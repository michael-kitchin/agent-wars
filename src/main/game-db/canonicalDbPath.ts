/**
 * Resolves where the SQLite game database file lives on disk under Electron `userData`.
 *
 * Purpose: Keeps path construction out of `gameDb.ts` so bootstrap and recovery code share one helper.
 * When to use: Any main-process code that needs the canonical DB file path before opening `better-sqlite3`.
 * Expected outcome: An absolute path joining `app.getPath('userData')` with the provided file name.
 * Exceptions: None; relies on Electron `app` being available (main process).
 */

import * as path from 'path';
import { app } from 'electron';
import { logTrace } from '../logger';

/**
 * Builds the absolute path to the game database file in the per-user application data directory.
 *
 * Purpose: Single implementation for `GAME_DB_FILE_NAME` resolution and test helpers that mirror production layout.
 * When to use: From `gameDb` open/create paths and corrupt-db recovery that targets the same file.
 * Expected outcome: Stable path for a given `fileName` on the current machine.
 * Exceptions: None.
 */
export function resolveGameDbFileUnderUserData(fileName: string): string {
  logTrace('resolveGameDbFileUnderUserData', { fileName });
  return path.join(app.getPath('userData'), fileName);
}
