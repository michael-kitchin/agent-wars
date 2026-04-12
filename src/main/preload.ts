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
  AirStrikeTargetType,
  HexBuildQueueSnapshot,
  NewGameIpcPayload,
  ResolveMeleeInterceptIpcPayload,
} from '../shared/ipcTypes';
import type {
  EndTacticalBattleIpcResult,
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from '../shared/tacticalBattleTypes';

/**
 * Documents the module-scope binding `openRouterLogListener` (openRouterLogListener: ((payload: { line: string; isError?: boolean })).

 * Purpose: Supports maintainability by documenting why `openRouterLogListener` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let openRouterLogListener: ((payload: { line: string; isError?: boolean }) => void) | null = null;
ipcRenderer.on('openRouter:log', (_event, payload: { line: string; isError?: boolean }) => {
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
    ipcRenderer.invoke('game:getState'),
    /**
   * Documents the object literal property `getRes4TerrainOverrides` (getRes4TerrainOverrides: (): Promise<Res4TerrainOverrideRow[]> => ipcRenderer.invoke('game:getRes4TerrainOverrides')).

   * Purpose: Supports maintainability by documenting why `getRes4TerrainOverrides` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getRes4TerrainOverrides: (): Promise<Res4TerrainOverrideRow[]> =>
    ipcRenderer.invoke('game:getRes4TerrainOverrides'),
    /**
   * Documents the object literal property `getHexNamingTooltipLine` (getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest): Promise<string | null> => ipcRenderer.invoke('game:getHexNamingTooltipLine', payload)).

   * Purpose: Supports maintainability by documenting why `getHexNamingTooltipLine` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest): Promise<string | null> =>
    ipcRenderer.invoke('game:getHexNamingTooltipLine', payload),
    /**
   * Documents the object literal property `getHexContinentNames` (getHexContinentNames: (payload: HexContinentNamesRequest): Promise<string[]> => ipcRenderer.invoke('game:getHexContinentNames', payload)).

   * Purpose: Supports maintainability by documenting why `getHexContinentNames` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexContinentNames: (payload: HexContinentNamesRequest): Promise<string[]> =>
    ipcRenderer.invoke('game:getHexContinentNames', payload),
    /**
   * Documents the object literal property `listScenarioHomeRegions` (listScenarioHomeRegions: (): Promise<string[]> => ipcRenderer.invoke('game:listScenarioHomeRegions')).

   * Purpose: Supports maintainability by documenting why `listScenarioHomeRegions` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listScenarioHomeRegions: (): Promise<string[]> =>
    ipcRenderer.invoke('game:listScenarioHomeRegions'),
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
    ipcRenderer.invoke('game:submitOrders', payload),
    /**
   * Documents the object literal property `ready` (ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:ready', payload)).

   * Purpose: Supports maintainability by documenting why `ready` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ready: (payload?: GameReadyIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:ready', payload),
    /**
   * Documents the object literal property `resolveMeleeIntercept` (resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload): Promise<ReadyResult> => ipcRenderer.invoke('game:resolveMeleeIntercept', payload)).

   * Purpose: Resumes strategic turn resolution after the melee intercept modal submits Fight or Ignore.
   * When to use: Only after `ready` returned `awaitingMeleeDecision`.
   * Expected outcome: Same completion shape as an uninterrupted ready; Fight may request tactical auto-start.
   * Exceptions: None.
   */
resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload): Promise<ReadyResult> =>
    ipcRenderer.invoke('game:resolveMeleeIntercept', payload),
    /**
   * Documents the object literal property `startTacticalBattle` (startTacticalBattle: (payload: { enclosingRes1H3Index: string }): Promise<StartTacticalBattleIpcResult> => ipcRenderer.invoke('game:startTacticalBattle', payload)).

   * Purpose: Exposes milestone-2.1 tactical battle entry to the renderer with the same contract as the main-process handler.
   * When to use: After the player activates a contested-hex tactical entry control during strategic planning.
   * Expected outcome: Returns a tactical snapshot on success for res4-scoped rendering and interaction.
   * Exceptions: None.
   */
startTacticalBattle: (payload: { enclosingRes1H3Index: string }): Promise<StartTacticalBattleIpcResult> =>
    ipcRenderer.invoke('game:startTacticalBattle', payload),
    /**
   * Documents the object literal property `endTacticalBattle` (endTacticalBattle: (): Promise<EndTacticalBattleIpcResult> => ipcRenderer.invoke('game:endTacticalBattle')).

   * Purpose: Clears the in-main tactical session so strategic planning actions (`ready`, orders, build queue) work again.
   * When to use: When the player leaves tactical view and returns to the strategic map without resolving tactical combat.
   * Expected outcome: Main process drops the active tactical snapshot; renderer should refresh game state afterward.
   * Exceptions: None.
   */
