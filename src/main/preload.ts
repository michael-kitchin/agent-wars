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
};

contextBridge.exposeInMainWorld('gameApi', gameApi);
