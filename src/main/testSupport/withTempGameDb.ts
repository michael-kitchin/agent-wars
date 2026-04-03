import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
} from '../gameDb';

/**
 * Why this exists:
 *     Provides one reusable temp-DB harness for game-action contract tests.
 * When to use:
 *     Tests that require an isolated sqlite file and fresh seeded match state.
 * What to expect:
 *     Opens a temporary database, resets match state, executes callback, and always cleans up.
 */
export function withTempGameDb(prefix: string, runCase: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
