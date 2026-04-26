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
  Res4CityOverlayRow,
  Res4RoadRailOverlayRow,
  Res4TransportVectorOverlayRow,
  HexNamingTooltipLineRequest,
  HexContinentNamesRequest,
  BuildUnitType,
  AirStrikeTargetType,
  HexBuildQueueSnapshot,
  NewGameIpcPayload,
  ResolveMeleeInterceptIpcPayload,
  TacticalCommitResolutionPlayback,
} from '../shared/ipcTypes';
import type {
  EndTacticalBattleIpcResult,
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from '../shared/tacticalBattleTypes';

/**
 * Preload-local IPC channel map for game handlers.
 *
 * Purpose: Sandbox preload scripts cannot import arbitrary local modules at runtime, so this keeps
 * the invoke channel literals available without requiring `../shared/ipc/channels`.
 * When to use: Only for `ipcRenderer.invoke` calls in this preload bridge.
 * Expected outcome: Channel names stay aligned with main-process handlers and preload loads reliably.
 * Exceptions: None.
 */
const IPC_GAME = {
  getState: 'game:getState',
  getRes4TerrainOverrides: 'game:getRes4TerrainOverrides',
  getRes4CityOverlays: 'game:getRes4CityOverlays',
  getRes4RoadRailOverlays: 'game:getRes4RoadRailOverlays',
  getRes4TransportVectorOverlays: 'game:getRes4TransportVectorOverlays',
  getHexNamingTooltipLine: 'game:getHexNamingTooltipLine',
  getHexContinentNames: 'game:getHexContinentNames',
  listScenarioHomeRegions: 'game:listScenarioHomeRegions',
  newGame: 'game:newGame',
  submitOrders: 'game:submitOrders',
  listHumanStandingOrders: 'game:listHumanStandingOrders',
  previewHumanMarchOrder: 'game:previewHumanMarchOrder',
  previewHumanMarchOrders: 'game:previewHumanMarchOrders',
  assignHumanMarchOrder: 'game:assignHumanMarchOrder',
  assignHumanMarchOrders: 'game:assignHumanMarchOrders',
  commitHumanTacticalDraftOrders: 'game:commitHumanTacticalDraftOrders',
  validateGroupRangedTarget: 'game:validateGroupRangedTarget',
  validateGroupAirStrikeTarget: 'game:validateGroupAirStrikeTarget',
  validateGroupFerryTarget: 'game:validateGroupFerryTarget',
  cancelHumanStandingOrder: 'game:cancelHumanStandingOrder',
  getHexBuildQueue: 'game:getHexBuildQueue',
  addHexBuildQueueEntry: 'game:addHexBuildQueueEntry',
  updateHexBuildQueueEntry: 'game:updateHexBuildQueueEntry',
  removeHexBuildQueueEntry: 'game:removeHexBuildQueueEntry',
  getSealiftStackState: 'game:getSealiftStackState',
  getTacticalSealiftStackState: 'game:getTacticalSealiftStackState',
  updateTacticalSealiftSlot: 'game:updateTacticalSealiftSlot',
  updateSealiftSlot: 'game:updateSealiftSlot',
  startTacticalBattle: 'game:startTacticalBattle',
  endTacticalBattle: 'game:endTacticalBattle',
  ready: 'game:ready',
  resolveMeleeIntercept: 'game:resolveMeleeIntercept',
  requestAiOrders: 'game:requestAiOrders',
  cancelRequestAiOrders: 'game:cancelRequestAiOrders',
} as const;

/**
 * Preload-local IPC channel map for OpenRouter settings and log streaming.
 *
 * Purpose: Keeps preload runtime free of non-Electron module imports in sandbox mode.
 * When to use: For invoke/listener channel names in this preload bridge.
 * Expected outcome: Renderer receives OpenRouter logs and settings operations through stable channels.
 * Exceptions: None.
 */
const IPC_OPENROUTER = {
  log: 'openRouter:log',
  getToolGroupList: 'openRouter:getToolGroupList',
  getKey: 'openRouter:getKey',
  getSelectedModel: 'openRouter:getSelectedModel',
  setKey: 'openRouter:setKey',
  listModels: 'openRouter:listModels',
  setSelectedModel: 'openRouter:setSelectedModel',
} as const;

/**
 * Documents the module-scope binding `openRouterLogListener` (openRouterLogListener: ((payload: { line: string; isError?: boolean })).

 * Purpose: Supports maintainability by documenting why `openRouterLogListener` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let openRouterLogListener: ((payload: { line: string; isError?: boolean }) => void) | null = null;
ipcRenderer.on(IPC_OPENROUTER.log, (_event, payload: { line: string; isError?: boolean }) => {
  openRouterLogListener?.(payload);
});

/**
 * Documents the module-scope binding `gameApi` (gameApi).

 * Purpose: Supports maintainability by documenting why `gameApi` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const gameApi = {
    /**
   * Documents the object literal property `getGameState` (getGameState: (): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:getState')).

   * Purpose: Supports maintainability by documenting why `getGameState` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGameState: (): Promise<GameStateSnapshot> =>
    ipcRenderer.invoke(IPC_GAME.getState),
    /**
   * Documents the object literal property `getRes4TerrainOverrides` (getRes4TerrainOverrides: (): Promise<Res4TerrainOverrideRow[]> => ipcRenderer.invoke('game:getRes4TerrainOverrides')).

   * Purpose: Supports maintainability by documenting why `getRes4TerrainOverrides` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getRes4TerrainOverrides: (): Promise<Res4TerrainOverrideRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getRes4TerrainOverrides),
    /**
   * Documents the object literal property `getRes4CityOverlays` (getRes4CityOverlays: (): Promise<Res4CityOverlayRow[]> => ipcRenderer.invoke('game:getRes4CityOverlays')).

   * Purpose: Supports maintainability by documenting why `getRes4CityOverlays` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getRes4CityOverlays: (): Promise<Res4CityOverlayRow[]> => ipcRenderer.invoke(IPC_GAME.getRes4CityOverlays),
    /**
   * Documents the object literal property `getRes4RoadRailOverlays` (getRes4RoadRailOverlays: (): Promise<Res4RoadRailOverlayRow[]> => ipcRenderer.invoke('game:getRes4RoadRailOverlays')).

   * Purpose: Supports maintainability by documenting why `getRes4RoadRailOverlays` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getRes4RoadRailOverlays: (): Promise<Res4RoadRailOverlayRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getRes4RoadRailOverlays),
    /**
   * Documents the object literal property `getRes4TransportVectorOverlays` (getRes4TransportVectorOverlays: (): Promise<Res4TransportVectorOverlayRow[]> => ipcRenderer.invoke('game:getRes4TransportVectorOverlays')).

   * Purpose: Exposes optional display-only road/rail vectors for the Leaflet transport overlay.
   * When to use: Renderer startup hydration alongside res4 terrain/city/side-mask overlay data.
   * Expected outcome: Returns empty when the optional vector artifact is missing.
   * Exceptions: None.
   */
getRes4TransportVectorOverlays: (): Promise<Res4TransportVectorOverlayRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getRes4TransportVectorOverlays),
    /**
   * Documents the object literal property `getHexNamingTooltipLine` (getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest): Promise<string | null> => ipcRenderer.invoke('game:getHexNamingTooltipLine', payload)).

   * Purpose: Supports maintainability by documenting why `getHexNamingTooltipLine` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest): Promise<string | null> =>
    ipcRenderer.invoke(IPC_GAME.getHexNamingTooltipLine, payload),
    /**
   * Documents the object literal property `getHexContinentNames` (getHexContinentNames: (payload: HexContinentNamesRequest): Promise<string[]> => ipcRenderer.invoke('game:getHexContinentNames', payload)).

   * Purpose: Supports maintainability by documenting why `getHexContinentNames` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexContinentNames: (payload: HexContinentNamesRequest): Promise<string[]> =>
    ipcRenderer.invoke(IPC_GAME.getHexContinentNames, payload),
    /**
   * Documents the object literal property `listScenarioHomeRegions` (listScenarioHomeRegions: (): Promise<string[]> => ipcRenderer.invoke('game:listScenarioHomeRegions')).

   * Purpose: Supports maintainability by documenting why `listScenarioHomeRegions` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listScenarioHomeRegions: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_GAME.listScenarioHomeRegions),
    /**
   * Documents the object literal property `newGame` (newGame: (payload?: NewGameIpcPayload): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:newGame', payload)).

   * Purpose: Supports maintainability by documenting why `newGame` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
newGame: (payload?: NewGameIpcPayload): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:newGame', payload),
    /**
   * Documents the object literal property `submitOrders` (submitOrders: (payload: SubmitOrdersIpcPayload): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:submitOrders', payload)).

   * Purpose: Supports maintainability by documenting why `submitOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
submitOrders: (payload: SubmitOrdersIpcPayload): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke(IPC_GAME.submitOrders, payload),
    /**
   * Documents the object literal property `ready` (ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:ready', payload)).

   * Purpose: Supports maintainability by documenting why `ready` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke(IPC_GAME.ready, payload),
    /**
   * Documents the object literal property `resolveMeleeIntercept` (resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:resolveMeleeIntercept', payload)).

   * Purpose: Resumes strategic turn resolution after the melee intercept modal submits Fight or Ignore.
   * When to use: Only after `ready` returned `awaitingMeleeDecision`.
   * Expected outcome: Same completion shape as an uninterrupted ready; Fight may request tactical auto-start.
   * Exceptions: None.
   */
resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload): Promise<ReadyResult> =>
    ipcRenderer.invoke(IPC_GAME.resolveMeleeIntercept, payload),
    /**
   * Documents the object literal property `startTacticalBattle` (startTacticalBattle: (payload: { enclosingRes1H3Index: string }): Promise<StartTacticalBattleIpcResult> => ipcRenderer.invoke('game:startTacticalBattle', payload)).

   * Purpose: Exposes milestone-2.1 tactical battle entry to the renderer with the same contract as the main-process handler.
   * When to use: After the player activates a contested-hex tactical entry control during strategic planning.
   * Expected outcome: Returns a tactical snapshot on success for res4-scoped rendering and interaction.
   * Exceptions: None.
   */
startTacticalBattle: (payload: { enclosingRes1H3Index: string }): Promise<StartTacticalBattleIpcResult> =>
    ipcRenderer.invoke(IPC_GAME.startTacticalBattle, payload),
    /**
   * Documents the object literal property `endTacticalBattle` (endTacticalBattle: (): Promise<EndTacticalBattleIpcResult> => ipcRenderer.invoke('game:endTacticalBattle')).

   * Purpose: Clears the in-main tactical session so strategic planning actions (`ready`, orders, build queue) work again.
   * When to use: When the player leaves tactical view and returns to the strategic map without resolving tactical combat.
   * Expected outcome: Main process drops the active tactical snapshot; renderer should refresh game state afterward.
   * Exceptions: None.
   */
