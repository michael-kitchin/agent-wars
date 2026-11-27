/**
 * The fixed prompt sentences about diplomacy and agreements.
 *
 * Purpose: The talk prompt, the strategic orders rules, and the orders contract quote one wording.
 * When to use: `buildTalkSystemText`, `sideMessageRuleBlock`, and `buildFinalJsonContractInstruction`.
 * Expected outcome: Text with no turn number and no fact that changes during a match, so cached system prompts stay stable.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import {
  SIDE_AGREEMENT_KINDS,
  SIDE_AGREEMENT_INTENTS,
  SIDE_AGREEMENT_MAX_OPEN_PER_SIDE,
  SIDE_AGREEMENT_MAX_TURNS,
  SIDE_AGREEMENT_NO_THIRD_SIDE,
  SIDE_AGREEMENT_STATUSES,
} from '../../../shared/sideAgreements';

/**
 * Why diplomacy matters.
 *
 * Purpose: Tells a commander that diplomacy is a way to win the war, in both theaters.
 * When to use: The "Why diplomacy matters:" block of the talk system text.
 * Expected outcome: Three bullets, without the leading hyphen.
 * Exceptions: None.
 */
export const DIPLOMACY_PURPOSE_BULLETS = [
  'Only one side can win this war. Diplomacy is one of your ways to be that side, alongside your orders.',
  'Use diplomacy to serve your war plan. Keep a front quiet so you can mass your forces elsewhere. Turn rivals against each other. Discourage sides from joining against you. Learn what others intend. Buy time.',
  'Other commanders judge you by what you do as well as by what you say. A broken promise makes your later promises worth less to that side, and to any side it warns.',
] as const;

/**
 * The bullets that explain agreements in the strategic talk system text.
 *
 * Purpose: Explains what an agreement is, its kinds, statuses, limits, and how to change one.
 * When to use: The "Agreements:" block of the strategic talk system text only.
 * Expected outcome: Nine bullets, without the leading hyphen. They hold only fixed limits, never a turn number or a count that changes during a match.
 * Exceptions: None.
 */
export function sideAgreementTalkBullets(): readonly string[] {
  const bullets = [
    'An agreement is your private record of what you believe you and one other side have agreed to. That side keeps its own record, which may differ from yours. No other commander sees your record, and the game does not enforce any agreement.',
    "The kinds are: non_aggression (neither side strikes the other or moves into the other's hexes), ceasefire_in_place (neither side strikes the other, and both hold their current lines), no_entry_zone (neither side moves into the hexes listed in zone), joint_action (both sides act against the side named in against), and information_sharing (both sides tell each other what they see).",
    'Record an agreement when you propose one, or when you believe one has been made. Use status proposed until you believe the other side has accepted, then active. When an agreement ends early, set its status to ended, broken_by_them, or broken_by_me.',
    `An agreement covers the turns from the turn you record it through its endTurn, at most ${SIDE_AGREEMENT_MAX_TURNS} turns. After its endTurn it has expired. To continue it, record a new one.`,
    `You may hold at most ${SIDE_AGREEMENT_MAX_OPEN_PER_SIDE} proposed or active agreements with any one side.`,
    'intent is your private plan for an agreement: keep, opportunistic (keep it only while it serves you), or plan_to_break.',
    'Keeping an agreement lets you hold that front with fewer units and makes that side predictable. Breaking one can catch a thinly held front by surprise, and pays most when the gain is decisive. It can also bring retaliation, a reinforced front, warnings to other sides, and distrust of your later offers. Whether to keep or break an agreement is your decision.',
    'The section titled Your agreements shows each open agreement with the losses both ways since it began, and each recently closed one with how and when it ended. That record of losses comes from the game, not from either side.',
    'To change an agreement, send it again with its id and every field, changed or not. Use id 0 for a new agreement. You cannot change who an agreement is with, its kind, or the turn it began.',
  ];
  logTrace('diplomacyRuleText sideAgreementTalkBullets', { bulletCount: bullets.length });
  return bullets;
}

