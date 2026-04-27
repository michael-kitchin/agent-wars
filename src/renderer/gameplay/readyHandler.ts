import type {
  AirStrikeAnimationMove,
  GameReadyIpcPayload,
  GameStateSnapshot,
  ReadyResult,
  RemovedUnitSnapshot,
  TacticalCommitResolutionPlayback,
} from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/readyTypes';
import type { MeleeInterceptModalOpenArgs, MeleeInterceptModalOutcome } from './meleeInterceptModal';
import { buildTacticalSubUnitKillLabelOverlay } from './sidebarSupport';
import { buildTurnUpdateBullets } from './turnUpdateSummary';
import { readTacticalBattlesInterceptPromptEnabled } from './tacticalBattlePromptPreference';
import { composeResolutionMapToastBullets } from '../../shared/orderPreviewBlockingCopy';
import { tacticalKillEdgesForStrategicStyleTurnUpdate } from '../../shared/tacticalToastKillSlice';
import type { ResolutionMove, ResolutionPlaybackMove } from '../core/types';
import { rendererSharedState as S } from '../core/state';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';
import { isWaitingForPrecomputedAiOrders } from '../openRouter/aiPlanningState';

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
   * Specifies the contract for the `refreshRes4TerrainOverridesForRenderer` member (refreshRes4TerrainOverridesForRenderer: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshRes4TerrainOverridesForRenderer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshRes4TerrainOverridesForRenderer: () => Promise<void>;
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
   * Specifies the contract for the `showAiStrategyToast` member (showAiStrategyToast: (content: string) => void;).

   * Contract: Describes stable behavior for callers of `showAiStrategyToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showAiStrategyToast: (content: string) => void;
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
   * Specifies the contract for the `appendOpenRouterLog` member (appendOpenRouterLog: (line: string, isError?: boolean) => void;).

   * Contract: Describes stable behavior for callers of `appendOpenRouterLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
appendOpenRouterLog: (line: string, isError?: boolean) => void;
    /**
   * Specifies the contract for the `showMapToast` member (showMapToast: (message: string, options?: { isError?: boolean }) => void;).

   * Contract: Describes stable behavior for callers of `showMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showMapToast: (message: string, options?: { isError?: boolean }) => void;
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
    tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[]
  ) => { formatKillLine: (entry: { victimId: string; killerIds: string[] }) => string; formatUnitName: (unitId: string) => string };
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

   * Contract: Tooltip-equivalent HTML for a res1 hex used in the melee intercept modal.
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

   * Contract: Enters tactical combat for the given res1 hex after strategic resolution completes.
   * When to use: When `ReadyResult.tacticalAutoStartRes1H3Index` is set after Fight.
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
}

/**
 * Documents the `ReadyPayloadBuildArgs` interface as a named contract surface (interface ReadyPayloadBuildArgs).

 * Purpose: Supports maintainability by documenting why `ReadyPayloadBuildArgs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface ReadyPayloadBuildArgs {
    /**
   * Specifies the contract for the `enabledToolGroupsPayload` member (enabledToolGroupsPayload: string[];).

   * Contract: Describes stable behavior for callers of `enabledToolGroupsPayload` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
enabledToolGroupsPayload: string[];
    /**
   * Specifies the contract for the `useEventDriven` member (useEventDriven: boolean;).

   * Contract: Describes stable behavior for callers of `useEventDriven` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
useEventDriven: boolean;
    /**
   * Specifies the contract for the `usePrecomputed` member (usePrecomputed: boolean;).

   * Contract: Describes stable behavior for callers of `usePrecomputed` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
usePrecomputed: boolean;
    /**
   * Specifies the contract for the `aiPlanningRunEnabled` member (aiPlanningRunEnabled?: boolean;).

   * Contract: Mirrors the Run/AI planning toggle into ready and resolve payloads.
   * When to use: Ready and melee-intercept resolve IPC.
   * Expected outcome: Defaults to renderer `runButtonOn` when omitted.
   * Exceptions: None.
   */
aiPlanningRunEnabled?: boolean;
}