endTacticalBattle: (): Promise<EndTacticalBattleIpcResult> => ipcRenderer.invoke(IPC_GAME.endTacticalBattle),
    /**
   * Documents the object literal property `listHumanStandingOrders` (listHumanStandingOrders: (): Promise<HumanStandingOrderSnapshot[]> => ipcRenderer.invoke('game:listHumanStandingOrders')).

   * Purpose: Supports maintainability by documenting why `listHumanStandingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listHumanStandingOrders: (): Promise<HumanStandingOrderSnapshot[]> =>
    ipcRenderer.invoke(IPC_GAME.listHumanStandingOrders),
    /**
   * Documents the object literal property `previewHumanMarchOrder` (previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }): Promise<HumanOrderPreviewResult> => ipcRenderer.invoke('game:previewHumanMar).

   * Purpose: Supports maintainability by documenting why `previewHumanMarchOrder` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }): Promise<HumanOrderPreviewResult> =>
    ipcRenderer.invoke(IPC_GAME.previewHumanMarchOrder, payload),
    /**
   * Documents the object literal property `previewHumanMarchOrders` (previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }): Promise<HumanOrderGroupPreviewResult> => ipcRenderer.invoke('game:previe).

   * Purpose: Supports maintainability by documenting why `previewHumanMarchOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }): Promise<HumanOrderGroupPreviewResult> =>
    ipcRenderer.invoke(IPC_GAME.previewHumanMarchOrders, payload),
    /**
   * Documents the object literal property `assignHumanMarchOrder` (assignHumanMarchOrder: (payload: { unitId: string; destinationH3Index: string }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('gam).

   * Purpose: Supports maintainability by documenting why `assignHumanMarchOrder` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assignHumanMarchOrder: (payload: {
    unitId: string;
    destinationH3Index: string;
  }): Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }> =>
    ipcRenderer.invoke(IPC_GAME.assignHumanMarchOrder, payload),
    /**
   * Documents the object literal property `assignHumanMarchOrders` (assignHumanMarchOrders: (payload: { unitIds: string[]; destinationH3Index: string }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke().

   * Purpose: Supports maintainability by documenting why `assignHumanMarchOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assignHumanMarchOrders: (payload: {
    unitIds: string[];
    destinationH3Index: string;
  }): Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }> =>
    ipcRenderer.invoke(IPC_GAME.assignHumanMarchOrders, payload),
    /**
   * Documents the object literal property `commitHumanTacticalDraftOrders` (commitHumanTacticalDraftOrders: (payload: { movementOrders: ...; rangedAttacks?: ... }) => Promise<...> => ipcRenderer.invoke()).

   * Purpose: Exposes tactical Ready commit for all tactical draft rows held in renderer state until confirmed.
   * When to use: Tactical planning sidebar Ready click after the human has edited pending drafts.
   * Expected outcome: Main returns the updated tactical snapshot JSON on success.
   * Exceptions: IPC errors propagate as promise rejections.
   */
