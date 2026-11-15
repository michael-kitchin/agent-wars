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
       * When to use: A screen that shows the player's messages.
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
       * When to use: A screen that is not playing a seat.
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
 * Turns raw text into one stored line.
 *
 * Purpose: A message and a stance reason share the same cleaning.
 * When to use: Before storing either one.
 * Expected outcome: Empty for a non-string. Otherwise whitespace runs become one space, other control characters are removed, and the result is cut to `maxChars` without an ellipsis.
 * Exceptions: None.
 */
export function cleanSideMessageText(raw: unknown, maxChars: number): string {
  if (typeof raw !== 'string') return '';
  const collapsed = raw.replace(/\s+/g, ' ');
  const stripped = Array.from(collapsed).filter((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= 32 && code !== 127;
  }).join('');
  return stripped.trim().slice(0, Math.max(0, maxChars));
}

/**
 * Reports whether this viewer may see one message.
 *
 * Purpose: Prompts and screens share one rule, so a later change to what the settings allow is a change here.
 * When to use: Before placing a stored message in a prompt or on a screen.
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
