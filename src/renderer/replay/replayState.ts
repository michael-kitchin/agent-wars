/**
 * Whether replay is on, and where it is.
 *
 * Purpose: Any module can ask `replayActive()` without importing the rest of replay. This file imports no other replay file.
 * When to use: Guards that must do nothing while a past turn is on screen, and the replay panel's change subscription.
 * Expected outcome: One module-level state with listeners that run on every change.
 * Exceptions: None. A listener that throws is logged and does not stop the others.
 */

import type { ReplayTimeline } from '../../shared/replayTypes';
import { rendererMatchEpochCurrent } from '../core/matchEpoch';

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
   * Whether a step is loading or being put on screen.
   *
   * Contract: True from the request until the reply, and again while `presentReplayStep` shows the loaded step's snapshot and dialogs.
   * When to use: Disabling the step buttons.
   * Expected outcome: True while a request is in flight or a loaded step is being shown.
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
  /**
   * Whether Play is running.
   *
   * Contract: False when replay is entered. Set by the play loop and cleared when it stops or replay is left.
   * When to use: Disabling the step controls and turning Play into Pause.
   * Expected outcome: True from the start of playback until it ends.
   * Exceptions: None.
   */
  readonly playing: boolean;
  /**
   * Whether the player asked playback to stop.
   *
   * Contract: False when replay is entered and when playback starts. Set by Pause and by leaving replay.
   * When to use: The play loop reads it after the turn in progress.
   * Expected outcome: True makes the loop end after the turn that is animating.
   * Exceptions: None.
   */
  readonly stopRequested: boolean;
  /**
   * Which entry into replay this state belongs to.
   *
   * Contract: A number raised by `nextReplaySession` each time replay is entered.
   * When to use: A loop that outlives its replay compares it with the one it started in.
   * Expected outcome: A different number for every entry.
   * Exceptions: None.
   */
  readonly session: number;
}

/**
 * The last session number handed out.
 *
 * Purpose: Each entry into replay gets its own number, so work left over from an earlier entry can tell it is stale.
 * When to use: Read and raised only by `nextReplaySession`.
 * Expected outcome: 0 until replay is first entered.
 * Exceptions: None.
 */
let lastReplaySession = 0;

/**
 * Hands out the session number for a new entry into replay.
 *
 * Purpose: Playback that outlives its replay must not act on a later one.
 * When to use: Once, when replay is entered.
 * Expected outcome: A number larger than every earlier one.
 * Exceptions: None.
 */
export function nextReplaySession(): number {
  lastReplaySession += 1;
  return lastReplaySession;
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
  for (const listener of [...replayListeners]) {
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
 * Whether a leave is running.
 *
 * Purpose: A leave turns replay off before it has put the live match back on screen, so `replayActive()` is already false while it finishes. Actions that need the live match must still wait.
 * When to use: `setReplayLeaveRunning` sets it. `replayLeaveRunning` and `requestReplayLeave` read it.
 * Expected outcome: True from the start of a leave until it settles.
 * Exceptions: None.
 */
let leaveRunning = false;

/**
 * Records whether a leave is running.
 *
 * Purpose: Replay mode owns the leave, and the rest of the renderer only needs to know that one is running.
 * When to use: `leaveReplay` in replay mode, when a leave starts and when it settles.
 * Expected outcome: `replayLeaveRunning` reports `running`.
 * Exceptions: None.
 */
export function setReplayLeaveRunning(running: boolean): void {
  leaveRunning = running;
}

/**
 * Reports whether a leave is running.
 *
 * Purpose: The game menu holds a click that changes or saves the match while replay is on or still being left.
 * When to use: Before running an action that needs the live match on screen.
 * Expected outcome: True from the start of a leave until it settles.
 * Exceptions: None.
 */
export function replayLeaveRunning(): boolean {
  return leaveRunning;
}

/**
 * Leaves replay when it is on, or waits for a leave that is running.
 *
 * Purpose: The game menu and similar actions must act on the present.
 * When to use: Before an action that needs the live match.
 * Expected outcome: Resolves once replay is off and the live match is back on screen. Resolves at once when replay was not on and no leave is running.
 * Exceptions: Propagates a failure of the registered leaver.
 */
export async function requestReplayLeave(): Promise<void> {
  if ((replayState === null && !leaveRunning) || replayLeaver === null) return;
  await replayLeaver();
}

/**
 * Drops replay without applying anything.
 *
 * Purpose: A new match replaces the one replay belongs to, and the live state is already the new match's.
 * When to use: From `abandonReplayForNewMatch` in replay mode, which also stops the animation and refreshes the console.
 * Expected outcome: Replay is off and the body attribute is removed. No snapshot is applied. The copies replay mode kept for leaving are not put back; the next entry replaces them.
 * Exceptions: None.
 */
export function abandonReplay(): void {
  if (replayState === null) return;
  setReplay(null);
  delete document.body.dataset.replay;
}

/**
 * Resolves once no replay step is loading.
 *
 * Purpose: Leaving replay while a step is loading must wait for that step to settle before it shows the last one.
 * When to use: Through `waitForStepToSettle`, which also waits past the gap between loading and showing.
 * Expected outcome: Resolves at once when replay is off or idle, and otherwise after the change that clears the busy flag or ends replay.
 * Exceptions: None.
 */
export function waitForReplayIdle(): Promise<void> {
  return new Promise((resolve) => {
    const settled = (): boolean => replayState === null || !replayState.busy;
    if (settled()) {
      resolve();
      return;
    }
    const listener = (): void => {
      if (!settled()) return;
      replayListeners.splice(replayListeners.indexOf(listener), 1);
      resolve();
    };
    replayListeners.push(listener);
  });
}

/**
 * Resolves once no step is loading or being presented.
 *
 * Purpose: A step clears the busy flag when its read returns and sets it again when its presentation starts in a later microtask, so one idle event is not enough. This waits for idle and then for the next task before it checks again. `loadReplayStep` refuses while a step is busy, so a leave or a released slider must wait here before it shows a step.
 * When to use: From `runLeaveReplay` before it shows the last step, and from the slider's release before it shows the released step.
 * Expected outcome: Resolves when replay is off, when the flag stays clear across a task boundary, or at once when the match replay belongs to was replaced, since no step of that match will be shown.
 * Exceptions: None.
 */
export async function waitForStepToSettle(): Promise<void> {
  for (let state = currentReplay(); state?.busy && rendererMatchEpochCurrent(state.matchEpoch); state = currentReplay()) {
    await waitForReplayIdle();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
