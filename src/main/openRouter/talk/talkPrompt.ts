/**
 * The texts sent to the model for a talk call.
 *
 * Purpose: Diplomacy is one system text and one situation text, built from plain inputs.
 * When to use: `requestTalk`, and the orders prompt, which reuses `formatSideMessageThreads`.
 * Expected outcome: Markdown. The system text has no turn facts. This module does not read the database.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import { RELATIONSHIP_SCALE_MAX, SIDE_MESSAGE_MAX_CHARS, SIDE_STANCES, type SideStance } from '../../../shared/sideMessages';
import { SIDE_MESSAGE_SOURCE_BULLETS, SIDE_MESSAGE_TRUST_BULLETS } from '../promptSpec/sideMessageRuleText';

/**
 * One side in the talk prompt's table.
 *
 * Contract: `code` is `playerIdCodeFor`. `label` is the name the orders prompt uses in its Sides table.
 * When to use: `buildTalkSituationText`.
 * Expected outcome: The row and, when this is not the commander's own side, a thread heading.
 * Exceptions: None.
 */
export interface TalkPromptSide {
  /**
   * The side code shown to the model.
   *
   * Contract: `h1` or `a1` through `a4`.
   * When to use: The Code column and the reply's `to` and `toward` values.
   * Expected outcome: The code for this seat.
   * Exceptions: None.
   */
  readonly code: string;
  /**
   * The name shown in the Side column.
   *
   * Contract: The home-region label the orders prompt uses.
   * When to use: The table and the thread heading.
   * Expected outcome: The label, without "(you)".
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Whether this row is the commander the prompt is written for.
   *
   * Contract: Exactly one side in the input is own.
   * When to use: Placing that row first and printing `(you)`.
   * Expected outcome: True for the commander's side.
   * Exceptions: None.
   */
  readonly isOwn: boolean;
  /**
   * The turn this side left the match, or null while it is in.
   *
   * Contract: Null means active.
   * When to use: The Status column and the thread heading.
   * Expected outcome: The seat's `outTurn`.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
  /**
   * This commander's current stance toward the side, or null when none is stored.
   *
   * Contract: Null for the commander's own row.
   * When to use: The stance column.
   * Expected outcome: A stance, or null.
   * Exceptions: None.
   */
  readonly stance: SideStance | null;
  /**
   * The reason for `stance`, or null when no stance is stored.
   *
   * Contract: Empty text is a stored reason. Null means no row.
   * When to use: The stance column. Do not log it.
   * Expected outcome: The reason, or null.
   * Exceptions: None.
   */
  readonly stanceReason: string | null;
  /**
   * How far this commander believes the side, or null when it has not reported it.
   *
   * Contract: A whole number from 0 to `RELATIONSHIP_SCALE_MAX`. Null for the commander's own row and where no stance is stored.
   * When to use: The stance cell. This is the commander's own report, never another commander's.
   * Expected outcome: The stored trust, or null.
   * Exceptions: None.
   */
  readonly trust: number | null;
  /**
   * How dangerous this commander finds the side, or null when it has not reported it.
   *
   * Contract: A whole number from 0 to `RELATIONSHIP_SCALE_MAX`. Null for the commander's own row and where no stance is stored.
   * When to use: The stance cell. This is the commander's own report, never another commander's.
   * Expected outcome: The stored threat, or null.
   * Exceptions: None.
   */
  readonly threat: number | null;
  /**
   * This commander's combat record with the side, or null when there is none.
   *
   * Contract: Null for the commander's own row, a side that is out, and a window with no stored turns. Otherwise the text from `formatSideCombatRecord`, which is a count the game made from the loss lines, not a claim by any side.
   * When to use: The Record column of the Sides table, and the orders prompt's record line.
   * Expected outcome: One line that begins `Record, turn`.
   * Exceptions: None.
   */
  readonly record: string | null;
}

/**
 * One line of a message thread.
 *
 * Contract: `text` is the stored body. `isNew` is true for an unread message addressed to this commander.
 * When to use: `formatSideMessageThreads`.
 * Expected outcome: One bullet.
 * Exceptions: None.
 */
