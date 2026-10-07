import type {
  AirStrikeOrder,
  AirStrikeTargetType,
  EmbarkOrder,
  FerryOrder,
  MovementOrder,
  NewGameIpcPayload,
  RangedAttackOrder,
  SubmitOrdersIpcPayload,
} from './ordersTypes';
import type {
  ApplyBuildQueueTemplateResult,
  BuildQueueTemplateEntry,
  BuildUnitType,
  HexBuildQueueSnapshot,
  SetHexesKeepBuildingResult,
} from './productionTypes';
import type { GameStateSnapshot } from './gameStateTypes';
import type { GameMapListEntry } from '../gameMapList';
import type {
  EndTacticalBattleIpcResult,
  StartTacticalBattleIpcResult,
  TacticalBattleSnapshot,
} from './tacticalTypes';
import type {
  HexContinentNamesRequest,
  HexNamingTooltipLineRequest,
  StrategicBaselineUrbanHexCountRow,
  TacticalCityOverlayRow,
  TacticalRoadRailOverlayRow,
  TacticalTransportVectorOverlayRow,
  TacticalTerrainOverrideRow,
} from './terrainHexTypes';
import type { HumanOrderGroupPreviewResult, HumanOrderPreviewResult, HumanStandingOrderSnapshot } from './humanOrderPreviewTypes';
import type { OpenRouterModel, RequestAiOrdersResult } from './openRouterTypes';
import type { GameReadyIpcPayload, ReadyResult } from './readyTypes';
import type { TacticalCommitResolutionPlayback } from './tacticalPlaybackTypes';
import type {
  NotifyResolutionPlaybackCompletePayload,
  PostResolutionConsultationPushPayload,
  TacticalOpponentPlanPayload,
  TacticalPostBeatConsultFields,
} from './consultationPushTypes';
import type { ResolveMeleeInterceptIpcPayload } from './meleeInterceptTypes';
import type { SealiftStackState } from './sealiftTypes';
import type { HexNamingCaption } from '../hexNamingCaption';

/**
 * Invoke result for `game:commitHumanTacticalDraftOrders` (success or validation failure).
 *
 * Purpose: Names the preload/renderer contract for tactical Ready commit, including optional post-beat consultation keys merged on main when event-driven Run completes inside the same invoke.
 * When to use: `GameApi.commitHumanTacticalDraftOrders`, `preload` typing, and renderer code that inspects `commitResult`.
 * Expected outcome: On success, `tacticalBattle` and playback fields may be set; `kind`/`battleId`/`attachTacticalOpponentPlanToIpc` appear only when main merged `TacticalPostBeatConsultFields`.
 * Exceptions: None.
 */
export type CommitHumanTacticalDraftOrdersIpcResult = {
  success: boolean;
  reason?: string;
  tacticalBattle?: TacticalBattleSnapshot;
  tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;
  tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];
  tacticalOpponentPlan?: TacticalOpponentPlanPayload | null;
  committedOpponentTacticalDraft?: TacticalOpponentPlanPayload | null;
  toolInvocationCounts?: Record<string, number>;
  aiStrategy?: string;
  /**
   * Player-facing taunt/threat from the post–tactical-beat LLM pass (IPC merge only).
   *
   * Contract: Same source as `aiStrategy`; omit when empty.
   * When to use: Renderer Message toast section after tactical Ready.
   * Expected outcome: Independent of `aiStrategy`.
   * Exceptions: None.
   */
  aiMessage?: string;
  /**
   * True when main deferred `runEventDrivenAfterTacticalBeatConsultation` until resolution playback notify + push.
   *
   * Purpose: Distinguishes invoke responses that omit merged `TacticalPostBeatConsultFields` from those that include them inline.
   * When to use: Tactical Ready handler schedules notify and listens for `postTacticalBeatConsultation` when set.
   * Expected outcome: Consult fields arrive only via push for that commit.
   * Exceptions: Omitted when consultation ran inline or was skipped.
   */
  tacticalPostBeatConsultDeferred?: boolean;
} & Partial<TacticalPostBeatConsultFields>;

/**
 * Draft rows the renderer sends when the human commits a tactical beat.
 *
 * Purpose: Names the `commitHumanTacticalDraftOrders` argument so the preload bridge and `GameApi` share one shape.
 * When to use: The `GameApi` method and the preload `satisfies GameApi` annotation.
 * Expected outcome: Movement is required; support drafts and consultation flags stay optional.
 * Exceptions: None.
 */
