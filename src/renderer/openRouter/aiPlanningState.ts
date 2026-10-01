import { rendererSharedState as S } from '../core/state';

/**
 * Defines the `isDeferredResolutionPlaybackConsultPending` function shape (export function isDeferredResolutionPlaybackConsultPending(): boolean).

 * Purpose: True while deferred LLM consultation is outstanding after resolution IPC returned but before main push arrives.
 * When to use: Ready disabling (`updateReadyButtonState`), prefetch gating (`startBackgroundRequestIfAllowed`), Ready click guard.
 * Expected outcome: True only when main armed deferred strategic or tactical consultation for the current beat.
 * Exceptions: Cleared when push handlers apply or tactical/strategic session resets.
 */
export function isDeferredResolutionPlaybackConsultPending(): boolean {
  return S.pendingDeferredStrategicPostResolutionConsult || S.pendingDeferredTacticalPostBeatConsult;
}

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: True when Run is on and Ready must wait for AI planning (strategic precompute or tactical opponent draft buffer).
 * When to use: `startBackgroundRequestIfAllowed`, Ready click guard, Ready button disabled styling (with distinct deferred latch).
 * Expected outcome: Every-turn strategic waits while `precomputedAiOrders === null` (initial or post–successful-Ready reset).
 * After a failed background `requestAiOrders`, the renderer uses empty arrays instead of null so Ready is not stuck.
 * Event-driven strategic waits only until the opening consultation (`eventDrivenInitialConsultationDone`). Later turns use
 * pending orders from the post-resolution consult, so a null precompute buffer must not start a second model call.
 * Event-driven post-resolution / post-beat LLM work is deferred until resolution playback completes; readiness for that phase
 * is tracked separately via `isDeferredResolutionPlaybackConsultPending` so prefetch and Ready labeling stay accurate.
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
  if (S.useEventDrivenConsultation && S.eventDrivenInitialConsultationDone) return false;
  return S.precomputedAiOrders === null;
}
