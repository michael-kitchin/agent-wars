/**
 * Contract tests for per-turn dedup of parity-check DB reads.
 *
 * Purpose: Guards that repeated `(h3Index, context)` pairs skip redundant `getHexController` reads within a turn.
 * When to use: Run via `npm test` after changes to `snapshotDbParity.ts`.
 * Expected outcome: Two identical calls perform one DB read; reset allows a second read.
 * Exceptions: Requires better-sqlite3 native module (same as `gameDb.test.ts`).
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getParityCheckDbReadCountForTests,
  logHexControllerParityMismatch,
  resetHexControllerParityCheckDedupForTurn,
  resetParityCheckDedupAndTestCountersForTests,
} from './snapshotDbParity';

/**
 * Defines the `loadGameDb` function shape (async function loadGameDb()).

 * Purpose: Lazy-loads `gameDb` so this file can compile before the native module is rebuilt.
 * When to use: Start of `run` before opening an in-memory test database.
 * Expected outcome: Resolves to the compiled `gameDb` module namespace.
 * Exceptions: Propagates import failures.
 */
async function loadGameDb() {
  return import('./gameDb');
}

/**
 * Defines the `testParityCheckDedupsDbReadWithinTurn` function shape (function testParityCheckDedupsDbReadWithinTurn(gameDb)).

 * Purpose: Asserts DB-read dedup for identical parity-check arguments within one turn window.
 * When to use: Regression guard after changing `shouldRunParityCheck`.
 * Expected outcome: Read count is 1 after two calls; 2 after turn reset and a third call.
 * Exceptions: None; uses temporary SQLite file under `os.tmpdir()`.
 */
function testParityCheckDedupsDbReadWithinTurn(gameDb: typeof import('./gameDb')): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-parity-'));
  const p = path.join(dir, 't.sqlite');
  try {
    gameDb.openGameDatabaseAtPathForTests(p);
    gameDb.resetGameForNewMatch();
    const sampleHex = gameDb.dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM hexes LIMIT 1');
    assert.ok(sampleHex?.h3Index, 'expected at least one hex');
    resetParityCheckDedupAndTestCountersForTests();
    resetHexControllerParityCheckDedupForTurn();
    const args = {
      h3Index: sampleHex!.h3Index,
      snapshotController: null as string | null,
      context: 'snapshotDbParity.test',
    };
    logHexControllerParityMismatch(args);
    logHexControllerParityMismatch(args);
    assert.strictEqual(getParityCheckDbReadCountForTests(), 1, 'second identical call must not re-read DB');
    resetHexControllerParityCheckDedupForTurn();
    logHexControllerParityMismatch(args);
    assert.strictEqual(getParityCheckDbReadCountForTests(), 2, 'new turn must allow another read');
  } finally {
    gameDb.closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Defines the `run` function shape (async function run(): Promise<void>).

 * Purpose: Executes this module's async test cases for Node's direct execution model.
 * When to use: Default entry when running `node dist/main/snapshotDbParity.test.js`.
 * Expected outcome: All tests pass and print OK lines.
 * Exceptions: Sets `process.exitCode` on failure.
 */
async function run(): Promise<void> {
  const gameDb = await loadGameDb();
  const tests = [{ name: 'parity check dedups DB read within turn', fn: () => testParityCheckDedupsDbReadWithinTurn(gameDb) }];
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exitCode = 1;
    }
  }
}

void run();
