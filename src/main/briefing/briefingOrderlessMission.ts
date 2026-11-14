/**
 * Whether an orderless unit still needs a mission in the briefing.
 *
 * Purpose: The unit table and the attention mission bullet share one rule, and the briefing file is already at its size limit.
 * When to use: Strategic unit rows and the orderless-mission count.
 * Expected outcome: A boolean per unit, and a count for the mission bullet.
 * Exceptions: None.
 */

import { logTrace } from '../logger';
import type { UnitAssessmentResult } from '../precomputation';
import { orderlessUnitNeedsMission, type OrderlessActionNeededSets } from '../tools/orderlessUnitSuggestions';

/**
 * No operation units, used when a caller omits the held set.
 *
 * Purpose: The count's default argument must not allocate a fresh set on every call.
 * When to use: `orderlessMissionCount` when the briefing has no held set.
 * Expected outcome: An empty set.
 * Exceptions: None.
 */
const EMPTY_OPERATION_HELD_UNIT_IDS: ReadonlySet<string> = new Set();

/**
 * True when the assessment lists a fight the unit can take this turn.
 *
 * Purpose: A legal attack is a mission even when the unit has no suggested destination.
 * When to use: `missionActionNeeded`.
 * Expected outcome: True when any `canAttackThisTurn` row has an attack type other than `none`.
 * Exceptions: None.
 */
function hasLegalAttackThisTurn(assessment: UnitAssessmentResult): boolean {
  const rows = (assessment.result.canAttackThisTurn ?? []) as Array<{ attackType?: unknown }>;
  return rows.some((row) => typeof row.attackType === 'string' && row.attackType !== 'none');
}

/**
 * Applies the orderless-mission Action needed rule without searching destinations.
 *
 * Purpose: `needsAction` stays the threat predicate. This adds a mission only from sets the caller already computed.
 * When to use: Unit Status rows and the mission-bullet count.
 * Expected outcome: True when `orderlessUnitNeedsMission` is true for this assessment. False when the sets were omitted.
 * Exceptions: None.
 */
export function missionActionNeeded(
  assessment: UnitAssessmentResult,
  standingOrdersActive: boolean,
  strategic: boolean,
  orderlessAction: OrderlessActionNeededSets | undefined
): boolean {
  const needed = orderlessAction
    ? orderlessUnitNeedsMission({
      strategic,
      standingOrdersActive,
      hasStandingOrder: assessment.result.unit?.currentStandingOrder != null,
      hasLegalAttack: hasLegalAttackThisTurn(assessment),
      unitId: assessment.unitId,
      suggestedUnitIds: orderlessAction.suggestedUnitIds,
      oneStepMoveUnitIds: orderlessAction.oneStepMoveUnitIds,
    })
    : false;
  logTrace('briefingOrderlessMission missionActionNeeded', { unitId: assessment.unitId, needed });
  return needed;
}

/**
 * Counts orderless units whose mission, shot, or listed one-step move is not already a standing order.
 *
 * Purpose: The mission bullet is one sentence for the whole group. Counting here keeps that sentence off the legal-attack bullet.
 * When to use: The end of `buildAttentionFlags`, strategic mode with standing orders active.
 * Expected outcome: Zero when the sets are omitted, the mode is tactical, no orderless unit qualifies, or every qualifier is in `operationHeldUnitIds`.
 * Exceptions: None.
 */
export function orderlessMissionCount(
  unitAssessments: readonly UnitAssessmentResult[],
  standingOrdersActive: boolean,
  strategic: boolean,
  orderlessAction: OrderlessActionNeededSets | undefined,
  operationHeldUnitIds: ReadonlySet<string> = EMPTY_OPERATION_HELD_UNIT_IDS
): number {
  let count = 0;
  if (orderlessAction) {
    for (const assessment of unitAssessments) {
      if (operationHeldUnitIds.has(assessment.unitId)) continue;
      if (missionActionNeeded(assessment, standingOrdersActive, strategic, orderlessAction)) count += 1;
    }
  }
  logTrace('briefingOrderlessMission orderlessMissionCount', {
    assessmentCount: unitAssessments.length,
    operationHeldUnitCount: operationHeldUnitIds.size,
    count,
  });
  return count;
}