export type CommitHumanTacticalDraftOrdersIpcPayload = {
  movementOrders: MovementOrder[];
  rangedAttacks?: RangedAttackOrder[];
  airStrikes?: AirStrikeOrder[];
  ferryOrders?: FerryOrder[];
  embarkOrders?: EmbarkOrder[];
  opponentTacticalDraft?: TacticalOpponentPlanPayload;
  useEventDrivenConsultation?: boolean;
  aiPlanningRunEnabled?: boolean;
};

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
   * Specifies the contract for the `getTacticalTerrainOverrides` member (getTacticalTerrainOverrides: () => Promise<TacticalTerrainOverrideRow[]>;).

   * Contract: Describes stable behavior for callers of `getTacticalTerrainOverrides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getTacticalTerrainOverrides: () => Promise<TacticalTerrainOverrideRow[]>;
    /**
   * Specifies the contract for the `getTacticalCityOverlays` member (getTacticalCityOverlays: () => Promise<TacticalCityOverlayRow[]>;).

   * Contract: Returns reduced tactical city labels for tactical map overlays; empty when classification cache is unavailable.
   * When to use: Renderer startup hydration alongside terrain overrides.
   * Expected outcome: Stable rows keyed by tactical `h3Index` with display-ready `label` strings.
   * Exceptions: None beyond IPC transport failures.
   */
getTacticalCityOverlays: () => Promise<TacticalCityOverlayRow[]>;
    /**
   * Specifies the contract for the `getTacticalRoadRailOverlays` member (getTacticalRoadRailOverlays: () => Promise<TacticalRoadRailOverlayRow[]>;).

   * Contract: Returns parsed road/rail side masks from bundled generated JSON for tactical glyphs.
   * When to use: Renderer startup hydration when tactical transport/city overlays are needed.
   * Expected outcome: Each row carries equal-length boolean masks sized to the parent cell edge count.
   * Exceptions: None beyond IPC transport failures.
   */
getTacticalRoadRailOverlays: () => Promise<TacticalRoadRailOverlayRow[]>;
    /**
   * Specifies the contract for the `getTacticalTransportVectorOverlays` member (getTacticalTransportVectorOverlays: () => Promise<TacticalTransportVectorOverlayRow[]>;).

   * Contract: Returns optional display-only WGS84 polylines for Leaflet road/rail overlays (not gameplay transport truth).
   * When to use: Renderer startup hydration to enable vector-based transport drawing when generated data exists.
   * Expected outcome: Empty array when the vector artifact is absent or invalid; otherwise style-tagged route rows.
   * Exceptions: None beyond IPC transport failures.
   */
getTacticalTransportVectorOverlays: () => Promise<TacticalTransportVectorOverlayRow[]>;
  /**
   * Returns the generated urban-cell count for each strategic hex that can produce units.
   *
   * Contract: Counts come from the terrain classification cache. They do not change when air strikes destroy cities.
   * When to use: Once per renderer session, beside the static tactical overlay load.
   * Expected outcome: One row per hex with a positive count. Empty when the cache is not loaded. Hexes that produce nothing are absent.
   * Exceptions: None beyond IPC transport failures. A handler failure returns an empty array.
   */
  getStrategicBaselineUrbanHexCounts: () => Promise<StrategicBaselineUrbanHexCountRow[]>;
  /**
   * Returns the structured naming caption (text plus country spans) for a strategic or tactical hex.
   *
   * Contract: `text` is the plain caption; spans mark headings and country names for flags. `null` when the hex has no naming data.
   * When to use: Hover tooltips, the build popup, and the melee-intercept hex cell, via the renderer's caption cache.
   * Expected outcome: Format with `formatHexNamingCaptionHtml`.
   * Exceptions: Rejects on IPC transport failures.
   */
  getHexNamingTooltipLine: (payload: HexNamingTooltipLineRequest) => Promise<HexNamingCaption | null>;
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
   * Lists the global map and every extracted regional pack.
   *
   * Contract: Each row has a display name, side groups, unit costs, and the Advanced threshold. Tactical terrain is not read.
   * When to use: When the new-game overlay opens.
   * Expected outcome: Maps and side groups sorted by display name.
   * Exceptions: Rejects on IPC transport failures.
   */
listGameMaps: () => Promise<GameMapListEntry[]>;
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
   * Expected outcome: Same completion fields as a normal ready result; Fight may set `tacticalAutoStartStrategicH3Index`.
   * Exceptions: None.
   */
resolveMeleeIntercept: (payload: ResolveMeleeInterceptIpcPayload) => Promise<ReadyResult>;
    /**
   * Notifies main that strategic/melee/tactical resolution playback finished so deferred LLM consultation may run.
   *
   * Contract: Payload discriminant must match the deferred batch armed on main (`planningTurnNumber` / `battleId`).
   * When to use: Renderer after `tickResolutionMoveAnimation` completes or immediately when no animation ran.
   * Expected outcome: Main runs deferred consultation and pushes results via registered listeners.
   * Exceptions: Mismatches return `{ ok: false }` and may clear the mutex.
   */
notifyResolutionPlaybackComplete: (
    payload: NotifyResolutionPlaybackCompletePayload
  ) => Promise<{ ok: boolean; reason?: string }>;
    /**
   * Subscribes to main-pushed strategic post-resolution consult results (deferred path).
   *
   * Contract: Replaces any prior callback; used for one logical listener in the renderer shell.
   * When to use: Once during OpenRouter / game UI init.
   * Expected outcome: Invoked with merged strategy and tool counts when `planningTurnNumber` matches the current turn.
   * Exceptions: None.
   */
registerPostResolutionConsultationListener: (callback: (payload: PostResolutionConsultationPushPayload) => void) => void;
    /**
   * Subscribes to main-pushed tactical post-beat consult fields (deferred path).
   *
   * Contract: Replaces any prior callback; same shape as inline `TacticalPostBeatConsultFields` on commit.
   * When to use: Once during init when tactical event-driven Run can defer consultation.
   * Expected outcome: Renderer hydrates opponent draft and tool telemetry after playback notify.
   * Exceptions: None.
   */
registerPostTacticalBeatConsultationListener: (callback: (payload: TacticalPostBeatConsultFields) => void) => void;
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
commitHumanTacticalDraftOrders: (
    payload: CommitHumanTacticalDraftOrdersIpcPayload
  ) => Promise<CommitHumanTacticalDraftOrdersIpcResult>;
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
   * Applies one queue template across selected production hexes with per-hex eligibility filtering.
   *
   * Contract: Valid hexes are updated best-effort while unavailable types are reported as non-failing skips.
   * When to use: Multi-hex build selection joins and shared queue edits.
   * Expected outcome: Applied, skipped, and hard-failed details for renderer reconciliation.
   * Exceptions: Transport failures reject the promise; domain failures are returned in the result.
   */
applyBuildQueueTemplateToHexes: (payload: {
    h3Indexes: string[];
    entries: BuildQueueTemplateEntry[];
  }) => Promise<ApplyBuildQueueTemplateResult>;
  /**
   * Arms or clears Keep building on one or more production hexes.
   *
   * Contract: Best-effort per hex; enabling requires a queue entry or an existing standing order.
   * When to use: Keep building checkbox in single- or multi-hex build popup.
   * Expected outcome: Applied/failed details; standing order does not rewrite queue rows.
   * Exceptions: Transport failures reject the promise; domain failures are returned in the result.
   */
  setHexesKeepBuilding: (payload: {
    h3Indexes: string[];
    keepBuilding: boolean;
  }) => Promise<SetHexesKeepBuildingResult>;
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
   * Specifies the contract for the `startTacticalBattle` member (startTacticalBattle: (payload: { enclosingStrategicH3Index: string }) => Promise<StartTacticalBattleIpcResult>;).

   * Contract: Starts a milestone-2.1 tactical battle for a contested strategic hex during strategic planning; fails if prerequisites are not met.
   * When to use: Renderer invokes this after the player confirms tactical entry from the map overlay.
   * Expected outcome: On success, returns a tactical snapshot the renderer stores for tactical-focused drawing and interaction.
   * Exceptions: None.
   */
startTacticalBattle: (payload: { enclosingStrategicH3Index: string }) => Promise<StartTacticalBattleIpcResult>;
    /**
   * Specifies the contract for the `endTacticalBattle` member (endTacticalBattle: () => Promise<EndTacticalBattleIpcResult>;).

   * Contract: Clears the active tactical session in the main process; on human voluntary tactical exit, bailout threshold elimination may remove strategic parents before returning to strategic planning.
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
    /**
     * Reads the persisted reasoning-effort override for the selected model.
     *
     * Contract: Resolves to the saved effort, or `''` when the model default applies.
     * When to use: Model-tab startup, to restore the reasoning dropdown.
     * Expected outcome: A string; never rejects for a missing value.
     * Exceptions: Rejects only on IPC or database failure.
     */
    getSelectedReasoningEffort: () => Promise<string>;
    /**
     * Persists the reasoning-effort override for the selected model.
     *
     * Contract: `''` clears the override so the model default applies; other values are saved trimmed.
     * When to use: When the player changes the reasoning dropdown.
     * Expected outcome: Resolves after the value is stored.
     * Exceptions: Rejects only on IPC or database failure.
     */
    setSelectedReasoningEffort: (effort: string) => Promise<void>;
    getToolGroupList: () => Promise<{ id: string; label: string }[]>;
  };
}
