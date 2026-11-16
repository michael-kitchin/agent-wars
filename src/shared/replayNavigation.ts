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
 * Sentence shown when replay is asked for while a turn is resolving.
 *
 * Purpose: The player learns why `p` did nothing.
 * When to use: `replayMayEnter` and the toast.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
export const REPLAY_BUSY_REASON = 'Replay is available once this turn finishes resolving.';

/**
 * Sentence shown when replay is asked for during a battle.
 *
 * Purpose: Replay covers the strategic game only.
 * When to use: `replayMayEnter` and the toast.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
export const REPLAY_IN_BATTLE_REASON = 'Replay inside a battle is not available yet. Leave the battle to replay the match.';

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
 * Expected outcome: Six flags read from the screen.
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
   * Whether a tactical battle is on screen.
   *
   * Contract: True while a battle snapshot is open.
   * When to use: Refusing with a sentence.
   * Expected outcome: True refuses with the battle sentence.
   * Exceptions: None.
   */
  readonly inBattle: boolean;
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
 * Purpose: Replay must not start over a turn in progress or another dialog.
 * When to use: Pressing `p` while not in replay.
 * Expected outcome: `ok`, or a refusal with the sentence to show, or null to do nothing silently.
 * Exceptions: None.
 */
export function replayMayEnter(input: ReplayEntryState): { ok: true } | { ok: false; reason: string | null } {
  if (!input.matchLoaded) return { ok: false, reason: null };
  if (input.otherModalOpen) return { ok: false, reason: null };
  if (input.newGameOpenMidMatch) return { ok: false, reason: null };
  if (input.readyInFlight || input.playbackRunning) return { ok: false, reason: REPLAY_BUSY_REASON };
  if (input.inBattle) return { ok: false, reason: REPLAY_IN_BATTLE_REASON };
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
}

/**
 * Whether step back is possible.
 *
 * Purpose: A button is enabled only when its action can happen.
 * When to use: Drawing the panel.
 * Expected outcome: True when an earlier step exists and nothing is loading.
 * Exceptions: None.
 */
export function canStepBack(position: ReplayPosition): boolean {
  return position.index > 0 && !position.busy;
}

/**
 * Whether step forward is possible.
 *
 * Purpose: A button is enabled only when its action can happen.
 * When to use: Drawing the panel.
 * Expected outcome: True when a later step exists and nothing is loading.
 * Exceptions: None.
 */
export function canStepForward(position: ReplayPosition): boolean {
  return position.index < position.stepCount - 1 && !position.busy;
}

/**
 * Whether Play is possible.
 *
 * Purpose: Animated playback is not built yet, so the button stays disabled.
 * When to use: Drawing the panel.
 * Expected outcome: Always false in this build.
 * Exceptions: None.
 */
export function canPlay(position: ReplayPosition): boolean {
  void position;
  return false;
}

/**
 * Reads a typed turn number.
 *
 * Purpose: Only positive whole numbers that were recorded are accepted.
 * When to use: Every input event in the turn field, and on Enter or blur.
 * Expected outcome: The index of the step with that turn, or an error.
 * Exceptions: None.
 */
export function parseTurnEntry(text: string, steps: readonly ReplayStepRef[]): { index: number } | { error: true } {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return { error: true };
  const turn = Number(trimmed);
  if (!Number.isSafeInteger(turn) || turn < 1) return { error: true };
  const index = steps.findIndex((step) => step.turnNumber === turn);
  return index < 0 ? { error: true } : { index };
}

/**
 * The panel label for a step.
 *
 * Purpose: The label says which turn is shown out of how many.
 * When to use: Drawing the panel.
 * Expected outcome: `Replay · Turn 12 of 30`, where 30 is the last step's turn.
 * Exceptions: None.
 */
export function replayLabel(steps: readonly ReplayStepRef[], index: number): string {
  const current = steps[index]?.turnNumber ?? 0;
  const last = steps[steps.length - 1]?.turnNumber ?? 0;
  return `Replay · Turn ${current} of ${last}`;
}
