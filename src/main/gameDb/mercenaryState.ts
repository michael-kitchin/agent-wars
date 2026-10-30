/**
 * Treasury balances, hire orders, and the mercenary rows payroll reads.
 *
 * Purpose: Credits and hire orders stay out of the unit table except for the mercenary flag.
 * When to use: Through `mercenaryStateAccess` once a match database is open. Tests may pass their own ops.
 * Expected outcome: A missing treasury reads as 0. Hire-order lists are ordered by id. A bad stored row is skipped.
 * Exceptions: The setters throw when the amount is not a non-negative integer. SQLite throws when a hire-order check fails.
 */

import { isHireableUnitType, type HireableUnitType, type HireKind } from '../../shared/mercenaryRules';
import { isSeatId, type SeatId } from '../../shared/seatIds';
import { logDebug, logError, logTrace } from '../logger';
import type { BasicDbOps } from './dbOps';

/**
 * One stored hire order.
 *
 * Purpose: Placement and the end-of-turn step share the row the table holds.
 * When to use: After a list or an insert. Do not invent a row the table rejected.
 * Expected outcome: A raise has no unit id. A rehire has a unit id and a count of 1.
 * Exceptions: None.
 */
export interface HireOrderRow {
  /**
   * Database id.
   *
   * Contract: Assigned by SQLite.
   * When to use: Delete and the hire-panel order id.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly id: number;
  /**
   * Seat that placed the order.
   *
   * Contract: A seat id. Neutral has no treasury and no orders.
   * When to use: Filtering a seat's orders.
   * Expected outcome: The stored `player_id`.
   * Exceptions: None.
   */
  readonly playerId: SeatId;
  /**
   * Raise or rehire.
   *
   * Contract: The table allows only those two kinds.
   * When to use: Choosing how the order fills.
   * Expected outcome: `'raise'` or `'rehire'`.
   * Exceptions: None.
   */
  readonly kind: HireKind;
  /**
   * Hex the order was placed on.
   *
   * Contract: For a rehire, the unit's hex at placement.
   * When to use: Capacity and the hire panel.
   * Expected outcome: The stored hex index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Hireable type stored on the order.
   *
   * Contract: For a rehire, the unit's type at placement.
   * When to use: Pricing a raise.
   * Expected outcome: Infantry, armor, naval, or air.
   * Exceptions: None.
   */
  readonly unitType: HireableUnitType;
  /**
   * How many units the order asks for.
   *
   * Contract: 1 for a rehire.
   * When to use: A partial raise fills up to this count.
   * Expected outcome: An integer from 1 to 99.
   * Exceptions: None.
   */
  readonly unitCount: number;
  /**
   * Neutral unit a rehire names.
   *
   * Contract: Null for a raise.
   * When to use: Finding the unit at the end of the turn.
   * Expected outcome: The unit id, or null.
   * Exceptions: None.
   */
  readonly neutralUnitId: string | null;
  /**
   * Planning turn on which the order was placed.
   *
   * Contract: Copied from `turn_state`. Every order is deleted at the end of the turn.
   * When to use: Diagnostics.
   * Expected outcome: The turn number stored with the row.
   * Exceptions: None.
   */
  readonly createdTurn: number;
  /**
   * Credits taken from the treasury when this order was stored.
   *
   * Contract: 0 for an order stored before fees were reserved. Otherwise the fee for the whole count.
   * When to use: Refunding a remove, and deciding whether the end of the turn charges again.
   * Expected outcome: A non-negative integer. A reserved order is not charged a second time.
   * Exceptions: None.
   */
  readonly reservedCredits: number;
}

/**
 * A mercenary unit row payroll can price without loading a full snapshot.
 *
 * Purpose: Desertion needs the id, the type, the hex, and the birth hex.
 * When to use: Building the payroll list for one seat.
 * Expected outcome: Only rows with `is_mercenary = 1` for that seat.
 * Exceptions: None.
 */
export interface MercenaryUnitRow {
  /**
   * Unit id.
   *
   * Contract: Stable for the life of the unit.
   * When to use: Desertion and transport lookup.
   * Expected outcome: The `units.id` value.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Stored unit type.
   *
   * Contract: A mercenary missile cannot be stored. A corrupt type is priced as 0 by the caller.
   * When to use: Upkeep.
   * Expected outcome: The `unit_type` column.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Current strategic hex.
   *
   * Contract: Where the unit stands, including a ship it is aboard.
   * When to use: Reports. Payroll transport comes from the assignment table.
   * Expected outcome: The `h3_index` column.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Birth hex, or null when the row has none.
   *
   * Contract: Tech tier is the tier of this hex when the tech bonus is on.
   * When to use: Upkeep.
   * Expected outcome: The `birth_h3_index` column.
   * Exceptions: None.
   */
  readonly birthH3Index: string | null;
}

