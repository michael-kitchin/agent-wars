import { rendererSharedState as S } from '../core/state';
import { anyCommanderIsPlanning } from './commanderPoolClient';

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
 * Reports whether main is running a deferred consultation right now.
 *
 * Purpose: Lets Ready show the "AI:" elapsed timer while the deferred consultation runs, without counting the
 * playback animation that precedes it.
 * When to use: `updateReadyButtonState` when choosing between the "Ready" and "AI:" labels.
 * Expected outcome: True from the playback-complete notify until the consultation push (applied, stale, or abandoned)
 * clears the pending flag.
 * Exceptions: None.
 */
export function isDeferredResolutionConsultRunning(): boolean {
  return isDeferredResolutionPlaybackConsultPending() && S.deferredResolutionConsultNotifySent;
}

/**
 * Defines the `isWaitingForPrecomputedAiOrders` function shape (export function isWaitingForPrecomputedAiOrders(): boolean).

 * Purpose: Ready stays disabled while any AI seat is still being consulted.
 * When to use: The Ready click guard and the Ready button label.
 * Expected outcome: True when the last pool snapshot has a planning seat.
 * Exceptions: None.
 */
export function isWaitingForPrecomputedAiOrders(): boolean {
  return anyCommanderIsPlanning();
}
