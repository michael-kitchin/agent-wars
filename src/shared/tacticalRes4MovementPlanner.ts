/**
 * Res4 tactical march planning: least movement-point paths inside a footprint (combat rules §12.4).
 */

import type { WeatherState } from './weatherBonusTypes';
import { tacticalWeatherOpenGroundCost } from './weatherBonusRules';
import type { TacticalTerrainKindResolver } from './tacticalTerrainMovement';
import {
  isNavalRes4TacticalCellNavigable,
  nativeRes4TerrainKindIsWaterOrCoastalForNavalRouting,
  normalizeDbTerrainKindToTacticalCategory,
  tacticalEnterHexMovementCost,
} from './tacticalTerrainMovement';
import {
  landInfantryArmorEnterCost,
  planInfantryArmorLandContinuityMarch,
} from './tacticalRes4LandMarchContinuity';
import {
  popNumericPriorityMinHeap,
  pushNumericPriorityMinHeap,
  type NumericPriorityHeapEntry,
} from './numericPriorityMinHeap';
import {
  res4NeighborsInFootprint,
  type Res4FootprintNeighborLookup,
} from './tacticalRes4TransportLink';

/**
 * Explains why a tactical march plan failed or could not finish in one turn.
 *
 * Contract: Diagnostic-only strings for logs and skip traces.
 * When to use: Interpreting `TacticalMarchPlanResult` from `planTacticalRes4March`.
 * Expected outcome: Stable union members for switch statements.
 * Exceptions: None.
 */
export type TacticalMarchPlanFailureReason =
  | 'same_cell'
  | 'outside_footprint'
  | 'no_path'
  | 'air_no_march';

/**
 * Result of a tactical movement plan between two res4 cells inside one battle footprint.
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
};

/**
 * When strict MP truncation would leave the unit on the path origin despite a multi-step route, advance one cell
 * along that path if the per-turn budget is positive so Ready/hover never apply a zero-length leg.
 *
 * Purpose: First-step costs can exceed budget 1 (e.g. armor 1.0 into blocking transport on road) while a longer path remains valid.
 * When to use: After the cumulative-cost loop that computes `stopIdx` in `planTacticalRes4March` (land and naval branches).
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
 * Movement cost for a naval unit to step from `fromH3` into `toH3` (§12.4 naval footprint rules).
 *
 * Purpose: Single implementation shared by Dijkstra relaxation and tactical spawn checks so “navigable” matches “can leave this cell”.
 * When to use: `enterCostForHex` for naval, and `tacticalNavalHasMovableNeighborInFootprint` when filtering snapshot spawns.
 * Expected outcome: `1` for a legal enter; `Infinity` when the destination is not navigable or when the move is adjacent land-berth→land-berth seaport (both endpoints lack native water/coastal kinds even if `is_seaport` is set on channel tiles).
 * Exceptions: None; `fromH3` null skips the seaport adjacency guard (unused by pathfinding today).
 */
function tacticalNavalEnterNeighborCost(
  fromH3: string | null,
  toH3: string,
  terrain: TacticalTerrainKindResolver
): number {
  if (terrain.isUrbanRes4?.(toH3) || terrain.isRubbleRes4?.(toH3)) {
    return Infinity;
  }
  const resolved = terrain.effectiveKindForRes4Hex(toH3);
  const seaportTo = terrain.isSeaportRes4?.(toH3) ?? false;
  if (
    !isNavalRes4TacticalCellNavigable({
      resolvedKindForCell: resolved,
      parentTerrain: terrain.parentTerrain,
      parentTerrainKind: terrain.parentTerrainKind,
      isSeaportCell: seaportTo,
    })
  ) {
    return Infinity;
  }
  if (seaportTo && fromH3 != null && (terrain.isSeaportRes4?.(fromH3) ?? false)) {
    const fromResolved = terrain.effectiveKindForRes4Hex(fromH3);
    if (
      !nativeRes4TerrainKindIsWaterOrCoastalForNavalRouting(fromResolved) &&
      !nativeRes4TerrainKindIsWaterOrCoastalForNavalRouting(resolved)
    ) {
      return Infinity;
    }
  }
  return 1;
}

