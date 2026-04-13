/**
 * Mutable renderer state shared across renderer modules. Mutate properties on `rendererSharedState`
 * (esbuild bundles named `export let` imports as immutable bindings).
 */

import type {
  GameStateSnapshot,
  HumanStandingOrderSnapshot,
  MovementOrder,
  RangedAttackOrder,
  AirStrikeOrder,
  EmbarkOrder,
  FerryOrder,
  AirStrikeTargetType,
  RemovedUnitSnapshot,
} from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { OPENROUTER_TOOL_GROUPS } from './constants';
import type { HoverRoutePreviewState, ResolutionMove, ResolutionPlaybackMove } from './types';

/**
 * Documents the `ResolutionMoveAnimationState` type alias (export type ResolutionMoveAnimationState).

 * Purpose: Supports maintainability by documenting why `ResolutionMoveAnimationState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type ResolutionMoveAnimationState = {
    /**
   * Specifies the contract for the `moves` member (moves: ResolutionMove[];).

   * Contract: Describes stable behavior for callers of `moves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
moves: ResolutionMove[];
    /**
   * Specifies the contract for the `airStrikeOutboundMoves` member (airStrikeOutboundMoves?: ResolutionPlaybackMove[];).

   * Contract: Describes stable behavior for callers of `airStrikeOutboundMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeOutboundMoves?: ResolutionPlaybackMove[];
    /**
   * Specifies the contract for the `airStrikeReturnMoves` member (airStrikeReturnMoves?: ResolutionPlaybackMove[];).

   * Contract: Describes stable behavior for callers of `airStrikeReturnMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeReturnMoves?: ResolutionPlaybackMove[];
    /**
   * Specifies the contract for the `airStrikeCombatHexes` member (airStrikeCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `airStrikeCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCombatHexes?: string[];
    /**
   * Specifies the contract for the `airStrikeCasualtyHexes` member (airStrikeCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `airStrikeCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `startTime` member (startTime: number;).

   * Contract: Describes stable behavior for callers of `startTime` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
startTime: number;
    /**
   * Specifies the contract for the `combatHexes` member (combatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `combatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
combatHexes?: string[];
    /**
   * Specifies the contract for the `casualtyHexes` member (casualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `casualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
casualtyHexes?: string[];
    /**
   * Specifies the contract for the `rangedCombatHexes` member (rangedCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `rangedCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCombatHexes?: string[];
    /**
   * Specifies the contract for the `rangedCasualtyHexes` member (rangedCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `rangedCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `rangedRemovedUnits` member (rangedRemovedUnits?: RemovedUnitSnapshot[];).

   * Contract: Describes stable behavior for callers of `rangedRemovedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedRemovedUnits?: RemovedUnitSnapshot[];
    /**
   * Specifies the contract for the `meleeCombatHexes` member (meleeCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `meleeCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCombatHexes?: string[];
    /**
   * Specifies the contract for the `controlLossLightningHexes` member (controlLossLightningHexes?: string[];).

   * Contract: Describes stable behavior for callers of `controlLossLightningHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controlLossLightningHexes?: string[];
    /**
   * Specifies the contract for the `meleeCasualtyHexes` member (meleeCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `meleeCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeCasualtyHexes?: string[];
    /**
   * Specifies the contract for the `meleeRemovedUnits` member (meleeRemovedUnits?: RemovedUnitSnapshot[];).

   * Contract: Describes stable behavior for callers of `meleeRemovedUnits` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
meleeRemovedUnits?: RemovedUnitSnapshot[];
    /**
   * Specifies the contract for the `unknownCombatHexes` member (unknownCombatHexes?: string[];).

   * Contract: Describes stable behavior for callers of `unknownCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCombatHexes?: string[];
    /**
   * Specifies the contract for the `unknownCasualtyHexes` member (unknownCasualtyHexes?: string[];).

   * Contract: Describes stable behavior for callers of `unknownCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCasualtyHexes?: string[];
} | null;

/**
 * Documents the module-scope binding `rendererSharedState` (rendererSharedState).

 * Purpose: Supports maintainability by documenting why `rendererSharedState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const rendererSharedState = {
    /**
   * Documents the object literal property `buildEntryButtonPointerInside` (buildEntryButtonPointerInside: false).

   * Purpose: Supports maintainability by documenting why `buildEntryButtonPointerInside` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildEntryButtonPointerInside: false,

    /**
   * Documents the object literal property `lastPointerClientX` (lastPointerClientX: 0).

   * Purpose: Supports maintainability by documenting why `lastPointerClientX` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastPointerClientX: 0,
    /**
   * Documents the object literal property `lastPointerClientY` (lastPointerClientY: 0).

   * Purpose: Supports maintainability by documenting why `lastPointerClientY` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastPointerClientY: 0,
    /**
   * Documents the object literal property `terrainTooltipDelayTimer` (terrainTooltipDelayTimer: null as ReturnType<typeof setTimeout> | null).

   * Purpose: Supports maintainability by documenting why `terrainTooltipDelayTimer` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainTooltipDelayTimer: null as ReturnType<typeof setTimeout> | null,
    /**
   * Documents the object literal property `buildEntryDefaultMapZoom` (buildEntryDefaultMapZoom: null as number | null).

   * Purpose: Supports maintainability by documenting why `buildEntryDefaultMapZoom` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildEntryDefaultMapZoom: null as number | null,
    /**
   * Documents the object literal property `lastBuildEntryLayerKey` (lastBuildEntryLayerKey: null as string | null).

   * Purpose: Supports maintainability by documenting why `lastBuildEntryLayerKey` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastBuildEntryLayerKey: null as string | null,

    /**
   * Documents the object literal property `tacticalBattleSnapshot` (tacticalBattleSnapshot: null as TacticalBattleSnapshot | null).

   * Purpose: Holds the active tactical battle layout and sub-units while the renderer is in tactical map mode.
   * When to use: Set after a successful `startTacticalBattle` IPC; cleared when the tactical session ends.
   * Expected outcome: When non-null, terrain and unit drawing use tactical res4 constraints instead of global strategic view.
   * Exceptions: None.
   */
