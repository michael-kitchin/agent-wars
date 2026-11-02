/**
 * Detects a standing march or an off-post defend walk-back that increases hop distance to the nearest observed enemy.
 *
 * Purpose: The briefing must mark a healthy order that walks away from contact. A march is overridden. A defend walk-back can also be stopped by assigning defend on the current hex. Shared by Standing Order Status and Action needed.
 * When to use: After a march destination or a defend next-move hex is known.
 * Expected outcome: True only when both hops are measurable and the step is strictly farther.
 * Exceptions: None; unmeasurable pairs are treated as not receding. A pursue order is not decided here.
 */

import { strategicCellAt } from '../../shared/h3Resolutions';
import { logError, logTrace } from '../logger';
import type { UnitAssessmentResult } from '../precomputation';
import { gridHopDistanceBetween } from './assessUnitProximity';

/**
 * True when moving from `unitH3` to `stepH3` increases hop distance to `enemyH3`.
 *
 * Purpose: One comparison for the Attention column and for Action needed.
 * When to use: March/pursue next-move or destination hex versus the nearest observed enemy hex.
 * Expected outcome: False when any hop count is missing or the step does not recede.
 * Exceptions: None.
 */
export function marchStepRecedesFromEnemy(unitH3: string, stepH3: string, enemyH3: string): boolean {
  logTrace('standingMarchReceding marchStepRecedesFromEnemy', { unitH3, stepH3, enemyH3 });
  const here = gridHopDistanceBetween(unitH3, enemyH3);
  const there = gridHopDistanceBetween(stepH3, enemyH3);
  if (here === null || there === null) return false;
  return there > here;
}

/**
 * Reads the standing-order type from either stored field name.
 *
 * Purpose: Assessments stamp `type` from the database row, while some fixtures and older stamps use `orderType`.
 * When to use: Before deciding whether a receding check applies to a march or a defend walk-back.
 * Expected outcome: The string type, or an empty string when neither field is a string.
 * Exceptions: None.
 */
export function standingOrderTypeOf(
  order: { type?: unknown; orderType?: unknown } | null | undefined
): string {
  logTrace('standingMarchReceding standingOrderTypeOf', {
    type: order && typeof order.type === 'string' ? order.type : undefined,
    orderType: order && typeof order.orderType === 'string' ? order.orderType : undefined,
  });
  if (!order) return '';
  if (typeof order.type === 'string') return order.type;
  if (typeof order.orderType === 'string') return order.orderType;
  return '';
}

/**
 * Attention Flags sentence for a receding march or defend walk-back.
 *
 * Purpose: The two orders need different advice. A march is overridden. A walk-back can also be stopped by assigning defend on the current hex.
 * When to use: The receding branch of Attention Flags, after the order type is known.
 * Expected outcome: The defend sentence when `orderType` is `defend`. The march sentence for every other type.
 * Exceptions: None.
 */
export function recedingOrderAttentionText(unitRef: string, enemyRef: string, orderType: string): string {
  logTrace('standingMarchReceding recedingOrderAttentionText', { unitRef, enemyRef, orderType });
  if (orderType === 'defend') {
    return `${unitRef} defend order walks it back to its post, away from the nearest enemy (${enemyRef}) — override it this turn or assign defend on its current hex.`;
  }
  return `${unitRef} standing march recedes from the nearest enemy (${enemyRef}) — override it this turn.`;
}

/**
 * True when a standing march or an off-post defend walk-back increases hop distance to the nearest enemy.
 *
 * Purpose: Action needed and Attention Flags must surface a healthy order that walks away from contact.
 * When to use: After shots and this-turn closes are considered. A march still compares its destination. A defend order compares `nextMoveHex` only, and only while status is `en_route`.
 * Expected outcome: False when geometry is missing, the unit is air, the defend step is the unit's own cell, or the step does not recede.
 * Exceptions: A throw from `strategicCellAt` is treated as not receding.
 */
export function standingOrderRecedesFromNearestEnemy(assessment: UnitAssessmentResult): boolean {
  const order = assessment.result.unit?.currentStandingOrder as
    | { type?: unknown; orderType?: unknown; status?: unknown; destination?: unknown; nextMoveHex?: unknown }
    | null
    | undefined;
  logTrace('standingMarchReceding standingOrderRecedesFromNearestEnemy', {
    unitId: assessment.unitId,
    orderType: standingOrderTypeOf(order),
  });
  if (!order) return false;
  const orderType = standingOrderTypeOf(order);
  const unitPos = assessment.result.unit?.position;
  if (!Array.isArray(unitPos) || unitPos.length < 2) return false;
  const nearest = assessment.result.nearbyEnemies?.[0] as { position?: unknown } | undefined;
  const enemyPos = nearest?.position;
  if (!Array.isArray(enemyPos) || enemyPos.length < 2) return false;
  try {
    const unitH3 = strategicCellAt(Number(unitPos[0]), Number(unitPos[1]));
    const enemyH3 = strategicCellAt(Number(enemyPos[0]), Number(enemyPos[1]));
    if (orderType === 'march') {
      const dest = order.destination;
      if (!Array.isArray(dest) || dest.length < 2) return false;
      return marchStepRecedesFromEnemy(unitH3, strategicCellAt(Number(dest[0]), Number(dest[1])), enemyH3);
    }
    if (orderType !== 'defend' || order.status !== 'en_route') return false;
    if (assessment.result.unit?.type === 'air') return false;
    const nextMove = order.nextMoveHex;
    if (!Array.isArray(nextMove) || nextMove.length < 2) return false;
    const stepH3 = strategicCellAt(Number(nextMove[0]), Number(nextMove[1]));
    if (stepH3 === unitH3) return false;
    return marchStepRecedesFromEnemy(unitH3, stepH3, enemyH3);
  } catch (err) {
    logError('standingMarchReceding standingOrderRecedesFromNearestEnemy: unresolved cell', {
      unitId: assessment.unitId,
      err,
    });
    return false;
  }
}

/**
 * Picks the nearest enemy hex to `unitH3` by grid hops.
 *
 * Purpose: Receding detection needs one enemy hex without re-running assessment.
 * When to use: Standing-order briefing rows when the snapshot lists observed enemies.
 * Expected outcome: The closest measurable enemy hex, or null when none pair.
 * Exceptions: None.
 */
export function nearestObservedEnemyH3(unitH3: string, enemyH3s: readonly string[]): string | null {
  logTrace('standingMarchReceding nearestObservedEnemyH3', {
    unitH3,
    enemyCount: enemyH3s.length,
  });
  let best: { h3: string; d: number } | null = null;
  for (const enemyH3 of enemyH3s) {
    const d = gridHopDistanceBetween(unitH3, enemyH3);
    if (d === null) continue;
    if (best === null || d < best.d) best = { h3: enemyH3, d };
  }
  return best?.h3 ?? null;
}
