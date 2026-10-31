/**
 * Counts for the battle header's force bar: each side's sub-units in a battle and the player's share of them.
 */
import { HUMAN_SEAT_ID } from './seatIds';
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

/**
 * Each side's sub-units in a battle, and the player's share of all of them.
 *
 * Purpose: The force bar shows both counts and draws the player's share as the teal part of the bar.
 * When to use: Returned by `countBattleForces`.
 * Expected outcome: Whole counts, and a share from 0 to 1.
 * Exceptions: None.
 */
export type BattleForceCounts = {
  readonly human: number;
  readonly opponent: number;
  readonly humanShare: number;
};

/**
 * Both parties' sub-unit counts, and the left party's share of the two.
 *
 * Purpose: An AI-only force bar shows the lead party on the left and the other party on the right.
 * When to use: Returned by `countTwoPartyForces`.
 * Expected outcome: Whole counts, and a left share from 0 to 1.
 * Exceptions: None.
 */
export type TwoPartyForceCounts = {
  /**
   * Sub-units of the left party.
   *
   * Contract: Only `leftOwnerId` is counted.
   * When to use: The left side of the force bar.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  readonly left: number;
  /**
   * Sub-units of the right party.
   *
   * Contract: Only `rightOwnerId` is counted.
   * When to use: The right side of the force bar.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  readonly right: number;
  /**
   * The left party's share of both counts.
   *
   * Contract: Left over left plus right, or 0.5 when both counts are zero.
   * When to use: Drawing the left part of the bar.
   * Expected outcome: A number from 0 to 1.
   * Exceptions: None.
   */
  readonly leftShare: number;
};

/**
 * Counts two named parties and the left party's share.
 *
 * Purpose: An AI-only battle has no human seat, so the force bar cannot use `countBattleForces`.
 * When to use: When the snapshot has `leadPartyId`. Pass that id as the left owner.
 * Expected outcome: The two counts. Any other owner is not counted. `leftShare` is 0.5 when both counts are zero.
 * Exceptions: None.
 */
export function countTwoPartyForces(
  subUnits: readonly { readonly player: string }[],
  leftOwnerId: string,
  rightOwnerId: string
): TwoPartyForceCounts {
  const left = subUnits.filter((sub) => sub.player === leftOwnerId).length;
  const right = subUnits.filter((sub) => sub.player === rightOwnerId).length;
  const total = left + right;
  return { left, right, leftShare: total > 0 ? left / total : 0.5 };
}

/**
 * Counts each side's sub-units in a battle and works out the player's share.
 *
 * Purpose: The player sees at a glance how the two sides compare in the fight.
 * When to use: With the battle snapshot's `subUnits` and `opposingPartyId`. A battle has no fog of war, so the snapshot
 *   lists every enemy sub-unit.
 * Expected outcome: Human sub-units versus the named party, including one carried by a ship. Other owners are not counted.
 *   `humanShare` is the player's count over both counts, or 0.5 when neither side has any.
 * Exceptions: None.
 */
export function countBattleForces(
  subUnits: readonly Pick<TacticalSubUnitSnapshot, 'player'>[],
  opposingPartyId: string
): BattleForceCounts {
  const human = subUnits.filter((sub) => sub.player === HUMAN_SEAT_ID).length;
  const opponent = subUnits.filter((sub) => sub.player === opposingPartyId).length;
  const total = human + opponent;
  return { human, opponent, humanShare: total > 0 ? human / total : 0.5 };
}
