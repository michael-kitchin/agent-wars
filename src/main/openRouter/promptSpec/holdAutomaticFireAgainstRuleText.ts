/**
 * What the orders contract and the talk system text say about automatic fire and `holdAutomaticFireAgainst`.
 *
 * Purpose: A commander can only keep a promise to hold fire when it knows the engine fires for it and how to stop that.
 * When to use: Building the final JSON contract of an orders consult, or a talk system text, in either theater.
 * Expected outcome: Prompt text only. Nothing is read or stored.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';

/**
 * The contract paragraph for the optional field.
 *
 * Purpose: States both halves: automatic fire stops at a listed side, and every other kind of fire does not. It ties a
 * listing to an agreement, so a commander does not give up its shots at sides it is fighting.
 * When to use: Once in every orders contract.
 * Expected outcome: One line. `periodNoun` names the turn or the beat the commander may not be consulted for.
 * Exceptions: None.
 */
export function buildHoldAutomaticFireAgainstParagraph(periodNoun: 'turn' | 'beat'): string {
  logTrace('holdAutomaticFireAgainstRuleText buildHoldAutomaticFireAgainstParagraph', { periodNoun });
  return `Optional "holdAutomaticFireAgainst": a list of side codes from the Sides table. Your units hold automatic fire against every side in this list. Automatic fire is this: a unit of yours that has a legal shot and no attack order from you fires on its own at the nearest enemy, also on a ${periodNoun} you are not consulted for. Against a listed side it does not. The one exception is a world-map hex that also holds a unit of a side you have not listed: automatic fire can pick that hex, and its hits can fall on units of a listed side there. Only automatic fire stops: your units still return fire, they still fight units in the same hex or cell, and an attack you order against a listed side still fires. List a side only to keep an agreement or a promise to hold fire toward it. A listed side can still fire at your units on its own, so listing a side you are fighting, or every side, gives up shots and protects nothing. Take a side off the list when that agreement ends or the side attacks you. Against every other side, the nearest enemy is not always the best target, so keep ordering your own attacks. The list is stored and holds on the world map and in battles until you change it. A list of codes replaces the stored list. Send ["none"] to stop holding automatic fire against every side. Omit the field or send an empty list to keep the stored list. The Messages section shows the stored list when it is not empty. You cannot list Neutral or your own side.`;
}

/**
 * The talk system text bullet about automatic fire.
 *
 * Purpose: A promise to hold fire made while talking is only kept when the orders step sets the list.
 * When to use: The last bullet of the agreements block of both talk system texts, without the leading hyphen.
 * Expected outcome: One line with no turn fact, so the system text stays the same between calls.
 * Exceptions: None.
 */
export const HOLD_AUTOMATIC_FIRE_AGAINST_TALK_BULLET =
  'Your units fire on their own at the nearest enemy in range when you give them no attack order. A promise to hold fire is kept only when your orders give no attack against that side and list it in "holdAutomaticFireAgainst". You set that list in your orders step, not here. The Holding automatic fire section, when present, shows the sides you hold automatic fire against.';