commitHumanTacticalDraftOrders: (payload: {
    movementOrders: { unitId: string; toH3Index: string }[];
    rangedAttacks?: { unitId: string; targetH3Index: string }[];
    airStrikes?: { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[];
    ferryOrders?: { unitId: string; destinationH3Index: string }[];
    embarkOrders?: { unitId: string; navalUnitId: string }[];
    opponentTacticalDraft?: import('../shared/ipc/readyTypes').TacticalOpponentPlanPayload;
    useEventDrivenConsultation?: boolean;
    aiPlanningRunEnabled?: boolean;
  }): Promise<{
    success: boolean;
    reason?: string;
    tacticalBattle?: TacticalBattleSnapshot;
    tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;
    tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];
    tacticalOpponentPlan?: import('../shared/ipc/readyTypes').TacticalOpponentPlanPayload;
    toolInvocationCounts?: Record<string, number>;
  }> => ipcRenderer.invoke(IPC_GAME.commitHumanTacticalDraftOrders, payload),
    /**
   * Documents the object literal property `validateGroupRangedTarget` (validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('g).

   * Purpose: Supports maintainability by documenting why `validateGroupRangedTarget` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke(IPC_GAME.validateGroupRangedTarget, payload),
    /**
   * Documents the object literal property `validateGroupAirStrikeTarget` (validateGroupAirStrikeTarget: (payload: { unitIds: string[]; targetH3Index: string; targetType: AirStrikeTargetType; }): Promise<{ success: bo).

   * Purpose: Supports maintainability by documenting why `validateGroupAirStrikeTarget` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupAirStrikeTarget: (payload: {
    unitIds: string[];
    targetH3Index: string;
    targetType: AirStrikeTargetType;
  }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke(IPC_GAME.validateGroupAirStrikeTarget, payload),
    /**
   * Documents the object literal property `validateGroupFerryTarget` (validateGroupFerryTarget: (payload: { unitIds: string[]; destinationH3Index: string; }): Promise<{ success: boolean; reason?: string }> => ipcRende).

   * Purpose: Supports maintainability by documenting why `validateGroupFerryTarget` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupFerryTarget: (payload: {
    unitIds: string[];
    destinationH3Index: string;
  }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke(IPC_GAME.validateGroupFerryTarget, payload),
    /**
   * Documents the object literal property `cancelHumanStandingOrder` (cancelHumanStandingOrder: (payload: { unitId: string }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:cancelHumanStandingOrde).

   * Purpose: Supports maintainability by documenting why `cancelHumanStandingOrder` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelHumanStandingOrder: (payload: { unitId: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke(IPC_GAME.cancelHumanStandingOrder, payload),
    /**
   * Documents the object literal property `getHexBuildQueue` (getHexBuildQueue: (payload: { h3Index: string }): Promise<HexBuildQueueSnapshot | null> => ipcRenderer.invoke('game:getHexBuildQueue', payload)).

   * Purpose: Supports maintainability by documenting why `getHexBuildQueue` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexBuildQueue: (payload: { h3Index: string }): Promise<HexBuildQueueSnapshot | null> =>
    ipcRenderer.invoke(IPC_GAME.getHexBuildQueue, payload),
    /**
   * Documents the object literal property `addHexBuildQueueEntry` (addHexBuildQueueEntry: (payload: { h3Index: string }): Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }> => ipcRenderer.invoke().

   * Purpose: Supports maintainability by documenting why `addHexBuildQueueEntry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
addHexBuildQueueEntry: (payload: { h3Index: string }): Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }> =>
    ipcRenderer.invoke(IPC_GAME.addHexBuildQueueEntry, payload),
    /**
   * Documents the object literal property `updateHexBuildQueueEntry` (updateHexBuildQueueEntry: (payload: { h3Index: string; entryId: number; unitType: BuildUnitType; count: number }): Promise<{ success: boolean; reason?).

   * Purpose: Supports maintainability by documenting why `updateHexBuildQueueEntry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateHexBuildQueueEntry: (payload: { h3Index: string; entryId: number; unitType: BuildUnitType; count: number }): Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }> => ipcRenderer.invoke(IPC_GAME.updateHexBuildQueueEntry, payload),
    /**
   * Documents the object literal property `removeHexBuildQueueEntry` (removeHexBuildQueueEntry: (payload: { h3Index: string; entryId: number }): Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnap).

   * Purpose: Supports maintainability by documenting why `removeHexBuildQueueEntry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removeHexBuildQueueEntry: (payload: { h3Index: string; entryId: number }): Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }> => ipcRenderer.invoke(IPC_GAME.removeHexBuildQueueEntry, payload),
    /**
   * Documents the object literal property `getSealiftStackState` (getSealiftStackState: (payload: { h3Index: string }) => ipcRenderer.invoke('game:getSealiftStackState', payload)).

   * Purpose: Supports maintainability by documenting why `getSealiftStackState` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getSealiftStackState: (payload: { h3Index: string }) =>
    ipcRenderer.invoke(IPC_GAME.getSealiftStackState, payload),
    /**
   * Documents the object literal property `getTacticalSealiftStackState` (getTacticalSealiftStackState: (payload: { h3Index: string }) => ipcRenderer.invoke('game:getTacticalSealiftStackState', payload)).

   * Purpose: Exposes tactical sealift stack rows keyed by tactical sub-unit ids while a tactical battle is active.
   * When to use: Stack callout sealift section during tactical planning when strategic sealift IPC is unavailable.
   * Expected outcome: Same `SealiftStackState` envelope as `getSealiftStackState`, with sub-unit ids in slot fields.
   * Exceptions: IPC errors propagate as promise rejections.
   */
