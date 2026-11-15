/**
 * Creates the match history table on a database that was saved before the table existed.
 *
 * Purpose: Save version 26 stays. An old file has no history table until it is opened.
 * When to use: Every open path that calls `ensurePendingAirDropOrdersTable`, after validation.
 * Expected outcome: The table exists. A second call does nothing. `user_version` is unchanged.
 * Exceptions: Propagates a SQLite error.
 */

import { logDebug } from '../logger';

/**
 * `CREATE TABLE` text for `match_records`.
 *
 * Purpose: Fresh databases and opened databases share one statement.
 * When to use: `getFullDdl` and `ensureMatchRecordsTable`.
 * Expected outcome: The history table, with frames and events in one row shape.
 * Exceptions: None.
 */
export const MATCH_RECORDS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS match_records (
  record_id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('frame', 'event')),
  record_type TEXT NOT NULL,
  format_version INTEGER NOT NULL CHECK (format_version >= 1),
  step_key TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('strategic', 'tactical')),
  turn_number INTEGER NOT NULL,
  battle_id TEXT NOT NULL DEFAULT '',
  beat_number INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL,
  display_text TEXT,
  recorded_at TEXT NOT NULL,
  payload BLOB NOT NULL
)`;

/**
 * Creates `match_records` when it is missing.
 *
 * Purpose: Validation does not require the table, because it runs before this call.
 * When to use: With the open database's `run`.
 * Expected outcome: One `CREATE TABLE IF NOT EXISTS`. No change to `user_version`.
 * Exceptions: Propagates a SQLite error.
 */
export function ensureMatchRecordsTable(exec: (sql: string) => void): void {
  logDebug('matchRecordsTable ensureMatchRecordsTable');
  exec(MATCH_RECORDS_TABLE_DDL);
}
