import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
} from '../gameDb';

/**
 * Defines the `withTempGameDb` function shape (export function withTempGameDb(prefix: string, runCase: () => void): void).

 * Purpose: Supports maintainability by documenting why `withTempGameDb` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
