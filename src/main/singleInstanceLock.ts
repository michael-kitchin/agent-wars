import type { App, BrowserWindow } from 'electron';
import { logDebug, logInfo } from './logger';

/**
 * Claims the process lock for this user-data directory and focuses the open window on a later launch.
 *
 * Purpose: The match database is opened with an exclusive file lock, so a second process cannot open it.
 * When to use: Once at startup, after `applyUserDataDirOverride`. Electron keys the lock by the user-data
 *   directory, so a run that sets its own directory does not collide with a running game.
 * Expected outcome: `true` for the first process, which brings its window forward when another launch of the
 *   same directory arrives. `false` for a later process, which should quit before opening a window or the database.
 * Exceptions: None. A missing window is ignored, because the first process may still be starting.
 */
export function claimSingleInstanceLock(electronApp: App, getMainWindow: () => BrowserWindow | null): boolean {
  /**
   * Brings the open window forward when a second process starts.
   *
   * Purpose: The second process quits; this one is the copy the player already has.
   * When to use: Electron's `second-instance` event, only on the process that holds the lock.
   * Expected outcome: A minimized window is restored, a hidden window is shown, and the window is focused.
   *   Nothing happens when the window does not exist yet.
   * Exceptions: None.
   */
  const focusExistingWindow = (): void => {
    const existingWindow = getMainWindow();
    logDebug('main claimSingleInstanceLock second instance', { hasWindow: existingWindow !== null });
    if (existingWindow === null) return;
    if (existingWindow.isMinimized()) existingWindow.restore();
    if (!existingWindow.isVisible()) existingWindow.show();
    existingWindow.focus();
  };
  const isPrimaryInstance = electronApp.requestSingleInstanceLock();
  logDebug('main claimSingleInstanceLock', { isPrimaryInstance });
  if (!isPrimaryInstance) {
    logInfo('main claimSingleInstanceLock: another copy is already running');
    return false;
  }
  electronApp.on('second-instance', focusExistingWindow);
  return true;
}
