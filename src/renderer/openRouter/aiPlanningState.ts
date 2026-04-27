import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: True when Run is on and Ready must wait for AI planning (strategic precompute or tactical opponent draft).
 * When to use: `startBackgroundRequestIfAllowed`, Ready click guard, and Ready button disabled styling.
 * Expected outcome: Strategic waits while `precomputedAiOrders === null` (initial or post–successful-Ready reset).
 * After a failed background `requestAiOrders`, the renderer uses empty arrays instead of null so Ready is not stuck.
 * Strategic event-driven post-resolution LLM work runs **inside** `game:ready` on main (`handleGameReady` awaits
 * `runEventDrivenAfterResolutionConsultation` before returning); the renderer also keeps `readyRequestInFlight` until
 * that IPC completes, so there is no extra latch. Tactical `commitHumanTacticalDraftOrders` now awaits post-beat
 * consultation on main when event-driven Run applies, so the renderer does not need a separate deferred latch either.
 * Tactical waits when Run is on, opponent sub-units remain, and there is no buffered opponent plan (`tacticalOpponentDraft`
 * is null). A background `requestAiOrders` failure still uses an empty typed draft so Ready can recover.
 * Exceptions: None.
 */
export function isWaitingForPrecomputedAiOrders(): boolean {
  if (!S.runButtonOn) return false;
  if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
    const opponentAlive = S.tacticalBattleSnapshot.subUnits.some((u) => u.player === 'opponent');
    if (!opponentAlive) return false;
    return S.tacticalOpponentDraft === null;
  }
  return S.precomputedAiOrders === null;
}
