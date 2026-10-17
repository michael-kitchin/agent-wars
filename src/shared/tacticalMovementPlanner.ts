/**
 * Tactical tactical march planning: least movement-point paths inside a footprint (combat rules §12.4).
 */

import type { WeatherState } from './weatherBonusTypes';
import { tacticalWeatherOpenGroundCost } from './weatherBonusRules';
import type { TacticalMovementCategory, TacticalTerrainKindResolver } from './tacticalTerrainMovement';
import {
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
} from './tacticalTerrainMovement';
import {
  collectTerrainBonusStopsFromReached,
  tacticalNavalEnterNeighborCost,
} from './tacticalMarchStepCost';
import { preferFasterTerrainBonusMarch } from './tacticalMarchBeatSearch';
import {
  landInfantryArmorEnterCost,
  planInfantryArmorLandContinuityMarch,
} from './tacticalLandMarchContinuity';
import {
  popNumericPriorityMinHeap,
  pushNumericPriorityMinHeap,
  type NumericPriorityHeapEntry,
} from './numericPriorityMinHeap';
import {
  tacticalNeighborsInFootprint,
  type TacticalFootprintNeighborLookup,
} from './tacticalTransportLink';

/**
 * Explains why a tactical march plan failed or could not finish in one turn.
 *
 * Contract: Diagnostic-only strings for logs and skip traces.
 * When to use: Interpreting `TacticalMarchPlanResult` from `planTacticalMarch`.
 * Expected outcome: Stable union members for switch statements.
 * Exceptions: None.
 */
export type TacticalMarchPlanFailureReason =
  | 'same_cell'
  | 'outside_footprint'
  | 'no_path'
  | 'air_no_march';

/**
 * Result of a tactical movement plan between two tactical cells inside one battle footprint.
 *
 * Contract: `pathToDestination` includes both endpoints when reachable; `firstStopWithinBudget` matches commit truncation plus a
 * one-hex floor when the budget is positive but cannot pay for the first step (see `stopIdxWithMinimumOneHexProgress`).
 * When to use: Hover preview, IPC validation, and `commitHumanTacticalDraftOrders` first-leg application.
 * Expected outcome: `reachable` true iff finite-cost path exists under terrain rules; `reachableThisTurn` iff total cost ≤ budget.
 * Exceptions: None; invalid H3 inputs yield `reachable: false` without throwing.
 */
export type TacticalMarchPlanResult = {
  reachable: boolean;
  reachableThisTurn: boolean;
  totalCostToDestination: number;
  pathToDestination: string[] | null;
  firstStopWithinBudget: { stopH3: string; consumedFullPath: boolean };
  failureReason?: TacticalMarchPlanFailureReason;
  /**
   * The route uses at least one terrain-bonus stop.
   *
   * Contract: Set only by `preferFasterTerrainBonusMarch`; today's plans omit it. On such a plan the total is the full
   * budget for every beat before arrival plus the arrival beat's spend, so `ceil(total / budget)` is the beat count.
   * When to use: Logs and tests that need to know why a route crosses terrain the unit cannot normally enter.
   * Expected outcome: `true` or absent.
   * Exceptions: None.
   */
  usesTerrainBonus?: true;
};

/**
 * Arguments to `planTacticalMarch`.
 *
 * Purpose: Names the planner input once, so the planner and its terrain-bonus comparison read the same fields.
 * When to use: Every battle march plan.
 * Expected outcome: Weather fields are ignored unless `weatherEnabled` is true; `terrainBonusCategory` null or omitted
 * means today's behavior exactly.
 * Exceptions: None.
 */
export type TacticalMarchPlanArgs = {
  fromH3: string;
  toH3: string;
  tacticalSet: ReadonlySet<string>;
  unitTypeForMovement: string;
  movementPointBudget: number;
  terrain: TacticalTerrainKindResolver;
  /** Precomputed footprint adjacency; when omitted, falls back to `tacticalNeighborsInFootprint` per state. */
  footprintNeighbors?: TacticalFootprintNeighborLookup;
  weatherEnabled?: boolean;
  weather?: WeatherState | null;
  weatherTags?: readonly WeatherState[] | null;
  /**
   * Terrain-bonus stop category for the moving sub-unit.
   *
   * Contract: From `terrainBonusMarchCategoryForMover`. Null or omitted disables terrain-bonus stops.
   * When to use: Every call that knows the moving sub-unit and its battle.
   * Expected outcome: Today's route is kept unless a route with stops arrives in strictly fewer beats.
   * Exceptions: None.
   */
  terrainBonusCategory?: TacticalMovementCategory | null;
};

