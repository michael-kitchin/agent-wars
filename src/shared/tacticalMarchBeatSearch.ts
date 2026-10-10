/**
 * Beat-counting march search for terrain-bonus movement, and the rule that decides when its route replaces today's.
 *
 * Purpose: A terrain-bonus stop spends the rest of a beat, so its value is measured in beats, not movement points.
 * This search orders routes by arrival beat first and spend in the final beat second. `planTacticalMarch` keeps
 * today's route unless a route with stops arrives in strictly fewer beats.
 * When to use: Only through `preferFasterTerrainBonusMarch`, called once at the end of `planTacticalMarch`.
 * Expected outcome: Pure results with no logging and no I/O.
 * Exceptions: None.
 */

import { landStateKey } from './tacticalLandMarchContinuity';
import {
  classifyTacticalMarchStep,
  type TacticalMarchStepClass,
  type TacticalMarchStepContext,
} from './tacticalMarchStepCost';
import type { TacticalMarchPlanResult } from './tacticalMovementPlanner';
import {
  normalizeDbTerrainKindToTacticalCategory,
  type TacticalMovementCategory,
  type TacticalTerrainKindResolver,
} from './tacticalTerrainMovement';
import type { TacticalFootprintNeighborLookup } from './tacticalTransportLink';
import {
  popNumericPriorityMinHeap,
  pushNumericPriorityMinHeap,
  type NumericPriorityHeapEntry,
} from './numericPriorityMinHeap';
import type { WeatherState } from './weatherBonusTypes';

/**
 * Inputs for one beat search, matching the `planTacticalMarch` arguments.
 *
 * Purpose: Parameter object shared by `searchTacticalMarchBeats` and `preferFasterTerrainBonusMarch`.
 * When to use: Built by `planTacticalMarch` from its own arguments and resolved footprint neighbors.
 * Expected outcome: Same meaning as the planner fields of the same names.
 * Exceptions: None.
 */
export type TacticalMarchBeatSearchArgs = {
  readonly fromH3: string;
  readonly toH3: string;
  readonly tacticalSet: ReadonlySet<string>;
  readonly unitTypeForMovement: string;
  readonly movementPointBudget: number;
  readonly terrain: TacticalTerrainKindResolver;
  readonly footprintNeighbors: TacticalFootprintNeighborLookup;
  readonly weatherEnabled?: boolean;
  readonly weather?: WeatherState | null;
  readonly weatherTags?: readonly WeatherState[] | null;
  readonly terrainBonusCategory?: TacticalMovementCategory | null;
};

/**
 * Fewest-beat route found by `searchTacticalMarchBeats`.
 *
 * Contract: `path` includes both endpoints. `beatByIndex[i]` is the beat in which the unit stands on `path[i]`, so it
 * starts at 1 and never decreases. `arrivalSpent` is the spend inside the arrival beat, in `(0, budget]`.
 * When to use: Building a plan result in `preferFasterTerrainBonusMarch`, and tests.
 * Expected outcome: `usesTerrainBonus` is true when any step on the route is a terrain-bonus stop.
 * Exceptions: None.
 */
export type TacticalMarchBeatRoute = {
  readonly path: string[];
  readonly beatByIndex: number[];
  readonly arrivalBeat: number;
  readonly arrivalSpent: number;
  readonly usesTerrainBonus: boolean;
};

/**
 * Search position: a beat number and the movement spent inside that beat.
 *
 * Purpose: The label the search minimizes, beat first and spend second.
 * When to use: Inside this module only.
 * Expected outcome: `spent` never exceeds the budget.
 * Exceptions: None.
 */
type BeatPosition = { readonly beat: number; readonly spent: number };

/**
 * One search state: a cell, the cell it was entered from, its label, and the state it came from.
 *
 * Purpose: Land states are keyed by cell and predecessor like today's land search, so the transit guard sees the same
 * history. Naval states are keyed by cell alone.
 * When to use: Inside `searchTacticalMarchBeats` only.
 * Expected outcome: `parentKey` is null only at the origin.
 * Exceptions: None.
 */
type BeatSearchState = BeatPosition & {
  readonly h3: string;
  readonly prevH3: string | null;
  readonly parentKey: string | null;
  readonly usesTerrainBonus: boolean;
};

