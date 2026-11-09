/**
 * The stored cap on how many beats an AI-only battle can run.
 *
 * Purpose: The new-game dropdown and the battle-end check share one parser.
 * When to use: Starting a match, reading `ai_only_beat_limit` back, and deciding whether a finished beat ends the battle.
 * Expected outcome: Helpers do not read the database. Callers pass the value they already have.
 * Exceptions: None. This module does not import the main-process logger.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';
import { DEFAULT_TURN_LIMIT, TURN_LIMIT_OPTIONS } from './victoryRules';

/**
 * `game_config` key for the beat limit.
 *
 * Purpose: A match remembers the most beats one AI-only battle can run.
 * When to use: Writing the row at match start, and reading it back.
 * Expected outcome: The string `ai_only_beat_limit`.
 * Exceptions: None.
 */
export const AI_ONLY_BEAT_LIMIT_CONFIG_KEY = 'ai_only_beat_limit';

/**
 * Stored row and dropdown value for Unlimited.
 *
 * Purpose: Unlimited is not a number, so the row and the option share this word.
 * When to use: Writing a null limit, and painting the last option.
 * Expected outcome: The string `unlimited`.
 * Exceptions: None.
 */
export const AI_ONLY_BEAT_LIMIT_UNLIMITED = 'unlimited';

/**
 * Beat counts the dropdown offers.
 *
 * Purpose: The list matches the turn-limit list by design, so the two controls stay the same shape.
 * When to use: Validating a requested limit and painting the dropdown.
 * Expected outcome: 20, 30, 40, and 50.
 * Exceptions: None.
 */
export const AI_ONLY_BEAT_LIMIT_OPTIONS = TURN_LIMIT_OPTIONS;

/**
 * Beat limit stored when a new game does not name one.
 *
 * Purpose: A fresh match caps an AI-only battle at the usual turn length.
 * When to use: `aiOnlyBeatLimitForRequest` and the new-game dropdown.
 * Expected outcome: 30.
 * Exceptions: None.
 */
export const DEFAULT_AI_ONLY_BEAT_LIMIT = DEFAULT_TURN_LIMIT;

/**
 * A beat limit: a listed count, or null for Unlimited.
 *
 * Purpose: Null is the stored Unlimited value and the value a missing row reads as.
 * When to use: The start payload and the battle-end check.
 * Expected outcome: `null` or one of `AI_ONLY_BEAT_LIMIT_OPTIONS`.
 * Exceptions: None.
 */
export type AiOnlyBeatLimit = number | null;

/**
 * Whether a value is one of the listed beat counts.
 *
 * Purpose: Request parsing and stored-row parsing share the same list.
 * When to use: `aiOnlyBeatLimitForRequest` and `aiOnlyBeatLimitFromStored`.
 * Expected outcome: True only for 20, 30, 40, or 50.
 * Exceptions: None.
 */
function isListedBeatLimit(value: number): boolean {
  return (AI_ONLY_BEAT_LIMIT_OPTIONS as readonly number[]).includes(value);
}

/**
 * The limit to store when a match starts.
 *
 * Purpose: Null stays Unlimited. A listed number is stored as itself. Anything else stores the default.
 * When to use: `resetGameForNewMatch` with the start payload.
 * Expected outcome: `null` for null. The number for a listed number. 30 for an omitted or unlisted value.
 * Exceptions: None.
 */
export function aiOnlyBeatLimitForRequest(value: unknown): AiOnlyBeatLimit {
  if (value === null) return null;
  if (typeof value === 'number' && isListedBeatLimit(value)) return value;
  return DEFAULT_AI_ONLY_BEAT_LIMIT;
}

/**
 * The limit stored in `game_config`.
 *
 * Purpose: A missing row is an old save and must keep playing with no beat cap.
 * When to use: After reading the `ai_only_beat_limit` row.
 * Expected outcome: A listed number for a string that names one. Null for anything else, including a missing row and `unlimited`.
 * Exceptions: None.
 */
export function aiOnlyBeatLimitFromStored(value: unknown): AiOnlyBeatLimit {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return isListedBeatLimit(parsed) ? parsed : null;
}

/**
 * The row and the dropdown value for a limit.
 *
 * Purpose: Unlimited and a number have to round-trip through one string column.
 * When to use: Writing the row, and setting the dropdown's selected value.
 * Expected outcome: `unlimited` for null. The decimal digits for a number.
 * Exceptions: None.
 */
