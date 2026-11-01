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

/** Listeners that run after playback finishes, including a turn that had nothing to animate. */
const playbackFinishedListeners: Array<() => void> = [];

/** One-shot waits that must end when playback is cancelled instead of finished. */
const playbackAbandonedListeners: Array<() => void> = [];

/**
 * Drops `fn` from `list` when it is still registered.
 *
 * Purpose: A one-shot wait listens for both a normal finish and a cancel, and must leave both lists.
 * When to use: When that wait settles.
 * Expected outcome: `fn` is gone from `list`. A missing entry is left alone.
 * Exceptions: None.
 */
function removePlaybackListener(list: Array<() => void>, fn: () => void): void {
  const index = list.indexOf(fn);
  if (index >= 0) list.splice(index, 1);
}

/**
 * Runs `listener` whenever resolution playback finishes.
 *
 * Purpose: Auto-advance waits for the animation, then looks again at the commander pool.
 * When to use: Once, from the watch screen's startup.
 * Expected outcome: The listener runs after the one-shot consult notify, and after a turn with nothing to animate.
 * Exceptions: None. A listener that throws is logged and does not stop the others.
 */
export function onResolutionPlaybackFinished(listener: () => void): void {
  playbackFinishedListeners.push(listener);
}

/**
 * Tells playback-finished listeners that the animation is done.
 *
 * Purpose: The one-shot consult queue and the watch share the same moment.
 * When to use: From the flush, and when a turn had nothing to animate.
 * Expected outcome: Each listener runs once.
 * Exceptions: Logs a listener error and continues.
 */
export function notifyResolutionPlaybackFinished(): void {
  for (const listener of [...playbackFinishedListeners]) {
    try {
      listener();
    } catch (err) {
      console.error('resolutionPlaybackDeferral: playback-finished listener failed', err);
    }
  }
}

/**
 * Resolves when the current playback finishes, or when it is cancelled first.
 *
 * Purpose: A watch has to open its battle after movement, combat, and dice, and a new game has to unblock that wait.
 * When to use: After the animation state is assigned, and before `requestAnimationFrame`, so a later await cannot miss the finish.
 * Expected outcome: The promise resolves once. A later finish or cancel does not resolve it again.
 * Exceptions: None. A listener error is logged by the notifier that runs it.
 */
export function waitForNextResolutionPlaybackFinished(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      removePlaybackListener(playbackFinishedListeners, finish);
      removePlaybackListener(playbackAbandonedListeners, finish);
      resolve();
    };
    playbackFinishedListeners.push(finish);
    playbackAbandonedListeners.push(finish);
  });
}

/**
 * Releases waits that were waiting for a playback this caller just cancelled.
 *
 * Purpose: Cancelling the animation does not finish it, but a watch must not stay parked on the old battle entry.
 * When to use: From the teardown that clears `resolutionMoveAnimation` without flushing playback-complete notifies.
 * Expected outcome: Each abandoned wait resolves once. Playback-finished listeners, including auto-advance, are not called.
 * Exceptions: Logs a listener error and continues.
 */
export function abandonResolutionPlaybackWaits(): void {
  const waiting = [...playbackAbandonedListeners];
  playbackAbandonedListeners.length = 0;
  for (const listener of waiting) {
    try {
      listener();
    } catch (err) {
      console.error('resolutionPlaybackDeferral: abandoned playback wait failed', err);
    }
  }
}

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
  notifyResolutionPlaybackFinished();
}
