/**
 * Creates the message and stance tables on a database that was saved before they existed.
 *
 * Purpose: Save version 26 stays. An old file has no message tables until it is opened.
 * When to use: Every open path that calls `ensureMatchRecordsTable`, after that call.
 * Expected outcome: Both tables exist. A second call does nothing. `user_version` is unchanged.
 * Exceptions: Propagates a SQLite error.
 */

import { logDebug } from '../logger';
import type { BasicDbOps } from './dbOps';
import { RELATIONSHIP_SCALE_MAX } from '../../shared/sideMessages';

/**
 * Column definition for a commander's reported trust in another side.
 *
 * Purpose: The table statement and the upgrade of an older table add the same column text.
 * When to use: Building `SIDE_MESSAGE_TABLES_DDL` and `ensureSideStanceScoreColumns`.
 * Expected outcome: A nullable integer column limited to 0 through `RELATIONSHIP_SCALE_MAX`.
 * Exceptions: None.
 */
const TRUST_COLUMN_DEFINITION = `trust INTEGER CHECK (trust IS NULL OR trust BETWEEN 0 AND ${RELATIONSHIP_SCALE_MAX})`;

/**
 * Column definition for a commander's reported threat from another side.
 *
 * Purpose: The table statement and the upgrade of an older table add the same column text.
 * When to use: Building `SIDE_MESSAGE_TABLES_DDL` and `ensureSideStanceScoreColumns`.
 * Expected outcome: A nullable integer column limited to 0 through `RELATIONSHIP_SCALE_MAX`.
 * Exceptions: None.
 */
const THREAT_COLUMN_DEFINITION = `threat INTEGER CHECK (threat IS NULL OR threat BETWEEN 0 AND ${RELATIONSHIP_SCALE_MAX})`;

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
  ${TRUST_COLUMN_DEFINITION},
  ${THREAT_COLUMN_DEFINITION},
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

/**
 * Adds the trust and threat columns to a `side_stances` table saved before they existed.
 *
 * Purpose: Save version 26 stays. An older file has the stance table without the two score columns until it is opened.
 * When to use: Directly after every `ensureSideMessageTables` call. Pass the open database's operations.
 * Expected outcome: `side_stances` lists both columns. A table that already has them is left alone, so a second call does nothing.
 * Exceptions: Propagates a SQLite error.
 */
export function ensureSideStanceScoreColumns(ops: BasicDbOps): void {
  logDebug('sideMessageTables ensureSideStanceScoreColumns');
  const existing = new Set(ops.getAll<{ name: string }>('PRAGMA table_info(side_stances)').map((column) => column.name));
  for (const [name, definition] of [
    ['trust', TRUST_COLUMN_DEFINITION],
    ['threat', THREAT_COLUMN_DEFINITION],
  ] as const) {
    if (!existing.has(name)) ops.run(`ALTER TABLE side_stances ADD COLUMN ${definition}`);
  }
}