export interface TalkPromptLine {
  /**
   * The strategic turn the message was sent.
   *
   * Contract: The message's turn number.
   * When to use: The bullet's turn.
   * Expected outcome: A positive turn.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * Whether this commander wrote the line.
   *
   * Contract: True when the stored sender is this commander.
   * When to use: Choosing "you said" or "they said".
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly fromOwnSide: boolean;
  /**
   * The message text.
   *
   * Contract: The stored body. Quotes are replaced when the bullet is printed.
   * When to use: The quoted part of the bullet. Do not log it.
   * Expected outcome: The line.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Whether the recipient has not yet been shown this message in an orders consult.
   *
   * Contract: True only for an unread message addressed to this commander.
   * When to use: Appending `(new)`.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly isNew: boolean;
  /**
   * The stored message id.
   *
   * Contract: The `message_id` of this line.
   * When to use: The orders consult marks the new lines it showed.
   * Expected outcome: The id. The printed bullet does not include it.
   * Exceptions: None.
   */
  readonly messageId: number;
}

/**
 * The messages between this commander and one other side.
 *
 * Contract: `lines` is oldest first and may be empty.
 * When to use: The Messages section.
 * Expected outcome: One heading and its bullets.
 * Exceptions: None.
 */
export interface TalkPromptThread {
  /**
   * The other side's code.
   *
   * Contract: A code in `sides`, other than the commander's own.
   * When to use: Finding the label and whether that side has left.
   * Expected outcome: The thread's code.
   * Exceptions: None.
   */
  readonly sideCode: string;
  /**
   * The lines to print, oldest first.
   *
   * Contract: Empty when the two sides have no sent messages.
   * When to use: The bullets under the heading.
   * Expected outcome: The thread.
   * Exceptions: None.
   */
  readonly lines: readonly TalkPromptLine[];
}

/**
 * Everything the situation text is built from.
 *
 * Contract: `recentTurnsSection` is empty when there is nothing to include. `battle` is null on the world map.
 * When to use: `buildTalkSituationText`.
 * Expected outcome: One situation document.
 * Exceptions: None.
 */
export interface TalkPromptInput {
  /**
   * The commander's own side name.
   *
   * Contract: The label used in the system text and the own row.
   * When to use: Replacing `{ownSide}`.
   * Expected outcome: The name.
   * Exceptions: None.
   */
  readonly ownSideLabel: string;
  /**
   * The strategic turn.
   *
   * Contract: The turn the talk call is for.
   * When to use: The diplomacy heading.
   * Expected outcome: The turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The battle this call is inside, or null on the world map.
   *
   * Contract: `opponentLabel` is null when the opponent has no label. `opponentCode` is null when the opponent is not a seat still in the match, and then no message can be sent.
   * When to use: The battle heading, the fighting line, and the line that limits messages to the opponent.
   * Expected outcome: The beat, or null.
   * Exceptions: None.
   */
  readonly battle: { readonly beatNumber: number; readonly opponentLabel: string | null; readonly opponentCode: string | null } | null;
  /**
   * The sides table, including this commander's own side.
   *
   * Contract: One row is `isOwn`.
   * When to use: The Sides section. The own row is printed first.
   * Expected outcome: The rows.
   * Exceptions: None.
   */
  readonly sides: readonly TalkPromptSide[];
  /**
   * This commander's newest strategy line, or null.
   *
   * Contract: Null when no strategy has been stored.
   * When to use: The last-plan section.
   * Expected outcome: The line, or null.
   * Exceptions: None.
   */
  readonly lastStrategy: string | null;
  /**
   * The recent-turns section already formatted for this seat and scope.
   *
   * Contract: Empty when there is nothing to include. Included as given.
   * When to use: Between the last plan and the messages.
   * Expected outcome: The section, or `''`.
   * Exceptions: None.
   */
  readonly recentTurnsSection: string;
  /**
   * One thread per other side that should appear.
   *
   * Contract: Active sides, then sides that have left and still have lines.
   * When to use: The Messages section.
   * Expected outcome: The threads, in that order.
   * Exceptions: None.
   */
  readonly threads: readonly TalkPromptThread[];
}