/**
 * Applies one classified step to a search position.
 *
 * Purpose: The beat arithmetic in one place. A normal step fits the beat or starts the next one; the first step of
 * the march always fits, which matches the planner's one-cell floor. A stop spends the whole beat.
 * When to use: Relaxation in `searchTacticalMarchBeats`.
 * Expected outcome: `null` for a blocked step. A stop yields the full budget in this beat when spend is below it, and
 * in the next beat otherwise.
 * Exceptions: None.
 */
function advanceBeatPosition(from: BeatPosition, step: TacticalMarchStepClass, budget: number): BeatPosition | null {
  if (step.kind === 'blocked') return null;
  if (step.kind === 'terrainBonusStop') {
    return from.spent < budget ? { beat: from.beat, spent: budget } : { beat: from.beat + 1, spent: budget };
  }
  if (from.spent + step.cost <= budget) return { beat: from.beat, spent: from.spent + step.cost };
  if (from.spent === 0) return { beat: from.beat, spent: budget };
  return { beat: from.beat + 1, spent: Math.min(step.cost, budget) };
}

/**
 * Rebuilds the route from the goal state's parent links.
 *
 * Purpose: Turns the search states into the path and per-cell beat numbers.
 * When to use: After `searchTacticalMarchBeats` pops the goal.
 * Expected outcome: A route whose first cell is the origin.
 * Exceptions: None.
 */
function beatRouteFromStates(states: ReadonlyMap<string, BeatSearchState>, goalKey: string): TacticalMarchBeatRoute {
  const reversed: BeatSearchState[] = [];
  for (let key: string | null = goalKey; key !== null; ) {
    const state: BeatSearchState = states.get(key)!;
    reversed.push(state);
    key = state.parentKey;
  }
  const ordered = reversed.reverse();
  const goal = ordered[ordered.length - 1]!;
  return {
    path: ordered.map((s) => s.h3),
    beatByIndex: ordered.map((s) => s.beat),
    arrivalBeat: goal.beat,
    arrivalSpent: goal.spent,
    usesTerrainBonus: goal.usesTerrainBonus,
  };
}

/**
 * Finds the route that arrives in the fewest beats, then with the least spend in the arrival beat.
 *
 * Purpose: Measures routes in beats so terrain-bonus stops can be compared fairly with routes that avoid them.
 * When to use: Through `preferFasterTerrainBonusMarch`; run once with stops allowed and once without.
 * Expected outcome: `null` when the destination cannot be reached, the endpoints are equal or outside the footprint, or
 * the budget is below 1. Every beat uses the same budget, as today's beat estimates do.
 * Exceptions: None.
 */
export function searchTacticalMarchBeats(
  args: TacticalMarchBeatSearchArgs & { readonly allowTerrainBonusStops: boolean }
): TacticalMarchBeatRoute | null {
  const { fromH3, toH3, tacticalSet, movementPointBudget: budget } = args;
  if (!(budget >= 1) || fromH3 === toH3 || !tacticalSet.has(fromH3) || !tacticalSet.has(toH3)) return null;
  const isLand = args.unitTypeForMovement === 'infantry' || args.unitTypeForMovement === 'armor';
  const ctx: TacticalMarchStepContext = {
    terrain: args.terrain,
    moveType: args.unitTypeForMovement,
    tacticalSet,
    marchStartH3: fromH3,
    marchGoalH3: toH3,
    footprintNeighbors: args.footprintNeighbors,
    weatherEnabled: args.weatherEnabled,
    weather: args.weather,
    weatherTags: args.weatherTags,
    terrainBonusCategory: args.allowTerrainBonusStops ? args.terrainBonusCategory : null,
  };
  const keyOf = (h3: string, prevH3: string | null): string => (isLand ? landStateKey(h3, prevH3) : h3);
  const priorityOf = (p: BeatPosition): number => p.beat * (budget + 1) + p.spent;
  const states = new Map<string, BeatSearchState>();
  const heap: NumericPriorityHeapEntry<string>[] = [];
  const startKey = keyOf(fromH3, null);
  const start: BeatSearchState = { h3: fromH3, prevH3: null, parentKey: null, beat: 1, spent: 0, usesTerrainBonus: false };
  states.set(startKey, start);
  pushNumericPriorityMinHeap(heap, startKey, priorityOf(start));
  while (heap.length > 0) {
    const node = popNumericPriorityMinHeap(heap);
    if (!node) break;
    const state = states.get(node.payload);
    if (!state || node.d !== priorityOf(state)) continue;
    if (state.h3 === toH3) return beatRouteFromStates(states, node.payload);
    for (const nb of args.footprintNeighbors(state.h3)) {
      const step = classifyTacticalMarchStep(ctx, { fromH3: state.h3, prevH3: state.prevH3, toH3: nb });
      const next = advanceBeatPosition(state, step, budget);
      if (!next) continue;
      const key = keyOf(nb, state.h3);
      const existing = states.get(key);
      if (existing && priorityOf(existing) <= priorityOf(next)) continue;
      states.set(key, {
        ...next,
        h3: nb,
        prevH3: state.h3,
        parentKey: node.payload,
        usesTerrainBonus: state.usesTerrainBonus || step.kind === 'terrainBonusStop',
      });
      pushNumericPriorityMinHeap(heap, key, priorityOf(next));
    }
  }
  return null;
}

