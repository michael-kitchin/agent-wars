/**
 * Queues one-shot callbacks to run when strategic/tactical resolution canvas playback completes.
 *
 * Purpose: Centralizes notify wiring so `tickResolutionMoveAnimation` completion (and no-animation fast paths) invoke
 * `game:notifyResolutionPlaybackComplete` exactly once per Ready beat without duplicating logic across handlers.
 * When to use: Strategic and tactical Ready handlers after arming `resolutionMoveAnimation` or when skipping animation.
 * Expected outcome: After flush, main may run deferred LLM consultation and push results to registered listeners.
 * Exceptions: Callback exceptions are logged and do not block subsequent notifies.
 */

/** Holds deferred playback-complete hooks until `flushResolutionPlaybackCompleteNotifyCallbacks` drains them. */
const playbackCompleteNotifyQueue: Array<() => void> = [];

/**
 * Registers a callback to run once resolution playback reaches completion (or immediately when flushed without animation).
 *
 * Purpose: Bridges renderer animation completion to main-process deferred consultation mutex release sequence.
 * When to use: After a Ready IPC returns `postResolutionConsultDeferred` / tactical defer flag before starting rAF loop.
 * Expected outcome: Callback runs exactly once when `flushResolutionPlaybackCompleteNotifyCallbacks` fires.
 * Exceptions: None.
 */
export function enqueueResolutionPlaybackCompleteNotify(fn: () => void): void {
  playbackCompleteNotifyQueue.push(fn);
}

/**
 * Drains all queued playback-complete notifies (typically from `tickResolutionMoveAnimation` end branch).
 *
 * Purpose: Single choke point so multiple queued hooks cannot reorder incorrectly relative to animation teardown.
 * When to use: Only from `tickResolutionMoveAnimation` when elapsed exceeds duration.
 * Expected outcome: Queue empty after return; each callback invoked in FIFO order.
 * Exceptions: Swallows per-callback errors after `console.error`.
 */
export function flushResolutionPlaybackCompleteNotifyCallbacks(): void {
  const queue = [...playbackCompleteNotifyQueue];
  playbackCompleteNotifyQueue.length = 0;
  for (const fn of queue) {
    try {
      fn();
    } catch (err) {
      console.error('resolutionPlaybackDeferral: notify callback failed', err);
    }
  }
}