/**
 * Defines the `buildReadyPayload` function shape (function buildReadyPayload(args: ReadyPayloadBuildArgs): GameReadyIpcPayload).

 * Purpose: Supports maintainability by documenting why `buildReadyPayload` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildReadyPayload(args: ReadyPayloadBuildArgs): GameReadyIpcPayload {
  const { enabledToolGroupsPayload, useEventDriven, usePrecomputed, aiPlanningRunEnabled } = args;
  const base: GameReadyIpcPayload = {
    enabledToolGroups: enabledToolGroupsPayload,
    aiPlanningRunEnabled: aiPlanningRunEnabled ?? S.runButtonOn,
  };
  if (useEventDriven) {
    base.useEventDrivenConsultation = true;
  }
  if (!usePrecomputed) return base;
  base.precomputedAiOrders = S.precomputedAiOrders ?? [];
  base.precomputedAiRangedOrders = S.precomputedAiRangedOrders ?? [];
  base.precomputedAiEmbarkOrders = S.precomputedAiEmbarkOrders ?? [];
  base.precomputedAiStrategy = S.precomputedAiStrategy ?? undefined;
  return base;
}

/**
 * Documents the `CombatVisibilityClassification` interface as a named contract surface (interface CombatVisibilityClassification).

 * Purpose: Supports maintainability by documenting why `CombatVisibilityClassification` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface CombatVisibilityClassification {
    /**
   * Specifies the contract for the `unknownCombatHexes` member (unknownCombatHexes: string[];).

   * Contract: Describes stable behavior for callers of `unknownCombatHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCombatHexes: string[];
    /**
   * Specifies the contract for the `unknownCasualtyHexes` member (unknownCasualtyHexes: string[];).

   * Contract: Describes stable behavior for callers of `unknownCasualtyHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownCasualtyHexes: string[];
    /**
   * Specifies the contract for the `knownVictimIds` member (knownVictimIds: Set<string>;).

   * Contract: Describes stable behavior for callers of `knownVictimIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
knownVictimIds: Set<string>;
    /**
   * Specifies the contract for the `unknownVictimIds` member (unknownVictimIds: string[];).

   * Contract: Describes stable behavior for callers of `unknownVictimIds` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unknownVictimIds: string[];
}

/**
 * Defines the `deriveCombatVisibilityClassification` function shape (function deriveCombatVisibilityClassification().

 * Purpose: Supports maintainability by documenting why `deriveCombatVisibilityClassification` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function deriveCombatVisibilityClassification(
  readyResult: ReadyResult,
  visibleHexes: ReadonlySet<string>
): CombatVisibilityClassification {
  const allKills = readyResult.kills ?? [];
  const anyCombatResolved =
    (readyResult.airStrikeHexes?.length ?? 0) > 0 ||
    (readyResult.airStrikeCasualtyHexes?.length ?? 0) > 0 ||
    (readyResult.rangedCombatHexes?.length ?? 0) > 0 ||
    (readyResult.rangedCasualtyHexes?.length ?? 0) > 0 ||
    (readyResult.meleeCombatHexes?.length ?? 0) > 0 ||
    (readyResult.meleeCasualtyHexes?.length ?? 0) > 0 ||
    (readyResult.combatHexes?.length ?? 0) > 0 ||
    (readyResult.casualtyHexes?.length ?? 0) > 0 ||
    allKills.length > 0 ||
    (readyResult.removedUnits?.length ?? 0) > 0;
  if (anyCombatResolved) {
    // In the two-side game flow, any resolved battle necessarily involves the human side.
    // Treat all battle outcomes as known for turn updates and suppress unknown-battle toasts.
    const knownVictimIds = new Set<string>([
      ...allKills.map((k) => k.victimId),
      ...(readyResult.removedUnits ?? []).map((u) => u.id),
    ]);
    return {
      unknownCombatHexes: [],
      unknownCasualtyHexes: [],
      knownVictimIds,
      unknownVictimIds: [],
    };
  }
  const removedById = new Map<string, RemovedUnitSnapshot>((readyResult.removedUnits ?? []).map((u) => [u.id, u] as const));
  const friendlyInvolvedKillVictimIds = new Set<string>(
    allKills
      .filter((k) => {
        const victim = removedById.get(k.victimId);
        const killerIsFriendly = k.killerIds.some((id) => id.startsWith('human-'));
        const victimIsFriendly = victim?.player === 'human';
        return killerIsFriendly || victimIsFriendly;
      })
      .map((k) => k.victimId)
  );
  const friendlyInvolvedCombatHexes = new Set(
    [...friendlyInvolvedKillVictimIds]
      .map((victimId) => removedById.get(victimId)?.h3Index ?? null)
      .filter((h3): h3 is string => typeof h3 === 'string')
  );
  const friendlyPlannedCombatHexes = new Set<string>([
    ...(readyResult.humanMoves ?? []).flatMap((move) => [move.fromH3Index, move.toH3Index]),
    ...S.pendingRangedAttacks.map((order) => order.targetH3Index),
    ...S.pendingAirStrikes.map((order) => order.targetH3Index),
    ...(readyResult.airStrikeMoves ?? [])
      .filter((move) => move.player === 'human')
      .flatMap((move) => [move.fromH3Index, move.targetH3Index]),
    ...(readyResult.removedUnits ?? []).filter((unit) => unit.player === 'human').map((unit) => unit.h3Index),
  ]);
  for (const h3 of friendlyPlannedCombatHexes) friendlyInvolvedCombatHexes.add(h3);
  const knownHumanAirStrikeTargetHexes = new Set(
    (readyResult.airStrikeMoves ?? []).filter((move) => move.player === 'human').map((move) => move.targetH3Index)
  );
  const unknownCombatHexes = [
    ...(readyResult.airStrikeHexes ?? []).filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3)),
    ...(readyResult.rangedCombatHexes ?? []),
    ...(readyResult.meleeCombatHexes ?? []),
    ...(readyResult.combatHexes ?? []),
  ].filter((h3, idx, arr) => arr.indexOf(h3) === idx && !visibleHexes.has(h3) && !friendlyInvolvedCombatHexes.has(h3));
  const unknownCasualtyHexes = [
    ...(readyResult.airStrikeCasualtyHexes ?? []).filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3)),
    ...(readyResult.rangedCasualtyHexes ?? []),
    ...(readyResult.meleeCasualtyHexes ?? []),
    ...(readyResult.casualtyHexes ?? []),
  ].filter((h3, idx, arr) => arr.indexOf(h3) === idx && !visibleHexes.has(h3) && !friendlyInvolvedCombatHexes.has(h3));
  const knownVictimIds = new Set((readyResult.removedUnits ?? []).filter((u) => visibleHexes.has(u.h3Index)).map((u) => u.id));
  for (const removed of readyResult.removedUnits ?? []) {
    if (removed.player === 'human') knownVictimIds.add(removed.id);
  }
  for (const victimId of friendlyInvolvedKillVictimIds) knownVictimIds.add(victimId);
  const unknownVictimIds = allKills
    .map((k) => k.victimId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx)
    .filter((id) => {
      const removed = removedById.get(id);
      if (removed?.player === 'human') return false;
      return !friendlyInvolvedKillVictimIds.has(id);
    })
    .filter((id) => {
      const removed = removedById.get(id);
      return removed ? !visibleHexes.has(removed.h3Index) : false;
    });
  return { unknownCombatHexes, unknownCasualtyHexes, knownVictimIds, unknownVictimIds };
}

/**
 * Adapts tactical Ready playback into a `ReadyResult`-shaped slice so kill lines and visibility reuse strategic helpers.
 *
 * Purpose: Avoids a second toast pipeline in the renderer while tactical combat remains snapshot-simulated on the main process.
 * When to use: Only after a successful `commitHumanTacticalDraftOrders` when `tacticalResolutionPlayback` is present.
 * Expected outcome: `deriveCombatVisibilityClassification` and `buildTurnUpdateBullets` see the same kill and casualty fields they expect from strategic Ready, including `kills` without air-strike edges (air stays on the air strike summary line).
 * Exceptions: None; omits optional arrays when empty to match typical `ReadyResult` payloads.
 */