tacticalBattleSnapshot: null as TacticalBattleSnapshot | null,
    /**
   * Documents the object literal property `lastTacticalEntryLayerKey` (lastTacticalEntryLayerKey: null as string | null).

   * Purpose: Avoids rebuilding tactical-entry DOM when the derived overlay key is unchanged between frames.
   * When to use: Updated alongside `tactical-entry-layer` innerHTML synchronization.
   * Expected outcome: Fewer DOM writes during pan/zoom redraws.
   * Exceptions: None.
   */
lastTacticalEntryLayerKey: null as string | null,
    /**
   * Documents the object literal property `tacticalEntryButtonPointerInside` (tacticalEntryButtonPointerInside: false).

   * Purpose: Tracks whether the pointer is over a tactical-entry button for consistent click hit-testing with build-entry.
   * When to use: Pointer handlers on the tactical-entry layer update this flag.
   * Expected outcome: Map dragging does not steal clicks intended for tactical entry.
   * Exceptions: None.
   */
tacticalEntryButtonPointerInside: false,
    /**
   * Documents the object literal property `tacticalPhasePlanning` (tacticalPhasePlanning: true).

   * Purpose: Separates milestone-2.1 tactical planning beats from tactical resolution (AI / async work after advancing the tactical turn).
   * When to use: `true` while the human may exit tactical mode or press Advance; `false` while `performTacticalAdvanceTurn` waits on IPC and optional background `requestAiOrders`.
   * Expected outcome: `#tactical-exit-btn` stays disabled whenever this flag is `false` with an active tactical snapshot.
   * Exceptions: Reconciling snapshots or ending tactical always resets this to `true` once the renderer returns to a coherent tactical or strategic mode.
   */
tacticalPhasePlanning: true,
    /**
   * Documents the object literal property `preTacticalLeafletMinZoom` (preTacticalLeafletMinZoom: null as number | null).

   * Purpose: Stores the main map min zoom before tactical constraints so it can be restored after tactical exit.
   * When to use: Captured when entering tactical mode; consumed when leaving tactical mode.
   * Expected outcome: Strategic zoom limits return unchanged after tactical battles.
   * Exceptions: None.
   */
