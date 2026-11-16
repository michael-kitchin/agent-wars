/**
 * Pure rules for replay: which view, when it may start, which buttons work, and what a typed turn means.
 *
 * Purpose: The replay screen only reads the page and calls these functions, so every rule has a test.
 * When to use: Entering replay, drawing the panel, and reading the turn field.
 * Expected outcome: Plain answers. Nothing here reads the page or the database.
 * Exceptions: None.
 */

import type { ReplayStepRef, ReplayView } from './replayTypes';

/**
 * The level a replay timeline covers.
 *
 * Purpose: A timeline holds the strategic turns or one battle's beats, never both.
 * When to use: The label, the turn field, and the button rules that depend on the level.
 * Expected outcome: One of the two names.
 * Exceptions: None.
 */
export type ReplayScope = 'strategic' | 'tactical';

/**
 * Sentence shown when replay is asked for while a turn is resolving.
 *
 * Purpose: The player learns why `p` did nothing.
 * When to use: `replayMayEnter` and the toast.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
export const REPLAY_BUSY_REASON = 'Replay is available once this turn finishes resolving.';

/**
 * Chooses which recorded picture replay shows.
 *
 * Purpose: A player sees what they could see then. An observer, and anyone after the match, sees everything.
 * When to use: Building the timeline.
 * Expected outcome: `player` when a human seat is active and the match is not over, otherwise `all`.
 * Exceptions: None.
 */
export function replayViewFor(input: { readonly humanSeatActive: boolean; readonly gameOver: boolean }): ReplayView {
  return input.humanSeatActive && !input.gameOver ? 'player' : 'all';
}

/**
 * What decides whether replay may start.
 *
 * Purpose: One object keeps the entry check readable.
 * When to use: `replayMayEnter`.
 * Expected outcome: Five flags read from the screen.
 * Exceptions: None.
 */
export interface ReplayEntryState {
  /**
   * Whether a match is open.
   *
   * Contract: True when the state has seats.
   * When to use: First check.
   * Expected outcome: False refuses silently.
   * Exceptions: None.
   */
  readonly matchLoaded: boolean;
  /**
   * Whether a Ready request is in flight.
   *
   * Contract: True while a turn is resolving.
   * When to use: Refusing with a sentence.
   * Expected outcome: True refuses with the busy sentence.
   * Exceptions: None.
   */
  readonly readyInFlight: boolean;
  /**
   * Whether resolution playback is running.
   *
   * Contract: True while moves are animating.
   * When to use: Refusing with a sentence.
   * Expected outcome: True refuses with the busy sentence.
   * Exceptions: None.
   */
  readonly playbackRunning: boolean;
  /**
   * Whether another dialog is open.
   *
   * Contract: True for a blocking dialog or the charts dialog.
   * When to use: Refusing silently.
   * Expected outcome: True refuses with no sentence.
   * Exceptions: None.
   */
  readonly otherModalOpen: boolean;
  /**
   * Whether the new-game panel is open over a running match.
   *
   * Contract: False at game over, when the panel shows standings.
   * When to use: Refusing silently.
   * Expected outcome: True refuses with no sentence.
   * Exceptions: None.
   */
  readonly newGameOpenMidMatch: boolean;
}

/**
 * Decides whether replay may start.
 *
 * Purpose: Replay must not start over a turn in progress or another dialog. It may start in a battle, where it covers that battle's beats.
 * When to use: Pressing `p` while not in replay.
 * Expected outcome: `ok`, or a refusal with the sentence to show, or null to do nothing silently.
 * Exceptions: None.
 */
export function replayMayEnter(input: ReplayEntryState): { ok: true } | { ok: false; reason: string | null } {
  if (!input.matchLoaded) return { ok: false, reason: null };
  if (input.otherModalOpen) return { ok: false, reason: null };
  if (input.newGameOpenMidMatch) return { ok: false, reason: null };
  if (input.readyInFlight || input.playbackRunning) return { ok: false, reason: REPLAY_BUSY_REASON };
  return { ok: true };
}

/**
 * Where the player is in the timeline.
 *
 * Purpose: The three button rules read the same position.
 * When to use: Drawing the panel.
 * Expected outcome: The step count, the current index, and whether a step is loading.
 * Exceptions: None.
 */
export interface ReplayPosition {
  /**
   * How many steps the timeline holds.
   *
   * Contract: A whole number, 0 or more.
   * When to use: The forward rule.
   * Expected outcome: The length of the steps list.
   * Exceptions: None.
   */
  readonly stepCount: number;
  /**
   * The step on screen.
   *
   * Contract: A zero-based index.
   * When to use: Both step rules.
   * Expected outcome: The current index.
   * Exceptions: None.
   */
  readonly index: number;
  /**
   * Whether a step is loading.
   *
   * Contract: True from the request until the reply.
   * When to use: Disabling every step button.
   * Expected outcome: True disables them.
   * Exceptions: None.
   */
  readonly busy: boolean;
  /**
   * Whether Play is running.
   *
   * Contract: True from the start of playback until it stops or replay is left.
   * When to use: Disabling the step buttons, the slider, and the turn field, and turning Play into Pause.
   * Expected outcome: True disables every control except Pause.
   * Exceptions: None.
   */
  readonly playing: boolean;
}

