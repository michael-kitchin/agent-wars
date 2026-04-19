import { logError } from '../logger';

/**
 * Detects failures to load the better-sqlite3 native addon because the `.node` binary targets a different
 * Node/Electron ABI than the running process (for example after `rebuild:native:node` followed by packaging
 * for Electron without rebuilding for Electron).
 *
 * Purpose: Lets bootstrap distinguish "wrong build / install" from a corrupt or incompatible SQLite file so
 * recovery code does not rename the user's database when the engine never loaded.
 * When to use: After `new Database(...)` throws during startup, before invoking corrupt-database recovery.
 * Expected outcome: `true` when `err` is the usual `ERR_DLOPEN_FAILED` / NODE_MODULE_VERSION mismatch message.
 * Exceptions: None; this is a pure predicate on `err`.
 */
export function isBetterSqliteNativeLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as NodeJS.ErrnoException & { code?: string };
  if (e.code === 'ERR_DLOPEN_FAILED') return true;
  const msg = String((err as Error).message ?? err);
  return msg.includes('NODE_MODULE_VERSION') && msg.includes('better_sqlite3');
}

/**
 * When better-sqlite3 cannot load its native binary, logs the failure, shows a blocking dialog in a real
 * Electron main process, and exits. In plain Node (for example unit tests without Electron APIs), only logs
 * and returns `false` so the caller can propagate the original error.
 *
 * Purpose: Surfaces an actionable "rebuild native for Electron" message instead of misleading corrupt-DB flows.
 * When to use: Immediately after catching an error from constructing `Database` during `initDatabase`.
 * Expected outcome: Returns `true` if the error was a native-load mismatch and the process is exiting or the
 * user was notified; returns `false` if the error was something else or Electron UI was unavailable.
 * Exceptions: Swallows errors from `require('electron')` or `dialog.showErrorBox` after logging them.
 */
export function notifyBetterSqliteNativeLoadFailureAndExitIfApplicable(err: unknown): boolean {
  if (!isBetterSqliteNativeLoadError(err)) return false;
  logError('betterSqliteNativeLoad: better-sqlite3 native add-on failed to load', err);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as Record<string, unknown> | string | undefined;
    if (!electron || typeof electron !== 'object') return false;
    const dialog = electron.dialog as { showErrorBox?: (title: string, content: string) => void } | undefined;
    const app = electron.app as { exit?: (code: number) => void } | undefined;
    if (typeof dialog?.showErrorBox !== 'function' || typeof app?.exit !== 'function') return false;
    dialog.showErrorBox(
      'Installation error',
      'The database engine could not load its native component. This is not a damaged save file.\n\n' +
        'If you built this app from source: run npm run rebuild:native:electron, then your dist script ' +
        '(for example npm run dist:win).\n\n' +
        'If you installed a prebuilt package, reinstall from a release built for this app version.'
    );
    app.exit(1);
    return true;
  } catch (notifyErr) {
    logError('betterSqliteNativeLoad: failed to show installation error dialog', notifyErr);
    return false;
  }
}