/**
 * When strict MP truncation would leave the unit on the path origin despite a multi-step route, advance one cell
 * along that path if the per-turn budget is positive so Ready/hover never apply a zero-length leg.
 *
 * Purpose: First-step costs can exceed budget 1 (e.g. armor 1.0 into blocking transport on road) while a longer path remains valid.
 * When to use: After the cumulative-cost loop that computes `stopIdx` in `planTacticalMarch` (land and naval branches).
 * Expected outcome: Returns index `1` when `movementPointBudget > 0`, `stopIdx === 0`, and `pathLength >= 2`; otherwise returns `stopIdx`.
 * Exceptions: None.
 */
function stopIdxWithMinimumOneHexProgress(args: {
  stopIdx: number;
  pathLength: number;
  movementPointBudget: number;
}): number {
  const { stopIdx, pathLength, movementPointBudget } = args;
  if (movementPointBudget > 0 && stopIdx === 0 && pathLength >= 2) return 1;
  return stopIdx;
}

/**
 * Returns true when a naval unit on `fromH3` has at least one footprint neighbor it may enter this turn.
 *
 * Purpose: Prevents tactical spawns on tactical cells that are “navigable” in isolation but isolated by plains or other blocked tiles under the same strategic parent.
 * When to use: `computeTacticalBattleSnapshot` greedy placement for `naval` parents only, after base navigability passes.
 * Expected outcome: True iff some ring neighbor inside `tacticalSet` receives finite `tacticalNavalEnterNeighborCost` from `fromH3`.
 * Exceptions: None; malformed H3 yields no neighbors from `gridDisk` catch paths.
 */
export function tacticalNavalHasMovableNeighborInFootprint(args: {
  fromH3: string;
  tacticalSet: ReadonlySet<string>;
  terrain: TacticalTerrainKindResolver;
}): boolean {
  const { fromH3, tacticalSet, terrain } = args;
  for (const nb of tacticalNeighborsInFootprint(fromH3, tacticalSet)) {
    const w = tacticalNavalEnterNeighborCost(fromH3, nb, terrain);
    if (Number.isFinite(w) && w > 0) return true;
  }
  return false;
}

/**
 * Computes movement points spent to enter a single tactical cell for naval march search.
 *
 * Purpose: Naval reachability uses this directly. Infantry and armor marches use `landInfantryArmorEnterCost`; this delegates to that function if a land type is passed so the two prices cannot diverge.
 * When to use: Naval neighbor expansion in `planTacticalMarch` and `collectSimpleEnterCostReachableWithinBudget`.
 * Expected outcome: Naval enter cost from `tacticalNavalEnterNeighborCost`. A land step with an origin matches `landInfantryArmorEnterCost`.
 * Exceptions: None.
 */
function enterCostForHex(
  h: string,
  unitTypeForMovement: string,
  terrain: TacticalTerrainKindResolver,
  fromH3: string | null,
  weatherEnter?: {
    weatherEnabled?: boolean;
    weather?: WeatherState | null;
    weatherTags?: readonly WeatherState[] | null;
  }
): number {
  if (unitTypeForMovement === 'naval') {
    return tacticalNavalEnterNeighborCost(fromH3, h, terrain);
  }
  if ((unitTypeForMovement === 'infantry' || unitTypeForMovement === 'armor') && fromH3 != null) {
    return landInfantryArmorEnterCost({
      toH3: h,
      unitTypeForMovement,
      terrain,
      fromH3,
      prevOfFrom: null,
      marchGoalH3: h,
      tacticalSet: new Set([fromH3, h]),
      weatherEnabled: weatherEnter?.weatherEnabled,
      weather: weatherEnter?.weather,
      weatherTags: weatherEnter?.weatherTags,
    });
  }
  const raw = terrain.effectiveKindForTacticalHex(h);
  const cat = normalizeDbTerrainKindToTacticalCategory(raw, terrain.parentTerrain);
  const base = tacticalEnterHexMovementCost(unitTypeForMovement, cat);
  const urbanDest = !!(unitTypeForMovement === 'infantry' || unitTypeForMovement === 'armor') && !!terrain.isUrbanTactical?.(h);
  if (urbanDest) return 1;
  return tacticalWeatherOpenGroundCost({
    unitType: unitTypeForMovement,
    category: cat,
    baseCost: base,
    weather: weatherEnter?.weather,
    tags: weatherEnter?.weatherTags,
    enabled: weatherEnter?.weatherEnabled === true,
  });
}

