import type { AirStrikeTargetType } from './ordersTypes';
import type { BuildUnitType, HexBuildQueueSnapshot } from './productionTypes';
import type { GameStateSnapshot } from './gameStateTypes';
import type {
  EndTacticalBattleIpcResult,
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from './tacticalTypes';
import type {
  HexContinentNamesRequest,
  HexNamingTooltipLineRequest,
  Res4CityOverlayRow,
  Res4RoadRailOverlayRow,
  Res4TransportVectorOverlayRow,
  Res4TerrainOverrideRow,
} from './terrainHexTypes';
import type { HumanOrderGroupPreviewResult, HumanOrderPreviewResult, HumanStandingOrderSnapshot } from './humanOrderPreviewTypes';
import type { NewGameIpcPayload, SubmitOrdersIpcPayload } from './ordersTypes';
import type { OpenRouterModel, RequestAiOrdersResult } from './openRouterTypes';
import type {
  GameReadyIpcPayload,
  PostResolutionConsultPushPayload,
  ReadyResult,
  ResolveMeleeInterceptIpcPayload,
  TacticalCommitResolutionPlayback,
} from './readyTypes';
import type { SealiftStackState } from './sealiftTypes';

/**
 * Documents the `GameApi` interface as a named contract surface (export interface GameApi).

 * Purpose: Supports maintainability by documenting why `GameApi` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface GameApi {
    /**
   * Specifies the contract for the `getGameState` member (getGameState: () => Promise<GameStateSnapshot>;).

   * Contract: Describes stable behavior for callers of `getGameState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getGameState: () => Promise<GameStateSnapshot>;
    /**
   * Specifies the contract for the `getRes4TerrainOverrides` member (getRes4TerrainOverrides: () => Promise<Res4TerrainOverrideRow[]>;).

   * Contract: Describes stable behavior for callers of `getRes4TerrainOverrides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getRes4TerrainOverrides: () => Promise<Res4TerrainOverrideRow[]>;
    /**
   * Specifies the contract for the `getRes4CityOverlays` member (getRes4CityOverlays: () => Promise<Res4CityOverlayRow[]>;).

   * Contract: Returns reduced res4 city labels for res4 map overlays; empty when classification cache is unavailable.
   * When to use: Renderer startup hydration alongside terrain overrides.
   * Expected outcome: Stable rows keyed by res4 `h3Index` with display-ready `label` strings.
   * Exceptions: None beyond IPC transport failures.
   */
getRes4CityOverlays: () => Promise<Res4CityOverlayRow[]>;
    /**
   * Specifies the contract for the `getRes4RoadRailOverlays` member (getRes4RoadRailOverlays: () => Promise<Res4RoadRailOverlayRow[]>;).

   * Contract: Returns parsed road/rail side masks from bundled generated JSON for res4 tactical glyphs.
   * When to use: Renderer startup hydration when res4 transport/city overlays are needed.
   * Expected outcome: Each row carries equal-length boolean masks sized to the parent cell edge count.
   * Exceptions: None beyond IPC transport failures.
   */
getRes4RoadRailOverlays: () => Promise<Res4RoadRailOverlayRow[]>;
    /**
   * Specifies the contract for the `getRes4TransportVectorOverlays` member (getRes4TransportVectorOverlays: () => Promise<Res4TransportVectorOverlayRow[]>;).

   * Contract: Returns optional display-only WGS84 polylines for Leaflet road/rail overlays (not gameplay transport truth).
   * When to use: Renderer startup hydration to enable vector-based transport drawing when generated data exists.
   * Expected outcome: Empty array when the vector artifact is absent or invalid; otherwise style-tagged route rows.
   * Exceptions: None beyond IPC transport failures.
   */
getRes4TransportVectorOverlays: () => Promise<Res4TransportVectorOverlayRow[]>;
    /**
   * Specifies the contract for the `getHexNamingTooltipLine` member (getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest) => Promise<string | null>;).

   * Contract: Describes stable behavior for callers of `getHexNamingTooltipLine` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest) => Promise<string | null>;
    /**
   * Specifies the contract for the `getHexContinentNames` member (getHexContinentNames: (payload: HexContinentNamesRequest) => Promise<string[]>;).

   * Contract: Describes stable behavior for callers of `getHexContinentNames` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexContinentNames: (payload: HexContinentNamesRequest) => Promise<string[]>;
    /**
   * Specifies the contract for the `listScenarioHomeRegions` member (listScenarioHomeRegions: () => Promise<string[]>;).

   * Contract: Describes stable behavior for callers of `listScenarioHomeRegions` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listScenarioHomeRegions: () => Promise<string[]>;
    /**
   * Specifies the contract for the `newGame` member (newGame: (payload?: NewGameIpcPayload) => Promise<GameStateSnapshot>;).

   * Contract: Describes stable behavior for callers of `newGame` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
newGame: (payload?: NewGameIpcPayload) => Promise<GameStateSnapshot>;
    /**
   * Specifies the contract for the `submitOrders` member (submitOrders: (payload: SubmitOrdersIpcPayload) => Promise<{ success: boolean; reason?: string }>;).

   * Contract: Describes stable behavior for callers of `submitOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
submitOrders: (payload: SubmitOrdersIpcPayload) => Promise<{ success: boolean; reason?: string }>;
    /**
   * Specifies the contract for the `ready` member (ready: (payload?: GameReadyIpcPayload) => Promise<ReadyResult>;).

   * Contract: Describes stable behavior for callers of `ready` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ready: (payload?: GameReadyIpcPayload) => Promise<ReadyResult>;
    /**
   * Specifies the contract for the `resolveMeleeIntercept` member (resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload) => Promise<ReadyResult>;).

   * Contract: Completes a turn paused at pre-melee after the human submits Fight or Ignore from the intercept modal.
   * When to use: Only after a successful ready returned `awaitingMeleeDecision`.
   * Expected outcome: Same completion fields as a normal ready result; Fight may set `tacticalAutoStartRes1H3Index`.
   * Exceptions: None.
   */
resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload) => Promise<ReadyResult>;
    /**
   * Specifies the contract for the `listHumanStandingOrders` member (listHumanStandingOrders: () => Promise<HumanStandingOrderSnapshot[]>;).

   * Contract: Describes stable behavior for callers of `listHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
listHumanStandingOrders: () => Promise<HumanStandingOrderSnapshot[]>;
    /**
   * Specifies the contract for the `previewHumanMarchOrder` member (previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }) => Promise<HumanOrderPreviewResult>;).

   * Contract: Describes stable behavior for callers of `previewHumanMarchOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previewHumanMarchOrder: (payload: { unitId: string; hoveredH3Index: string }) => Promise<HumanOrderPreviewResult>;
    /**
   * Specifies the contract for the `previewHumanMarchOrders` member (previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }) => Promise<HumanOrderGroupPreviewResult>;).

   * Contract: Describes stable behavior for callers of `previewHumanMarchOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
previewHumanMarchOrders: (payload: { unitIds: string[]; hoveredH3Index: string }) => Promise<HumanOrderGroupPreviewResult>;
    /**
   * Specifies the contract for the `assignHumanMarchOrder` member (assignHumanMarchOrder: (payload: { unitId: string; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }>;).

   * Contract: Describes stable behavior for callers of `assignHumanMarchOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assignHumanMarchOrder: (payload: {
    unitId: string;
    destinationH3Index: string;
  }) => Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }>;
    /**
   * Specifies the contract for the `assignHumanMarchOrders` member (assignHumanMarchOrders: (payload: { unitIds: string[]; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }>;).

   * Contract: Describes stable behavior for callers of `assignHumanMarchOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
assignHumanMarchOrders: (payload: {
    unitIds: string[];
    destinationH3Index: string;
  }) => Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }>;
    /**
   * Specifies the contract for the `commitHumanTacticalDraftOrders` member (commitHumanTacticalDraftOrders: (payload: { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks?: ... }) => Promise<{ success: boolean; reason?: string; tacticalBattle?: TacticalBattleSnapshot }>;).

   * Contract: Applies renderer tactical draft rows (movement, ranged, air, ferry, embark) to the main-process snapshot on tactical Ready.
   * When to use: Renderer tactical planning phase when the human clicks Ready with zero or more pending draft rows.
   * Expected outcome: Returns the updated tactical snapshot on success for immediate redraw.
   * Exceptions: None; failures return `success: false` with a reason string.
   */
