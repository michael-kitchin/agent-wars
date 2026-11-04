/**
 * Creates the pending air-drop table on a database that was saved before the table existed.
 *
 * Purpose: Save version 26 stays. An old file has no drop table until it is opened.
 * When to use: Every open path that calls `ensureSeatAddedColumns`, after validation.
 * Expected outcome: The table exists. A second call does nothing. `user_version` is unchanged.
 * Exceptions: Propagates a SQLite error.
 */

import { logDebug } from '../logger';

/**
 * Creates `pending_air_drop_orders` when it is missing.
 *
 * Purpose: Validation does not require the table, because it runs before this call.
 * When to use: With the open database's `exec` or `run`.
 * Expected outcome: One `CREATE TABLE IF NOT EXISTS`. No change to `user_version`.
 * Exceptions: Propagates a SQLite error.
 */
export function ensurePendingAirDropOrdersTable(exec: (sql: string) => void): void {
  logDebug('pendingAirDropOrders ensurePendingAirDropOrdersTable');
  exec(
    `CREATE TABLE IF NOT EXISTS pending_air_drop_orders (
      unit_id TEXT PRIMARY KEY,
      target_h3_index TEXT NOT NULL
    )`
  );
}