getTacticalSealiftStackState: (payload: { h3Index: string }) =>
    ipcRenderer.invoke(IPC_GAME.getTacticalSealiftStackState, payload),
    /**
   * Documents the object literal property `updateTacticalSealiftSlot` (updateTacticalSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }) => ipcRenderer.invoke('game:updateTacticalSealiftSlot', payload)).

   * Purpose: Commits one tactical sealift slot edit to the main-process snapshot and strategic transport rows.
   * When to use: Stack callout sealift controls during tactical battles instead of `updateSealiftSlot`.
   * Expected outcome: Promise resolves to success flag, optional `tacticalBattle` snapshot, and optional stack `state`.
   * Exceptions: IPC errors propagate as promise rejections.
   */
updateTacticalSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }) =>
    ipcRenderer.invoke(IPC_GAME.updateTacticalSealiftSlot, payload),
    /**
   * Documents the object literal property `updateSealiftSlot` (updateSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }) => ipcRenderer.invoke('game:updateSeali).

   * Purpose: Supports maintainability by documenting why `updateSealiftSlot` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }) =>
    ipcRenderer.invoke(IPC_GAME.updateSealiftSlot, payload),
    /**
   * Documents the object literal property `requestAiOrders` (requestAiOrders: (payload?: { enabledToolGroups?: string[] }): Promise<RequestAiOrdersResult> => ipcRenderer.invoke('game:requestAiOrders', payload)).

   * Purpose: Supports maintainability by documenting why `requestAiOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestAiOrders: (payload?: { enabledToolGroups?: string[] }): Promise<RequestAiOrdersResult> =>
    ipcRenderer.invoke(IPC_GAME.requestAiOrders, payload),
    /**
   * Documents the object literal property `cancelRequestAiOrders` (cancelRequestAiOrders: (): Promise<void> => ipcRenderer.invoke('game:cancelRequestAiOrders')).

   * Purpose: Supports maintainability by documenting why `cancelRequestAiOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelRequestAiOrders: (): Promise<void> =>
    ipcRenderer.invoke(IPC_GAME.cancelRequestAiOrders),
    /**
   * Documents the object literal property `registerOpenRouterLogListener` (registerOpenRouterLogListener: (callback: (payload: { line: string; isError?: boolean }) => void): void => { openRouterLogListener = callback; }).

   * Purpose: Supports maintainability by documenting why `registerOpenRouterLogListener` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
registerOpenRouterLogListener: (callback: (payload: { line: string; isError?: boolean }) => void): void => {
    openRouterLogListener = callback;
  },
    /**
   * Documents the object literal property `openRouter` (openRouter: { getKey: (): Promise<{ hasKey: boolean }> => ipcRenderer.invoke('openRouter:getKey'), getSelectedModel: (): Promise<string> =>).

   * Purpose: Supports maintainability by documenting why `openRouter` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
openRouter: {
    getKey: (): Promise<{ hasKey: boolean }> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getKey),
    getSelectedModel: (): Promise<string> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getSelectedModel),
    setKey: (key: string): Promise<void> =>
      ipcRenderer.invoke(IPC_OPENROUTER.setKey, key),
    listModels: (): Promise<{ models?: OpenRouterModel[]; error?: string }> =>
      ipcRenderer.invoke(IPC_OPENROUTER.listModels),
    setSelectedModel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_OPENROUTER.setSelectedModel, modelId),
    getToolGroupList: (): Promise<{ id: string; label: string }[]> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getToolGroupList),
  },
};

contextBridge.exposeInMainWorld('gameApi', gameApi);