/**
 * Prints one thread heading and its bullets.
 *
 * Purpose: The talk prompt and the orders prompt show the same history.
 * When to use: With `headingLevel` 3 in the talk prompt, and one level deeper than the orders section heading.
 * Expected outcome: A heading `With {label} ({code})`, then one bullet per line, or `- No messages yet.` A side that has left adds ` (out of the match)`. Quotes inside a message become single quotes.
 * Exceptions: None.
 */
export function formatSideMessageThreads(
  threads: readonly TalkPromptThread[],
  sides: readonly TalkPromptSide[],
  headingLevel: number
): string {
  const marks = '#'.repeat(Math.max(1, headingLevel));
  return threads.map((thread) => {
    const side = sides.find((row) => row.code === thread.sideCode);
    const label = side?.label ?? thread.sideCode;
    const departed = side?.outTurn != null ? ' (out of the match)' : '';
    const heading = `${marks} With ${label} (${thread.sideCode})${departed}`;
    if (thread.lines.length === 0) return `${heading}\n- No messages yet.`;
    const bullets = thread.lines.map((line) => {
      const who = line.fromOwnSide ? 'you said' : 'they said';
      const quoted = line.text.replaceAll('"', "'");
      const fresh = line.isNew ? ' (new)' : '';
      return `- Turn ${line.turnNumber}, ${who}: "${quoted}"${fresh}`;
    });
    return `${heading}\n${bullets.join('\n')}`;
  }).join('\n\n');
}

/**
 * Words for a score the commander has not reported.
 *
 * Purpose: A missing trust or threat prints the same words in both prompts.
 * When to use: `formatStanceScores`.
 * Expected outcome: The text `not reported`.
 * Exceptions: None.
 */
const SCORE_NOT_REPORTED = 'not reported';

/**
 * Prints a commander's own trust and threat for one side.
 *
 * Purpose: The talk prompt's Sides table and the orders prompt's stance lists show the scores the same way.
 * When to use: Beside a stored stance, with the scores `TalkPromptSide` holds.
 * Expected outcome: `trust {t}, threat {h}`, with `not reported` in place of a null score.
 * Exceptions: None.
 */
export function formatStanceScores(trust: number | null, threat: number | null): string {
  return `trust ${trust ?? SCORE_NOT_REPORTED}, threat ${threat ?? SCORE_NOT_REPORTED}`;
}

/**
 * The system text for one talk call.
 *
 * Purpose: The cached system text tells the commander what this step is for, where messages come from, and how far to trust them.
 * When to use: The system message of a talk call. Do not put a turn number, a count, or a message in it.
 * Expected outcome: The diplomacy instructions, with `{ownSide}` replaced by `ownSideLabel`. The character limit and the stance list come from the shared constants.
 * Exceptions: None.
 */
export function buildTalkSystemText(ownSideLabel: string): string {
  logTrace('talkPrompt buildTalkSystemText', { labelLength: ownSideLabel.length });
  const source = SIDE_MESSAGE_SOURCE_BULLETS.map((line) => `- ${line}`).join('\n');
  const trust = SIDE_MESSAGE_TRUST_BULLETS.map((line) => `- ${line}`).join('\n');
  const stances = SIDE_STANCES.join(', ');
  const stanceEnum = SIDE_STANCES.join('|');
  const max = RELATIONSHIP_SCALE_MAX;
  return `You are the commander of ${ownSideLabel} in a turn-based war game. This step is for diplomacy only. You give no orders here. Your orders come in a separate step, right after this one, and that step will show you the same messages.

Where messages come from:
${source}

How far to trust a message:
${trust}

What you may do in this step:
- Send one short message to each other side. A message is one or two sentences, at most ${SIDE_MESSAGE_MAX_CHARS} characters. Longer text is cut off.
- You may threaten, bargain, propose, bluff, or lie. Nothing you say binds you, and nothing another commander says binds them.
- Send nothing when you have nothing worth saying. Silence costs nothing.
- Set how you regard each side. A stance is your private view of one side: ${stances}. With each stance give trust, from 0 to ${max}, for how far you believe what that side tells you, and threat, from 0 to ${max}, for how dangerous that side is to you now. No other commander is told your stance, trust, or threat. Base all three on what a side has done to you, as the loss lines in Recent Turn Notes and the Record column show, more than on what it says. Give a stance only for a side whose stance you want to set or change, with a reason of one short sentence.

Reply with one JSON object and nothing else:
{"messages":[{"to":"<side code>","text":"<message>"}],"stances":[{"toward":"<side code>","stance":"<${stanceEnum}>","trust":<0-${max}>,"threat":<0-${max}>,"reason":"<one sentence>"}]}
Use the side codes from the Sides table. Either list may be empty.`;
}

