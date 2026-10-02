import type { IpcMain } from 'electron';
import { IPC_OPENROUTER } from '../../shared/ipc/channels';
import { logDebug } from '../logger';
import {
  getSelectedModel,
  getSelectedReasoningEffort,
  getToolGroupList,
  hasKey,
  listModels,
  saveKey,
  setSelectedModel,
  setSelectedReasoningEffort,
} from '../openRouter/openRouter';

/**
 * Registers the Model-tab OpenRouter settings handlers: key, model list, model choice, reasoning effort, tool groups.
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
  ipcMain.handle(IPC_OPENROUTER.listModels, () => listModels());
  ipcMain.handle(IPC_OPENROUTER.setSelectedModel, (_event, modelId: unknown) => {
    setSelectedModel(typeof modelId === 'string' ? modelId : '');
  });
  ipcMain.handle(IPC_OPENROUTER.getSelectedReasoningEffort, () => getSelectedReasoningEffort());
  ipcMain.handle(IPC_OPENROUTER.setSelectedReasoningEffort, (_event, effort: unknown) => {
    setSelectedReasoningEffort(typeof effort === 'string' ? effort : '');
  });
}
