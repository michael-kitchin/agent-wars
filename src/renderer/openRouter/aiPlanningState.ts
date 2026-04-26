import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: True when Run is on and Ready must wait for AI planning (strategic precompute or tactical opponent draft).
 * When to use: `startBackgroundRequestIfAllowed`, Ready click guard, and Ready button disabled styling.
 * Expected outcome: Strategic waits while `precomputedAiOrders === null`. Tactical waits when Run is on, opponent
 * sub-units remain, and `tacticalOpponentDraft` is unset — same whether or not the Events tool group is enabled, so
 * opponent draft fetches are not skipped during tactical play.
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
