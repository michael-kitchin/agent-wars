/**
 * Battle march estimates shared by the tactical routing, distance, and unit-assessment tools.
 */

import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { planTacticalMarchWithSessionCache } from '../tacticalBattle/tacticalMovementPlanningCache';
import { logTrace } from '../logger';

/**
 * Result of one battle march estimate.
 *
 * Purpose: One shape for "how far, and how many beats" answers so every battle tool reports reach the same way.
 * When to use: Returned by `estimateTacticalMarch`.
 * Expected outcome: Unreachable results carry zero steps and zero beats; callers check `reachable` first.
 * Exceptions: None.
 */
export interface TacticalMarchEstimate {
  /**
   * Whether a finite march path exists under battle terrain rules.
   *
   * Contract: False for air movers and for destinations the mover's type cannot enter.
   * When to use: Gate every other field.
   * Expected outcome: True when the mover already stands on the destination.
   * Exceptions: None.
   */
  readonly reachable: boolean;
  /**
   * Whether the destination lies within this beat's movement-point budget.
   *
   * Contract: Implies `reachable`.
   * When to use: "Can this unit enter that cell this beat" checks, such as melee contact.
   * Expected outcome: True when the mover already stands on the destination.
   * Exceptions: None.
   */
  readonly reachableThisBeat: boolean;
  /**
   * Number of cell-to-cell steps along the planned path.
   *
   * Contract: Zero when unreachable or already there.
   * When to use: Distance reporting.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly pathStepCount: number;
  /**
   * Beats needed to arrive, from total movement cost over the per-beat budget.
   *
   * Contract: Zero when unreachable or already there; otherwise at least one.
   * When to use: Beats-to-reach reporting.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly estimatedBeats: number;
  /**
   * Movement points the mover has for this beat's march leg.
   *
   * Contract: Terrain-adjusted budget from the mover's own cell; zero for air.
   * When to use: Reporting and route-leg summaries.
   * Expected outcome: Non-negative integer.
   * Exceptions: None.
   */
  readonly movementPointBudget: number;
}

/**
 * Estimates battle beats to a destination from total movement cost and per-beat budget.
 *
 * Purpose: Shared beats arithmetic for battle routes, distances, and assessments.
 * When to use: After a reachable `planTacticalMarchWithSessionCache` result.
 * Expected outcome: Zero when the path has one cell; otherwise at least one. Falls back to step count when the budget
 * or cost is not usable.
 * Exceptions: None.
 */
export function estimateTacticalTurnsRequired(totalCost: number, budget: number, pathLen: number): number {
  logTrace('tacticalMarchEstimate estimateTacticalTurnsRequired', { totalCost, budget, pathLen });
  if (pathLen <= 1) return 0;
  if (!(budget > 0) || !Number.isFinite(totalCost)) return pathLen - 1;
  return Math.max(1, Math.ceil(totalCost / budget));
}

/**
 * Plans one battle march and summarizes its reach.
 *
 * Purpose: Single entry point for "can this mover get there, and how soon" inside a battle footprint. It uses the
 * same planner, budget rule, and memo as Ready movement, so tools never disagree with what a move order would do.
 * When to use: Battle tools that report distance or beats to reach; pass `tacticalSet` only to restrict the cells the
 * march may use, such as an enemy-avoiding route.
 * Expected outcome: A `TacticalMarchEstimate`; air movers are always unreachable because air does not march.
 * Exceptions: None; planner failures surface as unreachable.
 */
export function estimateTacticalMarch(
  battle: TacticalBattleSnapshot,
  mover: Pick<TacticalSubUnitSnapshot, 'unitType' | 'h3Index' | 'embarkedOnSubUnitId' | 'weatherTags'>,
  toH3: string,
  tacticalSet?: ReadonlySet<string>
): TacticalMarchEstimate {
  logTrace('tacticalMarchEstimate estimateTacticalMarch', {
    battleId: battle.battleId,
    unitType: mover.unitType,
    fromH3: mover.h3Index,
    toH3,
  });
  const unreachable = (movementPointBudget: number): TacticalMarchEstimate => ({
    reachable: false,
    reachableThisBeat: false,
    pathStepCount: 0,
    estimatedBeats: 0,
    movementPointBudget,
  });
  if (mover.unitType === 'air') return unreachable(0);
  const budget = Math.max(
    0,
    effectiveTacticalMovementPointBudgetForMarchLeg(battle, mover, battle.subUnits, mover.unitType)
  );
  if (mover.h3Index === toH3) {
    return { reachable: true, reachableThisBeat: true, pathStepCount: 0, estimatedBeats: 0, movementPointBudget: budget };
  }
  const plan = planTacticalMarchWithSessionCache(battle, {
    fromH3: mover.h3Index,
    toH3,
    tacticalSet: tacticalSet ?? new Set(battle.tacticalChildH3Indexes),
    unitTypeForMovement: mover.unitType,
    movementPointBudget: budget,
    weatherEnabled: battle.weatherBonusEnabled === true,
    weather: battle.weather,
    weatherTags: mover.weatherTags,
  });
  if (!plan.reachable || !plan.pathToDestination) return unreachable(budget);
  const pathLen = plan.pathToDestination.length;
  return {
    reachable: true,
    reachableThisBeat: plan.reachableThisTurn,
    pathStepCount: Math.max(0, pathLen - 1),
    estimatedBeats: estimateTacticalTurnsRequired(plan.totalCostToDestination, budget, pathLen),
    movementPointBudget: budget,
  };
}
