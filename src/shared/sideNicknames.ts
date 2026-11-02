/**
 * The name a player gives a side, and the name the match shows when they do not.
 *
 * Purpose: Chips, tooltips, toasts, and standings share one rule for a nickname and its default.
 * When to use: Any label that names a seat. Prompt builders keep the full home name.
 * Expected outcome: Helpers do not mutate their input.
 * Exceptions: None. This module does not import the main-process logger.
 */

import { shortSideName } from './shortSideName';
import { NEUTRAL_OWNER_ID } from './seatIds';
import { HUMAN_SEAT_KIND, type SeatKind } from './seatRoster';

/**
 * The longest nickname the player can store, in Unicode code points.
 *
 * Purpose: A name has to fit a chip, a dropdown option, and a turn-update sentence.
 * When to use: The nickname inputs, and `normalizeSideNickname`.
 * Expected outcome: 16. Nickname inputs use this as `maxLength`. Normalization also keeps the first 16 code points.
 * Exceptions: None.
 */
export const SIDE_NICKNAME_MAX_LENGTH = 16;

/**
 * The name shown for the human seat when none has been saved.
 *
 * Purpose: The Game Options field and a match with no stored nickname agree.
 * When to use: `sideDisplayName` for a human seat, and the human-nickname setting when its row is missing.
 * Expected outcome: The word Human.
 * Exceptions: None.
 */
export const HUMAN_NICKNAME_DEFAULT = 'Human';

/**
 * `game_config` key for this computer's human nickname.
 *
 * Purpose: The name belongs to the computer, not to one match, so a save does not carry it.
 * When to use: Reading and writing that row. The same string is listed in `MACHINE_LOCAL_CONFIG_KEYS`.
 * Expected outcome: The string `human_nickname`.
 * Exceptions: None.
 */
export const HUMAN_NICKNAME_CONFIG_KEY = 'human_nickname';

/**
 * The seat fields a display name needs.
 *
 * Purpose: A snapshot and a hand-built toast row can both be passed.
 * When to use: `sideDisplayName`.
 * Expected outcome: `nickname` null means the default. `kind` chooses Human or the short home name.
 * Exceptions: None.
 */
export interface SideDisplaySeat {
  /**
   * Stored nickname, or null when the seat has none.
   *
   * Contract: Null, blank, and a rejected value all mean the default.
   * When to use: Whenever the roster or a toast row is in hand.
   * Expected outcome: Cleaned before it is shown.
   * Exceptions: None.
   */
  readonly nickname: string | null;
  /**
   * Full home name.
   *
   * Contract: The seat's `homeRegion`. Blank means the seat id is the AI default.
   * When to use: The AI fallback.
   * Expected outcome: Not shown while a nickname is stored.
   * Exceptions: None.
   */
  readonly homeRegion: string;
  /**
   * Seat id.
   *
   * Contract: The roster id.
   * When to use: The AI fallback when the home name is blank.
   * Expected outcome: Shown only in that case.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Whether a person or a commander plays the seat.
   *
   * Contract: `HUMAN_SEAT_KIND` or `AI_SEAT_KIND`.
   * When to use: Choosing the default.
   * Expected outcome: A human seat defaults to Human.
   * Exceptions: None.
   */
  readonly kind: SeatKind;
}

const DISALLOWED_NICKNAME_CHARACTER = /[^\p{L}\p{M}\p{N} .'\u2019-]/gu;

/**
 * Cleans a nickname the player typed or a save carried.
 *
 * Purpose: The turn-update painter finds names by splitting on a few words, and tooltips insert the name as text.
 * When to use: Before storing a nickname and before showing one.
 * Expected outcome: Letters, marks, numbers, spaces, `.`, `-`, a straight apostrophe, and U+2019 stay. Other characters are
 *   dropped. Whitespace collapses and the ends are trimmed. Longer than 16 code points is cut. `you`, `your`,
 *   and `neutral` in any letter case return `''`. A value containing ` lost `, ` took `, or ` and ` returns `''`.
 *   A non-string returns `''`.
 * Exceptions: None.
 */
export function normalizeSideNickname(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(DISALLOWED_NICKNAME_CHARACTER, '').replace(/\s+/g, ' ').trim();
  const capped = Array.from(cleaned).slice(0, SIDE_NICKNAME_MAX_LENGTH).join('').trim();
  const lower = capped.toLowerCase();
  if (lower === 'you' || lower === 'your' || lower === NEUTRAL_OWNER_ID) return '';
  if (lower.includes(' lost ') || lower.includes(' took ') || lower.includes(' and ')) return '';
  return capped;
}

/**
 * The name an AI seat shows when it has no nickname.
 *
 * Purpose: Today's short home name stays the default, including for a match saved before nicknames.
 * When to use: `sideDisplayName` when no nickname is stored, and `storedAiNickname` when deciding whether a typed name is that default.
 * Expected outcome: `shortSideName` of a non-blank home. Otherwise `seatId`.
 * Exceptions: None.
 */
export function defaultAiNickname(homeRegion: string, seatId: string): string {
  return homeRegion.trim().length > 0 ? shortSideName(homeRegion) : seatId;
}

/**
 * The nickname text a field should show.
 *
 * Purpose: The short home name can be longer than the field's cap, and parentheses in it are not a custom name.
 * When to use: Filling the commander nickname field, and reading it back on blur or Enter.
 * Expected outcome: The full `defaultNickname` when the cleaned value is empty or only repeats that default.
 *   Otherwise the cleaned value, at most 16 code points.
 * Exceptions: None.
 */
export function nicknameFieldValue(value: unknown, defaultNickname: string): string {
  const cleaned = normalizeSideNickname(value);
  if (cleaned.length === 0 || cleaned === normalizeSideNickname(defaultNickname)) return defaultNickname;
  return cleaned;
}

/**
 * The AI nickname to store.
 *
 * Purpose: A name the player did not change must stay null, so a long short home name is not cut to 16 characters.
 * When to use: Starting a match, and saving a nickname during a match.
 * Expected outcome: Null when the cleaned value is empty or equal to the cleaned short home name. Otherwise the cleaned value.
 * Exceptions: None.
 */
export function storedAiNickname(value: unknown, homeRegion: string, seatId: string): string | null {
  const cleaned = normalizeSideNickname(value);
  if (cleaned.length === 0) return null;
  if (cleaned === normalizeSideNickname(defaultAiNickname(homeRegion, seatId))) return null;
  return cleaned;
}

/**
 * The name the UI shows for one seat.
 *
 * Purpose: Chips, tooltips, toasts, cards, and standings share one answer.
 * When to use: Any on-screen side name. Do not pass the result through `shortSideName`.
 * Expected outcome: The cleaned nickname when it is non-empty. Otherwise Human for a human seat, the short home
 *   name for an AI seat, or the seat id when that home is blank.
 * Exceptions: None.
 */
export function sideDisplayName(seat: SideDisplaySeat): string {
  const nickname = normalizeSideNickname(seat.nickname);
  if (nickname.length > 0) return nickname;
  if (seat.kind === HUMAN_SEAT_KIND) return HUMAN_NICKNAME_DEFAULT;
  return defaultAiNickname(seat.homeRegion, seat.seatId);
}
