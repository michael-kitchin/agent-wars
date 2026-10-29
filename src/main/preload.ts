/**
 * Electron preload script. Exposes a minimal, type-safe API to the renderer via contextBridge.
 * Runs in the preload context; only contextBridge and ipcRenderer are used.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { CommanderPlanningMode, CommanderPoolSnapshot } from '../shared/commanderStatus';
import type { ModelCallCancelReason } from '../shared/ipc/modelCallCancelTypes';
import type { LoadGameResult, SaveGameResult } from '../shared/ipc/saveLoadTypes';
import type { AiSeatId } from '../shared/seatIds';
import type { CommanderKeyMemoryView } from '../shared/commanderSetupCopy';
import type { DoctrineChoice, SeatSnapshot } from '../shared/seatRoster';
import type {
  SubmitOrdersIpcPayload,
  GameReadyIpcPayload,
  GameStateSnapshot,
  ReadyResult,
  OpenRouterModel,
  HumanOrderPreviewResult,
  HumanOrderGroupPreviewResult,
  HumanStandingOrderSnapshot,
  StrategicBaselineUrbanHexCountRow,
  TacticalTerrainOverrideRow,
  TacticalCityOverlayRow,
  TacticalRoadRailOverlayRow,
  TacticalTransportVectorOverlayRow,
  HexNamingTooltipLineRequest,
  HexContinentNamesRequest,
  BuildUnitType,
  ApplyBuildQueueTemplateResult,
  BuildQueueTemplateEntry,
  SetHexesKeepBuildingResult,
  AirStrikeTargetType,
  HexBuildQueueSnapshot,
  NewGameIpcPayload,
  NewGameMapPreview,
  NewGameMapPreviewRequest,
  GameMapListEntry,
  ResolveMeleeInterceptIpcPayload,
  NotifyResolutionPlaybackCompletePayload,
  PostResolutionConsultationPushPayload,
  TacticalPostBeatConsultFields,
} from '../shared/ipcTypes';
import type {
  EndTacticalBattleIpcResult,
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from '../shared/tacticalBattleTypes';
import type {
  CommitHumanTacticalDraftOrdersIpcPayload,
  CommitHumanTacticalDraftOrdersIpcResult,
  GameApi,
} from '../shared/ipc/gameApiTypes';
import type { HexNamingCaption } from '../shared/hexNamingCaption';
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
  getTacticalTerrainOverrides: 'game:getRes4TerrainOverrides',
  getTacticalCityOverlays: 'game:getRes4CityOverlays',
  getTacticalRoadRailOverlays: 'game:getRes4RoadRailOverlays',
  getTacticalTransportVectorOverlays: 'game:getRes4TransportVectorOverlays',
  getStrategicBaselineUrbanHexCounts: 'game:getRes1BaselineUrbanHexCounts',
  getHexNamingTooltipLine: 'game:getHexNamingTooltipLine',
  getHexContinentNames: 'game:getHexContinentNames',
  listScenarioHomeRegions: 'game:listScenarioHomeRegions',
  listGameMaps: 'game:listGameMaps',
  newGameMapPreview: 'game:newGameMapPreview',
  newGame: 'game:newGame',
  endMatch: 'game:endMatch',
  saveGame: 'game:saveGame',
  loadGame: 'game:loadGame',
  setSeatCommander: 'game:setSeatCommander',
  startCommanderPlanning: 'game:startCommanderPlanning',
  stopCommanderPlanning: 'game:stopCommanderPlanning',
  readCommanderPool: 'game:readCommanderPool',
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
  applyBuildQueueTemplateToHexes: 'game:applyBuildQueueTemplateToHexes',
  setHexesKeepBuilding: 'game:setHexesKeepBuilding',
  getSealiftStackState: 'game:getSealiftStackState',
  getTacticalSealiftStackState: 'game:getTacticalSealiftStackState',
  updateTacticalSealiftSlot: 'game:updateTacticalSealiftSlot',
  updateSealiftSlot: 'game:updateSealiftSlot',
  startTacticalBattle: 'game:startTacticalBattle',
  endTacticalBattle: 'game:endTacticalBattle',
  ready: 'game:ready',
  resolveMeleeIntercept: 'game:resolveMeleeIntercept',
  notifyResolutionPlaybackComplete: 'game:notifyResolutionPlaybackComplete',
  postResolutionConsultation: 'game:postResolutionConsultation',
  postTacticalBeatConsultation: 'game:postTacticalBeatConsultation',
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
  getSelectedReasoningEffort: 'openRouter:getSelectedReasoningEffort',
  setSelectedReasoningEffort: 'openRouter:setSelectedReasoningEffort',
  getCommanderKeyMemory: 'openRouter:getCommanderKeyMemory',
  getSeatApiKey: 'openRouter:getSeatApiKey',
} as const;

/**
 * Documents the module-scope binding `openRouterLogListener` (openRouterLogListener: ((payload: { line: string; isError?: boolean })).

 * Purpose: Supports maintainability by documenting why `openRouterLogListener` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let openRouterLogListener: ((payload: { line: string; isError?: boolean; seatId?: string }) => void) | null = null;
ipcRenderer.on(IPC_OPENROUTER.log, (_event, payload: { line: string; isError?: boolean; seatId?: string }) => {
  openRouterLogListener?.(payload);
});

/**
 * Documents the module-scope binding `postResolutionConsultationListener` (optional callback for deferred strategic push).
 *
 * Purpose: Bridges `webContents.send` post-resolution consult payloads into the renderer without exposing `ipcRenderer` directly.
 * When to use: Set once via `registerPostResolutionConsultationListener` during shell init.
 * Expected outcome: Listener receives merged strategy/tool counts after deferred `afterResolution` completes on main.
 * Exceptions: None.
 */
