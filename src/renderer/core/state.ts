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
  TacticalOpponentPlanPayload,
  TacticalPendingMarchRow,
} from '../../shared/ipcTypes';
import type { RangedResolutionShotLine } from '../../shared/rangedResolutionShotLines';
import type { TacticalAnnihilationOutcomeKind } from '../../shared/tacticalAnnihilation';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { OPENROUTER_TOOL_GROUPS } from './constants';
import type { HoverRoutePreviewState, ResolutionMove, ResolutionPlaybackMove } from './types';
import type { BuildQueueTemplateRow } from '../gameplay/buildQueueMultiSelect';

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
   * When true, resolution playback elapsed stays at 0 until tactical Ready clears it and resets `startTime` after IPC.
   *
   * Purpose: Prevents `requestAnimationFrame` from advancing the movement timeline during `await getGameState` and
   * terrain refresh while the canvas is not yet showing the committed frame.
   * When to use: Only tactical `commitHumanTacticalDraftOrders` success path; omit for strategic Ready animations.
   * Expected outcome: Hop-free snapshot swap without consuming the movement segment before the first visible paint.
   * Exceptions: None.
   */
tacticalDeferResolutionClock?: boolean;
    /**
   * Sub-units copied at tactical Ready commit time (pre-commit snapshot) for resolution march playback lookup only.
   *
   * Purpose: `buildResolutionPlaybackMoves` needs `player`/`unitType` per `unitId`; the live `tacticalBattleSnapshot` is
   * swapped to the post-beat row set before animation runs, so units removed by ranged/melee in the same beat would
   * otherwise vanish from the map and drop their march segments from playback.
   * When to use: Tactical `commitHumanTacticalDraftOrders` path when arming `resolutionMoveAnimation` with march moves.
   * Expected outcome: Merged with current snapshot rows so movers still resolve for lines and glides until the anim ends.
   * Exceptions: None.
   */
tacticalMarchPlaybackUnits?: GameStateSnapshot['units'];
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
   * Hex-to-hex ranged connectors drawn during the ranged lightning playback window.
   *
   * Purpose: Carries IPC `rangedResolutionShotLines` for strategic Ready and tactical commit until the anim ends.
   * When to use: Set when arming `resolutionMoveAnimation`; drawn only while `inRangedLightning`.
   * Expected outcome: Deduped pairs; cleared when anim is nulled.
   * Exceptions: None.
   */
  rangedResolutionShotLines?: RangedResolutionShotLine[];
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
   * Documents the object literal property `tacticalOpponentDraft` (tacticalOpponentDraft: null as TacticalOpponentPlanPayload | null).

   * Purpose: Holds the latest buffered opponent tactical plan from `requestAiOrders` until tactical Ready commits it with human drafts.
   * When to use: Written on successful tactical AI consultation; cleared on successful Ready commit, tactical exit, or session stash.
   * Expected outcome: Null when no plan buffered yet or after commit; normalized arrays when set.
   * Exceptions: None.
   */
tacticalOpponentDraft: null as TacticalOpponentPlanPayload | null,
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

   * Purpose: Separates a tactical planning beat from the window while an advance-turn request and an optional opponent-order request are in flight.
   * When to use: `true` while the human may press Advance. Exit Battle also requires this flag, and beat playback disables that control on its own. `false` while `performTacticalAdvanceTurn` waits on IPC and optional background `requestAiOrders`.
   * Expected outcome: `#tactical-exit-btn` stays disabled when this flag is `false` and a tactical snapshot is active. Beat playback disables that same control while this flag stays `true`.
   * Exceptions: Reconciling snapshots or ending tactical always resets this to `true` once the renderer returns to a coherent tactical or strategic mode.
   */
tacticalPhasePlanning: true,
    /**
   * Documents the object literal property `tacticalAnnihilationOutcomeDialog` (tacticalAnnihilationOutcomeDialog: null as TacticalAnnihilationOutcomeKind | null).

   * Purpose: While non-null, the tactical annihilation win/loss modal is shown and the HUD exit control stays hidden until the player confirms `Exit Battle`.
   * When to use: Set when `getTacticalAnnihilationOutcome` is terminal during tactical planning; cleared on acknowledged exit, new game, or strategic reconciliation that drops the tactical session.
   * Expected outcome: Blocks Ready and map interaction (via `setMainUIControlsEnabled`) until dismissal; mirrors strategic `updateGameOverUI` message strings for win/loss.
   * Exceptions: None; keep `null` whenever no tactical snapshot exists.
   */
