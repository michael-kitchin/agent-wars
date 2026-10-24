import type { IpcMain } from 'electron';
import { IPC_OPENROUTER } from '../../shared/ipc/channels';
import { isAiSeatId } from '../../shared/seatIds';
import { logDebug, logError, logTrace } from '../logger';
import { readCommanderKeyMemory, readSeatApiKey } from '../openRouter/commanderKeyMemory';
import {
  getSelectedModel,
  getSelectedReasoningEffort,
  getToolGroupList,
  hasKey,
  listModels,
  loadKey,
  saveKey,
  setSelectedModel,
  setSelectedReasoningEffort,
} from '../openRouter/openRouter';

/**
 * Registers the Opponent-tab OpenRouter settings handlers: key, model list, model choice, reasoning effort, tool groups.
 *
 * Purpose: Keeps the OpenRouter settings surface in one place, apart from the game action handlers in `main.ts`.
 * When to use: Once at startup, from `registerIpcHandlers`, before the window loads.
 * Expected outcome: Every `IPC_OPENROUTER` invoke channel except `log` (a push channel) has a handler. Non-string
 * setter arguments are treated as `''`, which clears the stored value.
 * Exceptions: Electron throws if a channel already has a handler.
 */
export function registerOpenRouterIpcHandler(ipcMain: Pick<IpcMain, 'handle'>): void {
  logDebug('registerOpenRouterIpcHandler');
  ipcMain.handle(IPC_OPENROUTER.getToolGroupList, () => getToolGroupList());
  ipcMain.handle(IPC_OPENROUTER.getKey, () => ({ hasKey: hasKey() }));
  ipcMain.handle(IPC_OPENROUTER.getSelectedModel, () => getSelectedModel());
  ipcMain.handle(IPC_OPENROUTER.setKey, (_event, key: unknown) => {
    saveKey(typeof key === 'string' ? key : '');
  });
  ipcMain.handle(IPC_OPENROUTER.listModels, (_event, key: unknown) => listModels(typeof key === 'string' ? key : ''));
  ipcMain.handle(IPC_OPENROUTER.setSelectedModel, (_event, modelId: unknown) => {
    setSelectedModel(typeof modelId === 'string' ? modelId : '');
  });
  ipcMain.handle(IPC_OPENROUTER.getSelectedReasoningEffort, () => getSelectedReasoningEffort());
  ipcMain.handle(IPC_OPENROUTER.setSelectedReasoningEffort, (_event, effort: unknown) => {
    setSelectedReasoningEffort(typeof effort === 'string' ? effort : '');
  });
  ipcMain.handle(IPC_OPENROUTER.getCommanderKeyMemory, () => {
    logTrace('openRouterIpc getCommanderKeyMemory');
    return readCommanderKeyMemory(loadKey());
  });
  ipcMain.handle(IPC_OPENROUTER.getSeatApiKey, (_event, seatId: unknown) => {
    if (typeof seatId !== 'string' || !isAiSeatId(seatId)) {
      logError('openRouterIpc getSeatApiKey: seat id is not an AI seat', {
        seatIdType: typeof seatId,
        seatIdLength: typeof seatId === 'string' ? seatId.length : 0,
      });
      return '';
    }
    logTrace('openRouterIpc getSeatApiKey', { seatId });
    return readSeatApiKey(seatId, loadKey());
  });
}