let postResolutionConsultationListener: ((payload: PostResolutionConsultationPushPayload) => void) | null = null;
/**
 * Documents the module-scope binding `postTacticalBeatConsultationListener` (optional callback for deferred tactical push).
 *
 * Purpose: Bridges tactical post-beat consult fields after deferred `afterTacticalBeatResolution` completes on main.
 * When to use: Set once via `registerPostTacticalBeatConsultationListener` during shell init.
 * Expected outcome: Same merge semantics as inline tactical commit consultation fields.
 * Exceptions: None.
 */
let postTacticalBeatConsultationListener: ((payload: TacticalPostBeatConsultFields) => void) | null = null;
ipcRenderer.on(IPC_GAME.postResolutionConsultation, (_event, payload: PostResolutionConsultationPushPayload) => {
  postResolutionConsultationListener?.(payload);
});
ipcRenderer.on(IPC_GAME.postTacticalBeatConsultation, (_event, payload: TacticalPostBeatConsultFields) => {
  postTacticalBeatConsultationListener?.(payload);
});

/**
 * Renderer bridge checked against `GameApi`.
 *
 * Purpose: `satisfies GameApi` fails the build when a preload method drifts from the shared contract.
 * When to use: The only object passed to `contextBridge.exposeInMainWorld('gameApi', ...)`.
 * Expected outcome: Every `GameApi` member is present with a compatible signature.
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
getGameState: (viewAs?: string): Promise<GameStateSnapshot> =>
    ipcRenderer.invoke(IPC_GAME.getState, viewAs),
    /**
   * Documents the object literal property `getTacticalTerrainOverrides` (getTacticalTerrainOverrides: (): Promise<TacticalTerrainOverrideRow[]> => ipcRenderer.invoke('game:getTacticalTerrainOverrides')).

   * Purpose: Supports maintainability by documenting why `getTacticalTerrainOverrides` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getTacticalTerrainOverrides: (): Promise<TacticalTerrainOverrideRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getTacticalTerrainOverrides),
    /**
   * Documents the object literal property `getTacticalCityOverlays` (getTacticalCityOverlays: (): Promise<TacticalCityOverlayRow[]> => ipcRenderer.invoke('game:getTacticalCityOverlays')).

   * Purpose: Supports maintainability by documenting why `getTacticalCityOverlays` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getTacticalCityOverlays: (): Promise<TacticalCityOverlayRow[]> => ipcRenderer.invoke(IPC_GAME.getTacticalCityOverlays),
    /**
   * Documents the object literal property `getTacticalRoadRailOverlays` (getTacticalRoadRailOverlays: (): Promise<TacticalRoadRailOverlayRow[]> => ipcRenderer.invoke('game:getTacticalRoadRailOverlays')).

   * Purpose: Supports maintainability by documenting why `getTacticalRoadRailOverlays` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getTacticalRoadRailOverlays: (): Promise<TacticalRoadRailOverlayRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getTacticalRoadRailOverlays),
    /**
   * Documents the object literal property `getTacticalTransportVectorOverlays` (getTacticalTransportVectorOverlays: (): Promise<TacticalTransportVectorOverlayRow[]> => ipcRenderer.invoke('game:getTacticalTransportVectorOverlays')).

   * Purpose: Exposes optional display-only road/rail vectors for the Leaflet transport overlay.
   * When to use: Renderer startup hydration alongside tactical terrain/city/side-mask overlay data.
   * Expected outcome: Returns empty when the optional vector artifact is missing.
   * Exceptions: None.
   */