function buildTacticalCommitReadyResultForToast(playback: TacticalCommitResolutionPlayback): ReadyResult {
  const killsByDirectFire = playback.killsByDirectFire ?? [];
  const killsByAirStrike = playback.killsByAirStrike ?? [];
  const killsByReturnFire = playback.killsByReturnFire ?? [];
  const killsWithoutAirStrike = tacticalKillEdgesForStrategicStyleTurnUpdate(playback);
  const kills = killsWithoutAirStrike.length > 0 ? killsWithoutAirStrike : undefined;
  const removedAll = [...(playback.rangedRemovedUnits ?? []), ...(playback.meleeRemovedUnits ?? [])];
  const airStrikeVictimIds = new Set(killsByAirStrike.map((k) => k.victimId));
  const rangedVictimIds = new Set(killsByDirectFire.map((k) => k.victimId));
  const airStrikeRemovedUnits = removedAll.filter((u) => {
    if (airStrikeVictimIds.has(u.id)) return true;
    if (u.player === 'human' && u.unitType === 'air' && !rangedVictimIds.has(u.id)) return true;
    return false;
  });
  return {
    success: true,
    kills,
    killsByDirectFire: killsByDirectFire.length > 0 ? killsByDirectFire : undefined,
    killsByAirStrike: killsByAirStrike.length > 0 ? killsByAirStrike : undefined,
    killsByReturnFire: killsByReturnFire.length > 0 ? killsByReturnFire : undefined,
    removedUnits: removedAll.length > 0 ? removedAll : undefined,
    humanMoves: playback.humanMoves,
    rangedCombatHexes: playback.rangedCombatHexes,
    rangedCasualtyHexes: playback.rangedCasualtyHexes,
    rangedRemovedUnits: playback.rangedRemovedUnits,
    airStrikeRemovedUnits: airStrikeRemovedUnits.length > 0 ? airStrikeRemovedUnits : undefined,
    infrastructureDestroyedEvents:
      playback.infrastructureDestroyedEvents && playback.infrastructureDestroyedEvents.length > 0
        ? playback.infrastructureDestroyedEvents
        : undefined,
    airStrikeAttemptCount: playback.airStrikeAttemptCount,
    meleeCombatHexes: playback.meleeCombatHexes?.length ? playback.meleeCombatHexes : undefined,
    meleeCasualtyHexes: playback.meleeCasualtyHexes?.length ? playback.meleeCasualtyHexes : undefined,
    meleeRemovedUnits: playback.meleeRemovedUnits?.length ? playback.meleeRemovedUnits : undefined,
  };
}

