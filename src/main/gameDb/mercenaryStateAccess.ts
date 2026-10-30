/**
 * Live-database wrappers for the treasury and hire orders.
 *
 * Purpose: Callers outside `gameDb` pass no connection bundle.
 * When to use: Production, hire actions, and tests. The module functions emit the logs.
 * Expected outcome: The same results as `mercenaryState`, using the open match database.
 * Exceptions: The same throws as the module functions.
 */

import type { SeatId } from '../../shared/seatIds';
import { gameDbOps } from './dbConnection';
import type { HireOrderRow, MercenaryUnitRow } from './mercenaryState';
import {
  addTreasuryCredits as addTreasuryCreditsFromModule,
  deleteAllHireOrders as deleteAllHireOrdersFromModule,
  deleteHireOrder as deleteHireOrderFromModule,
  getTreasuryCredits as getTreasuryCreditsFromModule,
  insertHireOrder as insertHireOrderFromModule,
  listAllHireOrders as listAllHireOrdersFromModule,
  listHireOrdersForSeat as listHireOrdersForSeatFromModule,
  listMercenaryUnitsForSeat as listMercenaryUnitsForSeatFromModule,
  setTreasuryCredits as setTreasuryCreditsFromModule,
} from './mercenaryState';

/**
 * Reads one seat's treasury on the open match database.
 *
 * Purpose: Callers that do not hold `BasicDbOps` still see a missing row as 0.
 * When to use: When the match database is already open.
 * Expected outcome: The stored balance, or 0.
 * Exceptions: Propagates SQLite errors.
 */
export function getTreasuryCredits(seatId: SeatId): number {
  return getTreasuryCreditsFromModule(gameDbOps, seatId);
}

/**
 * Stores one seat's treasury on the open match database.
 *
 * Purpose: Payroll and tests set a known balance.
 * When to use: When the match database is already open.
 * Expected outcome: One row for the seat.
 * Exceptions: Throws when `credits` is not a non-negative integer.
 */
export function setTreasuryCredits(seatId: SeatId, credits: number): void {
  setTreasuryCreditsFromModule(gameDbOps, seatId, credits);
}

/**
 * Adds credits on the open match database and returns the new balance.
 *
 * Purpose: Production yields land without the caller reading the old balance first.
 * When to use: When the match database is already open.
 * Expected outcome: The new total.
 * Exceptions: Throws when `amount` is not a non-negative integer.
 */
export function addTreasuryCredits(seatId: SeatId, amount: number): number {
  return addTreasuryCreditsFromModule(gameDbOps, seatId, amount);
}

/**
 * Lists one seat's hire orders on the open match database.
 *
 * Purpose: Placement and the panel see that seat's orders.
 * When to use: When the match database is already open.
 * Expected outcome: Valid rows ordered by id.
 * Exceptions: Propagates SQLite errors.
 */
export function listHireOrdersForSeat(seatId: SeatId): HireOrderRow[] {
  return listHireOrdersForSeatFromModule(gameDbOps, seatId);
}

/**
 * Lists every hire order on the open match database.
 *
 * Purpose: The end of the turn shuffles one list.
 * When to use: When the match database is already open.
 * Expected outcome: Valid rows ordered by id.
 * Exceptions: Propagates SQLite errors.
 */
export function listAllHireOrders(): HireOrderRow[] {
  return listAllHireOrdersFromModule(gameDbOps);
}

/**
 * Inserts one hire order on the open match database.
 *
 * Purpose: Tests and the place action store an order without a connection argument.
 * When to use: When the match database is already open.
 * Expected outcome: The new row id.
 * Exceptions: SQLite throws when the row fails its check.
 */
export function insertHireOrder(row: Omit<HireOrderRow, 'id'>): number {
  return insertHireOrderFromModule(gameDbOps, row);
}

/**
 * Deletes one seat's hire order on the open match database.
 *
 * Purpose: A remove must not delete another seat's order.
 * When to use: When the match database is already open.
 * Expected outcome: True when a row was deleted.
 * Exceptions: Propagates SQLite errors.
 */
export function deleteHireOrder(seatId: SeatId, orderId: number): boolean {
  return deleteHireOrderFromModule(gameDbOps, seatId, orderId);
}

/**
 * Deletes every hire order on the open match database.
 *
 * Purpose: The end of the turn clears the table.
 * When to use: When the match database is already open.
 * Expected outcome: The table is empty.
 * Exceptions: Propagates SQLite errors.
 */
export function deleteAllHireOrders(): void {
  deleteAllHireOrdersFromModule(gameDbOps);
}

/**
 * Lists one seat's mercenaries on the open match database.
 *
 * Purpose: Payroll reads the open match without a connection argument.
 * When to use: When the match database is already open.
 * Expected outcome: That seat's mercenary rows, ordered by id.
 * Exceptions: Propagates SQLite errors.
 */
export function listMercenaryUnitsForSeat(seatId: SeatId): MercenaryUnitRow[] {
  return listMercenaryUnitsForSeatFromModule(gameDbOps, seatId);
}