preTacticalLeafletMinZoom: null as number | null,
    /**
   * Documents the object literal property `preTacticalLeafletMaxZoom` (preTacticalLeafletMaxZoom: null as number | null).

   * Purpose: Stores the main map max zoom before tactical constraints so it can be restored after tactical exit.
   * When to use: Captured when entering tactical mode; consumed when leaving tactical mode.
   * Expected outcome: Strategic zoom limits return unchanged after tactical battles.
   * Exceptions: None.
   */
preTacticalLeafletMaxZoom: null as number | null,
    /**
   * Documents the object literal property `strategicScenarioInitialLeafletView` (strategicScenarioInitialLeafletView: null as { lat: number; lng: number; zoom: number } | null).

   * Purpose: Remembers the main-map center and zoom from the first `applyInitialCameraForState` of the current match so leaving tactical mode can restore that framing instead of fitting the entire world.
   * When to use: Written when the scenario initial camera is applied; read in `exitTacticalMapView`; cleared on new game alongside `initialCameraApplied`.
   * Expected outcome: Post-tactical strategic view matches the opening scenario extent when available.
   * Exceptions: When null (before first camera apply), tactical exit falls back to world `fitBounds`.
   */
strategicScenarioInitialLeafletView: null as { lat: number; lng: number; zoom: number } | null,

    /**
   * Documents the object literal property `res1DominantTerrainKindByH3` (res1DominantTerrainKindByH3: new Map<string, string>()).

   * Purpose: Supports maintainability by documenting why `res1DominantTerrainKindByH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1DominantTerrainKindByH3: new Map<string, string>(),
    /**
   * Documents the object literal property `res1TerrainSummaryByH3` (res1TerrainSummaryByH3: new Map<string, string>()).

   * Purpose: Supports maintainability by documenting why `res1TerrainSummaryByH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1TerrainSummaryByH3: new Map<string, string>(),
    /**
   * Documents the object literal property `res1FeaturesSummaryByH3` (res1FeaturesSummaryByH3: new Map<string, string | null>()).

   * Purpose: Supports maintainability by documenting why `res1FeaturesSummaryByH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1FeaturesSummaryByH3: new Map<string, string | null>(),
    /**
   * Documents the object literal property `res1FeatureCountsByH3` (res1FeatureCountsByH3: new Map< string, { airportCount: number; seaportCount: number; rubbleCount: number } >()).

   * Purpose: Supports maintainability by documenting why `res1FeatureCountsByH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res1FeatureCountsByH3: new Map<
    string,
    { airportCount: number; seaportCount: number; rubbleCount: number }
  >(),

    /**
   * Documents the object literal property `namingLineByLookupKey` (namingLineByLookupKey: new Map<string, string | null>()).

   * Purpose: Supports maintainability by documenting why `namingLineByLookupKey` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
namingLineByLookupKey: new Map<string, string | null>(),
    /**
   * Documents the object literal property `terrainTooltipHtmlByContentKey` (terrainTooltipHtmlByContentKey: new Map<string, string>()).

   * Purpose: Supports maintainability by documenting why `terrainTooltipHtmlByContentKey` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainTooltipHtmlByContentKey: new Map<string, string>(),
    /**
   * Documents the object literal property `terrainTooltipRequestSeq` (terrainTooltipRequestSeq: 0).

   * Purpose: Supports maintainability by documenting why `terrainTooltipRequestSeq` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainTooltipRequestSeq: 0,

    /**
   * Documents the object literal property `terrainTooltipRestoreTimer` (terrainTooltipRestoreTimer: null as ReturnType<typeof setTimeout> | null).

   * Purpose: Supports maintainability by documenting why `terrainTooltipRestoreTimer` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainTooltipRestoreTimer: null as ReturnType<typeof setTimeout> | null,

    /**
   * Documents the object literal property `selectedHexIndex` (selectedHexIndex: null as string | null).

   * Purpose: Supports maintainability by documenting why `selectedHexIndex` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
selectedHexIndex: null as string | null,
    /**
   * Documents the object literal property `hoveredHexH3` (hoveredHexH3: null as string | null).

   * Purpose: Supports maintainability by documenting why `hoveredHexH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hoveredHexH3: null as string | null,
    /**
   * Documents the object literal property `hoveredDetailHexH3` (hoveredDetailHexH3: null as string | null).

   * Purpose: Supports maintainability by documenting why `hoveredDetailHexH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hoveredDetailHexH3: null as string | null,
    /**
   * Documents the object literal property `hideTerrainFillWhileHeld` (hideTerrainFillWhileHeld: false).

   * Purpose: Supports maintainability by documenting why `hideTerrainFillWhileHeld` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideTerrainFillWhileHeld: false,
    /**
   * Documents the object literal property `selectedUnitIds` (selectedUnitIds: [] as string[]).

   * Purpose: Supports maintainability by documenting why `selectedUnitIds` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
selectedUnitIds: [] as string[],
    /**
   * Documents the object literal property `selectedUnitIdsAtMouseDown` (selectedUnitIdsAtMouseDown: [] as string[]).

   * Purpose: Supports maintainability by documenting why `selectedUnitIdsAtMouseDown` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
selectedUnitIdsAtMouseDown: [] as string[],
    /**
   * Documents the object literal property `ctrlKeyActive` (ctrlKeyActive: false).

   * Purpose: Supports maintainability by documenting why `ctrlKeyActive` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
ctrlKeyActive: false,
    /**
   * Documents the object literal property `pendingSelectTimeout` (pendingSelectTimeout: null as ReturnType<typeof setTimeout> | null).

   * Purpose: Supports maintainability by documenting why `pendingSelectTimeout` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingSelectTimeout: null as ReturnType<typeof setTimeout> | null,
    /**
   * Documents the object literal property `humanStandingOrders` (humanStandingOrders: [] as HumanStandingOrderSnapshot[]).

   * Purpose: Supports maintainability by documenting why `humanStandingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
humanStandingOrders: [] as HumanStandingOrderSnapshot[],
    /**
   * Documents the object literal property `hoverRoutePreview` (hoverRoutePreview: null as HoverRoutePreviewState | null).

   * Purpose: Supports maintainability by documenting why `hoverRoutePreview` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hoverRoutePreview: null as HoverRoutePreviewState | null,
    /**
   * Documents the object literal property `hoverPreviewRequestSeq` (hoverPreviewRequestSeq: 0).

   * Purpose: Supports maintainability by documenting why `hoverPreviewRequestSeq` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hoverPreviewRequestSeq: 0,
    /**
   * Documents the object literal property `pendingRangedAttacks` (pendingRangedAttacks: [] as RangedAttackOrder[]).

   * Purpose: Supports maintainability by documenting why `pendingRangedAttacks` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingRangedAttacks: [] as RangedAttackOrder[],
    /**
   * Documents the object literal property `pendingAirStrikes` (pendingAirStrikes: [] as AirStrikeOrder[]).

   * Purpose: Supports maintainability by documenting why `pendingAirStrikes` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingAirStrikes: [] as AirStrikeOrder[],
    /**
   * Documents the object literal property `pendingFerryOrders` (pendingFerryOrders: [] as FerryOrder[]).

   * Purpose: Supports maintainability by documenting why `pendingFerryOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingFerryOrders: [] as FerryOrder[],
    /**
   * Documents the object literal property `tacticalPendingMarches` (tacticalPendingMarches: [] as { subUnitId: string; destinationH3Index: string }[]).

   * Purpose: Holds human tactical march rows shown in the pending-orders sidebar while a tactical battle is active; distinct from strategic standing orders.
   * When to use: Append after tactical march validation succeeds (draft, before Ready); clear on tactical Ready commit, advance turn, exit, stash, or new game.
   * Expected outcome: Sidebar lists res4 destinations keyed by tactical sub-unit ids until the next tactical beat boundary clears them.
   * Exceptions: None.
   */