getTacticalTransportVectorOverlays: (): Promise<TacticalTransportVectorOverlayRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getTacticalTransportVectorOverlays),
  /**
   * Fetches the generated urban-cell count for each strategic hex that can produce units.
   *
   * Purpose: The hex tooltip and the build popup classify tech from this baseline, which air strikes do not change.
   * When to use: Once per renderer session, beside the static tactical overlay load.
   * Expected outcome: Resolves to rows with a positive count, or an empty array when the cache is not loaded.
   * Exceptions: Rejects on IPC transport failures. A handler failure resolves to an empty array.
   */
  getStrategicBaselineUrbanHexCounts: (): Promise<StrategicBaselineUrbanHexCountRow[]> =>
    ipcRenderer.invoke(IPC_GAME.getStrategicBaselineUrbanHexCounts),
  /**
   * Fetches the structured naming caption (text plus country spans) for a strategic or tactical hex.
   *
   * Purpose: Feeds hover tooltips, the build popup, and the melee-intercept hex cell, which add flags from the spans.
   * When to use: Through the renderer's caption cache rather than per hover.
   * Expected outcome: Resolves to the caption, or `null` when the hex has no naming data.
   * Exceptions: Rejects on IPC transport failures.
   */
  getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest): Promise<HexNamingCaption | null> =>
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
   * Lists maps for the new-game dialog.
   *
   * Purpose: The overlay needs names, sides, and prices without a tactical load.
   * When to use: When the overlay opens.
   * Expected outcome: The same rows `listGameMaps` builds in the main process.
   * Exceptions: Rejects when the IPC channel fails.
   */
