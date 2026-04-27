import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: True when Run is on and Ready must wait for AI planning (strategic precompute or tactical opponent draft).
 * When to use: `startBackgroundRequestIfAllowed`, Ready click guard, and Ready button disabled styling.
 * Expected outcome: Strategic waits while `precomputedAiOrders === null` (initial or post–successful-Ready reset).
 * After a failed background `requestAiOrders`, the renderer uses empty arrays instead of null so Ready is not stuck.
 * Tactical waits when Run is on, opponent sub-units remain, and `tacticalOpponentDraft` is null — a failed fetch sets
 * an empty typed draft so the same latch clears.
 * Exceptions: None.
 */
export function isWaitingForPrecomputedAiOrders(): boolean {
  if (!S.runButtonOn) return false;
  if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
    const opponentAlive = S.tacticalBattleSnapshot.subUnits.some((u) => u.player === 'opponent');
    return opponentAlive && S.tacticalOpponentDraft === null;
  }
  return S.precomputedAiOrders === null;
}
