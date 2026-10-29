/**
 * Replaces the open match database with a staged save.
 *
 * Purpose: A load swaps the on-disk match and reopens it the same way launch opens an existing file.
 * When to use: After a save has been staged. The open database in production is always the file at `canonicalPath`.
 * Expected outcome: The staged match is open, or the previous match is open again. `canonicalPath + BEFORE_LOAD_BACKUP_SUFFIX` is a one-deep copy of the previous file that the next load overwrites.
 * Exceptions: Throws when the previous match cannot be reopened. Does not offer the corrupt-file recovery dialog.
 */

import * as fs from 'fs';
import { openExistingGameDatabaseAt } from '../gameDb';
import { closeDbHandle } from './dbConnection';
import { logDebug, logError } from '../logger';

/**
 * Suffix of the one-deep copy kept beside the match database.
 *
 * Purpose: A failed load copies this file back over the match.
 * When to use: Naming that copy.
 * Expected outcome: The string `.before-load`.
 * Exceptions: None.
 */
export const BEFORE_LOAD_BACKUP_SUFFIX = '.before-load';

/**
 * Shown when a failed load cannot reopen the previous match.
 *
 * Purpose: The player has to restart, because neither match is open.
 * When to use: When restoring the backup throws.
 * Expected outcome: The sentence `The previous match could not be reopened. Restart Agent Wars.`
 * Exceptions: None.
 */
export const DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE =
  'The previous match could not be reopened. Restart Agent Wars.';

/**
 * Whether the staged file became the open match.
 *
 * Purpose: The caller shows `mapLoadError` when the previous match was restored after a map failure.
 * When to use: The return value of `replaceGameDatabaseWithStagedFile`.
 * Expected outcome: `ok` is true when the staged match is open. Otherwise the previous match is open again, unless the function throws.
 * Exceptions: None.
 */
export type GameDatabaseReplaceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly mapLoadError: string | null };

/**
 * Swaps the match file at `canonicalPath` for `stagedPath` and reopens it.
 *
 * Purpose: The whole swap is synchronous because no other handler can run while the handle is closed or half-replaced.
 * When to use: With the path returned by `getCanonicalDbPath` and a staged save that has already been checked.
 * Expected outcome: `{ ok: true }` when the staged match is open. `{ ok: false }` when the previous match was restored.
 * Exceptions: Throws `DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE` when the previous match cannot be reopened.
 */
export function replaceGameDatabaseWithStagedFile(
  canonicalPath: string,
  stagedPath: string,
): GameDatabaseReplaceResult {
  logDebug('databaseReplace replaceGameDatabaseWithStagedFile', { canonicalPath, stagedPath });
  const backupPath = `${canonicalPath}${BEFORE_LOAD_BACKUP_SUFFIX}`;
  closeDbHandle();
  if (fs.existsSync(canonicalPath)) {
    try {
      fs.copyFileSync(canonicalPath, backupPath);
    } catch (err) {
      logError('databaseReplace could not copy the current match aside', { canonicalPath, err });
      reopenOrThrow(canonicalPath);
      return { ok: false, mapLoadError: null };
    }
  }
  try {
    fs.copyFileSync(stagedPath, canonicalPath);
    const opened = openExistingGameDatabaseAt(canonicalPath);
    if (opened.mapLoadError !== null) return restorePreviousMatch(canonicalPath, backupPath, opened.mapLoadError);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE) throw err;
    logError('databaseReplace could not open the staged match', { canonicalPath, err });
    return restorePreviousMatch(canonicalPath, backupPath, null);
  }
}

/**
 * Copies the backup back and opens it.
 *
 * Purpose: A staged file that fails validation or map load must not become the match the player is in.
 * When to use: After the staged copy or its reopen fails.
 * Expected outcome: The previous match is open, and the result carries `mapLoadError`.
 * Exceptions: Throws `DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE` when the backup cannot be opened.
 */
function restorePreviousMatch(
  canonicalPath: string,
  backupPath: string,
  mapLoadError: string | null,
): GameDatabaseReplaceResult {
  try {
    closeDbHandle();
    if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, canonicalPath);
    openExistingGameDatabaseAt(canonicalPath);
    return { ok: false, mapLoadError };
  } catch (err) {
    logError('databaseReplace could not reopen the previous match', { canonicalPath, err });
    throw new Error(DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE);
  }
}

/**
 * Reopens the current match after a backup copy failed.
 *
 * Purpose: Nothing was replaced, so the player stays in the match that was already open.
 * When to use: When copying `canonicalPath` to the backup path throws.
 * Expected outcome: That file is open again.
 * Exceptions: Throws `DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE` when it cannot be reopened.
 */
function reopenOrThrow(canonicalPath: string): void {
  try {
    openExistingGameDatabaseAt(canonicalPath);
  } catch (err) {
    logError('databaseReplace could not reopen the current match', { canonicalPath, err });
    throw new Error(DATABASE_REPLACE_ROLLBACK_FAILED_MESSAGE);
  }
}