/**
 * Returns true when a naval unit on `fromH3` has at least one footprint neighbor it may enter this turn.
 *
 * Purpose: Prevents tactical spawns on res4 cells that are “navigable” in isolation but isolated by plains or other blocked tiles under the same strategic parent.
 * When to use: `computeTacticalBattleSnapshot` greedy placement for `naval` parents only, after base navigability passes.
 * Expected outcome: True iff some ring neighbor inside `res4Set` receives finite `tacticalNavalEnterNeighborCost` from `fromH3`.
 * Exceptions: None; malformed H3 yields no neighbors from `gridDisk` catch paths.
 */
export function tacticalNavalHasMovableNeighborInFootprint(args: {
  fromH3: string;
  res4Set: ReadonlySet<string>;
  terrain: TacticalTerrainKindResolver;
}): boolean {
  const { fromH3, res4Set, terrain } = args;
  for (const nb of res4NeighborsInFootprint(fromH3, res4Set)) {
    const w = tacticalNavalEnterNeighborCost(fromH3, nb, terrain);
    if (Number.isFinite(w) && w > 0) return true;
  }
  return false;
}

/**
 * Computes movement points spent to enter a single res4 cell for naval march search.
 *
 * Purpose: Naval reachability uses this directly. Infantry and armor marches use `landInfantryArmorEnterCost`; this delegates to that function if a land type is passed so the two prices cannot diverge.
 * When to use: Naval neighbor expansion in `planTacticalRes4March` and `collectSimpleEnterCostReachableWithinBudget`.
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
      res4Set: new Set([fromH3, h]),
      weatherEnabled: weatherEnter?.weatherEnabled,
      weather: weatherEnter?.weather,
      weatherTags: weatherEnter?.weatherTags,
    });
  }
  const raw = terrain.effectiveKindForRes4Hex(h);
  const cat = normalizeDbTerrainKindToTacticalCategory(raw, terrain.parentTerrain);
  const base = tacticalEnterHexMovementCost(unitTypeForMovement, cat);
  const urbanDest = !!(unitTypeForMovement === 'infantry' || unitTypeForMovement === 'armor') && !!terrain.isUrbanRes4?.(h);
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
 * Contract: Dijkstra over res4 cells in `res4Set` using §12.4 enter-hex costs; origin pays no cost to stand still.
 * When to use: Any tactical march validation or preview that must respect terrain and per-turn MP budget.
 * Expected outcome: `firstStopWithinBudget` walks the cheapest path until the next enter would exceed `movementPointBudget`; if that
 * would spend zero MPs on a path of length ≥ 2 while the budget is positive, the first stop is still the first cell after the origin.
 * Exceptions: Catches H3 failures and returns `reachable: false` with `no_path`.
 */