/**
 * Returns true when some footprint cell could be a terrain-bonus stop for this category.
 *
 * Purpose: Skips both searches in the common case where the battle has no cell of the mover's birth terrain.
 * When to use: Only from `preferFasterTerrainBonusMarch`.
 * Expected outcome: True when a non-urban, non-rubble footprint cell has that movement category.
 * Exceptions: None.
 */
function footprintHasTerrainBonusCell(search: TacticalMarchBeatSearchArgs, category: TacticalMovementCategory): boolean {
  const { terrain } = search;
  for (const h3 of search.tacticalSet) {
    if (terrain.isUrbanTactical?.(h3) || terrain.isRubbleTactical?.(h3)) continue;
    if (normalizeDbTerrainKindToTacticalCategory(terrain.effectiveKindForTacticalHex(h3), terrain.parentTerrain) === category) {
      return true;
    }
  }
  return false;
}

/**
 * Converts a beat route into a march plan result.
 *
 * Purpose: Keeps every plan consumer unchanged: beats come from `ceil(total / budget)` and this beat's spend from
 * `min(budget, total)`, so the total is the full budget for each earlier beat plus the arrival beat's spend.
 * When to use: Only from `preferFasterTerrainBonusMarch` after the route has won.
 * Expected outcome: The first stop is the last path cell reached in beat 1. `usesTerrainBonus` is true.
 * Exceptions: None.
 */
function marchPlanFromBeatRoute(route: TacticalMarchBeatRoute, budget: number): TacticalMarchPlanResult {
  const firstStopIdx = route.beatByIndex.lastIndexOf(1);
  return {
    reachable: true,
    reachableThisTurn: route.arrivalBeat === 1,
    totalCostToDestination: (route.arrivalBeat - 1) * budget + route.arrivalSpent,
    pathToDestination: route.path,
    firstStopWithinBudget: { stopH3: route.path[firstStopIdx]!, consumedFullPath: route.arrivalBeat === 1 },
    usesTerrainBonus: true,
  };
}

/**
 * Returns today's plan, or a terrain-bonus route when that route arrives in strictly fewer beats.
 *
 * Purpose: The single place that lets terrain-bonus stops change a march, so a tie or a slower bonus route never
 * changes today's path, cost, or first stop.
 * When to use: At the end of `planTacticalMarch`, with the plan it would otherwise return.
 * Expected outcome: `plan` unchanged when there is no bonus category, the budget is below 1, `plan` already arrives
 * this beat or failed for a reason other than `no_path`, the footprint has no cell of the category, no route with stops
 * exists, or a route without stops arrives in the same number of beats or fewer. Otherwise the route with stops.
 * Exceptions: None.
 */
export function preferFasterTerrainBonusMarch(args: {
  readonly plan: TacticalMarchPlanResult;
  readonly search: TacticalMarchBeatSearchArgs;
}): TacticalMarchPlanResult {
  const { plan, search } = args;
  const category = search.terrainBonusCategory;
  if (category == null || !(search.movementPointBudget >= 1)) return plan;
  const mayImprove = (plan.reachable && !plan.reachableThisTurn) || plan.failureReason === 'no_path';
  if (!mayImprove || !footprintHasTerrainBonusCell(search, category)) return plan;
  const withStops = searchTacticalMarchBeats({ ...search, allowTerrainBonusStops: true });
  if (!withStops?.usesTerrainBonus) return plan;
  const withoutStops = searchTacticalMarchBeats({ ...search, allowTerrainBonusStops: false });
  if (withoutStops && withoutStops.arrivalBeat <= withStops.arrivalBeat) return plan;
  return marchPlanFromBeatRoute(withStops, search.movementPointBudget);
}
