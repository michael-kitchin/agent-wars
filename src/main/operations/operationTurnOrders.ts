/**
 * Ferry and drop orders for air operations, added when the turn is resolved.
 *
 * Purpose: An air operation moves by turn order. Those orders replace a strike, ferry, or drop the commander or the tempo rule named for the same air unit.
 * When to use: Once per seat, after that seat's other orders are known and before Ready resolves them.
 * Expected outcome: One ferry or one drop for each air operation in transit, and the carrier id of every air operation.
 * Exceptions: A thrown read is logged and returns empty lists.
 */

import type { AirDropOrder } from '../../shared/ipc/airDropTypes';
import type { FerryOrder } from '../../shared/ipc/ordersTypes';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne } from '../gameDb';
import { readOperations } from '../gameDb/operationMemory';
import { logDebug, logError } from '../logger';
import type { OwnerTurnOrders } from '../gameActions/ownerTurnOrders';
import type { Operation } from '../../shared/operationTypes';

/**
 * Turn orders an air operation adds, and the air units those orders own.
 *
 * Purpose: The gather merges this into the seat's other orders.
 * When to use: The return of `operationTurnOrders`.
 * Expected outcome: Ferry and drop lists, plus every air-operation carrier.
 * Exceptions: None.
 */
export interface OperationTurnOrderSet {
  /**
   * Ferry orders for air units that are not yet at the launch airport.
   *
   * Contract: `destinationH3Index` is the operation's `landingH3`. At most one per carrier.
   * When to use: Ready resolution.
   * Expected outcome: Empty when every transit carrier is already at its launch airport.
   * Exceptions: None.
   */
  readonly ferryOrders: readonly FerryOrder[];
  /**
   * Drop orders for air units that are at the launch airport with their infantry aboard.
   *
   * Contract: `targetH3Index` is the operation's objective. At most one per carrier, and never on a turn that also ferries that carrier.
   * When to use: Ready resolution.
   * Expected outcome: Empty when no transit carrier is ready to drop.
   * Exceptions: None.
   */
  readonly airDropOrders: readonly AirDropOrder[];
  /**
   * Air units whose other air orders must be removed.
   *
   * Contract: The carrier of every stored air operation for the seat, in any phase.
   * When to use: Filtering strikes, ferries, and drops before the operation's own orders are appended.
   * Expected outcome: A set of unit ids. Empty when the seat has no air operation.
   * Exceptions: None.
   */
  readonly carrierIds: ReadonlySet<string>;
}

/**
 * An empty result after a failed read.
 *
 * Purpose: Callers share one value instead of building the three empties twice.
 * When to use: The catch in `operationTurnOrders`.
 * Expected outcome: No orders and no carriers.
 * Exceptions: None.
 */
const EMPTY_TURN_ORDERS: OperationTurnOrderSet = {
  ferryOrders: [],
  airDropOrders: [],
  carrierIds: new Set(),
};

/**
 * Builds the ferry or drop for one air operation that is in transit.
 *
 * Purpose: The air unit ferries until it is based at the launch airport, then drops. It does not do both on the same turn.
 * When to use: Once per transit operation whose carrier and infantry are both present.
 * Expected outcome: One ferry, one drop, or nothing when the launch airport was not stored.
 * Exceptions: None.
 */
function transitOrder(operation: Operation, carrierHex: string): FerryOrder | AirDropOrder | null {
  const carrierId = operation.carrierIds[0];
  if (carrierId === undefined || operation.landingH3 === null) return null;
  if (carrierHex === operation.landingH3) {
    return { unitId: carrierId, targetH3Index: operation.objectiveH3 };
  }
  return { unitId: carrierId, destinationH3Index: operation.landingH3 };
}

/**
 * True when the order is a drop.
 *
 * Purpose: A transit order is one of the two shapes, and the lists stay separate.
 * When to use: After `transitOrder`.
 * Expected outcome: True when the order names `targetH3Index`.
 * Exceptions: None.
 */
function isDrop(order: FerryOrder | AirDropOrder): order is AirDropOrder {
  return 'targetH3Index' in order;
}

/**
 * Ferry and drop orders for one seat's air operations.
 *
 * Purpose: Ready adds these whether or not the commander was consulted.
 * When to use: Pass the snapshot whose units include the seat's air units and their cargo.
 * Expected outcome: Orders for transit operations whose infantry is aboard, and the carrier of every air operation. Empty lists when a read throws.
 * Exceptions: None. A thrown error is logged.
 */
export function operationTurnOrders(seatId: string, state: GameStateSnapshot): OperationTurnOrderSet {
  try {
    const operations = (readOperations({ getOne: dbGetOne }).get(seatId) ?? []).filter((operation) => operation.method === 'air');
    const byId = new Map(state.units.map((unit) => [unit.id, unit]));
    const ferryOrders: FerryOrder[] = [];
    const airDropOrders: AirDropOrder[] = [];
    const carrierIds = new Set<string>();
    for (const operation of operations) {
      const carrierId = operation.carrierIds[0];
      if (carrierId !== undefined) carrierIds.add(carrierId);
      if (operation.phase !== 'transit' || carrierId === undefined) continue;
      const carrier = byId.get(carrierId);
      const infantryId = operation.unitIds[0];
      const infantry = infantryId === undefined ? undefined : byId.get(infantryId);
      if (carrier === undefined || infantry === undefined) continue;
      if (infantry.embarkedOnCarrierUnitId !== carrierId) continue;
      const order = transitOrder(operation, carrier.h3Index);
      if (order === null) continue;
      if (isDrop(order)) airDropOrders.push(order);
      else ferryOrders.push(order);
    }
    logDebug('operationTurnOrders', { seatId, ferryCount: ferryOrders.length, dropCount: airDropOrders.length });
    return { ferryOrders, airDropOrders, carrierIds };
  } catch (err) {
    logError('operationTurnOrders failed', { seatId }, err);
    return EMPTY_TURN_ORDERS;
  }
}

/**
 * Removes other air orders for an operation's air unit and appends the operation's ferry or drop.
 *
 * Purpose: The engine's order wins for an air unit that is in an operation.
 * When to use: Once per seat, immediately before Ready returns that seat's orders.
 * Expected outcome: Strikes, ferries, and drops for `carrierIds` are gone. The operation's orders are at the end of those two lists. Every other list is unchanged.
 * Exceptions: None.
 */
export function mergeOperationTurnOrders(base: OwnerTurnOrders, extra: OperationTurnOrderSet): OwnerTurnOrders {
  const blocked = extra.carrierIds;
  const airDropOrders = [...(base.airDropOrders ?? []).filter((order) => !blocked.has(order.unitId)), ...extra.airDropOrders];
  const merged = {
    ...base,
    airStrikeOrders: base.airStrikeOrders.filter((order) => !blocked.has(order.unitId)),
    ferryOrders: [...base.ferryOrders.filter((order) => !blocked.has(order.unitId)), ...extra.ferryOrders],
    airDropOrders,
  };
  logDebug('operationTurnOrders mergeOperationTurnOrders', {
    blocked: blocked.size,
    ferryCount: merged.ferryOrders.length,
    dropCount: airDropOrders.length,
  });
  return merged;
}