/**
 * Reads one seat's treasury.
 *
 * Purpose: Missing seats, including a seat that has never earned credits, owe nothing and hold nothing.
 * When to use: Before spending or displaying credits.
 * Expected outcome: The stored balance, or 0 when the seat has no row.
 * Exceptions: Propagates SQLite errors.
 */
export function getTreasuryCredits(ops: BasicDbOps, seatId: SeatId): number {
  logTrace('gameDb getTreasuryCredits', { seatId });
  const row = ops.getOne<{ credits: number }>('SELECT credits FROM res_s_treasury WHERE player_id = ?', [seatId]);
  return row?.credits ?? 0;
}

/**
 * Stores one seat's treasury balance.
 *
 * Purpose: Payroll and hire resolution set the balance after a draw or a charge.
 * When to use: When the new balance is already known. Use `addTreasuryCredits` to add a production yield.
 * Expected outcome: One row for the seat, with `credits` equal to the argument.
 * Exceptions: Throws when `credits` is not a non-negative integer. Propagates SQLite errors.
 */
export function setTreasuryCredits(ops: BasicDbOps, seatId: SeatId, credits: number): void {
  logDebug('gameDb setTreasuryCredits', { seatId, credits });
  assertNonNegativeInteger(credits, 'credits');
  ops.run(
    `INSERT INTO res_s_treasury (player_id, credits) VALUES (?, ?)
     ON CONFLICT(player_id) DO UPDATE SET credits = excluded.credits`,
    [seatId, credits]
  );
}

/**
 * Adds credits to a seat's treasury and returns the new balance.
 *
 * Purpose: Production yields land in the treasury before upkeep.
 * When to use: When a credits item completes. Do not use this to charge a fee.
 * Expected outcome: The previous balance, or 0, plus `amount`.
 * Exceptions: Throws when `amount` is not a non-negative integer. Propagates SQLite errors.
 */
export function addTreasuryCredits(ops: BasicDbOps, seatId: SeatId, amount: number): number {
  logDebug('gameDb addTreasuryCredits', { seatId, amount });
  assertNonNegativeInteger(amount, 'amount');
  const next = getTreasuryCredits(ops, seatId) + amount;
  setTreasuryCredits(ops, seatId, next);
  return next;
}

/**
 * Subtracts a fee from a seat's treasury when the balance can cover it.
 *
 * Purpose: A hire order takes its fee when the row is stored.
 * When to use: After the other hire checks have passed, and only for a fee above 0.
 * Expected outcome: True when the balance dropped by `amount`. False when `amount` is not a positive integer or the balance is below it. The stored balance is never negative.
 * Exceptions: Propagates SQLite errors from the write.
 */
export function spendTreasuryCredits(ops: BasicDbOps, seatId: SeatId, amount: number): boolean {
  logDebug('gameDb spendTreasuryCredits', { seatId, amount });
  if (!Number.isInteger(amount) || amount <= 0) return false;
  const balance = getTreasuryCredits(ops, seatId);
  if (balance < amount) return false;
  setTreasuryCredits(ops, seatId, balance - amount);
  return true;
}

/**
 * Adds the reserved-credits column to a match created before that column existed.
 *
 * Purpose: An existing match keeps its user version, so the column is added in place.
 * When to use: After the database handle is open, including a fresh database whose DDL already has the column.
 * Expected outcome: The column exists. A second call does nothing. The user version is unchanged.
 * Exceptions: Propagates SQLite errors from the alter.
 */
export function ensureHireOrderReservedCreditsColumn(ops: BasicDbOps): void {
  logDebug('gameDb ensureHireOrderReservedCreditsColumn');
  const columns = ops.getAll<{ name: string } & Record<string, unknown>>('PRAGMA table_info(res_s_hire_orders)');
  if (columns.some((column) => column.name === 'reserved_credits')) return;
  ops.run('ALTER TABLE res_s_hire_orders ADD COLUMN reserved_credits INTEGER NOT NULL DEFAULT 0');
}

