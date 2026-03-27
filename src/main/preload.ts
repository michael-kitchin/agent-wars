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
  HumanOrderPreviewResult,
  HumanStandingOrderSnapshot,
} from '../shared/ipcTypes';

let openRouterLogListener: ((payload: { line: string; isError?: boolean }) => void) | null = null;
ipcRenderer.on('openRouter:log', (_event, payload: { line: string; isError?: boolean }) => {
  openRouterLogListener?.(payload);
});

const gameApi = {
  getGameState: (): Promise<GameStateSnapshot> =>
    ipcRenderer.invoke('game:getState'),
  getRes4TerrainOverrides: (): Promise<{ h3Index: string; terrainKind: string }[]> =>
    ipcRenderer.invoke('game:getRes4TerrainOverrides'),
  newGame: (): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:newGame'),
  submitOrders: (payload: SubmitOrdersIpcPayload): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:submitOrders', payload),
  ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:ready', payload),
  listHumanStandingOrders: (): Promise<HumanStandingOrderSnapshot[]> =>
    ipcRenderer.invoke('game:listHumanStandingOrders'),
  previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }): Promise<HumanOrderPreviewResult> =>
    ipcRenderer.invoke('game:previewHumanMarchOrder', payload),
  assignHumanMarchOrder: (payload: { unitId: string; destinationH3Index: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:assignHumanMarchOrder', payload),
  cancelHumanStandingOrder: (payload: { unitId: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:cancelHumanStandingOrder', payload),
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
