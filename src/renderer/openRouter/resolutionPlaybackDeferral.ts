/**
 * Queues one-shot callbacks to run when strategic/tactical resolution canvas playback completes.
 *
 * Purpose: Centralizes notify wiring so `tickResolutionMoveAnimation` completion (and no-animation fast paths) invoke
 * `game:notifyResolutionPlaybackComplete` exactly once per Ready beat without duplicating logic across handlers.
 * When to use: Strategic and tactical Ready handlers after arming `resolutionMoveAnimation` or when skipping animation.
 * Expected outcome: After flush, main may run deferred LLM consultation and push results to registered listeners.
 * Exceptions: Callback exceptions are logged and do not block subsequent notifies. Enqueue replaces any prior
 * queued notify so a cancelled tactical playback cannot later fire alongside a newer strategic/melee notify.
 */

/** Holds deferred playback-complete hooks until `flushResolutionPlaybackCompleteNotifyCallbacks` drains them. */
const playbackCompleteNotifyQueue: Array<() => void> = [];

/**
 * Registers a callback to run once resolution playback reaches completion (or immediately when flushed without animation).
 *
 * Purpose: Bridges renderer animation completion to main-process deferred consultation mutex release sequence.
 * When to use: After a Ready IPC returns `postResolutionConsultDeferred` / tactical defer flag before starting rAF loop.
 * Expected outcome: Queue holds only this callback; a later flush invokes it once.
 * Exceptions: None.
 */
export function enqueueResolutionPlaybackCompleteNotify(fn: () => void): void {
  playbackCompleteNotifyQueue.length = 0;
  playbackCompleteNotifyQueue.push(fn);
}

/**
 * Drops queued playback-complete notifies without invoking them.
 *
 * Purpose: Tactical exit and new-game teardown cancel the resolution RAF loop; leftover queued
 * tactical notifies must not flush later and collide with a newer deferred consult.
 * When to use: When cancelling `resolutionMoveAnimation` without completing playback.
 * Expected outcome: Queue empty; no IPC notify is sent.
 * Exceptions: None.
 */
export function dropQueuedResolutionPlaybackCompleteNotifies(): void {
  playbackCompleteNotifyQueue.length = 0;
}

/**
 * Drains all queued playback-complete notifies (typically from `tickResolutionMoveAnimation` end branch).
 *
 * Purpose: Single choke point so playback-complete IPC fires after canvas animation teardown.
 * When to use: From `tickResolutionMoveAnimation` when elapsed exceeds duration, and from tactical activation when interrupting in-flight strategic playback so deferred consult still runs.
 * Expected outcome: Queue empty after return; the current callback (at most one) is invoked.
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
