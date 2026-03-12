/**
 * Electron preload script. Exposes a minimal, type-safe API to the renderer via contextBridge.
 * Runs in the preload context; only contextBridge and ipcRenderer are used.
 */

import { contextBridge, ipcRenderer } from 'electron';

const gameApi = {
  getGameState: (): Promise<unknown> =>
    ipcRenderer.invoke('game:getState'),
  submitOrders: (orders: { unitId: string; toH3Index: string }[]): Promise<unknown> =>
    ipcRenderer.invoke('game:submitOrders', orders),
  ready: (): Promise<unknown> =>
    ipcRenderer.invoke('game:ready'),
  openRouter: {
    getKey: (): Promise<{ hasKey: boolean }> =>
      ipcRenderer.invoke('openRouter:getKey'),
    setKey: (key: string): Promise<void> =>
      ipcRenderer.invoke('openRouter:setKey', key),
    listModels: (): Promise<unknown> =>
      ipcRenderer.invoke('openRouter:listModels'),
    setSelectedModel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke('openRouter:setSelectedModel', modelId),
  },
};

contextBridge.exposeInMainWorld('gameApi', gameApi);
