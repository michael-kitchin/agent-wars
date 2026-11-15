/**
 * Creates the message and stance tables on a database that was saved before they existed.
 *
 * Purpose: Save version 26 stays. An old file has no message tables until it is opened.
 * When to use: Every open path that calls `ensureMatchRecordsTable`, after that call.
 * Expected outcome: Both tables exist. A second call does nothing. `user_version` is unchanged.
 * Exceptions: Propagates a SQLite error.
 */

import { logDebug } from '../logger';

/**
 * `CREATE TABLE` text for `side_messages` and `side_stances`.
 *
 * Purpose: Fresh databases and opened databases share one script.
 * When to use: `getFullDdl`, which runs the script with `exec`, and `ensureSideMessageTables`, which runs each statement alone.
 * Expected outcome: Two statements, each ending with a semicolon.
 * Exceptions: None.
 */
export const SIDE_MESSAGE_TABLES_DDL = `CREATE TABLE IF NOT EXISTS side_messages (
  message_id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_seat_id TEXT NOT NULL,
  to_seat_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('staged', 'sent')),
  body TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('strategic', 'tactical')),
  turn_number INTEGER NOT NULL,
  battle_id TEXT NOT NULL DEFAULT '',
  beat_number INTEGER NOT NULL DEFAULT 0,
  seen_by_recipient INTEGER NOT NULL DEFAULT 0 CHECK (seen_by_recipient IN (0, 1)),
  CHECK (from_seat_id <> to_seat_id)
);
CREATE TABLE IF NOT EXISTS side_stances (
  seat_id TEXT NOT NULL,
  toward_seat_id TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('hostile', 'wary', 'neutral', 'cordial', 'friendly')),
  reason TEXT NOT NULL,
  updated_turn INTEGER NOT NULL,
  PRIMARY KEY (seat_id, toward_seat_id),
  CHECK (seat_id <> toward_seat_id)
);`;

/**
 * Creates the message and stance tables when they are missing.
 *
 * Purpose: Validation does not require the tables, because it runs before this call.
 * When to use: With the open database's `run`. Pass one statement per call. `run` rejects a script of two statements.
 * Expected outcome: Two `CREATE TABLE IF NOT EXISTS` calls. No change to `user_version`.
 * Exceptions: Propagates a SQLite error.
 */
export function ensureSideMessageTables(exec: (sql: string) => void): void {
  logDebug('sideMessageTables ensureSideMessageTables');
  for (const statement of SIDE_MESSAGE_TABLES_DDL.split(';')) {
    const sql = statement.trim();
    if (sql.length > 0) exec(sql);
  }
}