export function aiOnlyBeatLimitToStored(limit: AiOnlyBeatLimit): string {
  return limit === null ? AI_ONLY_BEAT_LIMIT_UNLIMITED : String(limit);
}

/**
 * Whether the beat that just finished has reached the match's limit.
 *
 * Purpose: The check runs after that beat's orders resolve, so beat N of a limit of N still plays.
 * When to use: The last end-reason check of an AI-only beat.
 * Expected outcome: True when the limit is a number and the completed beat count is at least that number. Unlimited is never reached.
 * Exceptions: None.
 */
export function aiOnlyBeatLimitReached(completedBeats: number, limit: AiOnlyBeatLimit): boolean {
  return limit !== null && completedBeats >= limit;
}

/**
 * The sentence the result overlay shows when the limit ends the battle.
 *
 * Purpose: The player sees the number of beats the battle was allowed.
 * When to use: After a beat-limit ending, with the beat that just finished.
 * Expected outcome: `The battle reached its maximum of ${beats} beats.`
 * Exceptions: None.
 */
export function formatAiOnlyBeatLimitSentence(beats: number): string {
  return `The battle reached its maximum of ${beats} beats.`;
}

/**
 * How long the beat-limit notice stays up before it closes itself.
 *
 * Purpose: An observer who is auto-advancing still sees why the battle ended.
 * When to use: The timer that closes that notice.
 * Expected outcome: 3000 milliseconds.
 * Exceptions: None.
 */
export const AI_ONLY_BEAT_LIMIT_NOTICE_MS = 3000;

/**
 * How an ended AI-only battle is shown.
 *
 * Purpose: The beat-limit notice is the only ending that both shows a dialog and can close itself.
 * When to use: After playback, once the end reason is known.
 * Expected outcome: `leave_now` skips the dialog. `dialog_until_ok` waits. `timed_dialog` waits, then closes.
 * Exceptions: None.
 */
export type AiOnlyBattleEndPresentation = 'leave_now' | 'dialog_until_ok' | 'timed_dialog';

/**
 * Which notice to show for this ending and this observe checkbox.
 *
 * Purpose: Other endings keep today's behavior. Only a beat limit while auto-advancing uses the timed notice.
 * When to use: `tacticalMaybeScheduleAnnihilationExit`, after the sentence is known.
 * Expected outcome: Checkbox off is `dialog_until_ok`. Checkbox on and `beat_limit` is `timed_dialog`. Checkbox on and any other reason is `leave_now`.
 * Exceptions: None.
 */
export function aiOnlyBattleEndPresentation(
  reason: NonNullable<TacticalBattleSnapshot['aiOnlyEndReason']>,
  autoAdvance: boolean
): AiOnlyBattleEndPresentation {
  if (!autoAdvance) return 'dialog_until_ok';
  return reason === 'beat_limit' ? 'timed_dialog' : 'leave_now';
}

/**
 * Whether leaving this AI-only battle should press Ready.
 *
 * Purpose: Ok on an ordinary result does not start the next turn. Ok on the timed notice does, when the checkbox is still on.
 * When to use: Immediately before `leaveAiOnlyBattle`, while the snapshot and the sentence are still set.
 * Expected outcome: True when auto-advance is on and either no result dialog is open or the ending is the beat limit.
 * Exceptions: None.
 */
export function aiOnlyLeaveStartsNextTurn(args: {
  readonly resultDialogOpen: boolean;
  readonly endReason: TacticalBattleSnapshot['aiOnlyEndReason'];
  readonly autoAdvance: boolean;
}): boolean {
  return args.autoAdvance && (!args.resultDialogOpen || args.endReason === 'beat_limit');
}

/**
 * Whether the beat-limit timer should still close the notice.
 *
 * Purpose: Unticking the checkbox during the wait leaves the dialog up for Ok.
 * When to use: When the timer fires, before it closes the overlay.
 * Expected outcome: True only when a result sentence is showing and auto-advance is still on.
 * Exceptions: None.
 */
export function aiOnlyTimedNoticeStillCloses(sentence: string | null, autoAdvance: boolean): boolean {
  return sentence != null && autoAdvance;
}
