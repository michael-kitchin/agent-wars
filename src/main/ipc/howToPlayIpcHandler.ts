/**
 * IPC for the game menu's How to play item.
 *
 * Purpose: Opens the How to play guide on GitHub in the system browser. The renderer sends no URL, so a compromised renderer cannot open an arbitrary page.
 * When to use: `registerIpcHandlers` registers the channel once.
 * Expected outcome: The guide page opens in the default browser, and the call reports whether it opened.
 * Exceptions: None. A failed open is logged and reported as false.
 */

import type { IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import { logDebug, logError, logInfo } from '../logger';

/**
 * The How to play guide on GitHub.
 *
 * Purpose: The one page the How to play item may open, fixed in main so no renderer input reaches the browser call.
 * When to use: Only by `openHowToPlay`.
 * Expected outcome: The guide's GitHub URL on the main branch.
 * Exceptions: None.
 */
export const HOW_TO_PLAY_URL = 'https://github.com/michael-kitchin/agent-wars/blob/main/doc/how-to-play.md';

/**
 * Opens the How to play guide with the given browser opener.
 *
 * Purpose: Keeps the open testable without Electron, and turns a failed open into a plain false.
 * When to use: The How to play channel's handler, with Electron's `shell.openExternal`.
 * Expected outcome: Resolves true once the opener accepts the URL, or false when it rejects.
 * Exceptions: None. A rejection is logged with `logError`.
 */
export async function openHowToPlay(openExternal: (url: string) => Promise<void>): Promise<boolean> {
  logInfo('howToPlay open', { url: HOW_TO_PLAY_URL });
  try {
    await openExternal(HOW_TO_PLAY_URL);
    return true;
  } catch (error) {
    logError('howToPlay open failed', { url: HOW_TO_PLAY_URL, error });
    return false;
  }
}

/**
 * Registers the How to play channel.
 *
 * Purpose: Preload calls it by `IPC_GAME.openHowToPlay` when the player picks How to play in the game menu.
 * When to use: Once, from `registerIpcHandlers`, with Electron's `shell.openExternal`.
 * Expected outcome: Each call opens the fixed guide URL and resolves whether it opened.
 * Exceptions: None.
 */
export function registerHowToPlayIpcHandler(
  ipcMain: Pick<IpcMain, 'handle'>,
  openExternal: (url: string) => Promise<void>,
): void {
  logDebug('howToPlayIpcHandler register');
  ipcMain.handle(IPC_GAME.openHowToPlay, () => openHowToPlay(openExternal));
}