tacticalAnnihilationOutcomeDialog: null as TacticalAnnihilationOutcomeKind | null,
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
   * Ordered res1 hex ids controlled by the build-popup multi-selection (insertion order).
   *
   * Purpose: Keeps production-hex selection independent from unit selection and the scalar map hex.
   * When to use: Build-entry button chrome, Shift-toggle policy, and multi-hex popup rendering.
   * Expected outcome: Append on add and filter on remove preserve insertion order; the last entry is the
   * deselect re-anchor. Plain click replaces the set and popup close clears it.
   * Exceptions: Only build-entry button interactions may add or remove members.
   */
selectedBuildHexH3s: [] as string[],
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
   * Epoch milliseconds when `selectedUnitIdsAtMouseDown` was last copied from the live selection. `0` means no gesture is open.
   *
   * Purpose: Lets the second press of a double-click keep the units the player had selected instead of resnapshotting whatever the first click selected.
   * When to use: Written by the main-map pointer-down listener. Reset to `0` everywhere the snapshot array is cleared.
   * Expected outcome: A press inside the gesture window leaves the snapshot array untouched.
   * Exceptions: None.
   */
gestureSelectionSnapshotAtMs: 0,
    /**
   * Client X of the press that took the current gesture snapshot.
   *
   * Purpose: A second press far from this point is a new click, not the second half of a double-click, so the snapshot must be retaken.
   * When to use: Written beside `gestureSelectionSnapshotAtMs`.
   * Expected outcome: Meaningless while `gestureSelectionSnapshotAtMs` is `0`.
   * Exceptions: None.
   */
gestureSelectionAnchorClientX: 0,
    /**
   * Client Y of the press that took the current gesture snapshot.
   *
   * Purpose: Pairs with `gestureSelectionAnchorClientX` for the double-click distance check.
   * When to use: Written beside `gestureSelectionSnapshotAtMs`.
   * Expected outcome: Meaningless while `gestureSelectionSnapshotAtMs` is `0`.
   * Exceptions: None.
   */
gestureSelectionAnchorClientY: 0,
    /**
   * True while Shift is held as the multi-select modifier.
   *
   * Purpose: Hides committed paths and hover previews, and switches the stack callout from Select All to Add All / Remove All.
   * When to use: Set on Shift keydown, cleared on Shift keyup and window blur. Clicks also read `event.shiftKey`.
   * Expected outcome: `false` whenever Shift is up and the window is focused.
   * Exceptions: None.
   */
shiftKeyActive: false,
    /**
   * Documents the object literal property `pendingSelectTimeout` (pendingSelectTimeout: null as ReturnType<typeof setTimeout> | null).

   * Purpose: Supports maintainability by documenting why `pendingSelectTimeout` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingSelectTimeout: null as ReturnType<typeof setTimeout> | null,
    /**
   * Timer that will open the stack callout after a single click, or `null` when no open is waiting.
   *
   * Purpose: The callout is layered above the map, so opening it on the first click would swallow the second click of a double-click. Waiting out the single-select delay lets a double-click on a stack icon plan an order instead.
   * When to use: Written only by `scheduleDeferredStackCallout`; cleared by `clearDeferredStackCalloutTimer`.
   * Expected outcome: The callout appears only if this timer is allowed to fire.
   * Exceptions: None.
   */
pendingStackCalloutTimeout: null as ReturnType<typeof setTimeout> | null,
    /**
   * Client X of the click that scheduled the pending stack callout.
   *
   * Purpose: A press away from this point means the player moved on, so the popup must not still appear there; a press on the same point is the second half of a double-click and must leave it scheduled.
   * When to use: Written only by `scheduleDeferredStackCallout`; read only by `clearDeferredStackCalloutTimerForPressAway`.
   * Expected outcome: Meaningless while `pendingStackCalloutTimeout` is `null`.
   * Exceptions: None.
   */
pendingStackCalloutAnchorClientX: 0,
    /**
   * Client Y of the click that scheduled the pending stack callout.
   *
   * Purpose: Pairs with `pendingStackCalloutAnchorClientX` for the press-away distance check.
   * When to use: Written only by `scheduleDeferredStackCallout`; read only by `clearDeferredStackCalloutTimerForPressAway`.
   * Expected outcome: Meaningless while `pendingStackCalloutTimeout` is `null`.
   * Exceptions: None.
   */
