/**
 * Drops the movement orders of units that must stay put for a head-on contact.
 */

import type { MovementOrder } from '../../shared/ipc/ordersTypes';
import { resolveHeadOnContacts, type HeadOnContact, type HeadOnMover } from '../../shared/headOnContact';
import { logDebug } from '../logger';
import { createHeadOnInitiativePicker } from '../headOnInitiative';
import { shouldSkipEmbarkedLandIndependentMove } from './sealift';

/**
 * A unit still on the board when strategic movement starts.
 *
 * Purpose: Head-on contact is judged from positions after casualties, not from the order text alone.
 * When to use: The `unitsAtMovement` list passed to `withoutStrategicHeadOnHolderMoves`.
 * Expected outcome: One row per living unit.
 */
interface StrategicUnitAtMovement {
  /**
   * The unit id.
   *
   * Contract: Matches `units.id` and `MovementOrder.unitId`.
   * When to use: Joining an order to the unit that would carry it.
   * Expected outcome: An order whose unit is missing is not a mover.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * The seat or Neutral owner.
   *
   * Contract: The `units.player` value.
   * When to use: The mover's owner.
   * Expected outcome: Different owners can form a contact.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * The hex the unit occupies now.
   *
   * Contract: The post-casualty, post-embark hex.
   * When to use: The mover's start cell.
   * Expected outcome: A unit already on its destination is not a mover.
   * Exceptions: None.
   */
  readonly h3Index: string;
}

/**
 * The orders left after holding units are removed, plus what was found.
 *
 * Purpose: The pipeline replaces its order list with `orders` and builds playback from `cancelledUnitIds`.
 * When to use: The return of `withoutStrategicHeadOnHolderMoves`.
 * Expected outcome: `orders` is the input minus every holding unit. `contacts` may be empty.
 */
export interface StrategicHeadOnOutcome {
  /**
   * Movement orders that still apply.
   *
   * Contract: A mutable array, because the pipeline passes it to helpers that take `MovementOrder[]`.
   * When to use: In place of the merged order list.
   * Expected outcome: Entering units remain. Holding units are gone.
   * Exceptions: None.
   */
  readonly orders: MovementOrder[];
  /**
   * Units whose moves were cancelled.
   *
   * Contract: The holding ids from the contact rule.
   * When to use: Leaving those units out of playback rows.
   * Expected outcome: Empty when nothing traded cells.
   * Exceptions: None.
   */
  readonly cancelledUnitIds: ReadonlySet<string>;
  /**
   * The contacts that produced the cancellations.
   *
   * Contract: The list from `resolveHeadOnContacts`, already sorted.
   * When to use: Logging. Callers do not branch on it.
   * Expected outcome: One entry per traded hex pair.
   * Exceptions: None.
   */
  readonly contacts: readonly HeadOnContact[];
}

/**
 * Arguments for one strategic head-on pass.
 *
 * Purpose: Keeps the order list, the living units, and the roll's seed together.
 * When to use: `withoutStrategicHeadOnHolderMoves`.
 * Expected outcome: Every field is present. `orders` may be empty.
 */
interface StrategicHeadOnArgs {
  /**
   * Every side's movement orders, in resolution order.
   *
   * Contract: The last order for a unit is the one that would be written.
   * When to use: The merged human, seat, and Neutral movement lists.
   * Expected outcome: Holding units' rows are removed. Other rows stay, including earlier duplicates.
   * Exceptions: None.
   */
  readonly orders: readonly MovementOrder[];
  /**
   * Units still alive after missile, air, and ranged casualties.
   *
   * Contract: Current hexes, after embark and before movement.
   * When to use: Deciding who can trade cells.
   * Expected outcome: A unit that is not in this list cannot cause a contact.
   * Exceptions: None.
   */
  readonly unitsAtMovement: readonly StrategicUnitAtMovement[];
  /**
   * The strategic turn being resolved.
   *
   * Contract: The same turn number used for the rest of Ready.
   * When to use: Seeding the initiative roll.
   * Expected outcome: Part of the seed text.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * The match seed.
   *
   * Contract: `getGameSeed()`.
   * When to use: Seeding the initiative roll.
   * Expected outcome: The roll does not draw from the combat RNG.
   * Exceptions: None.
   */
  readonly gameSeed: number;
}

/**
 * Units of two owners that would trade hexes meet in one of them instead of passing.
 *
 * Purpose: Cancels the moves out of the held hex before any `UPDATE` runs.
 * When to use: Once per strategic Ready, after ranged casualties are deleted and before any movement `UPDATE`.
 * Expected outcome: The same orders minus the holding units' moves. Entering units' orders are untouched. Units missing from `unitsAtMovement` never take part.
 * Exceptions: None expected. The rule throws only on a broken picker.
 */
export function withoutStrategicHeadOnHolderMoves(args: StrategicHeadOnArgs): StrategicHeadOnOutcome {
  logDebug('withoutStrategicHeadOnHolderMoves', {
    orderCount: args.orders.length,
    unitCount: args.unitsAtMovement.length,
    turnNumber: args.turnNumber,
  });
  const unitById = new Map(args.unitsAtMovement.map((unit) => [unit.id, unit]));
  const destinationByUnitId = new Map(args.orders.map((order) => [order.unitId, order.toH3Index]));
  const movers: HeadOnMover[] = [...destinationByUnitId].flatMap(([unitId, toCell]) => {
    const unit = unitById.get(unitId);
    if (!unit || unit.h3Index === toCell || shouldSkipEmbarkedLandIndependentMove(unitId, toCell)) return [];
    return [{ unitId, owner: unit.player, fromCell: unit.h3Index, toCell }];
  });
  const resolution = resolveHeadOnContacts(
    movers,
    createHeadOnInitiativePicker(args.gameSeed, { kind: 'strategic', turnNumber: args.turnNumber }),
  );
  for (const contact of resolution.contacts) {
    logDebug('withoutStrategicHeadOnHolderMoves contact', { ...contact });
  }
  return {
    orders: args.orders.filter((order) => !resolution.cancelledUnitIds.has(order.unitId)),
    cancelledUnitIds: resolution.cancelledUnitIds,
    contacts: resolution.contacts,
  };
}