commitHumanTacticalDraftOrders: (payload: {
    movementOrders: { unitId: string; toH3Index: string }[];
    rangedAttacks?: { unitId: string; targetH3Index: string }[];
    airStrikes?: { unitId: string; targetH3Index: string; targetType: AirStrikeTargetType }[];
    ferryOrders?: { unitId: string; destinationH3Index: string }[];
    embarkOrders?: { unitId: string; navalUnitId: string }[];
    opponentTacticalDraft?: import('./readyTypes').TacticalOpponentPlanPayload;
    useEventDrivenConsultation?: boolean;
    aiPlanningRunEnabled?: boolean;
  }) => Promise<{
    success: boolean;
    reason?: string;
    tacticalBattle?: TacticalBattleSnapshot;
    tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;
    tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];
    tacticalOpponentPlan?: import('./readyTypes').TacticalOpponentPlanPayload | null;
    committedOpponentTacticalDraft?: import('./readyTypes').TacticalOpponentPlanPayload | null;
    toolInvocationCounts?: Record<string, number>;
    aiStrategy?: string;
  }>;
    /**
   * Specifies the contract for the `validateGroupRangedTarget` member (validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }) => Promise<{ success: boolean; reason?: string }>;).

   * Contract: Describes stable behavior for callers of `validateGroupRangedTarget` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupRangedTarget: (payload: { unitIds: string[]; targetH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
    /**
   * Specifies the contract for the `validateGroupAirStrikeTarget` member (validateGroupAirStrikeTarget: (payload: { unitIds: string[]; targetH3Index: string; targetType: AirStrikeTargetType; }) => Promise<{ success:).

   * Contract: Describes stable behavior for callers of `validateGroupAirStrikeTarget` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupAirStrikeTarget: (payload: {
    unitIds: string[];
    targetH3Index: string;
    targetType: AirStrikeTargetType;
  }) => Promise<{ success: boolean; reason?: string }>;
    /**
   * Specifies the contract for the `validateGroupFerryTarget` member (validateGroupFerryTarget: (payload: { unitIds: string[]; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string }>;).

   * Contract: Describes stable behavior for callers of `validateGroupFerryTarget` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
validateGroupFerryTarget: (payload: { unitIds: string[]; destinationH3Index: string }) => Promise<{ success: boolean; reason?: string }>;
    /**
   * Specifies the contract for the `cancelHumanStandingOrder` member (cancelHumanStandingOrder: (payload: { unitId: string }) => Promise<{ success: boolean; reason?: string }>;).

   * Contract: Describes stable behavior for callers of `cancelHumanStandingOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelHumanStandingOrder: (payload: { unitId: string }) => Promise<{ success: boolean; reason?: string }>;
    /**
   * Specifies the contract for the `getHexBuildQueue` member (getHexBuildQueue: (payload: { h3Index: string }) => Promise<HexBuildQueueSnapshot | null>;).

   * Contract: Describes stable behavior for callers of `getHexBuildQueue` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getHexBuildQueue: (payload: { h3Index: string }) => Promise<HexBuildQueueSnapshot | null>;
    /**
   * Specifies the contract for the `addHexBuildQueueEntry` member (addHexBuildQueueEntry: (payload: { h3Index: string }) => Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }>;).

   * Contract: Describes stable behavior for callers of `addHexBuildQueueEntry` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
addHexBuildQueueEntry: (payload: { h3Index: string }) => Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSnapshot }>;
    /**
   * Specifies the contract for the `updateHexBuildQueueEntry` member (updateHexBuildQueueEntry: (payload: { h3Index: string; entryId: number; unitType: BuildUnitType; count: number }) => Promise<{ success: boolean; reaso).

   * Contract: Describes stable behavior for callers of `updateHexBuildQueueEntry` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateHexBuildQueueEntry: (payload: { h3Index: string; entryId: number; unitType: BuildUnitType; count: number }) => Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }>;
    /**
   * Specifies the contract for the `removeHexBuildQueueEntry` member (removeHexBuildQueueEntry: (payload: { h3Index: string; entryId: number }) => Promise<{ success: boolean; reason?: string; queue?: HexBuildQueueSn).

   * Contract: Describes stable behavior for callers of `removeHexBuildQueueEntry` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
removeHexBuildQueueEntry: (payload: { h3Index: string; entryId: number }) => Promise<{
    success: boolean;
    reason?: string;
    queue?: HexBuildQueueSnapshot;
  }>;
    /**
   * Specifies the contract for the `getSealiftStackState` member (getSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;).

   * Contract: Describes stable behavior for callers of `getSealiftStackState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;
    /**
   * Specifies the contract for the `getTacticalSealiftStackState` member (getTacticalSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;).

   * Contract: Describes stable behavior for callers of `getTacticalSealiftStackState` in this codebase.
   * When to use: Tactical stack callout when human sealift assignments are expressed with tactical sub-unit ids.
   * Expected outcome: Same `SealiftStackState` shape as `getSealiftStackState`, or an empty section when no tactical session applies to the hex.
   * Exceptions: None beyond normal IPC failure modes.
   */
