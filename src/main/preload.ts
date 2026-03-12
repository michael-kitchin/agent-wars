/**
 * Electron preload script. Exposes a minimal, type-safe API to the renderer via contextBridge.
 * Runs in the preload context; only contextBridge and ipcRenderer are used.
 */

import { contextBridge, ipcRenderer } from 'electron';

/** Payload for submitOrders; backward compatible: array is treated as movementOrders only. */
type SubmitOrdersArg =
  | { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks?: { unitId: string; targetH3Index: string }[] }
  | { unitId: string; toH3Index: string }[];

const gameApi = {
  getGameState: (): Promise<unknown> =>
    ipcRenderer.invoke('game:getState'),
  newGame: (): Promise<unknown> =>
    ipcRenderer.invoke('game:newGame'),
  submitOrders: (payload: SubmitOrdersArg): Promise<unknown> =>
    ipcRenderer.invoke('game:submitOrders', payload),
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
