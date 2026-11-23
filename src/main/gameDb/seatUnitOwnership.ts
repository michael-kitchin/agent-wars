/**
 * Which units a seat owns right now, read from the units table.
 *
 * Purpose: A seat may fire a mercenary after it stored a plan or standing orders. Ready needs the true owner, not a fogged snapshot.
 * When to use: `gatherCommanderOrdersForReady`, before and after plans are collected.
 * Expected outcome: Exact ids, and a count of stale standing orders removed.
 * Exceptions: Propagates database errors.
 */

import { logDebug } from '../logger';
import type { BasicDbOps } from './dbOps';

/**
 * Ids of every unit the seat owns now, embarked units included.
 *
 * Purpose: Orders for any other unit are stale.
 * When to use: Filtering one seat's order set at Ready.
 * Expected outcome: A set of unit ids. Empty when the seat has no units.
 * Exceptions: Propagates database errors.
 */
export function listUnitIdsOwnedBy(ops: BasicDbOps, seatId: string): ReadonlySet<string> {
  logDebug('gameDb listUnitIdsOwnedBy', { seatId });
  return new Set(ops.getAll<{ id: string }>('SELECT id FROM units WHERE player = ?', [seatId]).map((row) => row.id));
}

/**
 * Deletes the seat's standing orders for units it no longer owns, and returns how many.
 *
 * Purpose: A fired mercenary is Neutral, and the seat's march or defend order for it must not move it again.
 * When to use: The top of the per-seat step at Ready, before standing orders are generated.
 * Expected outcome: Rows for units owned by someone else, or missing, are gone. Other rows are untouched.
 * Exceptions: Propagates database errors.
 */
export function deleteStandingOrdersForUnitsNotOwned(ops: BasicDbOps, seatId: string): number {
  const stale = 'player_id = ? AND unit_id NOT IN (SELECT id FROM units WHERE player = ?)';
  const count = ops.getOne<{ n: number }>(`SELECT COUNT(*) AS n FROM standing_orders WHERE ${stale}`, [seatId, seatId])?.n ?? 0;
  logDebug('gameDb deleteStandingOrdersForUnitsNotOwned', { seatId, count });
  if (count > 0) ops.run(`DELETE FROM standing_orders WHERE ${stale}`, [seatId, seatId]);
  return count;
}