/**
 * Defines the `formatHexCount` function shape (function formatHexCount(label: string, count: number): string).

 * Purpose: Supports maintainability by documenting why `formatHexCount` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatHexCount(label: string, count: number): string {
  return `• ${label} at ${count.toLocaleString()} ${count === 1 ? 'hex' : 'hexes'}.`;
}

type CombatActivityFallbackSource = Pick<
  ReadyResult,
  'rangedCombatHexes' | 'rangedCasualtyHexes' | 'meleeCombatHexes' | 'meleeCasualtyHexes' | 'airStrikeCasualtyHexes'
>;

/**
 * Defines the `buildCombatActivityFallbackBullets` function shape (function buildCombatActivityFallbackBullets(readyResult: ReadyResult): string[]).

 * Purpose: Supports maintainability by documenting why `buildCombatActivityFallbackBullets` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildCombatActivityFallbackBullets(readyResult: CombatActivityFallbackSource): string[] {
  const bullets: string[] = [];
  const rangedHexCount = readyResult.rangedCombatHexes?.length ?? 0;
  if (rangedHexCount > 0) bullets.push(formatHexCount('Ranged engagements', rangedHexCount));
  const meleeHexCount = readyResult.meleeCombatHexes?.length ?? 0;
  if (meleeHexCount > 0) bullets.push(formatHexCount('Melee engagements', meleeHexCount));
  const casualtyHexCount =
    (readyResult.rangedCasualtyHexes?.length ?? 0) +
    (readyResult.meleeCasualtyHexes?.length ?? 0) +
    (readyResult.airStrikeCasualtyHexes?.length ?? 0);
  if (casualtyHexCount > 0) bullets.push(formatHexCount('Casualty outcomes', casualtyHexCount));
  return bullets;
}

/**
 * Defines the `handleReadyButtonClick` function shape (export async function handleReadyButtonClick(deps: ReadyHandlerDeps): Promise<void>).

 * Purpose: Supports maintainability by documenting why `handleReadyButtonClick` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function handleReadyButtonClick(deps: ReadyHandlerDeps): Promise<void> {
  if (!window.gameApi) return;
  if (S.gameState?.gameOver) return;
  if (S.readyRequestInFlight) return;
  if (S.tacticalAnnihilationOutcomeDialog != null) return;
  deps.clearSidebarError();
  S.readyRequestInFlight = true;
  S.toolInvocationCounts = Object.fromEntries(S.openRouterToolGroups.map((g) => [g.id, 0]));
  deps.updateOpenRouterToolCountLabels();
  deps.updateReadyButtonState();
  try {
    if (isWaitingForPrecomputedAiOrders()) {
      deps.startBackgroundRequestIfAllowed();
      deps.showMapToast('AI planning is still running. Ready will unlock once precomputed orders are available.', { isError: false });
      deps.updateReadyButtonState();
      return;
    }
    if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
      const commit = window.gameApi.commitHumanTacticalDraftOrders;
      if (!commit) {
        deps.showSidebarError('Tactical commit is not available in this build.');
        deps.updateReadyButtonState();
        return;
      }
      const movementOrders = S.tacticalPendingMarches.map((r) => ({ unitId: r.subUnitId, toH3Index: r.destinationH3Index }));
      const commitResult = (await commit({
        movementOrders,
        rangedAttacks: [...S.pendingRangedAttacks],
        airStrikes: [...S.pendingAirStrikes],
        ferryOrders: [...S.pendingFerryOrders],
        embarkOrders: [...S.pendingEmbarkOrders],
        ...(S.tacticalOpponentDraft ? { opponentTacticalDraft: S.tacticalOpponentDraft } : {}),
        useEventDrivenConsultation: S.useEventDrivenConsultation,
        aiPlanningRunEnabled: S.runButtonOn,
      })) as {
        success: boolean;
        reason?: string;
        tacticalBattle?: TacticalBattleSnapshot;
        tacticalResolutionPlayback?: TacticalCommitResolutionPlayback;
        tacticalMarchContinuations?: { subUnitId: string; destinationH3Index: string }[];
        tacticalOpponentPlan?: TacticalOpponentPlanPayload | null;
        committedOpponentTacticalDraft?: TacticalOpponentPlanPayload | null;
        toolInvocationCounts?: Record<string, number>;
        aiStrategy?: string;
      };
      if (!commitResult.success) {
        deps.showSidebarError(commitResult.reason ?? 'Tactical commit failed');
        deps.updateReadyButtonState();
        return;
      }
      const tacticalSubUnitsBeforeCommit = S.tacticalBattleSnapshot?.subUnits;
      const playback = commitResult.tacticalResolutionPlayback;
      const hasMoves =
        (playback?.humanMoves?.length ?? 0) > 0 || (playback?.opponentMoves?.length ?? 0) > 0;
      const hasRangedPlayback =
        (playback?.rangedCombatHexes?.length ?? 0) > 0 ||
        (playback?.rangedCasualtyHexes?.length ?? 0) > 0 ||
        (playback?.rangedRemovedUnits?.length ?? 0) > 0;
      const hasMeleePlayback =
        (playback?.meleeCombatHexes?.length ?? 0) > 0 ||
        (playback?.meleeCasualtyHexes?.length ?? 0) > 0 ||
        (playback?.meleeRemovedUnits?.length ?? 0) > 0 ||
        (playback?.killsByMelee?.length ?? 0) > 0;
      const hasKillPlayback =
        (playback?.killsByDirectFire?.length ?? 0) > 0 ||
        (playback?.killsByAirStrike?.length ?? 0) > 0 ||
        (playback?.killsByReturnFire?.length ?? 0) > 0 ||
        (playback?.killsByMelee?.length ?? 0) > 0;
      const needsResolutionPlayback = hasMoves || hasRangedPlayback || hasMeleePlayback || hasKillPlayback;
      // Start resolution playback before updating the tactical snapshot or awaiting IPC so no redraw can
      // paint post-commit cells while `resolutionMoveAnimation` is still null (avoids a one-frame teleport hop).
      // Defer the playback clock and the first rAF until after post-commit awaits so the movement segment is not
      // consumed invisibly during `getGameState` / terrain refresh (avoids a short initial glide, pause, then tail).
      if (playback && needsResolutionPlayback) {
        if (S.resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(S.resolutionMoveAnimationFrameId);
        S.resolutionMoveAnimationFrameId = null;
        S.resolutionMoveAnimation = {
          moves: [...playback.humanMoves, ...(playback.opponentMoves ?? [])],
          startTime: Date.now(),
          tacticalDeferResolutionClock: true,
          rangedCombatHexes: playback.rangedCombatHexes,
          rangedCasualtyHexes: playback.rangedCasualtyHexes,
          rangedRemovedUnits: playback.rangedRemovedUnits,
          meleeCombatHexes: playback.meleeCombatHexes?.length ? playback.meleeCombatHexes : undefined,
          meleeCasualtyHexes: playback.meleeCasualtyHexes?.length ? playback.meleeCasualtyHexes : undefined,
          meleeRemovedUnits: playback.meleeRemovedUnits?.length ? playback.meleeRemovedUnits : undefined,
        };
      }
      if (commitResult.tacticalBattle) {
        S.tacticalBattleSnapshot = commitResult.tacticalBattle;
      }
      if ('tacticalOpponentPlan' in commitResult) {
        S.tacticalOpponentDraft = commitResult.tacticalOpponentPlan ?? null;
      } else if ('committedOpponentTacticalDraft' in commitResult) {
        S.tacticalOpponentDraft = commitResult.committedOpponentTacticalDraft ?? null;
      }
      if (commitResult.aiStrategy) deps.showAiStrategyToast(commitResult.aiStrategy);
      else deps.hideAiStrategyToast();
      if (commitResult.toolInvocationCounts) {
        S.toolInvocationCounts = { ...S.toolInvocationCounts, ...commitResult.toolInvocationCounts };
        deps.updateOpenRouterToolCountLabels();
      }
      S.tacticalPendingMarches = commitResult.tacticalMarchContinuations?.length
        ? [...commitResult.tacticalMarchContinuations]
        : [];
      S.pendingRangedAttacks = [];
      S.pendingAirStrikes = [];
      S.pendingFerryOrders = [];
      S.pendingEmbarkOrders = [];
      S.rangedModeActive = false;
      S.airStrikeModeActive = false;
      if (window.gameApi?.getGameState) {
        try {
          const refreshedStrategic = (await window.gameApi.getGameState()) as GameStateSnapshot;
          await deps.applyGameStateSnapshot(refreshedStrategic, {
            refreshStandingOrders: false,
            updateGameStateSidebarUi: false,
            updateSelectionUi: false,
            updateGameOverUi: false,
            updateReadyButton: false,
            refreshBuildPopup: false,
            redraw: false,
          });
        } catch (err) {
          console.error('tactical commit: failed to refresh strategic game state snapshot', err);
        }
      }
      if (playback && S.gameState && needsResolutionPlayback) {
        const tacticalReadySlice = buildTacticalCommitReadyResultForToast(playback);
        const visibleHexes = deps.getVisibleHexSet(S.gameState);
        const { unknownCombatHexes, unknownCasualtyHexes, knownVictimIds, unknownVictimIds } =
          deriveCombatVisibilityClassification(tacticalReadySlice, visibleHexes);
        const directFire = tacticalReadySlice.killsByDirectFire ?? [];
        const returnFire = tacticalReadySlice.killsByReturnFire ?? [];
        const allKills = tacticalReadySlice.kills ?? [];
        const directSet = new Set(directFire.map((k) => k.victimId));
        const returnSet = new Set(returnFire.map((k) => k.victimId));
        const meleeKills = allKills.filter((k) => !directSet.has(k.victimId) && !returnSet.has(k.victimId));
        const knownDirectFire = directFire.filter((k) => knownVictimIds.has(k.victimId));
        const knownReturnFire = returnFire.filter((k) => knownVictimIds.has(k.victimId));
        const knownMeleeKills = meleeKills.filter((k) => knownVictimIds.has(k.victimId));
        const killToastFormatter = deps.buildKillToastFormatterBundle(
          S.gameState,
          tacticalReadySlice.removedUnits,
          buildTacticalSubUnitKillLabelOverlay({
            subUnitsBeforeCommit: tacticalSubUnitsBeforeCommit,
            subUnitsAfterCommit: S.tacticalBattleSnapshot?.subUnits,
            removedUnits: tacticalReadySlice.removedUnits,
          })
        );
        const bullets = buildTurnUpdateBullets({
          readyResult: tacticalReadySlice as Parameters<typeof buildTurnUpdateBullets>[0]['readyResult'],
          knownDirectFire,
          knownReturnFire,
          knownMeleeKills,
          formatKillLine: killToastFormatter.formatKillLine,
          formatUnitName: killToastFormatter.formatUnitName,
        });
        const combatFallbackBullets = buildCombatActivityFallbackBullets(tacticalReadySlice);
        const updateBullets = composeResolutionMapToastBullets(bullets, combatFallbackBullets);
        if (updateBullets.length > 0) {
          const updateText = updateBullets.join('\n');
          deps.showMapToast(updateText, { isError: false });
          deps.appendOpenRouterLog(`Update: ${updateBullets.join(' | ')}`);
        }
        const hasUnknownBattle =
          unknownCombatHexes.length > 0 || unknownCasualtyHexes.length > 0 || unknownVictimIds.length > 0;
        if (hasUnknownBattle) {
          const unknownContinentNames: string[] = [];
          if (window.gameApi?.getHexContinentNames) {
            const unknownHexes = [...unknownCombatHexes, ...unknownCasualtyHexes].filter((h3, idx, arr) => arr.indexOf(h3) === idx);
            for (const h3 of unknownHexes) {
              const names = await window.gameApi.getHexContinentNames({ h3Index: h3 });
              for (const n of names) {
                if (!unknownContinentNames.includes(n)) unknownContinentNames.push(n);
              }
            }
          }
          deps.showMapToast(deps.formatUnknownBattleAnnouncement(unknownContinentNames), { isError: false });
        }
      }
      await deps.refreshRes4TerrainOverridesForRenderer();
      deps.updatePendingOrdersSidebar();
      deps.updateRangedSidebar();
      deps.updateSidebar();
      deps.updateGameStateSidebar(S.gameState);
      if (S.resolutionMoveAnimation?.tacticalDeferResolutionClock) {
        S.resolutionMoveAnimation.tacticalDeferResolutionClock = false;
        S.resolutionMoveAnimation.startTime = Date.now();
      }
      if (S.resolutionMoveAnimation && needsResolutionPlayback && S.resolutionMoveAnimationFrameId === null) {
        S.resolutionMoveAnimationFrameId = requestAnimationFrame(deps.tickResolutionMoveAnimation);
      }
      deps.redraw();
      deps.scheduleTacticalAnnihilationExit?.();
      if (S.runButtonOn) {
        const oppAlive = S.tacticalBattleSnapshot?.subUnits.some((u) => u.player === 'opponent') ?? false;
        if (oppAlive) deps.startBackgroundRequestIfAllowed();
      }
      deps.updateReadyButtonState();
      return;
    }
    const hasPendingDraftOrders =
      S.pendingRangedAttacks.length > 0 ||
      S.pendingAirStrikes.length > 0 ||
      S.pendingFerryOrders.length > 0;
    if (hasPendingDraftOrders) {
      const submitResult = (await window.gameApi.submitOrders({
        movementOrders: [],
        rangedAttacks: S.pendingRangedAttacks,
        airStrikes: S.pendingAirStrikes,
        ferryOrders: S.pendingFerryOrders,
      })) as { success: boolean; reason?: string };
      if (!submitResult.success) {
        deps.showSidebarError(submitResult.reason ?? 'Submit failed');
        deps.updateReadyButtonState();
        return;
      }
    }
    const enabledToolGroupsPayload = Array.from(S.enabledToolGroups).filter((id) => id !== 'events');
    const useEventDriven = S.useEventDrivenConsultation;
    const usePrecomputed = S.runButtonOn && S.precomputedAiOrders !== null;
    const cachedPrecomputedToolCounts = S.precomputedToolInvocationCounts
      ? { ...S.precomputedToolInvocationCounts }
      : null;
    const readyPayload = buildReadyPayload({
      enabledToolGroupsPayload,
      useEventDriven,
      usePrecomputed,
      aiPlanningRunEnabled: S.runButtonOn,
    });
    let readyResult = await deps.callReadyWithTimeout(readyPayload);
    if (!readyResult.success) {
      deps.showSidebarError(readyResult.reason ?? 'Ready failed');
      deps.updateReadyButtonState();
      return;
    }

    if (readyResult.awaitingMeleeDecision) {
      if (!window.gameApi.resolveMeleeIntercept) {
        deps.showSidebarError('Melee intercept resolve is not available in this build.');
        deps.updateReadyButtonState();
        return;
      }
      await deps.refreshRes4TerrainOverridesForRenderer();
      const pausedState = (await window.gameApi.getGameState()) as GameStateSnapshot;
      await deps.applyGameStateSnapshot(pausedState, {
        refreshStandingOrders: false,
        updateGameStateSidebarUi: false,
        updateSelectionUi: false,
        updateGameOverUi: false,
        updateReadyButton: false,
        refreshBuildPopup: false,
        redraw: false,
      });
      const outcome: MeleeInterceptModalOutcome = readTacticalBattlesInterceptPromptEnabled()
        ? await deps.openMeleeInterceptModal({
            candidates: readyResult.meleeInterceptCandidates ?? [],
            buildHexPopupHtml: deps.buildMeleeInterceptHexPopupHtml,
          })
        : { decision: 'ignore' };
      const resolveResult = await window.gameApi.resolveMeleeIntercept({
        meleeDecisionToken: readyResult.meleeDecisionToken ?? '',
        decision: outcome.decision,
        selectedH3Index: outcome.decision === 'fight' ? outcome.selectedH3Index : undefined,
        useEventDrivenConsultation: useEventDriven,
        aiPlanningRunEnabled: S.runButtonOn,
        enabledToolGroups: enabledToolGroupsPayload,
      });
      if (!resolveResult.success) {
        deps.showSidebarError(resolveResult.reason ?? 'Melee resolve failed');
        deps.updateReadyButtonState();
        return;
      }
      readyResult = resolveResult;
    }

    resetPrecomputedAiState('null');
    const humanMoves: ResolutionMove[] = readyResult.humanMoves ?? [];
    await deps.refreshRes4TerrainOverridesForRenderer();
    const nextState = (await window.gameApi.getGameState()) as GameStateSnapshot;
    const state = nextState;
    await deps.applyGameStateSnapshot(state, {
      refreshStandingOrders: false,
      updateGameStateSidebarUi: false,
      updateSelectionUi: false,
      updateGameOverUi: false,
      updateReadyButton: false,
      refreshBuildPopup: false,
      redraw: false,
    });
    const aiMoves = readyResult.aiMoves ?? [];
    const resolutionMoves = [...humanMoves, ...aiMoves];
    const airStrikeOutboundMoves = deps.buildAirStrikeOutboundPlaybackMoves(readyResult.airStrikeMoves);
    const airStrikeReturnMoves = deps.buildAirStrikeReturnPlaybackMoves(readyResult.airStrikeMoves);

    if (readyResult.aiStrategy) deps.showAiStrategyToast(readyResult.aiStrategy);
    else deps.hideAiStrategyToast();

    if (readyResult.toolInvocationCounts) {
      S.toolInvocationCounts = readyResult.toolInvocationCounts;
      deps.updateOpenRouterToolCountLabels();
    } else if (usePrecomputed && cachedPrecomputedToolCounts) {
      S.toolInvocationCounts = Object.assign({}, cachedPrecomputedToolCounts);
      deps.updateOpenRouterToolCountLabels();
    }
    S.precomputedToolInvocationCounts = null;
    if (readyResult.cost !== undefined) {
      S.openRouterGameCost += readyResult.cost;
      deps.updateOpenRouterCostLabel();
    }
    if (readyResult.aiConsulted === false) {
      deps.appendOpenRouterLog('AI executing standing orders (no event fired).');
      deps.showMapToast('AI: standing orders only (no consultation).', { isError: false });
    }

    const hasRanged =
      (readyResult.rangedCombatHexes?.length ?? 0) > 0 ||
      (readyResult.rangedCasualtyHexes?.length ?? 0) > 0 ||
      (readyResult.rangedRemovedUnits?.length ?? 0) > 0;
    const hasMelee =
      (readyResult.meleeCombatHexes?.length ?? 0) > 0 ||
      (readyResult.meleeCasualtyHexes?.length ?? 0) > 0 ||
      (readyResult.meleeRemovedUnits?.length ?? 0) > 0 ||
      (readyResult.controlLossLightningHexes?.length ?? 0) > 0;
    const hasLegacy = (readyResult.combatHexes?.length ?? 0) > 0 || (readyResult.casualtyHexes?.length ?? 0) > 0;
    const hasAirStrikeResolution =
      (readyResult.airStrikeAttemptCount ?? 0) > 0 ||
      (readyResult.airStrikeHexes?.length ?? 0) > 0 ||
      (readyResult.infrastructureDestroyedEvents?.length ?? 0) > 0 ||
      (readyResult.baseInvalidAirLossCount ?? 0) > 0;
    const visibleHexes = deps.getVisibleHexSet(state);
    const allKills = readyResult.kills ?? [];
    const { unknownCombatHexes, unknownCasualtyHexes, knownVictimIds, unknownVictimIds } = deriveCombatVisibilityClassification(
      readyResult,
      visibleHexes
    );
    const needsAnimation = resolutionMoves.length > 0 || hasRanged || hasMelee || hasLegacy || hasAirStrikeResolution;
    if (needsAnimation) {
      if (S.resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(S.resolutionMoveAnimationFrameId);
      S.resolutionMoveAnimation = {
        moves: resolutionMoves,
        airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined,
        airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined,
        airStrikeCombatHexes: readyResult.airStrikeHexes?.length ? readyResult.airStrikeHexes : undefined,
        airStrikeCasualtyHexes: readyResult.airStrikeCasualtyHexes?.length ? readyResult.airStrikeCasualtyHexes : undefined,
        startTime: Date.now(),
        combatHexes: readyResult.combatHexes?.length ? readyResult.combatHexes : undefined,
        casualtyHexes: readyResult.casualtyHexes?.length ? readyResult.casualtyHexes : undefined,
        rangedCombatHexes: readyResult.rangedCombatHexes?.length ? readyResult.rangedCombatHexes : undefined,
        rangedCasualtyHexes: readyResult.rangedCasualtyHexes?.length ? readyResult.rangedCasualtyHexes : undefined,
        rangedRemovedUnits: readyResult.rangedRemovedUnits?.length ? readyResult.rangedRemovedUnits : undefined,
        meleeCombatHexes: readyResult.meleeCombatHexes?.length ? readyResult.meleeCombatHexes : undefined,
        controlLossLightningHexes: readyResult.controlLossLightningHexes?.length ? readyResult.controlLossLightningHexes : undefined,
        meleeCasualtyHexes: readyResult.meleeCasualtyHexes?.length ? readyResult.meleeCasualtyHexes : undefined,
        meleeRemovedUnits: readyResult.meleeRemovedUnits?.length ? readyResult.meleeRemovedUnits : undefined,
        unknownCombatHexes: unknownCombatHexes.length > 0 ? unknownCombatHexes : undefined,
        unknownCasualtyHexes: unknownCasualtyHexes.length > 0 ? unknownCasualtyHexes : undefined,
      };
      const directFire = readyResult.killsByDirectFire ?? [];
      const returnFire = readyResult.killsByReturnFire ?? [];
      const directSet = new Set(directFire.map((k) => k.victimId));
      const returnSet = new Set(returnFire.map((k) => k.victimId));
      const meleeKills = allKills.filter((k) => !directSet.has(k.victimId) && !returnSet.has(k.victimId));
      const knownDirectFire = directFire.filter((k) => knownVictimIds.has(k.victimId));
      const knownReturnFire = returnFire.filter((k) => knownVictimIds.has(k.victimId));
      const knownMeleeKills = meleeKills.filter((k) => knownVictimIds.has(k.victimId));
      const killToastFormatter = deps.buildKillToastFormatterBundle(state, readyResult.removedUnits);
      const bullets = buildTurnUpdateBullets({
        readyResult: readyResult as Parameters<typeof buildTurnUpdateBullets>[0]['readyResult'],
        knownDirectFire,
        knownReturnFire,
        knownMeleeKills,
        formatKillLine: killToastFormatter.formatKillLine,
        formatUnitName: killToastFormatter.formatUnitName,
      });
      const combatFallbackBullets = buildCombatActivityFallbackBullets(readyResult);
      const updateBullets = composeResolutionMapToastBullets(bullets, combatFallbackBullets);
      if (updateBullets.length > 0) {
        const updateText = updateBullets.join('\n');
        deps.showMapToast(updateText, { isError: false });
        deps.appendOpenRouterLog(`Update: ${updateBullets.join(' | ')}`);
      }
      const hasUnknownBattle = unknownCombatHexes.length > 0 || unknownCasualtyHexes.length > 0 || unknownVictimIds.length > 0;
      if (hasUnknownBattle) {
        const unknownContinentNames: string[] = [];
        if (window.gameApi?.getHexContinentNames) {
          const unknownHexes = [...unknownCombatHexes, ...unknownCasualtyHexes].filter((h3, idx, arr) => arr.indexOf(h3) === idx);
          for (const h3 of unknownHexes) {
            const names = await window.gameApi.getHexContinentNames({ h3Index: h3 });
            for (const n of names) {
              if (!unknownContinentNames.includes(n)) unknownContinentNames.push(n);
            }
          }
        }
        deps.showMapToast(deps.formatUnknownBattleAnnouncement(unknownContinentNames), { isError: false });
      }
      S.resolutionMoveAnimationFrameId = requestAnimationFrame(deps.tickResolutionMoveAnimation);
    }
    S.hoverRoutePreview = null;
    S.hideCommittedOrderLinesAfterReady = false;
    deps.clearPendingTacticalOrders();
    await deps.refreshHumanStandingOrders();
    deps.updateGameStateSidebar(state);
    deps.updatePendingOrdersSidebar();
    deps.updateRangedSidebar();
    deps.updateSidebar();
    deps.updateGameOverUI(state);
    deps.updateReadyButtonState();
    if (S.runButtonOn) deps.startBackgroundRequestIfAllowed();
    deps.redraw();
    if (readyResult.tacticalAutoStartRes1H3Index) {
      await deps.startTacticalBattleFromInterceptHex(readyResult.tacticalAutoStartRes1H3Index);
      if (S.runButtonOn) deps.startBackgroundRequestIfAllowed();
    }
  } catch (err) {
    deps.showSidebarError(String(err));
    deps.updateReadyButtonState();
  } finally {
    S.readyRequestInFlight = false;
    deps.updateReadyButtonState();
  }
}
