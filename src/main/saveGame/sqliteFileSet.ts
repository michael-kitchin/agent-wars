/**
 * Deletes a SQLite database together with the journal files beside it.
 *
 * Purpose: A leftover write-ahead log or shared-memory file can be applied to the next file created at the same path.
 * When to use: Before replacing a staging database, and when a staging or aside file is removed.
 * Expected outcome: `<file>-wal`, `<file>-shm`, and `<file>` are absent, in that order. With `quiet`, a failure is logged with `failureLogMessage` and the remaining files are still attempted. Without `quiet`, the first failure is thrown and nothing is logged.
 * Exceptions: Throws the delete error when `quiet` is false.
 */

import * as fs from 'fs';
import { logDebug, logError } from '../logger';

/**
 * Deletes the write-ahead log, the shared-memory file, and the database file.
 *
 * Purpose: Save writing and save loading share one suffix order and one quiet-or-throw policy.
 * When to use: From the save-file and load-staging cleanup helpers. Pass the caller's existing failure sentence.
 * Expected outcome: Present files are removed. A missing file is skipped. A quiet failure is logged with the path that failed.
 * Exceptions: Rethrows the first delete error when `options.quiet` is false.
 */
export function deleteSqliteFileSet(
  filePath: string,
  options: { readonly quiet: boolean; readonly failureLogMessage: string }
): void {
  logDebug('sqliteFileSet deleteSqliteFileSet', { filePath, quiet: options.quiet });
  for (const suffix of ['-wal', '-shm', ''] as const) {
    const target = `${filePath}${suffix}`;
    try {
      if (fs.existsSync(target)) fs.rmSync(target);
    } catch (err) {
      if (!options.quiet) throw err;
      logError(options.failureLogMessage, { filePath: target, err });
    }
  }
}
