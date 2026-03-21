/**
 * Electron preload script. Exposes a minimal, type-safe API to the renderer via contextBridge.
 * Runs in the preload context; only contextBridge and ipcRenderer are used.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  SubmitOrdersIpcPayload,
  GameReadyIpcPayload,
  GameStateSnapshot,
  ReadyResult,
  RequestAiOrdersResult,
  OpenRouterModel,
} from '../shared/ipcTypes';

let openRouterLogListener: ((payload: { line: string; isError?: boolean }) => void) | null = null;
ipcRenderer.on('openRouter:log', (_event, payload: { line: string; isError?: boolean }) => {
  openRouterLogListener?.(payload);
});

const gameApi = {
  getGameState: (): Promise<GameStateSnapshot> =>
    ipcRenderer.invoke('game:getState'),
  newGame: (size?: 'small' | 'medium' | 'large'): Promise<GameStateSnapshot> =>
    ipcRenderer.invoke('game:newGame', size ?? 'small'),
  submitOrders: (payload: SubmitOrdersIpcPayload): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:submitOrders', payload),
  ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:ready', payload),
  requestAiOrders: (payload?: { enabledToolGroups?: string[] }): Promise<RequestAiOrdersResult> =>
    ipcRenderer.invoke('game:requestAiOrders', payload),
  cancelRequestAiOrders: (): Promise<void> =>
    ipcRenderer.invoke('game:cancelRequestAiOrders'),
  /** Registers a callback to receive AI status log lines from the main process (e.g. during requestOrders). */
  registerOpenRouterLogListener: (callback: (payload: { line: string; isError?: boolean }) => void): void => {
    openRouterLogListener = callback;
  },
  openRouter: {
    getKey: (): Promise<{ hasKey: boolean }> =>
      ipcRenderer.invoke('openRouter:getKey'),
    getSelectedModel: (): Promise<string> =>
      ipcRenderer.invoke('openRouter:getSelectedModel'),
    setKey: (key: string): Promise<void> =>
      ipcRenderer.invoke('openRouter:setKey', key),
    listModels: (): Promise<{ models?: OpenRouterModel[]; error?: string }> =>
      ipcRenderer.invoke('openRouter:listModels'),
    setSelectedModel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke('openRouter:setSelectedModel', modelId),
    getToolGroupList: (): Promise<{ id: string; label: string }[]> =>
      ipcRenderer.invoke('openRouter:getToolGroupList'),
  },
};

contextBridge.exposeInMainWorld('gameApi', gameApi);
