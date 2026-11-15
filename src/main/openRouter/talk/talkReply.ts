/**
 * Turns a talk-stage reply into messages and stances.
 *
 * Purpose: One model reply becomes the lists a talk round can store.
 * When to use: After a talk call returns text.
 * Expected outcome: A parsed reply, or null when the text is not one JSON object. Refused entries are counted and left out.
 * Exceptions: None. A reply that is not an object returns null rather than throwing.
 */

import { logTrace } from '../../logger';
import { isSeatId, type SeatId } from '../../../shared/seatIds';
import { playerIdCodeFor } from '../../../shared/unitIds';
import {
  cleanSideMessageText,
  isSideStance,
  SIDE_MESSAGE_MAX_CHARS,
  SIDE_STANCE_REASON_MAX_CHARS,
  type SideStance,
} from '../../../shared/sideMessages';

/**
 * One message a commander chose to send.
 *
 * Contract: `toSeatId` is another seat still in the match. `text` is cleaned and non-empty.
 * When to use: Storing a closed talk round.
 * Expected outcome: One recipient and one line.
 * Exceptions: None.
 */
export interface TalkReplyMessage {
  /**
   * The seat the message is addressed to.
   *
   * Contract: A `SeatId` other than the speaker, and one of the active seats.
   * When to use: The `to_seat_id` column.
   * Expected outcome: The resolved recipient.
   * Exceptions: None.
   */
  readonly toSeatId: SeatId;
  /**
   * The cleaned message.
   *
   * Contract: Non-empty, at most `SIDE_MESSAGE_MAX_CHARS`.
   * When to use: The message body. Do not log it.
   * Expected outcome: The stored text.
   * Exceptions: None.
   */
  readonly text: string;
}

/**
 * One stance a commander chose to set.
 *
 * Contract: `towardSeatId` is another active seat. `stance` is one of the five. `reason` may be empty.
 * When to use: Writing `side_stances`.
 * Expected outcome: The private view of one side.
 * Exceptions: None.
 */
export interface TalkReplyStance {
  /**
   * The seat the stance is about.
   *
   * Contract: A `SeatId` other than the speaker, and one of the active seats.
   * When to use: The `toward_seat_id` column.
   * Expected outcome: The resolved side.
   * Exceptions: None.
   */
  readonly towardSeatId: SeatId;
  /**
   * The private stance.
   *
   * Contract: A `SideStance`.
   * When to use: The stance column.
   * Expected outcome: One of the five words.
   * Exceptions: None.
   */
  readonly stance: SideStance;
  /**
   * The one-sentence reason, after cleaning.
   *
   * Contract: Text, possibly empty, at most `SIDE_STANCE_REASON_MAX_CHARS`.
   * When to use: The reason column. Do not log it.
   * Expected outcome: The stored reason.
   * Exceptions: None.
   */
  readonly reason: string;
}

/**
 * A talk reply that parsed.
 *
 * Contract: Each recipient appears once in `messages` and once in `stances`. `droppedCount` is the number of entries that were refused.
 * When to use: The result of `parseTalkReply`.
 * Expected outcome: The lists to store, which may both be empty.
 * Exceptions: None.
 */
export interface ParsedTalkReply {
  /**
   * Messages that passed the rules.
   *
   * Contract: One per recipient. The first entry for a recipient is the one kept.
   * When to use: Inserting sent messages when the round closes.
   * Expected outcome: The accepted messages.
   * Exceptions: None.
   */
  readonly messages: readonly TalkReplyMessage[];
  /**
   * Stances that passed the rules.
   *
   * Contract: One per side. An empty reason is kept.
   * When to use: Updating stances when the round closes.
   * Expected outcome: The accepted stances.
   * Exceptions: None.
   */
  readonly stances: readonly TalkReplyStance[];
  /**
   * How many entries were refused.
   *
   * Contract: A count of message and stance entries that did not pass.
   * When to use: A trace log. Do not log the refused text.
   * Expected outcome: Zero when every entry was kept.
   * Exceptions: None.
   */
  readonly droppedCount: number;
}

