import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type {
  AirStrikeAnimationMove,
  GameReadyIpcPayload,
  GameStateSnapshot,
  ReadyResult,
  RemovedUnitSnapshot,
} from '../../shared/ipcTypes';
import type { AiStrategyToastFields } from '../../shared/aiStrategyToastContent';
import type { MeleeInterceptModalOpenArgs, MeleeInterceptModalOutcome } from './meleeInterceptModal';
import type { ResolutionPlaybackMove } from '../core/types';
import type { MapToastOptions } from '../openRouter/openRouterUiHelpers';

/**
 * Documents the `ReadyHandlerDeps` interface as a named contract surface (export interface ReadyHandlerDeps).

 * Purpose: Supports maintainability by documenting why `ReadyHandlerDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ReadyHandlerDeps {
    /**
   * Specifies the contract for the `clearSidebarError` member (clearSidebarError: () => void;).

   * Contract: Describes stable behavior for callers of `clearSidebarError` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearSidebarError: () => void;
    /**
   * Specifies the contract for the `updateReadyButtonState` member (updateReadyButtonState: () => void;).

   * Contract: Describes stable behavior for callers of `updateReadyButtonState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateReadyButtonState: () => void;
    /**
   * Specifies the contract for the `updateOpenRouterToolCountLabels` member (updateOpenRouterToolCountLabels: () => void;).

   * Contract: Describes stable behavior for callers of `updateOpenRouterToolCountLabels` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateOpenRouterToolCountLabels: () => void;
    /**
   * Specifies the contract for the `showSidebarError` member (showSidebarError: (message: string) => void;).

   * Contract: Describes stable behavior for callers of `showSidebarError` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showSidebarError: (message: string) => void;
    /**
   * Specifies the contract for the `callReadyWithTimeout` member (callReadyWithTimeout: (payload: GameReadyIpcPayload) => Promise<ReadyResult>;).

   * Contract: Describes stable behavior for callers of `callReadyWithTimeout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
callReadyWithTimeout: (payload: GameReadyIpcPayload) => Promise<ReadyResult>;
    /**
   * Specifies the contract for the `refreshTacticalTerrainOverridesForRenderer` member (refreshTacticalTerrainOverridesForRenderer: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshTacticalTerrainOverridesForRenderer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshTacticalTerrainOverridesForRenderer: () => Promise<void>;
    /**
   * Specifies the contract for the `applyGameStateSnapshot` member (applyGameStateSnapshot: ( nextState: GameStateSnapshot, options: { refreshStandingOrders?: boolean; updateGameStateSidebarUi?: boolean;).

   * Contract: Describes stable behavior for callers of `applyGameStateSnapshot` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyGameStateSnapshot: (
    nextState: GameStateSnapshot,
    options: {
      refreshStandingOrders?: boolean;
      updateGameStateSidebarUi?: boolean;
      updateSelectionUi?: boolean;
      updateGameOverUi?: boolean;
      updateReadyButton?: boolean;
      refreshBuildPopup?: boolean;
      redraw?: boolean;
    }
  ) => Promise<void>;
    /**
   * Specifies the contract for the `buildAirStrikeOutboundPlaybackMoves` member (buildAirStrikeOutboundPlaybackMoves: (moves: AirStrikeAnimationMove[] | undefined) => ResolutionPlaybackMove[];).

   * Contract: Describes stable behavior for callers of `buildAirStrikeOutboundPlaybackMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildAirStrikeOutboundPlaybackMoves: (moves: AirStrikeAnimationMove[] | undefined) => ResolutionPlaybackMove[];
    /**
   * Specifies the contract for the `buildAirStrikeReturnPlaybackMoves` member (buildAirStrikeReturnPlaybackMoves: (moves: AirStrikeAnimationMove[] | undefined) => ResolutionPlaybackMove[];).

   * Contract: Describes stable behavior for callers of `buildAirStrikeReturnPlaybackMoves` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildAirStrikeReturnPlaybackMoves: (moves: AirStrikeAnimationMove[] | undefined) => ResolutionPlaybackMove[];
    /**
   * Specifies the contract for the `showAiStrategyToast` member (showAiStrategyToast: (content: AiStrategyToastFields) => void;).

   * Contract: Displays Message and Strategy sections from consultation IPC when either field is present.
   * When to use: Strategic Ready handler, tactical Ready handler, or other consultation merge sites.
   * Expected outcome: Non-empty fields become visible until timeout or dismiss; both empty hides a stale toast.
   * Exceptions: None.
   */
showAiStrategyToast: (content: AiStrategyToastFields) => void;
    /**
   * Specifies the contract for the `hideAiStrategyToast` member (hideAiStrategyToast: () => void;).

   * Contract: Describes stable behavior for callers of `hideAiStrategyToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideAiStrategyToast: () => void;
    /**
   * Specifies the contract for the `updateOpenRouterCostLabel` member (updateOpenRouterCostLabel: () => void;).

   * Contract: Describes stable behavior for callers of `updateOpenRouterCostLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateOpenRouterCostLabel: () => void;
    /**
   * Specifies the contract for the `appendOpenRouterLog` member (appendOpenRouterLog: (line: string, isError?: boolean, seatId?: string) => void;).

   * Contract: Describes stable behavior for callers of `appendOpenRouterLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
appendOpenRouterLog: (line: string, isError?: boolean, seatId?: string) => void;
    /**
   * Shows the lower-right map toast.
   *
   * Contract: Same behavior as `showMapToast` in `openRouterUiHelpers.ts`, including unit flags for named loss victims.
   * When to use: For turn update summaries and Ready-flow notices.
   * Expected outcome: The toast replaces any visible toast and hides after the standard duration.
   * Exceptions: None.
   */
