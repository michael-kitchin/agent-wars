/**
 * Limits, stance values, and the rule for who may see a side message.
 *
 * Purpose: Prompts, the store, and later screens share one definition.
 * When to use: Cleaning text, checking a stance, and deciding whether a viewer may see a message.
 * Expected outcome: Pure values. This module does not read the database or log.
 * Exceptions: None.
 */

/**
 * The longest message stored or shown, in characters.
 *
 * Purpose: A model reply and a player's draft are cut to the same length.
 * When to use: Cleaning a message body.
 * Expected outcome: 280.
 * Exceptions: None.
 */
export const SIDE_MESSAGE_MAX_CHARS = 280;

/**
 * The longest stance reason stored, in characters.
 *
 * Purpose: A stance reason stays one short sentence.
 * When to use: Cleaning a stance reason.
 * Expected outcome: 160.
 * Exceptions: None.
 */
export const SIDE_STANCE_REASON_MAX_CHARS = 160;

/**
 * The highest value of a trust or threat score.
 *
 * Purpose: A commander reports trust and threat on a scale from 0 to this value, and the reply schema, the parser, and the database check share it.
 * When to use: Cleaning a score, building the reply schema, and writing the column checks.
 * Expected outcome: 4.
 * Exceptions: None.
 */
export const RELATIONSHIP_SCALE_MAX = 4;

/**
 * The five private stances, from opposition to warmth.
 *
 * Purpose: The talk reply and the stance table share one list.
 * When to use: Validating a stance and listing the legal values.
 * Expected outcome: `hostile`, `wary`, `neutral`, `cordial`, `friendly`.
 * Exceptions: None.
 */
// The middle word is a stance. It is the same spelling as the neutral owner id, and it is not that id.
// eslint-disable-next-line seat-id-literals/no-seat-id-literals -- stance value, not a seat
export const SIDE_STANCES = ['hostile', 'wary', 'neutral', 'cordial', 'friendly'] as const;

/**
 * One of the five private stances.
 *
 * Contract: A member of `SIDE_STANCES`.
 * When to use: A stored stance and a parsed talk reply.
 * Expected outcome: One of the five words.
 * Exceptions: None.
 */
export type SideStance = (typeof SIDE_STANCES)[number];

/**
 * Who is asking whether a message may be shown.
 *
 * Contract: A commander or a player names one seat. An observer names none.
 * When to use: `sideMessageVisibleTo`.
 * Expected outcome: One of the three viewers.
 * Exceptions: None.
 */
export type SideMessageViewer =
  | {
      /**
       * An AI commander.
       *
       * Contract: The literal `commander`.
       * When to use: A talk prompt or an orders prompt.
       * Expected outcome: Fog of war does not widen what this viewer sees.
       * Exceptions: None.
       */
      readonly kind: 'commander';
      /**
       * The commander's seat.
       *
       * Contract: A seat id.
       * When to use: Comparing the message's sender and recipient.
       * Expected outcome: The seat the prompt is written for.
       * Exceptions: None.
       */
      readonly seatId: string;
    }
  | {
      /**
       * The human player.
       *
       * Contract: The literal `player`.
       * When to use: A view that follows the player's fog. The chat history and the message dialog show every message and do not ask.
       * Expected outcome: Fog of war limits this viewer to the player's own messages.
       * Exceptions: None.
       */
      readonly kind: 'player';
      /**
       * The player's seat.
       *
       * Contract: A seat id.
       * When to use: Comparing the message's sender and recipient.
       * Expected outcome: The human seat that is in the match.
       * Exceptions: None.
       */
      readonly seatId: string;
    }
  | {
      /**
       * An observer of the whole match.
       *
       * Contract: The literal `observer`.
       * When to use: A view that is not playing a seat. The chat history and the message dialog do not ask.
       * Expected outcome: Every message is visible.
       * Exceptions: None.
       */
      readonly kind: 'observer';
    };

