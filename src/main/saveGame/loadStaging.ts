/**
 * Copies a save into a staging file and puts this machine's setup back into it.
 *
 * Purpose: The staged file is what replaces the match. It must pass inspection, and it must carry this machine's keys rather than the save's metadata.
 * When to use: After the player chooses a file and before the match database is replaced.
 * Expected outcome: A usable inspection, with the staging file still on disk for the caller to delete. A rejected file leaves no staging file.
 * Exceptions: None. A copy or read failure is reported as not a save. A closed match database or a staging update failure is reported as a load failure.
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { dbGetAll, isDbReady } from '../gameDb';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { logDebug, logError } from '../logger';
import {
  LOAD_FAILED_MESSAGE,
  SAVE_APP_VERSION_CONFIG_KEY,
  SAVE_NOT_A_SAVE_MESSAGE,
  SAVE_WRITTEN_AT_CONFIG_KEY,
} from './saveFileFormat';
import { inspectSaveFile, type SaveFileInspection } from './saveFileInspect';

/**
 * Copies `sourcePath` to `stagingPath`, checks it, and copies this machine's setup into it.
 *
 * Purpose: Load can then replace the match with a file that has the right keys and no save metadata.
 * When to use: With a player-chosen path and the load staging path under the app data directory.
 * Expected outcome: The inspection of a prepared staging file, or the reason the file was rejected. The open match is not changed. A closed match database is refused so an empty key list is not written into the loaded match.
 * Exceptions: None.
 */
export function stageSaveFileForLoad(
  sourcePath: string,
  stagingPath: string,
  currentAppVersion: string,
): SaveFileInspection {
  logDebug('loadStaging stageSaveFileForLoad', { sourcePath, stagingPath, currentAppVersion });
  try {
    deleteStagingFiles(stagingPath, false);
    fs.mkdirSync(path.dirname(stagingPath), { recursive: true });
    fs.copyFileSync(sourcePath, stagingPath);
  } catch (err) {
    logError('loadStaging could not copy the save', { sourcePath, stagingPath, err });
    deleteStagingFiles(stagingPath, true);
    return { ok: false, message: SAVE_NOT_A_SAVE_MESSAGE };
  }
  const inspected = inspectSaveFile(stagingPath, currentAppVersion);
  if (!inspected.ok) {
    deleteStagingFiles(stagingPath, true);
    return inspected;
  }
  if (!isDbReady()) {
    logError('loadStaging refused to copy machine-local rows because the match database is closed', { stagingPath });
    deleteStagingFiles(stagingPath, true);
    return { ok: false, message: LOAD_FAILED_MESSAGE };
  }
  const placeholders = MACHINE_LOCAL_CONFIG_KEYS.map(() => '?').join(', ');
  let carried: { key: string; value: string }[];
  try {
    carried = dbGetAll<{ key: string; value: string }>(
      `SELECT key, value FROM game_config WHERE key IN (${placeholders})`,
      [...MACHINE_LOCAL_CONFIG_KEYS],
    );
  } catch (err) {
    logError('loadStaging could not read this machine setup', { stagingPath, err });
    deleteStagingFiles(stagingPath, true);
    return { ok: false, message: LOAD_FAILED_MESSAGE };
  }
  logDebug('loadStaging copying machine-local rows', { count: carried.length });
  let staging: InstanceType<typeof Database>;
  try {
    staging = new Database(stagingPath);
  } catch (err) {
    logError('loadStaging could not open the staging file', { stagingPath, err });
    deleteStagingFiles(stagingPath, true);
    return { ok: false, message: LOAD_FAILED_MESSAGE };
  }
  let prepared = false;
  try {
    staging.pragma('journal_mode = DELETE');
    staging.exec('BEGIN');
    try {
      staging.prepare(`DELETE FROM game_config WHERE key IN (${placeholders})`).run(...MACHINE_LOCAL_CONFIG_KEYS);
      staging.prepare('DELETE FROM game_config WHERE key IN (?, ?)').run(
        SAVE_APP_VERSION_CONFIG_KEY,
        SAVE_WRITTEN_AT_CONFIG_KEY,
      );
      const insert = staging.prepare('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)');
      for (const row of carried) insert.run(row.key, row.value);
      staging.exec('COMMIT');
      prepared = true;
    } catch (err) {
      try {
        staging.exec('ROLLBACK');
      } catch (rollbackErr) {
        logError('loadStaging could not roll back the staging file', { stagingPath, err: rollbackErr });
      }
      throw err;
    }
  } catch (err) {
    logError('loadStaging could not prepare the staging file', { stagingPath, err });
    prepared = false;
  } finally {
    try {
      staging.close();
    } catch (err) {
      logError('loadStaging could not close the staging file', { stagingPath, err });
      prepared = false;
    }
  }
  if (!prepared) {
    deleteStagingFiles(stagingPath, true);
    return { ok: false, message: LOAD_FAILED_MESSAGE };
  }
  if (fs.existsSync(`${stagingPath}-wal`) || fs.existsSync(`${stagingPath}-shm`)) {
    logDebug('loadStaging rejected an uncheckpointed copy', { stagingPath });
    deleteStagingFiles(stagingPath, true);
    return { ok: false, message: LOAD_FAILED_MESSAGE };
  }
  return inspected;
}

/**
 * Deletes a staging database and any journal files beside it.
 *
 * Purpose: A leftover `-wal` or `-shm` can be applied to the next file created at the same path. The database handle must already be closed.
 * When to use: Before copying a save into the staging path, and after a rejected copy.
 * Expected outcome: The staging path and its journal files are absent.
 * Exceptions: Throws when `quiet` is false and a delete fails. A quiet delete logs the failure and does not throw.
 */
function deleteStagingFiles(filePath: string, quiet: boolean): void {
  for (const suffix of ['-wal', '-shm', '']) {
    const target = `${filePath}${suffix}`;
    try {
      if (fs.existsSync(target)) fs.rmSync(target);
    } catch (err) {
      if (!quiet) throw err;
      logError('loadStaging failed to delete the staging file', { filePath: target, err });
    }
  }
}
