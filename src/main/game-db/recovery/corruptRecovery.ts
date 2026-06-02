import * as fs from 'fs';
import * as path from 'path';
import { logDebug, logError } from '../../logger';

/**
 * Resolves Electron `app` and `dialog` for corrupt-database UI recovery without loading `electron` at module import time.
 *
 * Purpose: Node test runs import `gameDb` transitively but do not install the Electron binary; top-level `electron`
 * imports throw before any recovery function runs.
 * When to use: Only from `recoverCorruptDatabaseUi` in the Electron main process.
 * Expected outcome: `{ app, dialog }` when Electron APIs are available; otherwise throws so callers fail loudly in production.
 * Exceptions: Throws when `require('electron')` fails or does not expose UI APIs (plain Node).
 */
function requireElectronUi(): {
  app: { exit: (code: number) => void };
  dialog: { showErrorBox: (title: string, content: string) => void };
} {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as Record<string, unknown> | string | undefined;
    if (!electron || typeof electron !== 'object') {
      throw new Error('corruptRecovery requireElectronUi: Electron UI APIs are not available');
    }
    const appCandidate = electron.app as { exit?: (code: number) => void } | undefined;
    const dialogCandidate = electron.dialog as { showErrorBox?: (title: string, content: string) => void } | undefined;
    if (typeof appCandidate?.exit !== 'function' || typeof dialogCandidate?.showErrorBox !== 'function') {
      throw new Error('corruptRecovery requireElectronUi: Electron UI APIs are not available');
    }
    return {
      app: appCandidate as { exit: (code: number) => void },
      dialog: dialogCandidate as { showErrorBox: (title: string, content: string) => void },
    };
  } catch (err) {
    logError('corruptRecovery requireElectronUi: failed to load Electron UI APIs', err);
    throw err;
  }
}

/**
 * Defines the `isoTimestampForFilename` function shape (function isoTimestampForFilename(): string).

 * Purpose: Supports maintainability by documenting why `isoTimestampForFilename` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isoTimestampForFilename(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

/**
 * Defines the `tryRenameCorruptSet` function shape (export function tryRenameCorruptSet(canonicalPath: string): boolean).

 * Purpose: Supports maintainability by documenting why `tryRenameCorruptSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `tryDeleteCanonicalAndSidecars` function shape (export function tryDeleteCanonicalAndSidecars(canonicalPath: string): boolean).

 * Purpose: Supports maintainability by documenting why `tryDeleteCanonicalAndSidecars` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `silentRecoverCorruptDatabase` function shape (export function silentRecoverCorruptDatabase().

 * Purpose: Supports maintainability by documenting why `silentRecoverCorruptDatabase` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
 * Defines the `recoverCorruptDatabaseUi` function shape (export function recoverCorruptDatabaseUi( canonicalPath: string, cause: unknown, deps: { closeDbHandle: () => void; createFreshDatabaseAt: (c).

 * Purpose: Supports maintainability by documenting why `recoverCorruptDatabaseUi` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function recoverCorruptDatabaseUi(
  canonicalPath: string,
  cause: unknown,
  deps: {
    closeDbHandle: () => void;
    createFreshDatabaseAt: (canonicalPath: string) => void;
  }
): void {
  const { app, dialog } = requireElectronUi();
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