/**
 * The bullets added to the strategic orders message rules.
 *
 * Purpose: Tells the orders stage to plan with stances and agreements in mind.
 * When to use: `sideMessageRuleBlock` with `includeAgreements`.
 * Expected outcome: Three bullets, without the leading hyphen. The last says that units in one hex fight whatever was agreed, and how to avoid that.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_ORDERS_BULLETS = [
  'Diplomacy is part of how you win. Plan with your stances and agreements in mind: a front covered by an agreement you mean to keep needs fewer units, and a side you rate as a high threat needs more.',
  'Each agreement listed in the Messages section is your own private record. The game does not enforce it, and keeping or breaking it is your decision. Weigh what you gain this turn against retaliation and lost trust.',
  'Units of two sides that end a turn in the same hex fight there, in melee or in a battle, whatever the two sides have agreed, and they fight again every turn until one side leaves or is destroyed. To keep an agreement, do not order units into a hex that side\'s units hold, and move your units out of a hex you share with them.',
] as const;

/**
 * The bullets added to the orders message rules of a battle between two commanders.
 *
 * Purpose: Tells the orders stage what the read-only agreements and the shot count in the Messages section are, and that orders against a message will be seen.
 * When to use: `sideMessageRuleBlock` with `battleTruce`.
 * Expected outcome: Three bullets, without the leading hyphen. No digits.
 * Exceptions: None.
 */
export const BATTLE_TRUCE_ORDERS_BULLETS = [
  'In a battle between two commanders, the Messages section lists your own agreements with the side you are fighting. They are your private record, the game does not enforce them, and you cannot make or change one during a battle. Hex codes inside an agreement are world-map codes.',
  'The Messages section also gives the game\'s count of the shots each side fired last beat and whether there was melee. That count is a fact. Check it against what the other side told you: holding fire while the other side keeps shooting loses your units.',
  'What you told the other side this beat is in the Messages section. Orders that go against it are your choice, and the other side will see what your units did in its own loss lines and shot count.',
] as const;

/**
 * The bullets of the battle talk system text about agreements and the last beat.
 *
 * Purpose: Tells the talk stage what the read-only agreements and the shot count are, so a promise is made knowing it will be checked.
 * When to use: The "Agreements and last beat:" block of the tactical talk system text.
 * Expected outcome: Two bullets, without the leading hyphen. No digits.
 * Exceptions: None.
 */
export const BATTLE_TRUCE_TALK_BULLETS = [
  'The Agreements and last beat section lists your own agreements with the side you are fighting. They are your private record, the game does not enforce them, and you cannot make or change one during a battle. Hex codes inside an agreement are world-map codes.',
  'The same section gives the game\'s count of the shots each side fired last beat and whether there was melee. That count is a fact, and the other side sees its own copy. A promise to hold fire is checked against that count on the next beat.',
] as const;

/**
 * The `agreements` part of the strategic talk reply shape.
 *
 * Purpose: Shows the model the exact fields of one agreement entry, built from the shared lists so it cannot drift.
 * When to use: The JSON line of the strategic talk system text.
 * Expected outcome: One string that starts with `"agreements":[`.
 * Exceptions: None.
 */
export function sideAgreementReplyShape(): string {
  const shape = `"agreements":[{"id":<agreement id, or 0 for a new one>,"with":"<side code>","kind":"<${SIDE_AGREEMENT_KINDS.join('|')}>","terms":"<one sentence>","zone":["<hex code>"],"against":"<side code, or ${SIDE_AGREEMENT_NO_THIRD_SIDE}>","endTurn":<turn number>,"status":"<${SIDE_AGREEMENT_STATUSES.join('|')}>","intent":"<${SIDE_AGREEMENT_INTENTS.join('|')}>","reason":"<one sentence>"}]`;
  logTrace('diplomacyRuleText sideAgreementReplyShape', { length: shape.length });
  return shape;
}

/**
 * The rules line that follows the strategic talk reply shape.
 *
 * Purpose: Says where side codes and hex codes come from, and when zone and against are used.
 * When to use: The line after the JSON line of the strategic talk system text.
 * Expected outcome: One sentence group.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_REPLY_RULES =
  'Use the side codes from the Sides table and hex codes from your orders briefing. Any list may be empty. Leave zone empty unless kind is no_entry_zone. Set against to none unless kind is joint_action.';

/**
 * The paragraph that explains `agreementDecisions` in the orders contract.
 *
 * Purpose: Tells the commander it may record a keep-or-break decision for an active agreement.
 * When to use: `buildFinalJsonContractInstruction` when `includeAgreementDecisions` is on.
 * Expected outcome: One paragraph.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_DECISIONS_PARAGRAPH =
  'Optional "agreementDecisions": for an agreement listed as active in the Messages section, add {"id":<agreement id>,"decision":"keep" or "break","reason":"<one sentence>"} to record whether you keep or break it this turn. Your next diplomacy step shows your decision. A decision does not change the agreement itself: to end it, change its status in your next diplomacy step. Omit the array to record nothing.';
