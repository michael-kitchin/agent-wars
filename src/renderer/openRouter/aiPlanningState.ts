import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: True when Run is on and Ready must wait for AI planning (strategic precompute or tactical opponent draft).
 * When to use: `startBackgroundRequestIfAllowed`, Ready click guard, and Ready button disabled styling.
 * Expected outcome: Strategic waits while `precomputedAiOrders === null` (initial or post–successful-Ready reset).
 * After a failed background `requestAiOrders`, the renderer uses empty arrays instead of null so Ready is not stuck.
 * Strategic event-driven post-resolution LLM work runs **inside** `game:ready` on main (`handleGameReady` awaits
 * `runEventDrivenAfterResolutionConsultation` before returning); the renderer also keeps `readyRequestInFlight` until
 * that IPC completes, so there is no extra latch—unlike tactical `commitHumanTacticalDraftOrders`, which returns before
 * deferred `afterTacticalBeatResolution` and therefore uses `tacticalDeferredPostBeatConsultPending` plus the push.
 * Tactical waits when Run is on, opponent sub-units remain, and either the deferred post-beat consultation push has
 * not arrived yet (`tacticalDeferredPostBeatConsultPending`) or there is no buffered opponent plan (`tacticalOpponentDraft`
 * is null). A background `requestAiOrders` failure still uses an empty typed draft so Ready can recover.
 * Exceptions: None.
 */
export function isWaitingForPrecomputedAiOrders(): boolean {
  if (!S.runButtonOn) return false;
  if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
    const opponentAlive = S.tacticalBattleSnapshot.subUnits.some((u) => u.player === 'opponent');
    if (!opponentAlive) return false;
    if (S.tacticalDeferredPostBeatConsultPending) return true;
    return S.tacticalOpponentDraft === null;
  }
  return S.precomputedAiOrders === null;
}
