/**
 * One owner's strategic orders for a single turn, and the map `ready` accepts.
 *
 * Purpose: Several commanders submit orders together. The human seat still uses the pending tables.
 * When to use: `ready`, the resolution pipeline, and the Ready IPC handler.
 * Expected outcome: Each list is applied in seat order after the human lists. Neutral is last.
 * Exceptions: A human key is ignored by `ready`. Orders for units the owner does not have are dropped.
 */

import type { AirStrikeOrder, EmbarkOrder, FerryOrder, MovementOrder, RangedAttackOrder } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID, type OwnerId } from '../../shared/seatIds';
import { sortSeatsByOrder } from '../../shared/seatRoster';
import { getSeatRoster } from '../gameDb';
import { logDebug, logError } from '../logger';

/**
 * Movement, fire, ferry, and embark orders for one non-human owner.
 *
 * Contract: Every unit id in these lists is supposed to belong to that owner. Empty lists are valid.
 * When to use: The value under one key of `TurnOrdersByOwner`.
 * Expected outcome: `keepOrdersOfOwnedUnits` removes any order whose unit is missing or belongs to someone else.
 * Exceptions: None.
 */
export interface OwnerTurnOrders {
  /**
   * Where this owner's units are ordered to move.
   *
   * Contract: Each entry names a unit id and a destination hex.
   * When to use: After the human movement orders have been merged.
   * Expected outcome: Applied during the movement step when the unit belongs to this owner.
   * Exceptions: None.
   */
  readonly movementOrders: readonly MovementOrder[];
  /**
   * Ranged attacks this owner declared.
   *
   * Contract: Each entry names a firing unit and a target hex.
   * When to use: After the human ranged orders have been merged.
   * Expected outcome: Included in the ranged phase when the unit belongs to this owner.
   * Exceptions: None.
   */
  readonly rangedOrders: readonly RangedAttackOrder[];
  /**
   * Air strikes this owner declared.
   *
   * Contract: Each entry names a striking unit, a target hex, and a target type.
   * When to use: After the human air-strike orders have been merged.
   * Expected outcome: Included in the air-strike phase when the unit belongs to this owner.
   * Exceptions: None.
   */
  readonly airStrikeOrders: readonly AirStrikeOrder[];
  /**
   * Ferry legs this owner declared.
   *
   * Contract: Each entry names an air unit and a destination hex.
   * When to use: After the human ferry orders have been merged.
   * Expected outcome: A ferry for a unit that also strikes is dropped later, as it is today.
   * Exceptions: None.
   */
  readonly ferryOrders: readonly FerryOrder[];
  /**
   * Embark assignments this owner declared.
   *
   * Contract: Each entry names a land unit and a naval unit.
   * When to use: Before movement, in seat order, with Neutral last.
   * Expected outcome: Applied by `applyEmbarkOrdersForPlayer` for that owner.
   * Exceptions: None.
   */
  readonly embarkOrders: readonly EmbarkOrder[];
}

/**
 * Orders for every non-human owner that submitted a turn.
 *
 * Purpose: `ready` takes this map instead of five separate arrays.
 * When to use: The Ready handler and tests that resolve a turn for one seat.
 * Expected outcome: Keys are owner ids. The human seat is not a key.
 * Exceptions: None.
 */
export type TurnOrdersByOwner = ReadonlyMap<OwnerId, OwnerTurnOrders>;

/**
 * An owner turn with nothing ordered.
 *
 * Purpose: Callers can override one list without repeating the other four.
 * When to use: A test or a handler that has orders of only one kind.
 * Expected outcome: Five empty lists.
 * Exceptions: None.
 */
export const EMPTY_OWNER_TURN_ORDERS: OwnerTurnOrders = {
  movementOrders: [],
  rangedOrders: [],
  airStrikeOrders: [],
  ferryOrders: [],
  embarkOrders: [],
};