endTacticalBattle: (): Promise<EndTacticalBattleIpcResult> => ipcRenderer.invoke('game:endTacticalBattle'),
    /**
   * Documents the object literal property `listHumanStandingOrders` (listHumanStandingOrders: (): Promise<HumanStandingOrderSnapshot[]> => ipcRenderer.invoke('game:listHumanStandingOrders')).

   * Purpose: Supports maintainability by documenting why `listHumanStandingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listHumanStandingOrders: (): Promise<HumanStandingOrderSnapshot[]> =>
    ipcRenderer.invoke('game:listHumanStandingOrders'),
    /**
   * Documents the object literal property `previewHumanMarchOrder` (previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }): Promise<HumanOrderPreviewResult> => ipcRenderer.invoke('game:previewHumanMar).

   * Purpose: Supports maintainability by documenting why `previewHumanMarchOrder` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }): Promise<HumanOrderPreviewResult> =>
    ipcRenderer.invoke('game:previewHumanMarchOrder', payload),
    /**
   * Documents the object literal property `previewHumanMarchOrders` (previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }): Promise<HumanOrderGroupPreviewResult> => ipcRenderer.invoke('game:previe).

   * Purpose: Supports maintainability by documenting why `previewHumanMarchOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }): Promise<HumanOrderGroupPreviewResult> =>
    ipcRenderer.invoke('game:previewHumanMarchOrders', payload),
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
    ipcRenderer.invoke('game:assignHumanMarchOrder', payload),
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
    ipcRenderer.invoke('game:assignHumanMarchOrders', payload),
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
  }): Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }> =>
    ipcRenderer.invoke('game:commitHumanTacticalDraftOrders', payload),
    /**
   * Documents the object literal property `validateGroupRangedTarget` (validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('g).

   * Purpose: Supports maintainability by documenting why `validateGroupRangedTarget` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:validateGroupRangedTarget', payload),
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
  }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:validateGroupAirStrikeTarget', payload),
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
  }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:validateGroupFerryTarget', payload),
    /**
   * Documents the object literal property `cancelHumanStandingOrder` (cancelHumanStandingOrder: (payload: { unitId: string }): Promise<{ success: boolean; reason?: string }> => ipcRenderer.invoke('game:cancelHumanStandingOrde).

   * Purpose: Supports maintainability by documenting why `cancelHumanStandingOrder` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelHumanStandingOrder: (payload: { unitId: string }): Promise<{ success: boolean; reason?: string }> =>
    ipcRenderer.invoke('game:cancelHumanStandingOrder', payload),
    /**
   * Documents the object literal property `getHexBuildQueue` (getHexBuildQueue: (payload: { h3Index: string }): Promise<HexBuildQueueSnapshot | null> => ipcRenderer.invoke('game:getHexBuildQueue', payload)).

   * Purpose: Supports maintainability by documenting why `getHexBuildQueue` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexBuildQueue: (payload: { h3Index: string }): Promise<HexBuildQueueSnapshot | null> =>
    ipcRenderer.invoke('game:getHexBuildQueue', payload),
    /**
   * Documents the object literal property `addHexBuildQueueEntry` (addHexBuildQueueEntry: (payload: { h3Index: string }): Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }> => ipcRenderer.invoke().

   * Purpose: Supports maintainability by documenting why `addHexBuildQueueEntry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
addHexBuildQueueEntry: (payload: { h3Index: string }): Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }> =>
    ipcRenderer.invoke('game:addHexBuildQueueEntry', payload),
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
  }> => ipcRenderer.invoke('game:updateHexBuildQueueEntry', payload),
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
  }> => ipcRenderer.invoke('game:removeHexBuildQueueEntry', payload),
    /**
   * Documents the object literal property `getSealiftStackState` (getSealiftStackState: (payload: { h3Index: string }) => ipcRenderer.invoke('game:getSealiftStackState', payload)).

   * Purpose: Supports maintainability by documenting why `getSealiftStackState` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getSealiftStackState: (payload: { h3Index: string }) =>
    ipcRenderer.invoke('game:getSealiftStackState', payload),
    /**
   * Documents the object literal property `updateSealiftSlot` (updateSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }) => ipcRenderer.invoke('game:updateSeali).

   * Purpose: Supports maintainability by documenting why `updateSealiftSlot` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null }) =>
    ipcRenderer.invoke('game:updateSealiftSlot', payload),
    /**
   * Documents the object literal property `requestAiOrders` (requestAiOrders: (payload?: { enabledToolGroups?: string[] }): Promise<RequestAiOrdersResult> => ipcRenderer.invoke('game:requestAiOrders', payload)).

   * Purpose: Supports maintainability by documenting why `requestAiOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestAiOrders: (payload?: { enabledToolGroups?: string[] }): Promise<RequestAiOrdersResult> =>
    ipcRenderer.invoke('game:requestAiOrders', payload),
    /**
   * Documents the object literal property `cancelRequestAiOrders` (cancelRequestAiOrders: (): Promise<void> => ipcRenderer.invoke('game:cancelRequestAiOrders')).

   * Purpose: Supports maintainability by documenting why `cancelRequestAiOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelRequestAiOrders: (): Promise<void> =>
    ipcRenderer.invoke('game:cancelRequestAiOrders'),
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
