/**
 * Writes the open match database to a save file.
 *
 * Purpose: A save is a checkpointed copy of the open database with this machine's setup removed and a save marker added. The staging file is the only file that ever holds those machine-local rows, and it lives under the app data directory beside the match database.
 * When to use: A manual save and an automatic save, after the caller has decided the match may be saved.
 * Expected outcome: The target file is a save. The open database is unchanged.
 * Exceptions: A blocker, a missing handle, or a write failure throws. The target is left unchanged when the write fails before it is replaced.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { dbGetOne, isDbReady } from '../gameDb';
import { getDbHandle } from '../gameDb/dbConnection';
import { readTurnStateRow } from '../gameDb/turnStateReads';
import { logDebug, logError } from '../logger';
import {
  SAVE_APPLICATION_ID,
  SAVE_APP_VERSION_CONFIG_KEY,
  SAVE_BUSY_MESSAGE,
  SAVE_GAME_OVER_MESSAGE,
  SAVE_NOTHING_TO_SAVE_MESSAGE,
  SAVE_WRITTEN_AT_CONFIG_KEY,
} from './saveFileFormat';

/**
 * Paths and the app version for one save write.
 *
 * Purpose: The writer does not choose the destination. The caller does.
 * When to use: Passing a manual or automatic save destination into `writeSaveFileFromOpenDatabase`.
 * Expected outcome: Two file paths and the version string stored in the save.
 * Exceptions: None.
 */
export interface SaveFileWriteRequest {
  /**
   * The finished save path.
   *
   * Contract: The path that should hold the save when the write succeeds.
   * When to use: A manual save or an automatic save.
   * Expected outcome: Replaced only after the copy is complete.
   * Exceptions: None.
   */
  readonly targetPath: string;
  /**
   * The temporary copy under the app data directory.
   *
   * Contract: A path the process can create and delete.
   * When to use: Before the copy is moved onto `targetPath`.
   * Expected outcome: Deleted when the write finishes, whether it succeeded or not.
   * Exceptions: None.
   */
  readonly stagingPath: string;
  /**
   * The app version stored in the save.
   *
   * Contract: A non-empty version string.
   * When to use: The `save_app_version` row.
   * Expected outcome: The inspection can name the app that wrote the file.
   * Exceptions: None.
   */
  readonly appVersion: string;
  /**
   * The time stored in the save.
   *
   * Contract: An ISO time string. Omitted means the writer uses the current time.
   * When to use: The `save_written_at` row.
   * Expected outcome: The stored time, or the time of the write.
   * Exceptions: None.
   */
  readonly writtenAtIso?: string;
}

/**
 * Says why the open match cannot be saved, or null when it can.
 *
 * Purpose: Resolution and a finished match are refused before any file is written.
 * When to use: Before `writeSaveFileFromOpenDatabase`, and from the save dialog's availability check.
 * Expected outcome: A player-facing sentence, or null. A closed database counts as nothing to save and is not queried.
 * Exceptions: None.
 */
export function matchSaveBlocker(): string | null {
  logDebug('saveFileWrite matchSaveBlocker', { ready: isDbReady() });
  if (!isDbReady()) return SAVE_NOTHING_TO_SAVE_MESSAGE;
  const counts = dbGetOne<{ hexes: number; seats: number }>(
    'SELECT (SELECT COUNT(*) FROM hexes) AS hexes, (SELECT COUNT(*) FROM seats) AS seats',
  );
  if (!counts || counts.hexes < 1 || counts.seats < 1) return SAVE_NOTHING_TO_SAVE_MESSAGE;
  const over = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', ['game_over']);
  if (over?.value === '1') return SAVE_GAME_OVER_MESSAGE;
  const turn = readTurnStateRow(dbGetOne);
  if (!turn || turn.phase !== 'planning') return SAVE_BUSY_MESSAGE;
  return null;
}

/**
 * Copies the open match database to `request.targetPath`.
 *
 * Purpose: The copy is checkpointed, then this machine's setup rows are removed and the save marker is added.
 * When to use: After `matchSaveBlocker` would return null, or when the caller wants that check included.
 * Expected outcome: The target is replaced only after the copy is complete. The open database still has its machine-local rows.
 * Exceptions: Throws the blocker sentence when the match cannot be saved. Throws when the database handle is missing or busy, or when the copy fails.
 */
