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
  HumanOrderGroupPreviewResult,
  HumanStandingOrderSnapshot,
  Res4TerrainOverrideRow,
  HexNamingTooltipLineRequest,
  HexContinentNamesRequest,
  BuildUnitType,
  HexBuildQueueSnapshot,
  NewGameIpcPayload,
} from '../shared/ipcTypes';

let openRouterLogListener: ((payload: { line: string; isError?: boolean }) => void) | null = null;
ipcRenderer.on('openRouter:log', (_event, payload: { line: string; isError?: boolean }) => {
  openRouterLogListener?.(payload);
});

const gameApi = {
  getGameState: (): Promise<GameStateSnapshot> =>
    ipcRenderer.invoke('game:getState'),
  getRes4TerrainOverrides: (): Promise<Res4TerrainOverrideRow[]> =>
    ipcRenderer.invoke('game:getRes4TerrainOverrides'),
  getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest): Promise<string | null> =>
    ipcRenderer.invoke('game:getHexNamingTooltipLine', payload),
  getHexContinentNames: (payload: HexContinentNamesRequest): Promise<string[]> =>
    ipcRenderer.invoke('game:getHexContinentNames', payload),
  newGame: (payload?: NewGameIpcPayload): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:newGame', payload),
  submitOrders: (payload: SubmitOrdersIpcPayload): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:submitOrders', payload),
  ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:ready', payload),
  listHumanStandingOrders: (): Promise<HumanStandingOrderSnapshot[]> =>
    ipcRenderer.invoke('game:listHumanStandingOrders'),
  previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }): Promise<HumanOrderPreviewResult> =>
    ipcRenderer.invoke('game:previewHumanMarchOrder', payload),
  previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }): Promise<HumanOrderGroupPreviewResult> =>
    ipcRenderer.invoke('game:previewHumanMarchOrders', payload),
  assignHumanMarchOrder: (payload: { unitId: string; destinationH3Index: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:assignHumanMarchOrder', payload),
  assignHumanMarchOrders: (payload: { unitIds: string[]; destinationH3Index: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:assignHumanMarchOrders', payload),
  validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:validateGroupRangedTarget', payload),
  validateGroupAirStrikeTarget: (payload: {
    unitIds: string[];
    targetH3Index: string;
    targetType: 'units' | 'urban' | 'airport' | 'seaport';
  }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:validateGroupAirStrikeTarget', payload),
  validateGroupFerryTarget: (payload: {
    unitIds: string[];
    destinationH3Index: string;
  }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:validateGroupFerryTarget', payload),
  cancelHumanStandingOrder: (payload: { unitId: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:cancelHumanStandingOrder', payload),
  getHexBuildQueue: (payload: { h3Index: string }): Promise<HexBuildQueueSnapshot | null> =>
    ipcRenderer.invoke('game:getHexBuildQueue', payload),
  addHexBuildQueueEntry: (payload: { h3Index: string }): Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }> =>
    ipcRenderer.invoke('game:addHexBuildQueueEntry', payload),
  updateHexBuildQueueEntry: (payload: { h3Index: string; entryId: number; unitType: BuildUnitType; count: number }): Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }> => ipcRenderer.invoke('game:updateHexBuildQueueEntry', payload),
  removeHexBuildQueueEntry: (payload: { h3Index: string; entryId: number }): Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }> => ipcRenderer.invoke('game:removeHexBuildQueueEntry', payload),
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