getTacticalSealiftStackState: (payload: { h3Index: string }) => Promise<SealiftStackState>;
    /**
   * Specifies the contract for the `updateTacticalSealiftSlot` member (updateTacticalSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null; }) => Promise<{ success: boolean; reason?: string; state?: SealiftStackState; tacticalBattle?: TacticalBattleSnapshot }>;).

   * Contract: Applies one sealift slot change to the active tactical snapshot and parent-level transport rows immediately (sub-unit ids).
   * When to use: Tactical stack sealift controls while a tactical battle is active; strategic `updateSealiftSlot` remains blocked in that mode.
   * Expected outcome: Same shape as `updateSealiftSlot` plus `tacticalBattle` on success for renderer redraw.
   * Exceptions: None beyond normal IPC failure modes.
   */
updateTacticalSealiftSlot: (payload: {
    h3Index: string;
    navalUnitId: string;
    slotIndex: 1 | 2;
    landUnitId: string | null;
  }) => Promise<{
    success: boolean;
    reason?: string;
    state?: SealiftStackState;
    tacticalBattle?: TacticalBattleSnapshot;
  }>;
    /**
   * Specifies the contract for the `updateSealiftSlot` member (updateSealiftSlot: (payload: { h3Index: string; navalUnitId: string; slotIndex: 1 | 2; landUnitId: string | null; }) => Promise<{ success).

   * Contract: Describes stable behavior for callers of `updateSealiftSlot` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSealiftSlot: (payload: {
    h3Index: string;
    navalUnitId: string;
    slotIndex: 1 | 2;
    landUnitId: string | null;
  }) => Promise<{ success: boolean; reason?: string; state?: SealiftStackState }>;
    /**
   * Specifies the contract for the `requestAiOrders` member (requestAiOrders: (payload?: { enabledToolGroups?: string[] }) => Promise<RequestAiOrdersResult>;).

   * Contract: Describes stable behavior for callers of `requestAiOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestAiOrders: (payload?: { enabledToolGroups?: string[] }) => Promise<RequestAiOrdersResult>;
    /**
   * Specifies the contract for the `startTacticalBattle` member (startTacticalBattle: (payload: { enclosingRes1H3Index: string }) => Promise<StartTacticalBattleIpcResult>;).

   * Contract: Starts a milestone-2.1 tactical battle for a contested res1 hex during strategic planning; fails if prerequisites are not met.
   * When to use: Renderer invokes this after the player confirms tactical entry from the map overlay.
   * Expected outcome: On success, returns a tactical snapshot the renderer stores for res4-focused drawing and interaction.
   * Exceptions: None.
   */