/**
 * Reconstructs the minimum-cost path from Dijkstra parent pointers (origin → destination).
 *
 * Purpose: Turns relaxed predecessor links into an ordered cell list for preview geometry and first-stop truncation.
 * When to use: After Dijkstra finds a finite `dist` total to the ordered destination.
 * Expected outcome: Returns `[from, …, to]` when the parent chain is consistent; otherwise `null`.
 * Exceptions: None.
 */
function reconstructPath(parent: Map<string, string | null>, from: string, to: string): string[] | null {
  if (!parent.has(to)) return null;
  const rev: string[] = [];
  let cur: string | null | undefined = to;
  while (cur !== null && cur !== undefined) {
    rev.push(cur);
    if (cur === from) break;
    cur = parent.get(cur) ?? null;
  }
  if (rev.length === 0 || rev[rev.length - 1] !== from) return null;
  return rev.reverse();
}

/**
 * Computes least movement-point path and first-turn stop for a tactical march order.
 *
 * Contract: Dijkstra over tactical cells in `tacticalSet` using §12.4 enter-hex costs; origin pays no cost to stand still.
 * When to use: Any tactical march validation or preview that must respect terrain and per-turn MP budget.
 * Expected outcome: `firstStopWithinBudget` walks the cheapest path until the next enter would exceed `movementPointBudget`; if that
 * would spend zero MPs on a path of length ≥ 2 while the budget is positive, the first stop is still the first cell after the origin.
 * With a `terrainBonusCategory`, a route through terrain-bonus stops replaces that plan only when it arrives in strictly
 * fewer beats (see `preferFasterTerrainBonusMarch`).
 * Exceptions: None; unreachable destinations return `reachable: false` with a failure reason.
 */
export function planTacticalMarch(args: TacticalMarchPlanArgs): TacticalMarchPlanResult {
  const plan = planTacticalMarchWithoutTerrainBonus(args);
  if (args.terrainBonusCategory == null) return plan;
  const footprintNeighbors =
    args.footprintNeighbors ?? ((h: string) => tacticalNeighborsInFootprint(h, args.tacticalSet));
  return preferFasterTerrainBonusMarch({ plan, search: { ...args, footprintNeighbors } });
}

/**
 * Returns the unreachable march result used when no legal path exists.
 *
 * Purpose: Land and naval planning share one `no_path` object so the two copies cannot drift.
 * When to use: Only when `planTacticalMarchWithoutTerrainBonus` has no legal land or naval path.
 * Expected outcome: `reachable: false`, an infinite cost, and a first stop on `fromH3`.
 * Exceptions: None. Do not use this for air or for a cell outside the footprint.
 */
function unreachedTacticalMarch(fromH3: string): TacticalMarchPlanResult {
  return {
    reachable: false,
    reachableThisTurn: false,
    totalCostToDestination: Infinity,
    pathToDestination: null,
    firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
    failureReason: 'no_path',
  };
}

/**
 * Walks a path until the next step would exceed the movement-point budget.
 *
 * Purpose: Land and naval plans share the cumulative stop, then each caller applies the one-hex minimum.
 * When to use: After a path of at least two cells is known.
 * Expected outcome: `{ ok: true, stopIdx }` before `stopIdxWithMinimumOneHexProgress`, or `{ ok: false }` when a step cost is not finite.
 * Exceptions: None.
 */
function firstStopIndexWithinBudget(
  path: readonly string[],
  movementPointBudget: number,
  stepCostAt: (index: number) => number
): { ok: true; stopIdx: number } | { ok: false } {
  let cum = 0;
  let stopIdx = 0;
  for (let i = 1; i < path.length; i++) {
    const stepCost = stepCostAt(i);
    if (!Number.isFinite(stepCost)) return { ok: false };
    if (cum + stepCost > movementPointBudget) break;
    cum += stepCost;
    stopIdx = i;
  }
  return { ok: true, stopIdx };
}

/**
 * Computes today's least movement-point plan, with no terrain-bonus stops.
 *
 * Purpose: The planner as it was before terrain-bonus movement, kept intact so that rule can only add a faster route.
 * When to use: Only from `planTacticalMarch`.
 * Expected outcome: Same contract as `planTacticalMarch` with no `terrainBonusCategory`.
 * Exceptions: None.
 */
