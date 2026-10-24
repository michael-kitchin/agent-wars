/**
 * Tactical rules adapter seed: tactical spatial checks that future tactical combat/movement will share with strategic parity layers.
 */

import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { planTacticalMarch } from '../../shared/tacticalMovementPlanner';
import { buildTacticalTerrainKindResolverFromSnapshot } from '../../shared/tacticalTerrainMovement';
import { terrainBonusMarchCategoryForMover } from '../../shared/terrainBonusMarch';
import { planTacticalMarchWithSessionCache } from './tacticalMovementPlanningCache';
import { tacticalLogQuery } from './tacticalLogging';
import { tacticalGridDistance } from './tacticalSpatialAdapter';

/**
 * Returns whether two tactical cells are within a maximum inclusive grid-step distance for tactical march-style checks.
 *
 * Contract: Uses `tacticalGridDistance`; both cells must be valid resolution-4 indexes or the distance helper throws.
 * When to use: Tactical order validation before delegating into shared strategic march rules with tactical geometry.
 * Expected outcome: True when distance is less than or equal to `maxSteps` (including same-cell distance zero).
 * Exceptions: Propagates errors from `tacticalGridDistance` for invalid indexes.
 */
export function tacticalMarchWithinGridSteps(
  fromTacticalH3Index: string,
  toTacticalH3Index: string,
  maxSteps: number
): boolean {
  tacticalLogQuery('tacticalMarchWithinGridSteps', { fromTacticalH3Index, toTacticalH3Index, maxSteps });
  const d = tacticalGridDistance(fromTacticalH3Index, toTacticalH3Index);
  const ok = d <= maxSteps;
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps result', { d, ok });
  return ok;
}

/**
 * Returns the tactical cell reached after spending at most `movementPointBudget` movement points toward `toTacticalH3Index` along the cheapest valid tactical path.
 *
 * Purpose: Lets tactical Ready apply only the first leg of a multi-turn march using §12.4 terrain costs.
 * When to use: `commitHumanTacticalDraftOrders` before `applyHumanTacticalDraftBeatInStrategicOrder`, using the same footprint and terrain snapshot as march validation.
 * Expected outcome: `stopH3` lies on the minimum movement-point path; `consumedFullPath` is true when the ordered destination is reached within budget.
 * When the budget cannot pay for the first step but the path exists and the budget is positive, `planTacticalMarch` still advances one hex along that path.
 * The mover's weather tags and, with the battle's terrain bonus on, its birth terrain shape the plan.
 * Exceptions: When no finite-cost path exists, returns `{ stopH3: from, consumedFullPath: false }` so callers do not advance illegally.
 */
export function tacticalMarchFirstStopAlongPath(
  fromTacticalH3Index: string,
  toTacticalH3Index: string,
  movementPointBudget: number,
  tacticalSet: ReadonlySet<string>,
  battle?: Pick<
    TacticalBattleSnapshot,
    | 'battleId'
    | 'tacticalTurnNumber'
    | 'subUnits'
    | 'tacticalTerrainKindByH3'
    | 'strategicHexTerrain'
    | 'strategicHexTerrainKind'
    | 'tacticalIsSeaportByH3'
    | 'tacticalIsUrbanByH3'
    | 'tacticalIsRubbleByH3'
    | 'tacticalRoadSidesByH3'
    | 'tacticalRailSidesByH3'
    | 'weather'
    | 'weatherBonusEnabled'
    | 'terrainBonusEnabled'
  >,
  unitTypeForMovement = 'infantry',
  mover?: Pick<TacticalSubUnitSnapshot, 'unitType' | 'origin' | 'weatherTags'>
): { stopH3: string; consumedFullPath: boolean; pathH3Prefix?: string[] } {
  const terrainBonusCategory =
    battle && mover ? terrainBonusMarchCategoryForMover(battle, mover, unitTypeForMovement) : null;
  tacticalLogQuery('tacticalMarchFirstStopAlongPath', {
    fromTacticalH3Index,
    toTacticalH3Index,
    movementPointBudget,
    unitTypeForMovement,
    terrainBonusCategory,
  });
  if (movementPointBudget <= 0) {
    return { stopH3: fromTacticalH3Index, consumedFullPath: false, pathH3Prefix: undefined };
  }
  const planArgs = {
    fromH3: fromTacticalH3Index,
    toH3: toTacticalH3Index,
    tacticalSet,
    unitTypeForMovement,
    movementPointBudget,
    weatherEnabled: battle?.weatherBonusEnabled === true,
    weather: battle?.weather,
    weatherTags: mover?.weatherTags,
    terrainBonusCategory,
  };
  const plan =
    battle && battle.battleId && battle.subUnits
      ? planTacticalMarchWithSessionCache(battle, planArgs)
      : planTacticalMarch({
          ...planArgs,
          terrain: buildTacticalTerrainKindResolverFromSnapshot(battle ?? {}),
        });
  if (!plan.reachable) {
    tacticalLogQuery('tacticalMarchFirstStopAlongPath unreachable', { failureReason: plan.failureReason });
    return { stopH3: fromTacticalH3Index, consumedFullPath: false, pathH3Prefix: undefined };
  }
  const { stopH3, consumedFullPath } = plan.firstStopWithinBudget;
  let pathH3Prefix: string[] | undefined;
  const fullPath = plan.pathToDestination;
  if (fullPath && fullPath.length >= 2) {
    const stopIdx = fullPath.indexOf(stopH3);
    if (stopIdx >= 0) {
      pathH3Prefix = fullPath.slice(0, stopIdx + 1);
    }
  }
  tacticalLogQuery('tacticalMarchFirstStopAlongPath result', { stopH3, consumedFullPath, pathLen: pathH3Prefix?.length });
  return { stopH3, consumedFullPath, pathH3Prefix };
}
