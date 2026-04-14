/**
 * Tactical rules adapter seed: res4 spatial checks that future tactical combat/movement will share with strategic parity layers.
 */

import { gridPathCells } from 'h3-js';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalRes4March } from '../../shared/tacticalRes4MovementPlanner';
import { buildTacticalTerrainKindResolverFromSnapshot } from '../../shared/tacticalTerrainMovement';
import { planTacticalRes4MarchWithSessionCache } from './tacticalMovementPlanningCache';
import { tacticalLogQuery } from './tacticalLogging';
import { tacticalRes4GridDistance } from './tacticalSpatialAdapter';

/**
 * Returns whether two res4 cells are within a maximum inclusive grid-step distance for tactical march-style checks.
 *
 * Contract: Uses `tacticalRes4GridDistance`; both cells must be valid resolution-4 indexes or the distance helper throws.
 * When to use: Tactical order validation before delegating into shared strategic march rules with res4 geometry.
 * Expected outcome: True when distance is less than or equal to `maxSteps` (including same-cell distance zero).
 * Exceptions: Propagates errors from `tacticalRes4GridDistance` for invalid indexes.
 */
export function tacticalMarchWithinRes4GridSteps(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  maxSteps: number
): boolean {
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps', { fromRes4H3Index, toRes4H3Index, maxSteps });
  const d = tacticalRes4GridDistance(fromRes4H3Index, toRes4H3Index);
  const ok = d <= maxSteps;
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps result', { d, ok });
  return ok;
}

/**
 * Returns true when a destination is reachable along an H3 grid path that stays entirely inside the tactical res4 footprint.
 *
 * Purpose: Allows multi-turn tactical march orders to the same destinations shown by hover preview (path within footprint), not only single-turn `maxSteps` disks.
 * When to use: Human/opponent march validation after single-step range check fails.
 * Expected outcome: True when `gridPathCells` exists and every cell is in `res4Set`; same-cell is true; false on path failure or any step leaving the footprint.
 * Exceptions: Returns false if H3 path APIs throw (invalid indexes).
 */
export function tacticalMarchReachableAlongRes4Footprint(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  res4Set: ReadonlySet<string>
): boolean {
  tacticalLogQuery('tacticalMarchReachableAlongRes4Footprint', { fromRes4H3Index, toRes4H3Index });
  if (fromRes4H3Index === toRes4H3Index) return true;
  if (!res4Set.has(fromRes4H3Index) || !res4Set.has(toRes4H3Index)) return false;
  let pathCells: string[];
  try {
    pathCells = gridPathCells(fromRes4H3Index, toRes4H3Index);
  } catch {
    tacticalLogQuery('tacticalMarchReachableAlongRes4Footprint noPath');
    return false;
  }
  const ok = pathCells.every((h) => res4Set.has(h));
  tacticalLogQuery('tacticalMarchReachableAlongRes4Footprint result', { ok, stepCount: pathCells.length });
  return ok;
}

/**
 * Returns the res4 cell reached after spending at most `movementPointBudget` movement points toward `toRes4H3Index` along the cheapest valid tactical path.
 *
 * Purpose: Lets tactical Ready apply only the first leg of a multi-turn march using §12.4 terrain costs (milestone 2.2).
 * When to use: `commitHumanTacticalDraftOrders` before `applyHumanTacticalDraftBeatInStrategicOrder`, using the same footprint and terrain snapshot as march validation.
 * Expected outcome: `stopH3` lies on the minimum movement-point path; `consumedFullPath` is true when the ordered destination is reached within budget.
 * Exceptions: When no finite-cost path exists, returns `{ stopH3: from, consumedFullPath: false }` so callers do not advance illegally.
 */
export function tacticalMarchFirstStopAlongPath(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  movementPointBudget: number,
  res4Set: ReadonlySet<string>,
  battle?: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'subUnits'
    | 'res4TerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'res4IsSeaportByH3'
    | 'res4IsUrbanByH3'
    | 'res4IsRubbleByH3'
  >,
  unitTypeForMovement = 'infantry'
): { stopH3: string; consumedFullPath: boolean } {
  tacticalLogQuery('tacticalMarchFirstStopAlongPath', {
    fromRes4H3Index,
    toRes4H3Index,
    movementPointBudget,
    unitTypeForMovement,
  });
  if (movementPointBudget <= 0) {
    return { stopH3: fromRes4H3Index, consumedFullPath: false };
  }
  const planArgs = {
    fromH3: fromRes4H3Index,
    toH3: toRes4H3Index,
    res4Set,
    unitTypeForMovement,
    movementPointBudget,
  };
  const plan =
    battle && battle.battleId && battle.subUnits
      ? planTacticalRes4MarchWithSessionCache(battle, planArgs)
      : planTacticalRes4March({
          ...planArgs,
          terrain: buildTacticalTerrainKindResolverFromSnapshot(battle ?? {}),
        });
  if (!plan.reachable) {
    tacticalLogQuery('tacticalMarchFirstStopAlongPath unreachable', { failureReason: plan.failureReason });
    return { stopH3: fromRes4H3Index, consumedFullPath: false };
  }
  tacticalLogQuery('tacticalMarchFirstStopAlongPath result', plan.firstStopWithinBudget);
  return plan.firstStopWithinBudget;
}