listGameMaps: (): Promise<GameMapListEntry[]> =>
    ipcRenderer.invoke(IPC_GAME.listGameMaps),
  /**
   * Asks the main process for the new-game map preview.
   *
   * Purpose: The overlay paints that map's terrain, weather, and homes without loading the match.
   * When to use: When the dialog opens and when its map or home choices change.
   * Expected outcome: The payload from `buildNewGameMapPreview`.
   * Exceptions: Rejects when the map or a side group is unknown, or when the IPC channel fails.
   */
  newGameMapPreview: (request: NewGameMapPreviewRequest): Promise<NewGameMapPreview> =>
    ipcRenderer.invoke(IPC_GAME.newGameMapPreview, request),
    /**
   * Documents the object literal property `newGame` (newGame: (payload?: NewGameIpcPayload): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:newGame', payload)).

   * Purpose: Supports maintainability by documenting why `newGame` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
newGame: (payload?: NewGameIpcPayload): Promise<GameStateSnapshot> => ipcRenderer.invoke('game:newGame', payload),
  /**
   * Saves one AI seat's model, effort, and doctrine choice.
   *
   * Purpose: The commander popover writes that seat without changing the other seats.
   * When to use: When the player changes a commander's model, effort, doctrine, or key.
   * Expected outcome: The updated snapshot. A model or effort change cancels that seat's consult. An omitted `apiKey` leaves the stored key.
   * Exceptions: Rejects when the seat is human, missing, or knocked out.
   */
  setSeatCommander: (
    seatId: AiSeatId,
    commander: { modelId: string | null; reasoningEffort: string | null; doctrineChoice: DoctrineChoice; apiKey?: string }
  ): Promise<SeatSnapshot> => ipcRenderer.invoke('game:setSeatCommander', seatId, commander),
  /**
   * Ends the match by ranking the seats that are still active.
   *
   * Purpose: End game on the knocked-out dialog opens the standings.
   * When to use: When the player chooses End game.
   * Expected outcome: The snapshot with the match over. A match that is already over is unchanged.
   * Exceptions: Rejects when the database write fails.
   */
  endMatch: (): Promise<GameStateSnapshot> => ipcRenderer.invoke(IPC_GAME.endMatch),
  /**
   * Saves the match in progress to a file the player chooses.
   *
   * Purpose: Save on the game menu opens the system Save dialog in the main process.
   * When to use: When the player chooses Save.
   * Expected outcome: `saved` with the file's base name, `canceled`, or `failed` with one sentence.
   * Exceptions: None. A write failure is `failed`.
   */
  saveGame: (): Promise<SaveGameResult> => ipcRenderer.invoke(IPC_GAME.saveGame),
  /**
   * Loads a saved match in place of the one in progress.
   *
   * Purpose: Load on the game menu and the new-game screen opens the system Open dialog in the main process.
   * When to use: When the player chooses Load, after confirming when a match is in progress.
   * Expected outcome: `loaded` with the file's base name, `canceled`, or `failed` with one sentence.
   * Exceptions: None. A failure that cannot reopen the previous match returns that sentence.
   */
  loadGame: (): Promise<LoadGameResult> => ipcRenderer.invoke(IPC_GAME.loadGame),
  /**
   * Starts commander planning for every eligible AI seat, or for the active battle.
   *
   * Purpose: The match screen will ask the pool to plan. It does not call this yet.
   * When to use: Strategic planning, or tactical planning while a battle is open.
   * Expected outcome: The snapshot after the starts have been kicked off. Consults are still in flight.
   * Exceptions: Rejects when the IPC channel fails.
   */
  startCommanderPlanning: (request: { mode: CommanderPlanningMode }): Promise<CommanderPoolSnapshot> =>
    ipcRenderer.invoke(IPC_GAME.startCommanderPlanning, request),
  /**
   * Stops every in-flight commander consult.
   *
   * Purpose: Run off and teardown need one stop for every seat.
   * When to use: When the player stops model work.
   * Expected outcome: Planning seats return to ready. Stored orders from an earlier consult stay.
   * Exceptions: Rejects when the IPC channel fails.
   */
  stopCommanderPlanning: (reason?: ModelCallCancelReason): Promise<void> =>
    ipcRenderer.invoke(IPC_GAME.stopCommanderPlanning, reason === undefined ? undefined : { reason }),
  /**
   * Reads commander status and, when asked, takes the queued prose.
   *
   * Purpose: A peek leaves dispatches for a later drain.
   * When to use: Polling status, or showing toasts.
   * Expected outcome: AI seats in seat order. Dispatches are cleared only when `drain` is true.
   * Exceptions: Rejects when the IPC channel fails.
   */
  readCommanderPool: (drain: boolean): Promise<CommanderPoolSnapshot> =>
    ipcRenderer.invoke(IPC_GAME.readCommanderPool, { drain }),
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
   * Documents the object literal property `notifyResolutionPlaybackComplete`.
   *
   * Purpose: Signals main that resolution canvas playback finished so deferred LLM consultation runs.
   * When to use: After strategic/tactical resolution animations complete or immediately when none ran.
   * Expected outcome: Main validates pending mutex metadata and pushes consult results to registered listeners.
   * Exceptions: IPC failures propagate as promise rejections.
   */
notifyResolutionPlaybackComplete: (
    payload: NotifyResolutionPlaybackCompletePayload
  ): Promise<{ ok: boolean; reason?: string }> =>
    ipcRenderer.invoke(IPC_GAME.notifyResolutionPlaybackComplete, payload),
    /**
   * Documents the object literal property `registerPostResolutionConsultationListener`.
   *
   * Purpose: Receives deferred strategic post-resolution consultation merges from main.
   * When to use: Renderer init once.
   * Expected outcome: Callback invoked after notify completes successful deferred consultation.
   * Exceptions: None.
   */
registerPostResolutionConsultationListener: (callback: (payload: PostResolutionConsultationPushPayload) => void): void => {
    postResolutionConsultationListener = callback;
  },
    /**
   * Documents the object literal property `registerPostTacticalBeatConsultationListener`.
   *
   * Purpose: Receives deferred tactical post-beat consultation fields from main.
   * When to use: Renderer init once alongside strategic deferred listener.
   * Expected outcome: Same hydration path as inline tactical commit consultation merges.
   * Exceptions: None.
   */
registerPostTacticalBeatConsultationListener: (callback: (payload: TacticalPostBeatConsultFields) => void): void => {
    postTacticalBeatConsultationListener = callback;
  },
    /**
   * Documents the object literal property `startTacticalBattle` (startTacticalBattle: (payload: { enclosingStrategicH3Index: string }): Promise<StartTacticalBattleIpcResult> => ipcRenderer.invoke('game:startTacticalBattle', payload)).

   * Purpose: Exposes tactical battle entry to the renderer with the same contract as the main-process handler.
   * When to use: After the player activates a contested-hex tactical entry control during strategic planning.
   * Expected outcome: Returns a tactical snapshot on success for tactical-scoped rendering and interaction.
   * Exceptions: None.
   */