/**
 * Reports whether `value` is one of the five stances.
 *
 * Purpose: A model reply can name a stance that is not in the list.
 * When to use: Parsing a talk reply.
 * Expected outcome: True for the five words. False for anything else, including `'allied'`.
 * Exceptions: None.
 */
export function isSideStance(value: unknown): value is SideStance {
  return typeof value === 'string' && (SIDE_STANCES as readonly string[]).includes(value);
}

/**
 * Cleans one reported trust or threat score.
 *
 * Purpose: A model can send a score that is missing, out of range, or not a whole number.
 * When to use: Parsing the `trust` and `threat` of a stance entry in a talk reply.
 * Expected outcome: The whole number from 0 to `RELATIONSHIP_SCALE_MAX` when `raw` is a number or a numeric string with that value. Null for anything else, including `2.5`, `5`, and `'x'`.
 * Exceptions: None.
 */
export function cleanRelationshipScore(raw: unknown): number | null {
  const numeric = typeof raw === 'string' && raw.trim().length > 0 ? Number(raw) : raw;
  if (typeof numeric !== 'number' || !Number.isInteger(numeric)) return null;
  return numeric >= 0 && numeric <= RELATIONSHIP_SCALE_MAX ? numeric : null;
}

/**
 * Invisible formatting characters that change how text reads without showing.
 *
 * Purpose: A model could use a right-to-left override or an isolate to make text read in a different order on screen than it is stored and shown to other commanders. The zero-width space and the word joiner hide text in the same way.
 * When to use: `cleanSideMessageText` only.
 * Expected outcome: Matches U+061C, U+200B, U+200E, U+200F, U+202A to U+202E, U+2060, and U+2066 to U+2069. It leaves U+200C and U+200D alone, because emoji sequences and some scripts need them.
 * Exceptions: None.
 */
const INVISIBLE_FORMATTING_PATTERN = /[\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069]/gu;

/**
 * Turns raw text into one stored line.
 *
 * Purpose: A message and a stance reason share the same cleaning. Agreement terms and reasons share it too.
 * When to use: Before storing either one.
 * Expected outcome: Empty for a non-string. Otherwise the invisible direction and zero-width characters of `INVISIBLE_FORMATTING_PATTERN` are removed first, so one between two spaces cannot leave a double space. Then whitespace runs become one space, other control characters are removed, and the result is cut to `maxChars` characters, counting each code point once, without an ellipsis.
 * Exceptions: None.
 */
export function cleanSideMessageText(raw: unknown, maxChars: number): string {
  if (typeof raw !== 'string') return '';
  const collapsed = raw.replace(INVISIBLE_FORMATTING_PATTERN, '').replace(/\s+/g, ' ');
  const stripped = Array.from(collapsed).filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  }).join('');
  return Array.from(stripped.trim()).slice(0, Math.max(0, maxChars)).join('');
}

/**
 * Reports whether this viewer may see one message.
 *
 * Purpose: Every prompt shares one rule, so a later change to what the settings allow is a change here.
 * When to use: Before placing a stored message in a prompt, or in a view that follows a viewer's fog. The chat history and the message dialog show every message and do not call this.
 * Expected outcome: A commander sees a message it sent or that was sent to it, with or without fog of war. A player sees the same when fog of war is on, and every message when it is off. An observer sees every message.
 * Exceptions: None.
 */
export function sideMessageVisibleTo(input: {
  readonly viewer: SideMessageViewer;
  readonly fogOfWarEnabled: boolean;
  readonly fromSeatId: string;
  readonly toSeatId: string;
}): boolean {
  if (input.viewer.kind === 'observer') return true;
  const own = input.viewer.seatId === input.fromSeatId || input.viewer.seatId === input.toSeatId;
  if (input.viewer.kind === 'commander') return own;
  return input.fogOfWarEnabled ? own : true;
}