export function writeSaveFileFromOpenDatabase(request: SaveFileWriteRequest): void {
  logDebug('saveFileWrite writeSaveFileFromOpenDatabase', {
    targetPath: request.targetPath,
    stagingPath: request.stagingPath,
    appVersion: request.appVersion,
  });
  const blocker = matchSaveBlocker();
  if (blocker) throw new Error(blocker);
  const handle = getDbHandle();
  if (!handle) throw new Error(SAVE_NOTHING_TO_SAVE_MESSAGE);
  if (handle.inTransaction) throw new Error('The match database is busy, so it could not be saved.');
  const partialPath = `${request.targetPath}.partial`;
  try {
    fs.mkdirSync(path.dirname(request.stagingPath), { recursive: true });
    deleteStagingSet(request.stagingPath, false);
    handle.prepare('VACUUM INTO ?').run(request.stagingPath);
    scrubStagingDatabase(request);
    if (fs.existsSync(`${request.stagingPath}-wal`) || fs.existsSync(`${request.stagingPath}-shm`)) {
      deleteStagingSet(request.stagingPath, false);
      throw new Error('The save copy was not fully checkpointed.');
    }
    fs.mkdirSync(path.dirname(request.targetPath), { recursive: true });
    fs.copyFileSync(request.stagingPath, partialPath);
    replaceTargetWithPartial(partialPath, request.targetPath);
  } finally {
    deleteStagingSet(request.stagingPath, true);
    deleteQuietly(partialPath);
  }
}

/**
 * Removes this machine's setup from the staging database and marks it as a save.
 *
 * Purpose: A save must not carry API keys or the remembered commander, and it must be recognizable as a save.
 * When to use: After `VACUUM INTO` and before the staging file is copied.
 * Expected outcome: The staging file has no machine-local rows, has the two save metadata rows, and has the save application id.
 * Exceptions: Throws when the staging file cannot be opened or updated. The staging handle is closed either way.
 */
function scrubStagingDatabase(request: SaveFileWriteRequest): void {
  const staging = new Database(request.stagingPath);
  try {
    staging.pragma('journal_mode = DELETE');
    const placeholders = MACHINE_LOCAL_CONFIG_KEYS.map(() => '?').join(', ');
    staging.prepare(`DELETE FROM game_config WHERE key IN (${placeholders})`).run(...MACHINE_LOCAL_CONFIG_KEYS);
    const writtenAt = request.writtenAtIso ?? new Date().toISOString();
    const insert = staging.prepare('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)');
    insert.run(SAVE_APP_VERSION_CONFIG_KEY, request.appVersion);
    insert.run(SAVE_WRITTEN_AT_CONFIG_KEY, writtenAt);
    // SAVE_APPLICATION_ID is a numeric constant, so this statement cannot be shaped by a path or a name.
    staging.pragma(`application_id = ${SAVE_APPLICATION_ID}`);
  } finally {
    staging.close();
  }
}

/**
 * Moves a finished partial file onto the target path.
 *
 * Purpose: Windows cannot rename a file onto a path that already exists, so an existing target is moved aside first.
 * When to use: After the partial copy has been written.
 * Expected outcome: The target path holds the new save. An existing target is restored when the final rename fails.
 * Exceptions: Throws when a rename fails. The partial file is left for the caller to delete.
 */
function replaceTargetWithPartial(partialPath: string, targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    fs.renameSync(partialPath, targetPath);
    return;
  }
  const asidePath = `${targetPath}.replacing`;
  deleteStagingSet(asidePath, false);
  fs.renameSync(targetPath, asidePath);
  try {
    fs.renameSync(partialPath, targetPath);
  } catch (err) {
    try {
      fs.renameSync(asidePath, targetPath);
    } catch (restoreErr) {
      logError('saveFileWrite could not restore the previous save file', { targetPath, err: restoreErr });
    }
    throw err;
  }
  deleteStagingSet(asidePath, true);
}

/**
 * Deletes a file when it is present.
 *
 * Purpose: A leftover staging or aside file must not block the next rename.
 * When to use: Before creating a staging file or an aside file.
 * Expected outcome: The path is absent.
 * Exceptions: Throws when the delete fails.
 */
function deleteIfPresent(filePath: string): void {
  if (fs.existsSync(filePath)) fs.rmSync(filePath);
}

/**
 * Deletes a temporary file and logs a failure without hiding the save error.
 *
 * Purpose: Cleanup runs after a failed save and must not replace that failure.
 * When to use: From the write function's cleanup.
 * Expected outcome: The path is absent, or the failure is logged.
 * Exceptions: None. A delete failure is logged.
 */
function deleteQuietly(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) fs.rmSync(filePath);
  } catch (err) {
    logError('saveFileWrite failed to delete a temporary file', { filePath, err });
  }
}

/**
 * Deletes a database path and any journal files beside it.
 *
 * Purpose: A leftover `-wal` or `-shm` can be applied to the next file created at the same path.
 * When to use: Before `VACUUM INTO`, when a copy is not checkpointed, and when an aside file is removed.
 * Expected outcome: The path and its journal files are absent.
 * Exceptions: Throws when `quiet` is false and a delete fails. A quiet delete logs the failure and does not throw.
 */
function deleteStagingSet(filePath: string, quiet: boolean): void {
  for (const suffix of ['-wal', '-shm', '']) {
    const target = `${filePath}${suffix}`;
    if (quiet) deleteQuietly(target);
    else deleteIfPresent(target);
  }
}