startTacticalBattle: (payload: { enclosingRes1H3Index: string }) => Promise<StartTacticalBattleIpcResult>;
    /**
   * Specifies the contract for the `endTacticalBattle` member (endTacticalBattle: () => Promise<EndTacticalBattleIpcResult>;).

   * Contract: Clears the active tactical session in the main process without applying strategic combat outcomes.
   * When to use: Renderer invokes this when the player exits tactical planning and returns to the strategic map.
   * Expected outcome: Strategic `ready` and order mutations become eligible again after this succeeds.
   * Exceptions: None.
   */
endTacticalBattle: () => Promise<EndTacticalBattleIpcResult>;
    /**
   * Specifies the contract for the `cancelRequestAiOrders` member (cancelRequestAiOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `cancelRequestAiOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelRequestAiOrders: () => Promise<void>;
    /**
   * Specifies the contract for the `registerOpenRouterLogListener` member (registerOpenRouterLogListener?: (callback: (payload: { line: string; isError?: boolean }) => void) => void;).

   * Contract: Describes stable behavior for callers of `registerOpenRouterLogListener` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  registerOpenRouterLogListener?: (callback: (payload: { line: string; isError?: boolean }) => void) => void;
  /**
   * Registers a listener for main-process deferred post-resolution consultation pushes (tactical post-beat only).
   *
   * Contract: Invoked zero or more times after `commitHumanTacticalDraftOrders` when event-driven Run schedules async consult.
   * Strategic `game:ready` already awaits post-resolution consultation on main; it does not use this channel.
   * When to use: OpenRouter UI init alongside `registerOpenRouterLogListener`.
   * Expected outcome: Renderer merges `tacticalOpponentPlan` / strategy when `battleId` matches the active tactical battle.
   * Exceptions: None; optional on older preload builds.
   */
  registerPostResolutionConsultPushListener?: (callback: (payload: PostResolutionConsultPushPayload) => void) => void;
    /**
   * Specifies the contract for the `openRouter` member (openRouter?: { getKey: () => Promise<{ hasKey: boolean }>; getSelectedModel: () => Promise<string>; setKey: (key: string) => Promise<void>;).

   * Contract: Describes stable behavior for callers of `openRouter` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
openRouter?: {
    getKey: () => Promise<{ hasKey: boolean }>;
    getSelectedModel: () => Promise<string>;
    setKey: (key: string) => Promise<void>;
    listModels: () => Promise<{ models?: OpenRouterModel[]; error?: string }>;
    setSelectedModel: (modelId: string) => Promise<void>;
    getToolGroupList: () => Promise<{ id: string; label: string }[]>;
  };
}
