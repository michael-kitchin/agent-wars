/**
 * Changes a saved match for the UI smoke run, between two launches of the app.
 *
 * Purpose: Some scenes need a match state that play cannot reach on cue: a hex both sides hold, so a battle can
 *   start, or a finished match. This script writes that state into the smoke run's throwaway copy of the match.
 * When to use: Only from `editSavedMatch` in `ui-smoke-session.cjs`, while the app is closed. It runs under Electron's
 *   own Node (`ELECTRON_RUN_AS_NODE=1`), because the smoke run builds the SQLite module for Electron.
 * Expected outcome: Runs every statement in one transaction, prints how many rows each changed, and exits 0.
 * Exceptions: Exits 1, printing the error, when the file cannot be opened or a statement fails. Nothing is written then.
 *
 * Arguments: the database file, then a JSON array of `{ "sql": string, "params": array }`.
 */
'use strict';

const Database = require('better-sqlite3');

/**
 * Opens the match file and runs the statements in one transaction.
 *
 * Purpose: Either every change lands or none does, so a failed edit cannot leave a half-changed match.
 * When to use: Once, from the command line.
 * Expected outcome: One output line per statement with its changed-row count.
 * Exceptions: Throws when the file or a statement is invalid; the caller turns that into exit code 1.
 */
function main() {
  const [dbPath, statementsJson] = process.argv.slice(2);
  const statements = JSON.parse(statementsJson);
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    const runAll = db.transaction(() => statements.map(({ sql, params }) => db.prepare(sql).run(...(params || [])).changes));
    runAll().forEach((changes, i) => console.log(`statement ${i + 1}: ${changes} row(s) changed`));
  } finally {
    db.close();
  }
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
}