pendingStackCalloutAnchorClientY: 0,
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
   * Documents the object literal property `pendingEmbarkOrders` (pendingEmbarkOrders: [] as EmbarkOrder[]).

   * Purpose: Queues human sealift embark drafts as tactical sub-unit pairs until tactical Ready commits them (strategic `updateSealiftSlot` is blocked during tactical battles).
   * When to use: Stack callout sealift controls while `tacticalBattleSnapshot` is set; clear on tactical Ready commit, exit, stash, or new game.
   * Expected outcome: Each row assigns one land sub-unit id to one naval sub-unit id co-located on the same res4 hex.
   * Exceptions: None.
   */
pendingEmbarkOrders: [] as EmbarkOrder[],
    /**
   * Documents the object literal property `tacticalPendingMarches` (tacticalPendingMarches: [] as TacticalPendingMarchRow[]).

   * Purpose: Holds human tactical march rows shown in the pending-orders sidebar while a tactical battle is active; distinct from strategic standing orders.
   * When to use: Append after tactical march validation succeeds (draft, before Ready); clear on tactical Ready commit, advance turn, exit, stash, or new game.
   * Expected outcome: Sidebar lists res4 destinations keyed by tactical sub-unit ids; optional `pathH3Indexes` and `cachedSegments` keep overlay polylines stable across beats.
   * Exceptions: None.
   */
tacticalPendingMarches: [] as TacticalPendingMarchRow[],
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
   * Cached lat/lng vertex loops for the range perimeter overlay (recomputed when signature changes).

   * Purpose: Avoids rebuilding H3 disks and edge chains every animation frame.
   * When to use: Read by `drawRangePerimeterOverlay`; written by `refreshRangePerimeterCacheIfNeeded`.
   * Expected outcome: `null` when mode inactive or selection invalid; otherwise one or more closed loops.
   * Exceptions: None.
   */
rangePerimeterLoopsLatLng: null as Array<Array<[number, number]>> | null,
    /**
   * Signature of mode, battle, and selection used to invalidate `rangePerimeterLoopsLatLng`.

   * Purpose: Detects when perimeter geometry must be recomputed.
   * When to use: Compared on each draw while ranged/strike planning is active.
   * Expected outcome: Changes when `selectedUnitIds`, mode flags, or enclosing battle hex changes.
   * Exceptions: None.
   */
rangePerimeterSignature: null as string | null,
    /**
   * Active `requestAnimationFrame` id for flowing range perimeter dashes, or null when idle.

   * Purpose: Ensures a single animation loop while planning mode is active.
   * When to use: Set by `ensureRangePerimeterAnimation` / `tickRangePerimeterAnimation`.
   * Expected outcome: Non-null only during ranged/strike mode without resolution playback.
   * Exceptions: None.
   */
rangePerimeterAnimationFrameId: null as number | null,
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
   * Ordered queue rows broadcast across selected production hexes while multi-select is active.
   *
   * Purpose: Preserves rows unavailable at some hexes even though those rows are filtered from persistence.
   * When to use: Selection size two or greater; clear when collapsing to one or closing the popup.
   * Expected outcome: Multi-edit controls remain stable across per-hex eligibility differences and async edits via stable `rowKey`.
   * Exceptions: Single-hex mode continues to read and mutate database entry ids directly.
   */
buildQueueTemplate: [] as BuildQueueTemplateRow[],
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
   * Documents the object literal property `res4CityOverlayLabelByH3` (res4CityOverlayLabelByH3: new Map<string, string>()).

   * Purpose: Caches reduced res4 city labels for the res4 city overlay while res4 hexes are visible.
   * When to use: Hydrated at startup from main-process IPC; read only from terrain overlay passes.
   * Expected outcome: Keys are res4 child indexes; values are display strings already tie-broken per naming rules.
   * Exceptions: None.
   */
