/**
 * Whether replay is on, and where it is.
 *
 * Purpose: Any module can ask `replayActive()` without importing the rest of replay. This file imports no other replay file.
 * When to use: Guards that must do nothing while a past turn is on screen, and the replay panel's change subscription.
 * Expected outcome: One module-level state with listeners that run on every change.
 * Exceptions: None. A listener that throws is logged and does not stop the others.
 */

import type { ReplayTimeline } from '../../shared/replayTypes';

/**
 * Where replay is.
 *
 * Purpose: The panel and the stepping code read one object.
 * When to use: `currentReplay` and `setReplay`.
 * Expected outcome: The timeline, the step on screen, and whether a step is loading.
 * Exceptions: None.
 */
export interface ReplayState {
  /**
   * The recorded steps for this replay.
   *
   * Contract: Read once when replay was entered. Never changed afterwards.
   * When to use: The label, the slider, and the turn field.
   * Expected outcome: Steps oldest first.
   * Exceptions: None.
   */
  readonly timeline: ReplayTimeline;
  /**
   * The index of the step on screen.
   *
   * Contract: A zero-based index into `timeline.steps`.
   * When to use: The panel and the step buttons.
   * Expected outcome: The step shown.
   * Exceptions: None.
   */
  readonly index: number;
  /**
   * Whether a step is loading.
   *
   * Contract: True from the request until the reply.
   * When to use: Disabling the step buttons.
   * Expected outcome: True while a request is in flight.
   * Exceptions: None.
   */
  readonly busy: boolean;
  /**
   * The match this replay belongs to.
   *
   * Contract: The renderer's match epoch when replay was entered.
   * When to use: Dropping a reply for a match that was replaced.
   * Expected outcome: The epoch value.
   * Exceptions: None.
   */
  readonly matchEpoch: number;
}

/**
 * The current replay state.
 *
 * Purpose: Null means replay is off.
 * When to use: Only through the functions below.
 * Expected outcome: The state or null.
 * Exceptions: None.
 */
let replayState: ReplayState | null = null;

/**
 * Functions to call after every change.
 *
 * Purpose: The panel redraws when the state changes, without `replayMode.ts` importing it.
 * When to use: `onReplayChange` adds to it.
 * Expected outcome: Called in the order added.
 * Exceptions: None.
 */
const replayListeners: Array<() => void> = [];

/**
 * The function that leaves replay.
 *
 * Purpose: Other modules leave replay without importing `replayMode.ts`.
 * When to use: `registerReplayLeaver` sets it. `requestReplayLeave` runs it.
 * Expected outcome: Null until replay mode binds its dependencies.
 * Exceptions: None.
 */
let replayLeaver: (() => Promise<void>) | null = null;

/**
 * Whether replay is on.
 *
 * Purpose: Guards across the renderer ask this one question.
 * When to use: Before an action that must not change or select anything in a past turn.
 * Expected outcome: True while a replay state is set.
 * Exceptions: None.
 */
export function replayActive(): boolean {
  return replayState !== null;
}

/**
 * Reads the replay state.
 *
 * Purpose: The panel and the stepping code need the timeline and the index.
 * When to use: Any time after replay might have started.
 * Expected outcome: The state, or null when replay is off.
 * Exceptions: None.
 */
export function currentReplay(): ReplayState | null {
  return replayState;
}

/**
 * Sets the replay state and tells the listeners.
 *
 * Purpose: Every change goes through here, so the panel always redraws.
 * When to use: Entering, stepping, loading, and leaving.
 * Expected outcome: The new state is stored and each listener runs once.
 * Exceptions: None. A listener failure is logged with `console.error`.
 */
export function setReplay(next: ReplayState | null): void {
  replayState = next;
  for (const listener of replayListeners) {
    try {
      listener();
    } catch (error) {
      console.error('replay listener failed', error);
    }
  }
}

/**
 * Adds a function to call after every change.
 *
 * Purpose: The panel subscribes once at startup.
 * When to use: From the panel's wiring.
 * Expected outcome: The listener runs after each `setReplay`.
 * Exceptions: None.
 */
export function onReplayChange(listener: () => void): void {
  replayListeners.push(listener);
}

/**
 * Registers the function that leaves replay.
 *
 * Purpose: Modules outside this folder leave replay through `requestReplayLeave`.
 * When to use: Once, when replay mode binds its dependencies.
 * Expected outcome: `requestReplayLeave` runs `leave` while replay is on.
 * Exceptions: None.
 */
export function registerReplayLeaver(leave: () => Promise<void>): void {
  replayLeaver = leave;
}

/**
 * Leaves replay when it is on.
 *
 * Purpose: The game menu and similar actions must act on the present.
 * When to use: Before an action that needs the live match.
 * Expected outcome: Resolves once replay is off. Resolves at once when it was not on.
 * Exceptions: Propagates a failure of the registered leaver.
 */
export async function requestReplayLeave(): Promise<void> {
  if (replayState === null || replayLeaver === null) return;
  await replayLeaver();
}

/**
 * Drops replay without applying anything.
 *
 * Purpose: A new match replaces the one replay belongs to, and the live state is already the new match's.
 * When to use: Where a new match's state is applied.
 * Expected outcome: Replay is off and the body attribute is removed. No snapshot is applied.
 * Exceptions: None.
 */
export function abandonReplay(): void {
  if (replayState === null) return;
  setReplay(null);
  delete document.body.dataset.replay;
}