startTacticalBattle: (payload: { enclosingStrategicH3Index: string }): Promise<StartTacticalBattleIpcResult> =>
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
   * Expected outcome: Main returns the updated tactical snapshot JSON on success; event-driven Run may merge
   * `TacticalPostBeatConsultFields` (kind `tactical`, battleId, attach flag, optional plan/strategy/counts) on the same result.
   * Exceptions: IPC errors propagate as promise rejections.
   */
commitHumanTacticalDraftOrders: (payload: CommitHumanTacticalDraftOrdersIpcPayload): Promise<CommitHumanTacticalDraftOrdersIpcResult> =>
    ipcRenderer.invoke(IPC_GAME.commitHumanTacticalDraftOrders, payload),
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
   * Applies one shared queue template to selected production hexes.
   *
   * Purpose: Gives the renderer one authoritative best-effort batch write for multi-hex editing.
   * When to use: A build hex joins a multi-selection or the shared template changes.
   * Expected outcome: Applied, eligibility-skipped, and hard-failed details.
   * Exceptions: IPC transport failures reject the promise.
   */
applyBuildQueueTemplateToHexes: (payload: {
    h3Indexes: string[];
    entries: BuildQueueTemplateEntry[];
  }): Promise<ApplyBuildQueueTemplateResult> =>
    ipcRenderer.invoke(IPC_GAME.applyBuildQueueTemplateToHexes, payload),
  /**
   * Arms or clears Keep building on selected production hexes.
   *
   * Purpose: Lets the build popup checkbox persist standing orders without rewriting queue rows.
   * When to use: Single- or multi-hex Keep building toggles.
   * Expected outcome: Best-effort applied/failed details.
   * Exceptions: IPC transport failures reject the promise.
   */
  setHexesKeepBuilding: (payload: {
    h3Indexes: string[];
    keepBuilding: boolean;
  }): Promise<SetHexesKeepBuildingResult> => ipcRenderer.invoke(IPC_GAME.setHexesKeepBuilding, payload),
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
   * Documents the object literal property `cancelRequestAiOrders` (cancelRequestAiOrders: (): Promise<void> => ipcRenderer.invoke('game:cancelRequestAiOrders')).

   * Purpose: Supports maintainability by documenting why `cancelRequestAiOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelRequestAiOrders: (payload?: { reason?: ModelCallCancelReason }): Promise<void> =>
    ipcRenderer.invoke(IPC_GAME.cancelRequestAiOrders, payload),
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
    /**
     * Loads the OpenRouter model list with the key from the open commander.
     *
     * Purpose: The model catalog is shared, and the refresh uses the popover's key.
     * When to use: Startup, when a remembered key exists, and the popover's refresh button.
     * Expected outcome: The model list, or an error string. The key is not logged.
     * Exceptions: Rejects on IPC failure.
     */
    listModels: (key: string): Promise<{ models?: OpenRouterModel[]; error?: string }> =>
      ipcRenderer.invoke(IPC_OPENROUTER.listModels, key),
    setSelectedModel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC_OPENROUTER.setSelectedModel, modelId),
    getSelectedReasoningEffort: (): Promise<string> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getSelectedReasoningEffort),
    setSelectedReasoningEffort: (effort: string): Promise<void> =>
      ipcRenderer.invoke(IPC_OPENROUTER.setSelectedReasoningEffort, effort),
    /**
     * Reads the remembered commanders and the key that fills the first AI row.
     *
     * Purpose: The new-game screen asks the main process for that snapshot.
     * When to use: Before the new-game rows are rebuilt.
     * Expected outcome: The snapshot view. The key is not logged.
     * Exceptions: Rejects on IPC failure.
     */
    getCommanderKeyMemory: (): Promise<CommanderKeyMemoryView> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getCommanderKeyMemory),
    /**
     * Reads one AI seat's OpenRouter key.
     *
     * Purpose: The in-match commander popover fills its password field from this seat.
     * When to use: When that popover opens.
     * Expected outcome: The stored key, or `''` when the seat has none. The key is not logged.
     * Exceptions: Rejects on IPC failure.
     */
    getSeatApiKey: (seatId: string): Promise<string> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getSeatApiKey, seatId),
    getToolGroupList: (): Promise<{ id: string; label: string }[]> =>
      ipcRenderer.invoke(IPC_OPENROUTER.getToolGroupList),
  },
} satisfies GameApi;

contextBridge.exposeInMainWorld('gameApi', gameApi);