res4CityOverlayLabelByH3: new Map<string, string>(),
    /**
   * Documents the object literal property `res4RoadRailSidesByH3` (res4RoadRailSidesByH3: new Map<string, { roadSides: boolean[]; railSides: boolean[] }>()).

   * Purpose: Caches road/rail side masks for res4 cells used by the res4 transport overlay renderer (gameplay truth: booleans).
   * When to use: Hydrated once per session from `game:getRes4RoadRailOverlays` alongside terrain overrides.
   * Expected outcome: Parallel boolean arrays match the exported JSON contract for each stored cell.
   * Exceptions: None.
   */
res4RoadRailSidesByH3: new Map<string, { roadSides: boolean[]; railSides: boolean[] }>(),
    /**
   * Documents the object literal property `res4TransportVectorOverlayRows` (res4TransportVectorOverlayRows: [] as Array<{ kind: 'road' | 'rail'; points: [number, number][] }>).

   * Purpose: Caches optional display-only transport polylines for the Leaflet vector overlay.
   * When to use: Hydrated from `game:getRes4TransportVectorOverlays`; consumed by the renderer Leaflet layer sync.
   * Expected outcome: Empty array when vector artifact is absent; populated rows use WGS84 `[lat, lng]` tuples.
   * Exceptions: None.
   */
res4TransportVectorOverlayRows: [] as Array<{ kind: 'road' | 'rail'; points: [number, number][] }>,
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
   * True while main deferred strategic post-resolution LLM consultation until playback notify + push.
   *
   * Purpose: Gates Ready + Run prefetch until `registerPostResolutionConsultationListener` receives a matching push.
   * When to use: Strategic Ready path when `ReadyResult.postResolutionConsultDeferred` is true until push clears this flag.
   * Expected outcome: Cleared when push applies or on new game / fatal mismatch recovery.
   * Exceptions: None.
   */
pendingDeferredStrategicPostResolutionConsult: false,
    /**
   * True while main deferred tactical post-beat LLM consultation until playback notify + push.
   *
   * Purpose: Mirrors `pendingDeferredStrategicPostResolutionConsult` for tactical event-driven Run commits.
   * When to use: Tactical commit returned `tacticalPostBeatConsultDeferred` until `registerPostTacticalBeatConsultationListener` fires.
   * Expected outcome: Cleared when tactical push applies or tactical session ends.
   * Exceptions: None.
   */
pendingDeferredTacticalPostBeatConsult: false,
    /**
   * True once the renderer has told main that resolution playback finished for the armed deferred consultation.
   *
   * Purpose: Main starts the deferred consultation on that notify, so the Ready "AI:" timer starts then rather than
   * during the playback animation.
   * When to use: Reset to false wherever a deferred strategic or tactical consultation is armed; set to true when its
   * playback-complete notify is sent. Read through `isDeferredResolutionConsultRunning`.
   * Expected outcome: Meaningful only while a deferred consultation is pending; a stale true value is ignored once the
   * pending flags clear.
   * Exceptions: None.
   */
deferredResolutionConsultNotifySent: false,
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

   * Purpose: Event-driven mode consults once up front, then only from post-resolution callbacks. This flag marks that the opening consult finished.
   * When to use: Set after a successful opening `requestAiOrders` or a successful post-resolution consult. Cleared on new game, Run off, mode switch, and abandoned deferred consult.
   * Expected outcome: While true, strategic Ready does not wait on a null precompute buffer and does not start a second model call for the same turn.
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
   * Documents the object literal property `precomputedAiMessage` (precomputedAiMessage: null as string | null).

   * Purpose: Caches the opponent taunt/threat from background `requestAiOrders` until Ready consumes it.
   * When to use: Set from a successful prefetch; cleared with the rest of precomputed AI state.
   * Expected outcome: Copied onto `GameReadyIpcPayload.precomputedAiMessage`.
   * Exceptions: None.
   */
precomputedAiMessage: null as string | null,
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
   * True from the first line of `handleReadyButtonClick` until its `finally` block (strategic Ready, tactical commit,
   * submit-orders path, or early exit after toasts/errors) so duplicate clicks are ignored and `#ready-btn` stays disabled.

   * Purpose: Single latch for the full async Ready pipeline including post-`ready` resolution playback setup.
   * When to use: Written only in `readyHandler`; read by `updateReadyButtonState` and the handler’s re-entry guard.
   * Expected outcome: At most one Ready completion run at a time; button reflects disabled state while true.
   * Exceptions: Cleared in `finally` even when the handler returns early (e.g. AI planning wait toast).
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
