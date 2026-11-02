/**
 * IPC for the Game Options nickname.
 *
 * Purpose: The field reads and writes the machine-local row without growing the main entry file.
 * When to use: `registerIpcHandlers`.
 * Expected outcome: Get returns `Human` when no custom row is stored. Set stores a cleaned name or restores `Human`.
 * Exceptions: Propagates a database error.
 */

import type { IpcMain } from 'electron';
import { IPC_GAME } from '../../shared/ipc/channels';
import { getHumanNickname, setHumanNickname } from '../humanNickname';
import { logDebug } from '../logger';

/**
 * Registers the two nickname channels.
 *
 * Purpose: Preload calls these by the channel constants.
 * When to use: Once, from `registerIpcHandlers`.
 * Expected outcome: Get returns the stored name. Set writes it and returns nothing.
 * Exceptions: A database error propagates.
 */
export function registerHumanNicknameIpcHandler(ipcMain: IpcMain): void {
  logDebug('humanNicknameIpcHandler register');
  ipcMain.handle(IPC_GAME.getHumanNickname, () => getHumanNickname());
  ipcMain.handle(IPC_GAME.setHumanNickname, (_event, nickname: unknown) => {
    setHumanNickname(nickname);
  });
}
