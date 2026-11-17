import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
} from '../gameDb';
import type { ResetGameForNewMatchOptions } from '../gameDb/resetGame';

/**
 * Options for `withTempGameDb`.
 *
 * Purpose: Lets a case change how the match is set up without writing its own temp-database wrapper.
 * When to use: The third argument of `withTempGameDb`.
 * Expected outcome: Omitted fields keep the default: a plain `resetGameForNewMatch()` and no extra step.
 * Exceptions: None.
 */
export interface WithTempGameDbOptions {
  /**
   * How the match is reset after the database opens.
   *
   * Contract: Options for `resetGameForNewMatch`, or `false` to skip the reset and keep the fresh database as it opened.
   * When to use: A case that needs a non-default game size, bonus level, or no match at all.
   * Expected outcome: Omitted, the match is reset with default options.
   * Exceptions: None.
   */
  readonly reset?: ResetGameForNewMatchOptions | false;
  /**
   * A step that runs after the reset and before the case.
   *
   * Contract: Runs once with the database open.
   * When to use: Seeding rows that every assertion in the case relies on.
   * Expected outcome: The case sees the seeded state.
   * Exceptions: A throw ends the case and the temporary directory is still removed.
   */
  readonly afterOpen?: () => void;
}

/**
 * Runs one test case against a temporary, reset game database.
 *
 * Purpose: Every database test needs the same open, reset, and cleanup steps, and a missed cleanup leaks a directory.
 * When to use: Wrap the body of any main-process test that reads or writes the game database.
 * Expected outcome: Opens a database in a new temporary directory, resets the match (see `WithTempGameDbOptions`), runs `runCase`, then closes the database and deletes the directory even when the case throws.
 * Exceptions: Rethrows whatever `runCase` or `afterOpen` throws.
 *
 * @param prefix A prefix for the temporary directory name.
 * @param runCase The test body.
 * @param options How to set the match up before the case.
 */
export function withTempGameDb(prefix: string, runCase: () => void, options?: WithTempGameDbOptions): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    if (options?.reset !== false) resetGameForNewMatch(options?.reset);
    options?.afterOpen?.();
    runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