/**
 * Lists one seat's hire orders, oldest id first.
 *
 * Purpose: The hire panel and fee total see only that seat's orders.
 * When to use: Placement capacity and the end-of-turn charge.
 * Expected outcome: Valid rows ordered by id. A row that fails a guard is logged and omitted.
 * Exceptions: Propagates SQLite errors.
 */
export function listHireOrdersForSeat(ops: BasicDbOps, seatId: SeatId): HireOrderRow[] {
  logTrace('gameDb listHireOrdersForSeat', { seatId });
  const rows = ops.getAll<HireOrderSqlRow & Record<string, unknown>>(
    `SELECT id, player_id, kind, h3_index, unit_type, unit_count, neutral_unit_id, created_turn, reserved_credits
     FROM res_s_hire_orders WHERE player_id = ? ORDER BY id`,
    [seatId]
  );
  return mapHireOrderRows(rows);
}

/**
 * Lists every hire order, oldest id first.
 *
 * Purpose: The end of the turn shuffles one combined list.
 * When to use: Once per turn, inside the mercenary step.
 * Expected outcome: Valid rows ordered by id. A row that fails a guard is logged and omitted.
 * Exceptions: Propagates SQLite errors.
 */
export function listAllHireOrders(ops: BasicDbOps): HireOrderRow[] {
  logTrace('gameDb listAllHireOrders', {});
  const rows = ops.getAll<HireOrderSqlRow & Record<string, unknown>>(
    `SELECT id, player_id, kind, h3_index, unit_type, unit_count, neutral_unit_id, created_turn, reserved_credits
     FROM res_s_hire_orders ORDER BY id`
  );
  return mapHireOrderRows(rows);
}

/**
 * Inserts one hire order and returns its id.
 *
 * Purpose: Planning stores the order and the credits already taken for it.
 * When to use: After the hire checks have accepted the request and any fee has been spent.
 * Expected outcome: The new row id. `reservedCredits` is the amount to refund if the order does not fill.
 * Exceptions: SQLite throws when the kind, count, or unit-id check fails.
 */
