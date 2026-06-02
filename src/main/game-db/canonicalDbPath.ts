/**
 * Resolves where the SQLite game database file lives on disk under Electron `userData`.
 *
 * Purpose: Keeps path construction out of `gameDb.ts` so bootstrap and recovery code share one helper.
 * When to use: Any main-process code that needs the canonical DB file path before opening `better-sqlite3`.
 * Expected outcome: An absolute path joining `app.getPath('userData')` with the provided file name.
 * Exceptions: None; relies on Electron `app` being available (main process).
 */

import * as path from 'path';
import { logTrace } from '../logger';

/**
 * Resolves Electron `app.getPath` without loading `electron` at module import time.
 *
 * Purpose: Node tests import `gameDb` transitively; a top-level `electron` import fails when the binary is not installed.
 * When to use: From `resolveGameDbFileUnderUserData` in the Electron main process.
 * Expected outcome: An object with `getPath` when Electron is available.
 * Exceptions: Throws when Electron is unavailable (for example in plain Node without the binary).
 */
function requireElectronApp(): { getPath: (name: string) => string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as Record<string, unknown> | string | undefined;
    if (!electron || typeof electron !== 'object') {
      throw new Error('resolveGameDbFileUnderUserData: Electron app is not available');
    }
    const app = electron.app as { getPath?: (name: string) => string } | undefined;
    if (typeof app?.getPath !== 'function') {
      throw new Error('resolveGameDbFileUnderUserData: Electron app is not available');
    }
    return app as { getPath: (name: string) => string };
  } catch (err) {
    throw new Error('resolveGameDbFileUnderUserData: Electron app is not available', { cause: err });
  }
}

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
  return path.join(requireElectronApp().getPath('userData'), fileName);
}