tacticalPendingMarches: [] as { subUnitId: string; destinationH3Index: string }[],
    /**
   * Documents the object literal property `hideCommittedOrderLinesAfterReady` (hideCommittedOrderLinesAfterReady: false).

   * Purpose: Supports maintainability by documenting why `hideCommittedOrderLinesAfterReady` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideCommittedOrderLinesAfterReady: false,
    /**
   * Documents the object literal property `rangedModeActive` (rangedModeActive: false).

   * Purpose: Supports maintainability by documenting why `rangedModeActive` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rangedModeActive: false,
    /**
   * Documents the object literal property `airStrikeModeActive` (airStrikeModeActive: false).

   * Purpose: Supports maintainability by documenting why `airStrikeModeActive` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeModeActive: false,
    /**
   * Documents the object literal property `airStrikeTargetType` (airStrikeTargetType: 'units' as AirStrikeTargetType).

   * Purpose: Supports maintainability by documenting why `airStrikeTargetType` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
airStrikeTargetType: 'units' as AirStrikeTargetType,
    /**
   * Documents the object literal property `stackCalloutModalActive` (stackCalloutModalActive: false).

   * Purpose: Supports maintainability by documenting why `stackCalloutModalActive` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
stackCalloutModalActive: false,
    /**
   * Documents the object literal property `buildPopupHexH3` (buildPopupHexH3: null as string | null).

   * Purpose: Supports maintainability by documenting why `buildPopupHexH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildPopupHexH3: null as string | null,
    /**
   * Documents the object literal property `buildPopupRequestSeq` (buildPopupRequestSeq: 0).

   * Purpose: Supports maintainability by documenting why `buildPopupRequestSeq` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildPopupRequestSeq: 0,
    /**
   * Documents the object literal property `gameState` (gameState: null as GameStateSnapshot | null).

   * Purpose: Supports maintainability by documenting why `gameState` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
gameState: null as GameStateSnapshot | null,
    /**
   * Documents the object literal property `unitDisplayNameById` (unitDisplayNameById: new Map<string, string>()).

   * Purpose: Supports maintainability by documenting why `unitDisplayNameById` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitDisplayNameById: new Map<string, string>(),
    /**
   * Documents the object literal property `res4TerrainOverridesByH3` (res4TerrainOverridesByH3: new Map< string, { terrainKind: string; isUrban: boolean; isAirport: boolean; isSeaport: boolean; isRubble: boolean } >()).

   * Purpose: Supports maintainability by documenting why `res4TerrainOverridesByH3` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4TerrainOverridesByH3: new Map<
    string,
    { terrainKind: string; isUrban: boolean; isAirport: boolean; isSeaport: boolean; isRubble: boolean }
  >(),
    /**
   * Documents the object literal property `terrainInfraRes1Airport` (terrainInfraRes1Airport: new Set<string>()).

   * Purpose: Supports maintainability by documenting why `terrainInfraRes1Airport` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes1Airport: new Set<string>(),
    /**
   * Documents the object literal property `terrainInfraRes1Seaport` (terrainInfraRes1Seaport: new Set<string>()).

   * Purpose: Supports maintainability by documenting why `terrainInfraRes1Seaport` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes1Seaport: new Set<string>(),
    /**
   * Documents the object literal property `terrainInfraRes4Airport` (terrainInfraRes4Airport: new Set<string>()).

   * Purpose: Supports maintainability by documenting why `terrainInfraRes4Airport` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes4Airport: new Set<string>(),
    /**
   * Documents the object literal property `terrainInfraRes4Seaport` (terrainInfraRes4Seaport: new Set<string>()).

   * Purpose: Supports maintainability by documenting why `terrainInfraRes4Seaport` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
terrainInfraRes4Seaport: new Set<string>(),
    /**
   * Documents the object literal property `res4ChildrenByParent` (res4ChildrenByParent: new Map<string, string[]>()).

   * Purpose: Supports maintainability by documenting why `res4ChildrenByParent` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4ChildrenByParent: new Map<string, string[]>(),
    /**
   * Documents the object literal property `res4Visible` (res4Visible: false).

   * Purpose: Supports maintainability by documenting why `res4Visible` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
res4Visible: false,

    /**
   * Documents the object literal property `resolutionMoveAnimation` (resolutionMoveAnimation: null as ResolutionMoveAnimationState).

   * Purpose: Supports maintainability by documenting why `resolutionMoveAnimation` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolutionMoveAnimation: null as ResolutionMoveAnimationState,
    /**
   * Documents the object literal property `resolutionMoveAnimationFrameId` (resolutionMoveAnimationFrameId: null as number | null).

   * Purpose: Supports maintainability by documenting why `resolutionMoveAnimationFrameId` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resolutionMoveAnimationFrameId: null as number | null,
    /**
   * Documents the object literal property `initialCameraApplied` (initialCameraApplied: false).

   * Purpose: Supports maintainability by documenting why `initialCameraApplied` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
initialCameraApplied: false,

    /**
   * Documents the object literal property `clientStaleEnemyIntelByUnitId` (clientStaleEnemyIntelByUnitId: new Map< string, { unitId: string; lastKnownH3Index: string; lastSeenTurn: number; staleUnt).

   * Purpose: Supports maintainability by documenting why `clientStaleEnemyIntelByUnitId` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clientStaleEnemyIntelByUnitId: new Map<
    string,
    {
      unitId: string;
      lastKnownH3Index: string;
      lastSeenTurn: number;
      staleUntilTurn: number;
    }
  >(),
    /**
   * Documents the object literal property `lastRenderedVisibleEnemyByUnitId` (lastRenderedVisibleEnemyByUnitId: new Map<string, { h3Index: string; lastSeenTurn: number }>()).

   * Purpose: Supports maintainability by documenting why `lastRenderedVisibleEnemyByUnitId` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastRenderedVisibleEnemyByUnitId: new Map<string, { h3Index: string; lastSeenTurn: number }>(),
    /**
   * Documents the object literal property `lastObservedEnemyByUnitId` (lastObservedEnemyByUnitId: new Map<string, { h3Index: string; lastSeenTurn: number }>()).

   * Purpose: Supports maintainability by documenting why `lastObservedEnemyByUnitId` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastObservedEnemyByUnitId: new Map<string, { h3Index: string; lastSeenTurn: number }>(),

    /**
   * Documents the object literal property `redrawRafId` (redrawRafId: null as number | null).

   * Purpose: Supports maintainability by documenting why `redrawRafId` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
redrawRafId: null as number | null,

    /**
   * Documents the object literal property `canvasMetrics` (canvasMetrics: null as { w: number; h: number; dpr: number } | null).

   * Purpose: Supports maintainability by documenting why `canvasMetrics` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
canvasMetrics: null as { w: number; h: number; dpr: number } | null,

    /**
   * Documents the object literal property `openRouterToolGroups` (openRouterToolGroups: [...OPENROUTER_TOOL_GROUPS] as { id: string; label: string }[]).

   * Purpose: Supports maintainability by documenting why `openRouterToolGroups` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
openRouterToolGroups: [...OPENROUTER_TOOL_GROUPS] as { id: string; label: string }[],
    /**
   * Documents the object literal property `enabledToolGroups` (enabledToolGroups: new Set<string>(OPENROUTER_TOOL_GROUPS.map((g) => g.id))).

   * Purpose: Supports maintainability by documenting why `enabledToolGroups` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enabledToolGroups: new Set<string>(OPENROUTER_TOOL_GROUPS.map((g) => g.id)),
    /**
   * Documents the object literal property `toolInvocationCounts` (toolInvocationCounts: Object.fromEntries(OPENROUTER_TOOL_GROUPS.map((g) => [g.id, 0])) as Record< string, number >).

   * Purpose: Supports maintainability by documenting why `toolInvocationCounts` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toolInvocationCounts: Object.fromEntries(OPENROUTER_TOOL_GROUPS.map((g) => [g.id, 0])) as Record<
    string,
    number
  >,
    /**
   * Documents the object literal property `runButtonOn` (runButtonOn: false).

   * Purpose: Supports maintainability by documenting why `runButtonOn` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
runButtonOn: false,
    /**
   * Documents the object literal property `useEventDrivenConsultation` (useEventDrivenConsultation: true).

   * Purpose: Supports maintainability by documenting why `useEventDrivenConsultation` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
useEventDrivenConsultation: true,
    /**
   * Documents the object literal property `eventDrivenInitialConsultationDone` (eventDrivenInitialConsultationDone: false).

   * Purpose: Supports maintainability by documenting why `eventDrivenInitialConsultationDone` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
eventDrivenInitialConsultationDone: false,
    /**
   * Documents the object literal property `precomputedAiOrders` (precomputedAiOrders: null as MovementOrder[] | null).

   * Purpose: Supports maintainability by documenting why `precomputedAiOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiOrders: null as MovementOrder[] | null,
    /**
   * Documents the object literal property `precomputedAiRangedOrders` (precomputedAiRangedOrders: null as { unitId: string; targetH3Index: string }[] | null).

   * Purpose: Supports maintainability by documenting why `precomputedAiRangedOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiRangedOrders: null as { unitId: string; targetH3Index: string }[] | null,
    /**
   * Documents the object literal property `precomputedAiEmbarkOrders` (precomputedAiEmbarkOrders: null as EmbarkOrder[] | null).

   * Purpose: Supports maintainability by documenting why `precomputedAiEmbarkOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiEmbarkOrders: null as EmbarkOrder[] | null,
    /**
   * Documents the object literal property `precomputedAiStrategy` (precomputedAiStrategy: null as string | null).

   * Purpose: Supports maintainability by documenting why `precomputedAiStrategy` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedAiStrategy: null as string | null,
    /**
   * Documents the object literal property `precomputedToolInvocationCounts` (precomputedToolInvocationCounts: null as Record<string, number> | null).

   * Purpose: Supports maintainability by documenting why `precomputedToolInvocationCounts` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
precomputedToolInvocationCounts: null as Record<string, number> | null,
    /**
   * Documents the object literal property `backgroundRequestInFlight` (backgroundRequestInFlight: false).

   * Purpose: Supports maintainability by documenting why `backgroundRequestInFlight` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
backgroundRequestInFlight: false,
    /**
   * Documents the object literal property `readyRequestInFlight` (readyRequestInFlight: false).

   * Purpose: Supports maintainability by documenting why `readyRequestInFlight` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
readyRequestInFlight: false,
    /**
   * Documents the object literal property `readyBtnAiWaitStartTime` (readyBtnAiWaitStartTime: null as number | null).

   * Purpose: Supports maintainability by documenting why `readyBtnAiWaitStartTime` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
readyBtnAiWaitStartTime: null as number | null,
    /**
   * Documents the object literal property `readyBtnAiWaitIntervalId` (readyBtnAiWaitIntervalId: null as ReturnType<typeof setInterval> | null).

   * Purpose: Supports maintainability by documenting why `readyBtnAiWaitIntervalId` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
readyBtnAiWaitIntervalId: null as ReturnType<typeof setInterval> | null,
    /**
   * Documents the object literal property `openRouterGameCost` (openRouterGameCost: 0).

   * Purpose: Supports maintainability by documenting why `openRouterGameCost` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
openRouterGameCost: 0,
    /**
   * Documents the object literal property `toastHideTimer` (toastHideTimer: null as ReturnType<typeof setTimeout> | null).

   * Purpose: Supports maintainability by documenting why `toastHideTimer` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toastHideTimer: null as ReturnType<typeof setTimeout> | null,
    /**
   * Documents the object literal property `aiStrategyToastHideTimer` (aiStrategyToastHideTimer: null as ReturnType<typeof setTimeout> | null).

   * Purpose: Supports maintainability by documenting why `aiStrategyToastHideTimer` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
aiStrategyToastHideTimer: null as ReturnType<typeof setTimeout> | null,
    /**
   * Documents the object literal property `lastAppliedMapInteractionCursor` (lastAppliedMapInteractionCursor: '').

   * Purpose: Supports maintainability by documenting why `lastAppliedMapInteractionCursor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
lastAppliedMapInteractionCursor: '',
};