export function planTacticalRes4March(args: {
  fromH3: string;
  toH3: string;
  res4Set: ReadonlySet<string>;
  unitTypeForMovement: string;
  movementPointBudget: number;
  terrain: TacticalTerrainKindResolver;
  /** Precomputed footprint adjacency; when omitted, falls back to `res4NeighborsInFootprint` per state. */
  footprintNeighbors?: Res4FootprintNeighborLookup;
  weatherEnabled?: boolean;
  weather?: WeatherState | null;
  weatherTags?: readonly WeatherState[] | null;
}): TacticalMarchPlanResult {
  const { fromH3, toH3, res4Set, unitTypeForMovement, movementPointBudget, terrain } = args;
  const neighborsOf = args.footprintNeighbors ?? ((h: string) => res4NeighborsInFootprint(h, res4Set));
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
  if (!res4Set.has(fromH3) || !res4Set.has(toH3)) {
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
      res4Set,
      unitTypeForMovement,
      terrain,
      footprintNeighbors: neighborsOf,
      weatherEnabled: args.weatherEnabled,
      weather: args.weather,
      weatherTags: args.weatherTags,
    });
    if (!landResult) {
      return {
        reachable: false,
        reachableThisTurn: false,
        totalCostToDestination: Infinity,
        pathToDestination: null,
        firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
        failureReason: 'no_path',
      };
    }
    const { path, totalCost: total } = landResult;
    let cum = 0;
    let stopIdx = 0;
    for (let i = 1; i < path.length; i++) {
      const prevOfFrom = i >= 2 ? path[i - 2]! : null;
      const stepCost = landInfantryArmorEnterCost({
        toH3: path[i]!,
        unitTypeForMovement,
        terrain,
        fromH3: path[i - 1]!,
        prevOfFrom,
        marchGoalH3: toH3,
        res4Set,
        footprintNeighbors: neighborsOf,
        weatherEnabled: args.weatherEnabled,
        weather: args.weather,
        weatherTags: args.weatherTags,
      });
      if (!Number.isFinite(stepCost)) {
        return {
          reachable: false,
          reachableThisTurn: false,
          totalCostToDestination: Infinity,
          pathToDestination: null,
          firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
          failureReason: 'no_path',
        };
      }
      if (cum + stepCost > movementPointBudget) break;
      cum += stepCost;
      stopIdx = i;
    }
    stopIdx = stopIdxWithMinimumOneHexProgress({
      stopIdx,
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
    return {
      reachable: false,
      reachableThisTurn: false,
      totalCostToDestination: Infinity,
      pathToDestination: null,
      firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
      failureReason: 'no_path',
    };
  }
  const path = reconstructPath(parent, fromH3, toH3);
  if (!path || path.length < 2) {
    return {
      reachable: false,
      reachableThisTurn: false,
      totalCostToDestination: Infinity,
      pathToDestination: null,
      firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
      failureReason: 'no_path',
    };
  }
  let cum = 0;
  let stopIdx = 0;
  for (let i = 1; i < path.length; i++) {
    const stepCost = enterCostForHex(path[i]!, unitTypeForMovement, terrain, path[i - 1]!, {
      weatherEnabled: args.weatherEnabled,
      weather: args.weather,
      weatherTags: args.weatherTags,
    });
    if (!Number.isFinite(stepCost)) {
      return {
        reachable: false,
        reachableThisTurn: false,
        totalCostToDestination: Infinity,
        pathToDestination: null,
        firstStopWithinBudget: { stopH3: fromH3, consumedFullPath: false },
        failureReason: 'no_path',
      };
    }
    if (cum + stepCost > movementPointBudget) break;
    cum += stepCost;
    stopIdx = i;
  }
  stopIdx = stopIdxWithMinimumOneHexProgress({
    stopIdx,
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
 * using the same `enterCostForHex` rules as `planTacticalRes4March`, instead of one plan per disk candidate.
 * When to use: `collectTacticalLegalMoveDestinationRes4Hexes` for naval (and any future non-infantry/armor march types that share this enter-cost path).
 * Expected outcome: Destination hexes with total enter cost ≤ budget, excluding the origin.
 * Exceptions: None; never throws.
 */
export function collectSimpleEnterCostReachableWithinBudget(args: {
  fromH3: string;
  res4Set: ReadonlySet<string>;
  unitTypeForMovement: string;
  movementPointBudget: number;
  terrain: TacticalTerrainKindResolver;
  footprintNeighbors?: Res4FootprintNeighborLookup;
  weatherEnabled?: boolean;
  weather?: WeatherState | null;
  weatherTags?: readonly WeatherState[] | null;
}): string[] {
  const { fromH3, res4Set, unitTypeForMovement, movementPointBudget, terrain } = args;
  const neighborsOf = args.footprintNeighbors ?? ((h: string) => res4NeighborsInFootprint(h, res4Set));
  if (!res4Set.has(fromH3) || movementPointBudget < 1) return [];
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
  return out;
}
