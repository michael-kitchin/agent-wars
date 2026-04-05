import * as fs from 'fs';
import * as path from 'path';
import { app, dialog } from 'electron';
import { logDebug, logError } from '../../logger';

function isoTimestampForFilename(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

export function tryRenameCorruptSet(canonicalPath: string): boolean {
  const parsed = path.parse(canonicalPath);
  const backupMain = path.join(parsed.dir, `${parsed.name}.corrupt.${isoTimestampForFilename()}${parsed.ext}`);
  const oldWal = `${canonicalPath}-wal`;
  const oldShm = `${canonicalPath}-shm`;
  const newWal = `${backupMain}-wal`;
  const newShm = `${backupMain}-shm`;
  try {
    fs.renameSync(canonicalPath, backupMain);
    if (fs.existsSync(oldWal)) fs.renameSync(oldWal, newWal);
    if (fs.existsSync(oldShm)) fs.renameSync(oldShm, newShm);
    logDebug('corruptRecovery tryRenameCorruptSet: success', { backupMain });
    return true;
  } catch (err) {
    logError('corruptRecovery tryRenameCorruptSet: failed', err);
    return false;
  }
}

export function tryDeleteCanonicalAndSidecars(canonicalPath: string): boolean {
  const paths = [`${canonicalPath}-wal`, `${canonicalPath}-shm`, canonicalPath];
  try {
    for (const p of paths) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    logDebug('corruptRecovery tryDeleteCanonicalAndSidecars: success');
    return true;
  } catch (err) {
    logError('corruptRecovery tryDeleteCanonicalAndSidecars: failed', err);
    return false;
  }
}

export function silentRecoverCorruptDatabase(
  canonicalPath: string,
  createFreshDatabaseAt: (canonicalPath: string) => void
): void {
  const renamed = tryRenameCorruptSet(canonicalPath);
  if (!renamed) {
    const deleted = tryDeleteCanonicalAndSidecars(canonicalPath);
    if (!deleted) {
      throw new Error('corruptRecovery silentRecoverCorruptDatabase: could not rename or delete corrupt database');
    }
  }
  createFreshDatabaseAt(canonicalPath);
}

/**
 * Why this exists:
 *     Performs UI-visible corrupt database recovery with one rename attempt and delete fallback before recreating the DB file.
 * When to use:
 *     On startup/open validation failures where user feedback and deterministic recovery behavior are required.
 * What to expect:
 *     Shows error dialogs, attempts rename/delete recovery, recreates database, and exits app when recovery cannot proceed.
 */
export function recoverCorruptDatabaseUi(
  canonicalPath: string,
  cause: unknown,
  deps: {
    closeDbHandle: () => void;
    createFreshDatabaseAt: (canonicalPath: string) => void;
  }
): void {
  deps.closeDbHandle();
  dialog.showErrorBox(
    'Database problem',
    'The game database file is invalid or incompatible with this version of Agent Wars.\n\n' +
      'The app will try to rename the existing file (one attempt) and create a new empty database.\n' +
      'After that, use New game from the menu to start playing.'
  );
  logError('corruptRecovery recoverCorruptDatabaseUi: starting recovery', cause);

  const renamed = tryRenameCorruptSet(canonicalPath);
  if (!renamed) {
    logError('corruptRecovery recoverCorruptDatabaseUi: rename failed, attempting delete', cause);
    const deleted = tryDeleteCanonicalAndSidecars(canonicalPath);
    if (!deleted) {
      logError('corruptRecovery recoverCorruptDatabaseUi: delete failed, exiting', cause);
      dialog.showErrorBox(
        'Database recovery failed',
        'The game could not rename or remove the damaged database file.\n\n' +
          'Please remove or move the database file manually (and any .sqlite-wal / .sqlite-shm files next to it), then restart the application.'
      );
      app.exit(1);
      return;
    }
    logDebug('corruptRecovery recoverCorruptDatabaseUi: path cleared after failed rename');
  } else {
    logDebug('corruptRecovery recoverCorruptDatabaseUi: corrupt file renamed; creating fresh DB');
  }

  try {
    deps.createFreshDatabaseAt(canonicalPath);
  } catch (err) {
    logError('corruptRecovery recoverCorruptDatabaseUi: createFreshDatabaseAt failed', err);
    dialog.showErrorBox('Database error', 'Could not create a new game database. See logs for details.');
    app.exit(1);
  }
}