function planTacticalMarchWithoutTerrainBonus(args: TacticalMarchPlanArgs): TacticalMarchPlanResult {
  const { fromH3, toH3, tacticalSet, unitTypeForMovement, movementPointBudget, terrain } = args;
  const neighborsOf = args.footprintNeighbors ?? ((h: string) => tacticalNeighborsInFootprint(h, tacticalSet));
  if (unitTypeForMovement === 'air') {
    return {
      reachable: false,
      reachableThisTurn: false,
      totalCostToDestination: Infinity,
      pathToDestination: null,
      firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
      failureReason: 'air_no_march',
    };
  }
  if (fromH3 === toH3) {
    return {
      reachable: true,
      reachableThisTurn: true,
      totalCostToDestination: 0,
      pathToDestination: [fromH3],
      firstStopWithinBudget: { stopH3: toH3, consumedFullPath: true },
    };
  }
  if (!tacticalSet.has(fromH3) || !tacticalSet.has(toH3)) {
    return {
      reachable: false,
      reachableThisTurn: false,
      totalCostToDestination: Infinity,
      pathToDestination: null,
      firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
      failureReason: 'outside_footprint',
    };
  }

  const isLandInfantryOrArmor = unitTypeForMovement === 'infantry' || unitTypeForMovement === 'armor';

  if (isLandInfantryOrArmor) {
    const landResult = planInfantryArmorLandContinuityMarch({
      fromH3,
      toH3,
      tacticalSet,
      unitTypeForMovement,
      terrain,
      footprintNeighbors: neighborsOf,
      weatherEnabled: args.weatherEnabled,
      weather: args.weather,
      weatherTags: args.weatherTags,
    });
    if (!landResult) {
      return unreachedTacticalMarch(fromH3);
    }
    const { path, totalCost: total } = landResult;
    const walked = firstStopIndexWithinBudget(path, movementPointBudget, (i) => {
      const prevOfFrom = i >= 2 ? path[i - 2]! : null;
      return landInfantryArmorEnterCost({
        toH3: path[i]!,
        unitTypeForMovement,
        terrain,
        fromH3: path[i - 1]!,
        prevOfFrom,
        marchGoalH3: toH3,
        tacticalSet,
        footprintNeighbors: neighborsOf,
        weatherEnabled: args.weatherEnabled,
        weather: args.weather,
        weatherTags: args.weatherTags,
      });
    });
    if (!walked.ok) return unreachedTacticalMarch(fromH3);
    const stopIdx = stopIdxWithMinimumOneHexProgress({
      stopIdx: walked.stopIdx,
      pathLength: path.length,
      movementPointBudget,
    });
    const stopH3 = path[stopIdx]!;
    const consumedFullPath = stopIdx >= path.length - 1;
    return {
      reachable: true,
      reachableThisTurn: total <= movementPointBudget,
      totalCostToDestination: total,
      pathToDestination: path,
      firstStopWithinBudget: { stopH3, consumedFullPath },
    };
  }

  const dist = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const heap: NumericPriorityHeapEntry<string>[] = [];
  dist.set(fromH3, 0);
  parent.set(fromH3, null);
  pushNumericPriorityMinHeap(heap, fromH3, 0);
  while (heap.length > 0) {
    const node = popNumericPriorityMinHeap(heap);
    if (!node) break;
    const { payload: h, d } = node;
    if (d !== dist.get(h)) continue;
    if (h === toH3) break;
    for (const nb of neighborsOf(h)) {
      const w = enterCostForHex(nb, unitTypeForMovement, terrain, h, {
        weatherEnabled: args.weatherEnabled,
        weather: args.weather,
        weatherTags: args.weatherTags,
      });
      if (!Number.isFinite(w) || w <= 0) continue;
      const nd = d + w;
      const prev = dist.get(nb);
      if (prev === undefined || nd < prev) {
        dist.set(nb, nd);
        parent.set(nb, h);
        pushNumericPriorityMinHeap(heap, nb, nd);
      }
    }
  }
  const totalNaval = dist.get(toH3);
  if (totalNaval === undefined || !Number.isFinite(totalNaval)) {
    return unreachedTacticalMarch(fromH3);
  }
  const path = reconstructPath(parent, fromH3, toH3);
  if (!path || path.length < 2) {
    return unreachedTacticalMarch(fromH3);
  }
  const walked = firstStopIndexWithinBudget(path, movementPointBudget, (i) =>
    enterCostForHex(path[i]!, unitTypeForMovement, terrain, path[i - 1]!, {
      weatherEnabled: args.weatherEnabled,
      weather: args.weather,
      weatherTags: args.weatherTags,
    })
  );
  if (!walked.ok) return unreachedTacticalMarch(fromH3);
  const stopIdx = stopIdxWithMinimumOneHexProgress({
    stopIdx: walked.stopIdx,
    pathLength: path.length,
    movementPointBudget,
  });
  const stopH3 = path[stopIdx]!;
  const consumedFullPath = stopIdx >= path.length - 1;
  return {
    reachable: true,
    reachableThisTurn: totalNaval <= movementPointBudget,
    totalCostToDestination: totalNaval,
    pathToDestination: path,
    firstStopWithinBudget: { stopH3, consumedFullPath },
  };
}