showMapToast: (message: string, options?: MapToastOptions) => void;
    /**
   * Specifies the contract for the `getVisibleHexSet` member (getVisibleHexSet: (state: GameStateSnapshot | null) => Set<string>;).

   * Contract: Describes stable behavior for callers of `getVisibleHexSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getVisibleHexSet: (state: GameStateSnapshot | null) => Set<string>;
    /**
   * Specifies the contract for the `buildKillToastFormatterBundle` member (buildKillToastFormatterBundle: ( state: GameStateSnapshot, removedUnits?: RemovedUnitSnapshot[], tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[] ) => { formatKillLine: (entry: { victimId: string;).

   * Contract: Describes stable behavior for callers of `buildKillToastFormatterBundle` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
buildKillToastFormatterBundle: (
    state: GameStateSnapshot,
    removedUnits?: RemovedUnitSnapshot[],
    tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[],
    killLabelUnits?: readonly { id: string; unitType: string; displayOrder?: number }[]
  ) => { formatKillLine: (entry: KillEdge) => string; formatUnitName: (unitId: string) => string };
    /**
   * Specifies the contract for the `formatUnknownBattleAnnouncement` member (formatUnknownBattleAnnouncement: (continentNames: string[]) => string;).

   * Contract: Describes stable behavior for callers of `formatUnknownBattleAnnouncement` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatUnknownBattleAnnouncement: (continentNames: string[]) => string;
    /**
   * Specifies the contract for the `tickResolutionMoveAnimation` member (tickResolutionMoveAnimation: () => void;).

   * Contract: Describes stable behavior for callers of `tickResolutionMoveAnimation` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
tickResolutionMoveAnimation: () => void;
    /**
   * Specifies the contract for the `clearPendingTacticalOrders` member (clearPendingTacticalOrders: () => void;).

   * Contract: Describes stable behavior for callers of `clearPendingTacticalOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearPendingTacticalOrders: () => void;
    /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHumanStandingOrders: () => Promise<void>;
    /**
   * Specifies the contract for the `updateGameStateSidebar` member (updateGameStateSidebar: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `updateGameStateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatePendingOrdersSidebar: () => void;
    /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateRangedSidebar: () => void;
    /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSidebar: () => void;
    /**
   * Specifies the contract for the `updateGameOverUI` member (updateGameOverUI: (state: GameStateSnapshot) => void;).

   * Contract: Describes stable behavior for callers of `updateGameOverUI` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameOverUI: (state: GameStateSnapshot) => void;
    /**
   * Specifies the contract for the `startBackgroundRequestIfAllowed` member (startBackgroundRequestIfAllowed: () => void;).

   * Contract: Describes stable behavior for callers of `startBackgroundRequestIfAllowed` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
startBackgroundRequestIfAllowed: () => void;
    /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).

   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  redraw: () => void;
    /**
   * Specifies the contract for the `buildMeleeInterceptHexPopupHtml` member (buildMeleeInterceptHexPopupHtml: (h3Index: string) => Promise<string>;).

   * Contract: Tooltip-equivalent HTML for a strategic hex used in the melee intercept modal.
   * When to use: Each candidate row while the modal is open.
   * Expected outcome: Safe HTML suitable for `innerHTML` in a table cell.
   * Exceptions: None.
   */
buildMeleeInterceptHexPopupHtml: (h3Index: string) => Promise<string>;
    /**
   * Specifies the contract for the `openMeleeInterceptModal` member (openMeleeInterceptModal: (args: MeleeInterceptModalOpenArgs) => Promise<MeleeInterceptModalOutcome>;).

   * Contract: Blocks until the player chooses Fight (with selection) or Ignore (or Escape/backdrop).
   * When to use: Only when ready returned `awaitingMeleeDecision`.
   * Expected outcome: Outcome feeds `resolveMeleeIntercept`.
   * Exceptions: None.
   */
openMeleeInterceptModal: (args: MeleeInterceptModalOpenArgs) => Promise<MeleeInterceptModalOutcome>;
    /**
   * Specifies the contract for the `startTacticalBattleFromInterceptHex` member (startTacticalBattleFromInterceptHex: (h3Index: string) => Promise<void>;).

   * Contract: Enters tactical combat for the given strategic hex after strategic resolution completes.
   * When to use: When `ReadyResult.tacticalAutoStartStrategicH3Index` is set after Fight.
   * Expected outcome: Same UX as magnifier tactical entry; failures surface as map toasts only.
   * Exceptions: None.
   */
startTacticalBattleFromInterceptHex: (h3Index: string) => Promise<void>;
    /**
   * Opens the tactical annihilation win/loss modal when a post-commit snapshot leaves at least one side with zero sub-units.
   *
   * Contract: Optional; renderer supplies the same hook used after tactical draw updates.
   * When to use: Immediately after tactical Ready successfully commits march drafts to the main snapshot.
   * Expected outcome: Modal appears when the roster is terminal; battle exit IPC runs only after the player confirms.
   * Exceptions: None.
   */
scheduleTacticalAnnihilationExit?: () => void;
    /**
   * Refreshes Exit Battle from the current battle snapshot and beat playback.
   *
   * Contract: Tactical Ready stores playback before later awaits, and Exit Battle must be disabled before those awaits return.
   * When to use: Immediately after a tactical commit stores beat playback, while a later redraw still refreshes the same control.
   * Expected outcome: The in-battle Exit Battle control is disabled while a battle snapshot and beat playback are both set. Does not change `S.tacticalPhasePlanning`.
   * Exceptions: Optional. Callers that omit it leave the control unchanged until the next redraw.
   */
syncTacticalExitButton?: () => void;
}