/**
 * The situation text for one talk call.
 *
 * Purpose: The user message carries the turn, the sides, the last plan, and the messages this commander may see.
 * When to use: The user message of a talk call.
 * Expected outcome: The diplomacy heading, the sides table, the last plan, the recent-turns section when it is not empty, and the message threads.
 * Exceptions: None.
 */
export function buildTalkSituationText(input: TalkPromptInput): string {
  logTrace('talkPrompt buildTalkSituationText', {
    turnNumber: input.turnNumber,
    sideCount: input.sides.length,
    threadCount: input.threads.length,
    inBattle: input.battle !== null,
  });
  const blocks: string[] = [];
  if (input.battle) {
    const lines = [`# Diplomacy: turn ${input.turnNumber}, battle beat ${input.battle.beatNumber}`];
    if (input.battle.opponentLabel) lines.push(`You are fighting ${input.battle.opponentLabel} in this battle.`);
    if (input.battle.opponentCode) {
      lines.push(`During a battle you can write only to the side you are fighting, code ${input.battle.opponentCode}, and set your stance only toward that side.`);
    }
    blocks.push(lines.join('\n'));
  } else {
    blocks.push(`# Diplomacy: turn ${input.turnNumber}`);
  }
  blocks.push(`## Sides\n${sidesTable(input.sides)}`);
  blocks.push(`## Your last plan\n${input.lastStrategy ?? '(none yet)'}`);
  if (input.recentTurnsSection.trim().length > 0) blocks.push(input.recentTurnsSection.trim());
  blocks.push(`## Messages\n${formatSideMessageThreads(input.threads, input.sides, 3)}`);
  return blocks.join('\n\n');
}

/**
 * The sides table, with this commander's row first.
 *
 * Purpose: The model answers with the codes in this table.
 * When to use: The Sides section.
 * Expected outcome: A markdown table. The own row is labelled `(you)` and has `-` for stance. A stored stance prints as `{stance} (trust {t}, threat {h}): {reason}`. A Record column is added when any side has a record, with `-` for a side that has none.
 * Exceptions: None.
 */
function sidesTable(sides: readonly TalkPromptSide[]): string {
  const ordered = [...sides.filter((side) => side.isOwn), ...sides.filter((side) => !side.isOwn)];
  const showRecord = sides.some((side) => side.record !== null);
  const rows = ordered.map((side) => {
    const name = side.isOwn ? `${side.label} (you)` : side.label;
    const status = side.outTurn == null ? 'Active' : `Out since turn ${side.outTurn}`;
    const stance = side.stance == null
      ? (side.isOwn ? '-' : 'not set')
      : `${side.stance} (${formatStanceScores(side.trust, side.threat)}): ${side.stanceReason ?? ''}`;
    return `| ${name} | ${side.code} | ${status} | ${stance} |${showRecord ? ` ${side.record ?? '-'} |` : ''}`;
  });
  const header = showRecord ? '| Side | Code | Status | Your stance | Record |' : '| Side | Code | Status | Your stance |';
  const divider = showRecord ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- |';
  return [header, divider, ...rows].join('\n');
}
