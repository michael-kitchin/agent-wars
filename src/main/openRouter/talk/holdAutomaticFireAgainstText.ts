/**
 * The briefing text about the sides a commander holds automatic fire against.
 *
 * Purpose: A commander must see its stored list, and whether a listed side has attacked it, to decide whether to keep the list.
 * When to use: Through `readHoldAutomaticFireAgainstText`, for the orders Messages section and the talk situation.
 * Expected outcome: Prompt text only. Nothing is read or stored.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';

/**
 * One listed side as the briefing shows it.
 *
 * Contract: One entry per stored side that the Sides table has a row for.
 * When to use: Input to `buildHoldAutomaticFireAgainstText`.
 * Expected outcome: The name, and what the game recorded that side doing.
 * Exceptions: None.
 */
export interface HoldAutomaticFireAgainstSide {
  /**
   * The side's label in the Sides table.
   *
   * Contract: Its home region.
   * When to use: Naming the side.
   * Expected outcome: Printed before the code.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * The side's code.
   *
   * Contract: The code the Sides table prints.
   * When to use: Naming the side.
   * Expected outcome: Printed in parentheses.
   * Exceptions: None.
   */
  readonly code: string;
  /**
   * The latest turn, since the commander listed this side, on which its attacks destroyed units of the commander.
   *
   * Contract: `latestTurnStruckYou` from the commander's combat record, when it is not before the turn the side was
   * listed for. Ranged, air, and missile attacks only. Null otherwise and in a battle.
   * When to use: The turn line.
   * Expected outcome: A number adds the line; null adds none.
   * Exceptions: None.
   */
  readonly struckSinceListedTurn: number | null;
  /**
   * The attack shots the game counted from this side last beat.
   *
   * Contract: The opponent's count from `lastBeatActivity`. Null outside a battle between two AI commanders and for a side that is not the opponent.
   * When to use: The shots line.
   * Expected outcome: A number above zero adds the line.
   * Exceptions: None.
   */
  readonly shotsLastBeat: number | null;
}

/**
 * Builds the text about a commander's list.
 *
 * Purpose: Says what the list does and does not stop, and flags a listed side that fired in a battle or destroyed units.
 * When to use: With the listed sides in Sides-table order.
 * Expected outcome: Null for an empty list. Otherwise the standing line, then one shots line per side that fired last beat, then one turn line per side that destroyed units. No trailing newline.
 * Exceptions: None.
 */
export function buildHoldAutomaticFireAgainstText(spared: readonly HoldAutomaticFireAgainstSide[]): string | null {
  logTrace('holdAutomaticFireAgainstText buildHoldAutomaticFireAgainstText', { sideCount: spared.length });
  if (spared.length === 0) return null;
  /**
   * A side as the briefing names it.
   *
   * Purpose: Every line names a side the same way.
   * When to use: Building each line.
   * Expected outcome: The label followed by the code in parentheses.
   * Exceptions: None.
   */
  const name = (side: HoldAutomaticFireAgainstSide): string => `${side.label} (${side.code})`;
  const names = spared.map(name).join(', ');
  const shotLines = spared
    .filter((side) => side.shotsLastBeat !== null && side.shotsLastBeat > 0)
    .map((side) => `${name(side)} is on this list. Attack shots the game counted from it last beat: ${side.shotsLastBeat}.`);
  const attackLines = spared
    .filter((side) => side.struckSinceListedTurn !== null)
    .map((side) => `${name(side)} is on this list, and the game's record shows its ranged, air, or missile attacks destroyed units of yours since you listed it, last on turn ${side.struckSinceListedTurn}.`);
  return [
    `Holding automatic fire: your units do not fire on their own at ${names}. They still return fire, and an attack you order against a listed side still fires. Change the list with "holdAutomaticFireAgainst" in your orders reply.`,
    ...shotLines,
    ...attackLines,
  ].join('\n');
}