/**
 * How long Play holds each step before the animations into the next one start.
 *
 * Purpose: Each step is shown with its dialogs for a moment before the units move, so the player can read it.
 * When to use: The play loop's hold between steps.
 * Expected outcome: 1000 milliseconds.
 * Exceptions: None.
 */
export const REPLAY_PLAYBACK_DWELL_MS = 1000;

/**
 * Whether step back is possible.
 *
 * Purpose: A button is enabled only when its action can happen.
 * When to use: Drawing the panel.
 * Expected outcome: True when an earlier step exists and nothing is loading or playing.
 * Exceptions: None.
 */
export function canStepBack(position: ReplayPosition): boolean {
  return position.index > 0 && !position.busy && !position.playing;
}

/**
 * Whether step forward is possible.
 *
 * Purpose: A button is enabled only when its action can happen.
 * When to use: Drawing the panel.
 * Expected outcome: True when a later step exists and nothing is loading or playing.
 * Exceptions: None.
 */
export function canStepForward(position: ReplayPosition): boolean {
  return position.index < position.stepCount - 1 && !position.busy && !position.playing;
}

/**
 * Whether the Play button can be pressed.
 *
 * Purpose: While playing, the button is Pause and stays enabled. Otherwise it needs a step after the one showing.
 * When to use: Drawing the panel.
 * Expected outcome: True while playing, or when a later step exists and nothing is loading.
 * Exceptions: None.
 */
export function canPlay(position: ReplayPosition): boolean {
  if (position.playing) return true;
  return position.index < position.stepCount - 1 && !position.busy;
}

/**
 * Whether the slider and the turn field can be used.
 *
 * Purpose: Jumping to a step while playback runs would fight the play loop.
 * When to use: Drawing the panel.
 * Expected outcome: True when nothing is loading and playback is not running.
 * Exceptions: None.
 */
export function canSeek(position: ReplayPosition): boolean {
  return !position.busy && !position.playing;
}

/**
 * Chooses the step Play shows next.
 *
 * Purpose: The play loop's one decision: continue to the next step, or end.
 * When to use: At the top of each pass of the play loop.
 * Expected outcome: The next index, or null when a stop was requested or the last step is showing.
 * Exceptions: None.
 */
export function nextPlaybackIndex(position: ReplayPosition, stopRequested: boolean): number | null {
  if (stopRequested) return null;
  return position.index < position.stepCount - 1 ? position.index + 1 : null;
}

/**
 * Reads a typed turn or beat number.
 *
 * Purpose: Only positive whole numbers that were recorded are accepted. A strategic timeline matches turn numbers and a tactical one matches beat numbers.
 * When to use: Every input event in the turn field, and on Enter or blur.
 * Expected outcome: The index of the step with that number, or an error.
 * Exceptions: None.
 */
export function parseTurnEntry(
  text: string,
  steps: readonly ReplayStepRef[],
  scope: ReplayScope = 'strategic'
): { index: number } | { error: true } {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { error: true };
  const entered = Number(trimmed);
  if (!Number.isSafeInteger(entered) || entered < 1) return { error: true };
  const index = steps.findIndex((step) => stepNumber(step, scope) === entered);
  return index < 0 ? { error: true } : { index };
}

/**
 * The panel label for a step.
 *
 * Purpose: The label says which turn, or which beat inside a battle, is shown out of how many.
 * When to use: Drawing the panel.
 * Expected outcome: `Replay · Turn 12 of 30`, or `Replay · Beat 3 of 7` for a tactical timeline, where the last number is the last step's.
 * Exceptions: None.
 */
export function replayLabel(steps: readonly ReplayStepRef[], index: number, scope: ReplayScope = 'strategic'): string {
  const current = steps[index] ? stepNumber(steps[index], scope) : 0;
  const lastStep = steps[steps.length - 1];
  const last = lastStep ? stepNumber(lastStep, scope) : 0;
  return `Replay · ${scope === 'tactical' ? 'Beat' : 'Turn'} ${current} of ${last}`;
}

/**
 * The number the panel shows for a step.
 *
 * Purpose: A strategic step is numbered by its turn and a tactical step by its beat.
 * When to use: The label, the slider's turn field, and parsing a typed number.
 * Expected outcome: The turn number or the beat number.
 * Exceptions: None.
 */
export function stepNumber(step: ReplayStepRef, scope: ReplayScope): number {
  return scope === 'tactical' ? step.beatNumber : step.turnNumber;
}
