/**
 * Electron preload script. Exposes a minimal, type-safe API to the renderer via contextBridge.
 * Runs in the preload context; only contextBridge and ipcRenderer are used.
 */

import { contextBridge, ipcRenderer } from 'electron';

let openRouterLogListener: ((payload: { line: string; isError?: boolean }) => void) | null = null;
ipcRenderer.on('openRouter:log', (_event, payload: { line: string; isError?: boolean }) => {
  openRouterLogListener?.(payload);
});

/** Payload for submitOrders; backward compatible: array is treated as movementOrders only. */
type SubmitOrdersArg =
  | { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks?: { unitId: string; targetH3Index: string }[] }
  | { unitId: string; toH3Index: string }[];

const gameApi = {
  getGameState: (): Promise<unknown> =>
    ipcRenderer.invoke('game:getState'),
  newGame: (size?: 'small' | 'medium' | 'large'): Promise<unknown> =>
    ipcRenderer.invoke('game:newGame', size ?? 'small'),
  submitOrders: (payload: SubmitOrdersArg): Promise<unknown> =>
    ipcRenderer.invoke('game:submitOrders', payload),
  ready: (payload?: {
    enabledToolGroups?: string[];
    precomputedAiOrders?: { unitId: string; toH3Index: string }[];
    precomputedAiRangedOrders?: { unitId: string; targetH3Index: string }[];
  }) => ipcRenderer.invoke('game:ready', payload),
  requestAiOrders: (payload?: { enabledToolGroups?: string[] }): Promise<unknown> =>
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
    listModels: (): Promise<unknown> =>
      ipcRenderer.invoke('openRouter:listModels'),
    setSelectedModel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke('openRouter:setSelectedModel', modelId),
    getToolGroupList: (): Promise<{ id: string; label: string }[]> =>
      ipcRenderer.invoke('openRouter:getToolGroupList'),
  },
};

contextBridge.exposeInMainWorld('gameApi', gameApi);
