/**
 * Creates the side agreement table on a database that was saved before it existed.
 *
 * Purpose: Save version 26 stays. An old file has no `side_agreements` table until it is opened.
 * When to use: Every open path that calls `ensureSideMessageTables`, after that call.
 * Expected outcome: The table and its index exist. A second call does nothing. `user_version` is unchanged.
 * Exceptions: Propagates a SQLite error.
 */

import { logDebug } from '../logger';
import {
  SIDE_AGREEMENT_DECISIONS,
  SIDE_AGREEMENT_INTENTS,
  SIDE_AGREEMENT_KINDS,
  SIDE_AGREEMENT_STATUSES,
} from '../../shared/sideAgreements';

/**
 * Turns a list of legal words into the inside of a SQL `IN (...)` check.
 *
 * Purpose: The column checks are built from the shared lists, so the table and the guards cannot disagree.
 * When to use: Building `SIDE_AGREEMENT_TABLE_DDL`.
 * Expected outcome: Each word in single quotes, joined by commas.
 * Exceptions: None.
 */
function sqlWordList(words: readonly string[]): string {
  return words.map((word) => `'${word}'`).join(', ');
}

/**
 * `CREATE TABLE` and `CREATE INDEX` text for `side_agreements`.
 *
 * Purpose: Fresh databases and opened databases share one script.
 * When to use: `getFullDdl`, which runs the script with `exec`, and `ensureSideAgreementTable`, which runs each statement alone.
 * Expected outcome: Two statements, each ending with a semicolon.
 * Exceptions: None.
 */
export const SIDE_AGREEMENT_TABLE_DDL = `CREATE TABLE IF NOT EXISTS side_agreements (
  agreement_id INTEGER PRIMARY KEY AUTOINCREMENT,
  seat_id TEXT NOT NULL,
  counterpart_seat_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${sqlWordList(SIDE_AGREEMENT_KINDS)})),
  terms TEXT NOT NULL,
  zone_h3_json TEXT NOT NULL DEFAULT '[]',
  against_seat_id TEXT,
  start_turn INTEGER NOT NULL,
  end_turn INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN (${sqlWordList(SIDE_AGREEMENT_STATUSES)})),
  intent TEXT NOT NULL CHECK (intent IN (${sqlWordList(SIDE_AGREEMENT_INTENTS)})),
  reason TEXT NOT NULL,
  updated_turn INTEGER NOT NULL,
  decision TEXT CHECK (decision IS NULL OR decision IN (${sqlWordList(SIDE_AGREEMENT_DECISIONS)})),
  decision_reason TEXT,
  decision_turn INTEGER,
  CHECK (seat_id <> counterpart_seat_id),
  CHECK (end_turn >= start_turn)
);
CREATE INDEX IF NOT EXISTS side_agreements_by_seat ON side_agreements (seat_id, counterpart_seat_id);`;

/**
 * Creates the side agreement table and its index when they are missing.
 *
 * Purpose: Validation does not require the table, because it runs before this call.
 * When to use: With the open database's `run`. Pass one statement per call. `run` rejects a script of two statements.
 * Expected outcome: One `CREATE TABLE IF NOT EXISTS` and one `CREATE INDEX IF NOT EXISTS`. No change to `user_version`.
 * Exceptions: Propagates a SQLite error.
 */
export function ensureSideAgreementTable(exec: (sql: string) => void): void {
  logDebug('sideAgreementTable ensureSideAgreementTable');
  for (const statement of SIDE_AGREEMENT_TABLE_DDL.split(';')) {
    const sql = statement.trim();
    if (sql.length > 0) exec(sql);
  }
}