export function insertHireOrder(ops: BasicDbOps, row: Omit<HireOrderRow, 'id'>): number {
  logDebug('gameDb insertHireOrder', {
    playerId: row.playerId,
    kind: row.kind,
    h3Index: row.h3Index,
    unitType: row.unitType,
    unitCount: row.unitCount,
    neutralUnitId: row.neutralUnitId,
    createdTurn: row.createdTurn,
    reservedCredits: row.reservedCredits,
  });
  assertNonNegativeInteger(row.reservedCredits, 'reservedCredits');
  ops.run(
    `INSERT INTO res_s_hire_orders (
       player_id, kind, h3_index, unit_type, unit_count, neutral_unit_id, created_turn, reserved_credits
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.playerId,
      row.kind,
      row.h3Index,
      row.unitType,
      row.unitCount,
      row.neutralUnitId,
      row.createdTurn,
      row.reservedCredits,
    ]
  );
  const inserted = ops.getOne<{ id: number }>('SELECT last_insert_rowid() AS id');
  return inserted?.id ?? 0;
}

/**
 * Deletes one hire order if it belongs to the seat.
 *
 * Purpose: The player can take an order back until Ready.
 * When to use: The remove action. Another seat's id must not delete the row.
 * Expected outcome: True when a row was deleted.
 * Exceptions: Propagates SQLite errors.
 */
export function deleteHireOrder(ops: BasicDbOps, seatId: SeatId, orderId: number): boolean {
  logDebug('gameDb deleteHireOrder', { seatId, orderId });
  ops.run('DELETE FROM res_s_hire_orders WHERE id = ? AND player_id = ?', [orderId, seatId]);
  const changed = ops.getOne<{ n: number }>('SELECT changes() AS n');
  return (changed?.n ?? 0) > 0;
}

/**
 * Deletes every hire order.
 *
 * Purpose: Orders do not carry into the next planning phase.
 * When to use: The last step of the end-of-turn mercenary resolution, after fills and drops.
 * Expected outcome: The hire-order table is empty.
 * Exceptions: Propagates SQLite errors.
 */
export function deleteAllHireOrders(ops: BasicDbOps): void {
  logDebug('gameDb deleteAllHireOrders', {});
  ops.run('DELETE FROM res_s_hire_orders');
}

/**
 * Lists one seat's mercenary units, ordered by id.
 *
 * Purpose: Payroll prices the units the seat already has, not units hired later the same turn.
 * When to use: Once per active seat that has mercenaries.
 * Expected outcome: Id, type, hex, and birth hex for each mercenary of that seat.
 * Exceptions: Propagates SQLite errors.
 */
export function listMercenaryUnitsForSeat(ops: BasicDbOps, seatId: SeatId): MercenaryUnitRow[] {
  logTrace('gameDb listMercenaryUnitsForSeat', { seatId });
  return ops.getAll<{ id: string; unitType: string; h3Index: string; birthH3Index: string | null }>(
    `SELECT id, unit_type AS unitType, h3_index AS h3Index, birth_h3_index AS birthH3Index
     FROM units WHERE player = ? AND is_mercenary = 1 ORDER BY id`,
    [seatId]
  );
}

/**
 * A hire-order row as SQLite returns it, before the guards.
 *
 * Purpose: Column names stay in one place so a bad value can be logged and skipped.
 * When to use: Only inside the list functions.
 * Expected outcome: One raw row.
 * Exceptions: None.
 */
type HireOrderSqlRow = {
  readonly id: number;
  readonly player_id: string;
  readonly kind: string;
  readonly h3_index: string;
  readonly unit_type: string;
  readonly unit_count: number;
  readonly neutral_unit_id: string | null;
  readonly created_turn: number;
  readonly reserved_credits: number;
};

/**
 * Throws when a treasury amount is not a non-negative integer.
 *
 * Purpose: The treasury check is `credits >= 0`, and a fractional credit has no meaning.
 * When to use: Before an insert or an add.
 * Expected outcome: Returns when the value is a safe non-negative integer.
 * Exceptions: Throws after logging when the value is negative or not an integer.
 */
function assertNonNegativeInteger(value: number, label: string): void {
  if (Number.isInteger(value) && value >= 0) return;
  const error = new Error(`${label} must be a non-negative integer`);
  logError('gameDb mercenaryState: rejected treasury amount', { label, value, error });
  throw error;
}

/**
 * Keeps hire-order rows that still match the seat, kind, and type guards.
 *
 * Purpose: A corrupt row must not crash payroll or be shown as an order.
 * When to use: After each hire-order SELECT.
 * Expected outcome: The valid rows, in the query's order.
 * Exceptions: None. A bad row is logged and skipped.
 */
function mapHireOrderRows(rows: readonly HireOrderSqlRow[]): HireOrderRow[] {
  const mapped: HireOrderRow[] = [];
  for (const row of rows) {
    const order = mapHireOrderRow(row);
    if (order) mapped.push(order);
  }
  return mapped;
}

/**
 * Maps one raw hire-order row, or skips it.
 *
 * Purpose: The table checks kinds and types, and this guard covers a row that still fails them.
 * When to use: From `mapHireOrderRows`.
 * Expected outcome: A row, or null when the seat, kind, or type is not one this module can price.
 * Exceptions: None.
 */
function mapHireOrderRow(row: HireOrderSqlRow): HireOrderRow | null {
  if (!isSeatId(row.player_id) || !isHireKind(row.kind) || !isHireableUnitType(row.unit_type)) {
    logError('gameDb mercenaryState: skipped hire order', {
      id: row.id,
      playerId: row.player_id,
      kind: row.kind,
      unitType: row.unit_type,
    });
    return null;
  }
  return {
    id: row.id,
    playerId: row.player_id,
    kind: row.kind,
    h3Index: row.h3_index,
    unitType: row.unit_type,
    unitCount: row.unit_count,
    neutralUnitId: row.neutral_unit_id,
    createdTurn: row.created_turn,
    reservedCredits: reservedCreditsOf(row),
  };
}

/**
 * Reads the reserved fee from a hire-order row.
 *
 * Purpose: An older row, or a row whose stored value is not a count of credits, reserves nothing.
 * When to use: While mapping a hire-order row.
 * Expected outcome: The stored non-negative integer, or 0.
 * Exceptions: None. A bad value is logged.
 */
function reservedCreditsOf(row: HireOrderSqlRow): number {
  if (Number.isInteger(row.reserved_credits) && row.reserved_credits >= 0) return row.reserved_credits;
  logError('gameDb mercenaryState: hire order reserved credits reset to 0', {
    id: row.id,
    reservedCredits: row.reserved_credits,
  });
  return 0;
}

/**
 * Reports whether a stored kind is raise or rehire.
 *
 * Purpose: The list skips a kind the table should already have rejected.
 * When to use: While mapping a hire-order row.
 * Expected outcome: True for the two stored kinds.
 * Exceptions: None.
 */
function isHireKind(value: string): value is HireKind {
  return value === 'raise' || value === 'rehire';
}
