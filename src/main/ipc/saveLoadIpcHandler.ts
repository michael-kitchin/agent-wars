/**
 * IPC for saving and loading the match in progress.
 *
 * Purpose: The renderer asks. Dialogs, the file, and the database swap stay in the main process.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: `game:saveGame` and `game:loadGame` are registered. A missing window fails without a dialog.
 * Exceptions: None. An unexpected failure is returned as the generic sentence.
 */

import { app, dialog, type BrowserWindow, type IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import { getCanonicalDbPath } from '../gameDb';
import { logDebug, logError } from '../logger';
import { stopModelWork } from './modelWorkCancellation';
import { isReadyInFlight } from './readyInFlight';
import { maybeWriteTurnStartAutoSave } from '../saveGame/autoSave';
import { runLoadGame, runSaveGame, SAVE_FAILED_MESSAGE, LOAD_FAILED_MESSAGE, type SaveLoadDeps } from '../saveGame/saveLoadPipeline';
import { SAVE_FILE_EXTENSION, SAVE_FILE_FILTER_NAME } from '../saveGame/saveFileFormat';

export { forgetAutoSaveTurnKey, rememberCurrentAutoSaveTurnKey } from '../saveGame/autoSave';
export { runWithReadyInFlight } from './readyInFlight';

/**
 * Runs `work`, then writes an automatic save when the open turn has not been saved.
 *
 * Purpose: Turn-start handlers share one place that saves after their own work has finished.
 * When to use: After Ready, melee resolution, a tactical commit, a battle start, a battle end, or a new match. Never inside a database transaction or inside resolution code.
 * Expected outcome: `work`'s result. An automatic save is attempted only when `work` returns. A throw from `work` is rethrown with no save.
 * Exceptions: Propagates whatever `work` throws.
 */
export async function withAutoSaveAfter<T>(work: () => T | Promise<T>): Promise<T> {
  const result = await work();
  maybeWriteTurnStartAutoSave({
    userDataDir: app.getPath('userData'),
    appVersion: app.getVersion(),
    now: () => new Date(),
  });
  return result;
}

/**
 * Registers the save and load channels.
 *
 * Purpose: Keeps the dialogs and the pipeline out of the main process entry file.
 * When to use: Once, next to the other game IPC registrations.
 * Expected outcome: Both channels are handled. A null window returns a failure and does not open a dialog. An unexpected throw becomes the generic failure sentence.
 * Exceptions: None.
 */
export function registerSaveLoadIpcHandler(
  ipcMain: IpcMain,
  getMainWindow: () => BrowserWindow | null,
  sendActivityLog: (line: string) => void,
): void {
  logDebug('saveLoadIpcHandler register');
  ipcMain.handle(IPC_GAME.saveGame, async () => {
    if (!getMainWindow()) return { status: 'failed' as const, message: SAVE_FAILED_MESSAGE };
    try {
      return await runSaveGame(buildDeps(getMainWindow, sendActivityLog));
    } catch (err) {
      logError('saveLoadIpcHandler could not save the match', { err });
      return { status: 'failed' as const, message: SAVE_FAILED_MESSAGE };
    }
  });
  ipcMain.handle(IPC_GAME.loadGame, async () => {
    if (!getMainWindow()) return { status: 'failed' as const, message: LOAD_FAILED_MESSAGE };
    try {
      return await runLoadGame(buildDeps(getMainWindow, sendActivityLog));
    } catch (err) {
      logError('saveLoadIpcHandler could not load the match', { err });
      return { status: 'failed' as const, message: LOAD_FAILED_MESSAGE };
    }
  });
}

/**
 * Fills the pipeline's dependencies from the running app.
 *
 * Purpose: Dialogs are parented to the main window, so the renderer cannot start another handler while one is open.
 * When to use: Each save or load call, so the paths match the current app data directory.
 * Expected outcome: Deps whose dialogs return a path, or null when the player cancels or the window is gone.
 * Exceptions: None.
 */
function buildDeps(
  getMainWindow: () => BrowserWindow | null,
  sendActivityLog: (line: string) => void,
): SaveLoadDeps {
  return {
    userDataDir: app.getPath('userData'),
    documentsDir: app.getPath('documents'),
    appVersion: app.getVersion(),
    canonicalDbPath: getCanonicalDbPath(),
    showSaveDialog: (defaultPath) => showSave(getMainWindow, defaultPath),
    showOpenDialog: (defaultDirectory) => showOpen(getMainWindow, defaultDirectory),
    stopModelWorkForLoad: () => stopModelWork('load_game', sendActivityLog),
    isReadyInFlight,
  };
}

/**
 * Shows the Save dialog on the main window.
 *
 * Purpose: The player chooses the file. The filter is the one save type.
 * When to use: From the save dependencies, after the window was confirmed.
 * Expected outcome: The chosen path, or null when the player cancels or the window is gone.
 * Exceptions: None.
 */
async function showSave(getMainWindow: () => BrowserWindow | null, defaultPath: string): Promise<string | null> {
  const parent = getMainWindow();
  if (!parent) return null;
  const chosen = await dialog.showSaveDialog(parent, {
    defaultPath,
    filters: [{ name: SAVE_FILE_FILTER_NAME, extensions: [SAVE_FILE_EXTENSION] }],
  });
  if (chosen.canceled || !chosen.filePath) return null;
  return chosen.filePath;
}

/**
 * Shows the Open dialog on the main window.
 *
 * Purpose: The player chooses one save file.
 * When to use: From the load dependencies, after the window was confirmed.
 * Expected outcome: The chosen path, or null when the player cancels or the window is gone.
 * Exceptions: None.
 */
async function showOpen(getMainWindow: () => BrowserWindow | null, defaultDirectory: string): Promise<string | null> {
  const parent = getMainWindow();
  if (!parent) return null;
  const chosen = await dialog.showOpenDialog(parent, {
    defaultPath: defaultDirectory,
    filters: [{ name: SAVE_FILE_FILTER_NAME, extensions: [SAVE_FILE_EXTENSION] }],
    properties: ['openFile'],
  });
  if (chosen.canceled || !chosen.filePaths[0]) return null;
  return chosen.filePaths[0];
}
