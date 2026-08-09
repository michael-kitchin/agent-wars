import { logDebug, logError } from '../logger';

/**
 * Minimal `ipcMain.handle` surface for registration without importing Electron in unit tests.
 *
 * Purpose: Lets `registerLoggedIpcHandler` accept a fake in Node tests while matching Electron’s handle API.
 * When to use: Pass Electron `ipcMain` in production; pass a stub in tests.
 * Expected outcome: `handle(channel, listener)` is invoked once per registration.
 * Exceptions: None.
 */
export type LoggedIpcMainLike = {
  handle: (channel: string, listener: (...args: unknown[]) => unknown) => void;
};

/**
 * Registers an IPC handler that logs entry, catches failures, and returns a fallback.
 *
 * Purpose: Collapses identical try/catch+logError wrappers for read-only loaders (e.g. res4 overlay IPC).
 * When to use: When a handler’s failure mode is “log and return fallback” with a stable debug label.
 * Expected outcome: Successful invokes return `handler()`; thrown errors log `${logLabel}: failed` and return `fallback`.
 * Exceptions: Does not rethrow; always returns `T`.
 */
export function registerLoggedIpcHandler<T>(
  ipcMain: LoggedIpcMainLike,
  channel: string,
  logLabel: string,
  handler: () => T,
  fallback: T
): void {
  logDebug('registerLoggedIpcHandler', { channel, logLabel });
  ipcMain.handle(channel, () => {
    logDebug(logLabel);
    try {
      return handler();
    } catch (err) {
      logError(`${logLabel}: failed`, err);
      return fallback;
    }
  });
}