/**
 * Drops orders whose unit is missing or belongs to a different owner.
 *
 * Purpose: One seat must not move another seat's unit by naming its id.
 * When to use: Once per map entry, against the unit owners from the pre-move snapshot.
 * Expected outcome: A new order set containing only that owner's units. Dropped orders are logged.
 * Exceptions: None. A missing unit is a drop, not a throw.
 */
export function keepOrdersOfOwnedUnits(
  owner: OwnerId,
  orders: OwnerTurnOrders,
  unitOwnerById: ReadonlyMap<string, string>
): OwnerTurnOrders {
  logDebug('keepOrdersOfOwnedUnits', {
    owner,
    movementCount: orders.movementOrders.length,
    rangedCount: orders.rangedOrders.length,
    airStrikeCount: orders.airStrikeOrders.length,
    ferryCount: orders.ferryOrders.length,
    embarkCount: orders.embarkOrders.length,
  });
  const keep = <T extends { readonly unitId: string }>(list: readonly T[], listName: string): T[] => {
    const kept: T[] = [];
    for (const order of list) {
      const actual = unitOwnerById.get(order.unitId);
      if (actual !== owner) {
        logError('keepOrdersOfOwnedUnits dropped an order for a unit this owner does not have', {
          owner,
          listName,
          unitId: order.unitId,
          actualOwner: actual ?? null,
        });
        continue;
      }
      kept.push(order);
    }
    return kept;
  };
  return {
    movementOrders: keep(orders.movementOrders, 'movement'),
    rangedOrders: keep(orders.rangedOrders, 'ranged'),
    airStrikeOrders: keep(orders.airStrikeOrders, 'air'),
    ferryOrders: keep(orders.ferryOrders, 'ferry'),
    embarkOrders: keep(orders.embarkOrders, 'embark'),
  };
}

/**
 * Owner ids in the order their orders are applied.
 *
 * Purpose: Seat order keeps a two-seat match as human then the first AI seat. Neutral follows every seat.
 * When to use: Embark and the merged air, ranged, movement, and ferry lists.
 * Expected outcome: Roster seats that have a map entry, then Neutral when Neutral has a map entry.
 * Exceptions: None. An owner that is not on the roster and is not Neutral is logged and omitted.
 */
export function ownersInResolutionOrder(ordersByOwner: TurnOrdersByOwner): OwnerId[] {
  const roster = sortSeatsByOrder(getSeatRoster());
  const seated = new Set(roster.map((seat) => seat.seatId));
  for (const owner of ordersByOwner.keys()) {
    if (owner === NEUTRAL_OWNER_ID || owner === HUMAN_SEAT_ID || seated.has(owner)) continue;
    logError('ownersInResolutionOrder skipped an owner that is not on the roster', { owner });
  }
  const ordered: OwnerId[] = roster
    .filter((seat) => seat.seatId !== HUMAN_SEAT_ID && ordersByOwner.has(seat.seatId))
    .map((seat) => seat.seatId);
  if (ordersByOwner.has(NEUTRAL_OWNER_ID)) ordered.push(NEUTRAL_OWNER_ID);
  logDebug('ownersInResolutionOrder', { owners: ordered });
  return ordered;
}

/**
 * Human items first, then each owner's items in resolution order.
 *
 * Purpose: The dice stream for a two-seat match stays human then the first AI seat.
 * When to use: Air strikes, ranged fire, movement, and ferry, after owned-unit filtering.
 * Expected outcome: One list. An owner with an empty selection adds nothing.
 * Exceptions: None.
 */
export function listsInResolutionOrder<T>(
  humanItems: readonly T[],
  ordersByOwner: TurnOrdersByOwner,
  select: (orders: OwnerTurnOrders) => readonly T[]
): T[] {
  const merged: T[] = [...humanItems];
  for (const owner of ownersInResolutionOrder(ordersByOwner)) {
    const orders = ordersByOwner.get(owner);
    if (orders) merged.push(...select(orders));
  }
  logDebug('listsInResolutionOrder', { humanCount: humanItems.length, mergedCount: merged.length });
  return merged;
}