/**
 * Single-source naval (non-land-continuity) reachability within one beat’s MP budget.
 *
 * Purpose: Tactical Best Options analogue of strategic naval `gridDisk` + passability listing — one Dijkstra from the origin
 * using the same `enterCostForHex` rules as `planTacticalMarch`, instead of one plan per disk candidate.
 * When to use: `collectTacticalLegalMoveDestinationTacticalHexes` for naval (and any future non-infantry/armor march types that share this enter-cost path).
 * Expected outcome: Destination hexes with total enter cost ≤ budget, excluding the origin, plus the terrain-bonus stop
 * cells next to them when `terrainBonusCategory` is set (see `collectTerrainBonusStopsFromReached`).
 * Exceptions: None; never throws.
 */
export function collectSimpleEnterCostReachableWithinBudget(args: {
  fromH3: string;
  tacticalSet: ReadonlySet<string>;
  unitTypeForMovement: string;
  movementPointBudget: number;
  terrain: TacticalTerrainKindResolver;
  footprintNeighbors?: TacticalFootprintNeighborLookup;
  weatherEnabled?: boolean;
  weather?: WeatherState | null;
  weatherTags?: readonly WeatherState[] | null;
  /** Same meaning as `TacticalMarchPlanArgs.terrainBonusCategory`. */
  terrainBonusCategory?: TacticalMovementCategory | null;
}): string[] {
  const { fromH3, tacticalSet, unitTypeForMovement, movementPointBudget, terrain } = args;
  const neighborsOf = args.footprintNeighbors ?? ((h: string) => tacticalNeighborsInFootprint(h, tacticalSet));
  if (!tacticalSet.has(fromH3) || movementPointBudget < 1) return [];
  const dist = new Map<string, number>([[fromH3, 0]]);
  const heap: NumericPriorityHeapEntry<string>[] = [];
  pushNumericPriorityMinHeap(heap, fromH3, 0);
  while (heap.length > 0) {
    const node = popNumericPriorityMinHeap(heap);
    if (!node) break;
    const { payload: h, d } = node;
    if (d !== dist.get(h)) continue;
    if (d > movementPointBudget) continue;
    for (const nb of neighborsOf(h)) {
      const w = enterCostForHex(nb, unitTypeForMovement, terrain, h, {
        weatherEnabled: args.weatherEnabled,
        weather: args.weather,
        weatherTags: args.weatherTags,
      });
      if (!Number.isFinite(w) || w <= 0) continue;
      const nd = d + w;
      if (nd > movementPointBudget) continue;
      const prev = dist.get(nb);
      if (prev === undefined || nd < prev) {
        dist.set(nb, nd);
        pushNumericPriorityMinHeap(heap, nb, nd);
      }
    }
  }
  const out: string[] = [];
  for (const [h, cost] of dist) {
    if (h !== fromH3 && cost <= movementPointBudget) out.push(h);
  }
  if (args.terrainBonusCategory == null) return out;
  const stops = collectTerrainBonusStopsFromReached({
    ctx: {
      terrain,
      moveType: unitTypeForMovement,
      tacticalSet,
      marchStartH3: fromH3,
      marchGoalH3: '',
      footprintNeighbors: neighborsOf,
      terrainBonusCategory: args.terrainBonusCategory,
    },
    reached: [...dist].map(([h3, spent]) => ({ h3, spent, prevH3: null })),
    exclude: new Set(out),
    movementPointBudget,
    neighborsOf,
  });
  return [...out, ...stops];
}