/**
 * The JSON object inside a reply, from the first `{` to the last `}`.
 *
 * Purpose: A model sometimes wraps the object in a markdown fence or a sentence.
 * When to use: Before `JSON.parse`.
 * Expected outcome: The slice, or null when there is no object.
 * Exceptions: None.
 */
function jsonObjectText(replyText: string): string | null {
  const start = replyText.indexOf('{');
  const end = replyText.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return replyText.slice(start, end + 1);
}

/**
 * Resolves a side code or a seat id to an active seat.
 *
 * Purpose: The model is shown side codes, and sometimes repeats a seat id.
 * When to use: Each `to` and `toward` value.
 * Expected outcome: The seat, or null when the code is not an active side.
 * Exceptions: None.
 */
function seatIdForSideCode(code: unknown, activeSeatIds: readonly SeatId[]): SeatId | null {
  if (typeof code !== 'string') return null;
  const normalized = code.trim().toLowerCase();
  if (normalized.length === 0) return null;
  const byCode = activeSeatIds.find((seatId) => playerIdCodeFor(seatId) === normalized);
  if (byCode) return byCode;
  if (isSeatId(normalized) && activeSeatIds.includes(normalized)) return normalized;
  return null;
}

/**
 * Reads one list from a parsed object.
 *
 * Purpose: A missing list and a non-array are both empty, and neither is a dropped entry.
 * When to use: The `messages` and `stances` fields.
 * Expected outcome: An array, or an empty array.
 * Exceptions: None.
 */
function entryList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Parses a talk reply.
 *
 * Purpose: The talk stage accepts one object and refuses the rest without a second model call.
 * When to use: After the model returns content.
 * Expected outcome: Null when the text has no JSON object or the value is not an object. Otherwise the accepted messages and stances, and a count of refused entries.
 * Exceptions: None.
 */
export function parseTalkReply(args: {
  readonly replyText: string;
  readonly ownSeatId: SeatId;
  readonly activeSeatIds: readonly SeatId[];
}): ParsedTalkReply | null {
  const slice = jsonObjectText(args.replyText);
  if (slice === null) {
    logTrace('talkReply parseTalkReply', { parsed: false });
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(slice);
  } catch {
    logTrace('talkReply parseTalkReply', { parsed: false });
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logTrace('talkReply parseTalkReply', { parsed: false });
    return null;
  }
  const record = parsed as { readonly messages?: unknown; readonly stances?: unknown };
  const messages: TalkReplyMessage[] = [];
  const stances: TalkReplyStance[] = [];
  const seenRecipients = new Set<SeatId>();
  const seenStances = new Set<SeatId>();
  let droppedCount = 0;

  for (const entry of entryList(record.messages)) {
    const row = entry !== null && typeof entry === 'object' ? (entry as { readonly to?: unknown; readonly text?: unknown }) : null;
    const toSeatId = row ? seatIdForSideCode(row.to, args.activeSeatIds) : null;
    const text = cleanSideMessageText(row?.text, SIDE_MESSAGE_MAX_CHARS);
    if (!toSeatId || toSeatId === args.ownSeatId || text.length === 0 || seenRecipients.has(toSeatId)) {
      droppedCount += 1;
      continue;
    }
    seenRecipients.add(toSeatId);
    messages.push({ toSeatId, text });
  }

  for (const entry of entryList(record.stances)) {
    const row = entry !== null && typeof entry === 'object'
      ? (entry as { readonly toward?: unknown; readonly stance?: unknown; readonly reason?: unknown })
      : null;
    const towardSeatId = row ? seatIdForSideCode(row.toward, args.activeSeatIds) : null;
    if (!towardSeatId || towardSeatId === args.ownSeatId || !isSideStance(row?.stance) || seenStances.has(towardSeatId)) {
      droppedCount += 1;
      continue;
    }
    seenStances.add(towardSeatId);
    stances.push({
      towardSeatId,
      stance: row.stance,
      reason: cleanSideMessageText(row.reason, SIDE_STANCE_REASON_MAX_CHARS),
    });
  }

  logTrace('talkReply parseTalkReply', { parsed: true, messageCount: messages.length, stanceCount: stances.length, droppedCount });
  return { messages, stances, droppedCount };
}
