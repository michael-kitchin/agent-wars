/**
 * Which two owners a tactical battle is between.
 *
 * Purpose: A human battle still names the one non-human owner. Two AI owners also name a lead seat.
 * When to use: `computeTacticalBattleSnapshot` after it has collected the owners on the hex.
 * Expected outcome: A human plus one other owner omits the lead. Two non-neutral owners set the lead from seat order.
 * Exceptions: None. Three owners, one owner, and a non-human Neutral pair are not a battle.
 */

import { logDebug } from '../logger';
import { HUMAN_SEAT_ID, isNeutralOwnerId, isOwnerId, type OwnerId } from '../../shared/seatIds';

/**
 * A seat's order, used only to pick the lead when both owners are AI.
 *
 * Purpose: The snapshot does not need the rest of the roster row.
 * When to use: `tacticalBattlePartiesForOwners`.
 * Expected outcome: `seatId` and `seatOrder` from the roster.
 * Exceptions: None.
 */
export interface TacticalBattlePartySeat {
  /**
   * The seat id.
   *
   * Contract: Compared with an owner id on the hex.
   * When to use: Looking up `seatOrder`.
   * Expected outcome: A seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The roster order.
   *
   * Contract: The lower number is the lead. An equal number breaks to `localeCompare` on the seat id.
   * When to use: Two AI owners.
   * Expected outcome: The stored `seatOrder`.
   * Exceptions: None.
   */
  readonly seatOrder: number;
}

/**
 * The parties a two-owner hex can fight as.
 *
 * Purpose: `opposingPartyId` is always the other party. `leadPartyId` exists only when neither party is human.
 * When to use: The success result of `tacticalBattlePartiesForOwners`.
 * Expected outcome: Both ids are owners on the hex.
 * Exceptions: None.
 */
export interface TacticalBattleParties {
  /**
   * The party that is not the lead, or the only non-human owner.
   *
   * Contract: On a human battle this is the non-human owner, even when that owner's seat order is lower.
   * When to use: Opponent planning on a human battle, and the right side of an AI-only battle.
   * Expected outcome: An owner id on the hex.
   * Exceptions: None.
   */
  readonly opposingPartyId: OwnerId;
  /**
   * The AI seat with the lower seat order.
   *
   * Contract: Absent on a human battle. Present only for two AI owners.
   * When to use: Deciding that the battle is AI-only.
   * Expected outcome: The lead seat id, or omitted.
   * Exceptions: None.
   */
  readonly leadPartyId?: OwnerId;
}

/**
 * Names the two parties on a hex, or rejects the hex.
 *
 * Purpose: Placement accepts a human plus one other owner, and exactly two owners when neither is Neutral.
 * When to use: Before sub-units are placed.
 * Expected outcome: `null` when the owner list is not one of those two shapes. Otherwise the parties.
 * Exceptions: None.
 */
export function tacticalBattlePartiesForOwners(
  owners: readonly string[],
  seats: readonly TacticalBattlePartySeat[]
): TacticalBattleParties | null {
  logDebug('tacticalBattlePartiesForOwners', { owners: [...owners] });
  if (owners.length !== 2 || owners.some((owner) => !isOwnerId(owner))) return null;
  const [first, second] = owners as [OwnerId, OwnerId];
  if (owners.includes(HUMAN_SEAT_ID)) {
    const opposingPartyId = first === HUMAN_SEAT_ID ? second : first;
    return { opposingPartyId };
  }
  if (owners.some((owner) => isNeutralOwnerId(owner))) return null;
  const orderOf = (ownerId: OwnerId): number => seats.find((seat) => seat.seatId === ownerId)?.seatOrder ?? 0;
  const firstLeads = orderOf(first) < orderOf(second)
    || (orderOf(first) === orderOf(second) && first.localeCompare(second) < 0);
  return firstLeads
    ? { leadPartyId: first, opposingPartyId: second }
    : { leadPartyId: second, opposingPartyId: first };
}
