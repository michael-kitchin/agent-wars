import type { GameReadyIpcPayload, GameStateSnapshot } from '../../shared/ipcTypes';
import { currentConsoleReportTag } from '../chrome/consoleReports';
import type { MeleeInterceptModalOutcome } from './meleeInterceptModal';
import { readTacticalBattlesInterceptPromptEnabled } from './tacticalBattlePromptPreference';
import type { ResolutionMove } from '../core/types';
import { rendererSharedState as S } from '../core/state';
import { pickPlaybackDiceRolls } from '../../shared/combatDiceChips';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';
import {
  isDeferredResolutionPlaybackConsultPending,
  isWaitingForPrecomputedAiOrders,
} from '../openRouter/aiPlanningState';
import { applyToolInvocationCountsAfterReady } from '../openRouter/openRouterUiHelpers';

import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { ordersHeldUntilMovementEnds } from '../../shared/ordersHeldForPlayback';
import type { ReadyHandlerDeps } from './readyHandlerTypes';
import { rollbackReadyToolCounts, runTacticalReadyCommit } from './readyTacticalCommit';
import {
  announceResolutionTurnUpdate,
  deriveCombatVisibilityClassification,
  scheduleResolutionPlaybackCompleteNotify,
} from './readyResolutionAnnouncements';
export type { ReadyHandlerDeps } from './readyHandlerTypes';

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
  base.precomputedAiMessage = S.precomputedAiMessage ?? undefined;
  return base;
}

/**
 * Runs the Ready button: commits a tactical beat in battle, or resolves the strategic turn on the world map.
 *
 * Purpose: Single entry for ending a turn or beat and starting its resolution playback.
 * When to use: From the Ready button's click handler.
 * Expected outcome: Does nothing when there is no game API, the game is over, a Ready is already in flight, the
 *   annihilation dialog is open, or a deferred AI consult is pending. In battle, commits the beat and plays it back.
 *   On the world map, submits drafts, resolves the turn (pausing for the tactical battles list when melee candidates
 *   are reported), reloads state, and plays the turn back with fog-filtered combat marks and dice chips. It can then
 *   start a battle the turn chose. Failures show on the map toast and return the player to planning.
 * Exceptions: None; errors are caught and reported. A newer match skips that report.
 */
export async function handleReadyButtonClick(deps: ReadyHandlerDeps): Promise<void> {
  if (!window.gameApi) return;
  if (S.gameState?.gameOver) return;
  if (S.readyRequestInFlight) return;
  if (S.tacticalAnnihilationOutcomeDialog != null) return;
  if (isDeferredResolutionPlaybackConsultPending()) {
    deps.updateReadyButtonState();
    return;
  }
  deps.clearSidebarError();
  S.readyRequestInFlight = true;
  const matchEpoch = currentRendererMatchEpoch();
  const toolCountsBeforeReadyClick = { ...S.toolInvocationCounts };
  const cachedPrecomputedToolCountsAtReadyStart = S.precomputedToolInvocationCounts
    ? { ...S.precomputedToolInvocationCounts }
    : null;
  S.toolInvocationCounts = Object.fromEntries(S.openRouterToolGroups.map((g) => [g.id, 0]));
  deps.updateOpenRouterToolCountLabels();
  deps.updateReadyButtonState();
  try {
    if (isWaitingForPrecomputedAiOrders()) {
      rollbackReadyToolCounts(deps, toolCountsBeforeReadyClick);
      deps.startBackgroundRequestIfAllowed();
      deps.showMapToast('AI planning is still running. Ready will unlock once precomputed orders are available.', { isError: false });
      deps.updateReadyButtonState();
      return;
    }
    if (await runTacticalReadyCommit({
      deps,
      toolCountsBeforeReadyClick,
      cachedPrecomputedToolCountsAtReadyStart,
      matchEpoch,
    })) return;
    // The turn this Ready resolves; its reports are filed under it after the snapshot moves on to the next turn.
    const turnReportTag = currentConsoleReportTag();
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
      if (!rendererMatchEpochCurrent(matchEpoch)) return;
      if (!submitResult.success) {
        deps.showSidebarError(submitResult.reason ?? 'Submit failed');
        deps.updateReadyButtonState();
        return;
      }
    }
    const enabledToolGroupsPayload = Array.from(S.enabledToolGroups).filter((id) => id !== 'events');
    const useEventDriven = S.useEventDrivenConsultation;
    const usePrecomputed = S.runButtonOn && S.precomputedAiOrders !== null;
    const cachedPrecomputedToolCounts =
      cachedPrecomputedToolCountsAtReadyStart ??
      (S.precomputedToolInvocationCounts ? { ...S.precomputedToolInvocationCounts } : null);
    const readyPayload = buildReadyPayload({
      enabledToolGroupsPayload,
      useEventDriven,
      usePrecomputed,
      aiPlanningRunEnabled: S.runButtonOn,
    });
    const visibleHexesBeforeTurn = deps.getVisibleHexSet(S.gameState);
    let readyResult = await deps.callReadyWithTimeout(readyPayload);
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    let resolutionPlaybackNotifyKind: 'strategic' | 'melee' = 'strategic';
    if (!readyResult.success) {
      rollbackReadyToolCounts(deps, toolCountsBeforeReadyClick);
      deps.showSidebarError(readyResult.reason ?? 'Ready failed');
      deps.updateReadyButtonState();
      return;
    }

    if (readyResult.awaitingMeleeDecision) {
      if (!window.gameApi.resolveMeleeIntercept) {
        rollbackReadyToolCounts(deps, toolCountsBeforeReadyClick);
        deps.showSidebarError('Melee intercept resolve is not available in this build.');
        deps.updateReadyButtonState();
        return;
      }
      await deps.refreshTacticalTerrainOverridesForRenderer();
      const pausedState = (await window.gameApi.getGameState()) as GameStateSnapshot;
      if (!rendererMatchEpochCurrent(matchEpoch)) return;
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
      if (!rendererMatchEpochCurrent(matchEpoch)) return;
      if (!resolveResult.success) {
        rollbackReadyToolCounts(deps, toolCountsBeforeReadyClick);
        deps.showSidebarError(resolveResult.reason ?? 'Melee resolve failed');
        deps.updateReadyButtonState();
        return;
      }
      readyResult = resolveResult;
      resolutionPlaybackNotifyKind = 'melee';
    }

    resetPrecomputedAiState('null');
    const humanMoves: ResolutionMove[] = readyResult.humanMoves ?? [];
    await deps.refreshTacticalTerrainOverridesForRenderer();
    const nextState = (await window.gameApi.getGameState()) as GameStateSnapshot;
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    const state = nextState;
    await deps.applyGameStateSnapshot(state, {
      refreshStandingOrders: false,
      updateGameStateSidebarUi: false,
      updateSelectionUi: false,
      updateGameOverUi: false,
      updateReadyButton: false,
      refreshBuildPopup: true,
      redraw: false,
    });
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    const aiMoves = readyResult.aiMoves ?? [];
    const resolutionMoves = [...humanMoves, ...aiMoves];
    const airStrikeOutboundMoves = deps.buildAirStrikeOutboundPlaybackMoves(readyResult.airStrikeMoves);
    const airStrikeReturnMoves = deps.buildAirStrikeReturnPlaybackMoves(readyResult.airStrikeMoves);

    deps.showAiStrategyToast({ message: readyResult.aiMessage, strategy: readyResult.aiStrategy });

    applyToolInvocationCountsAfterReady({
      fromResult: readyResult.toolInvocationCounts,
      cachedPrecomputed: cachedPrecomputedToolCounts,
      allowPrecomputedFallback: usePrecomputed,
    });
    if (readyResult.cost !== undefined) {
      S.openRouterGameCost += readyResult.cost;
      deps.updateOpenRouterCostLabel();
    }
    if (readyResult.aiConsulted === false) {
      deps.appendOpenRouterLog('AI executing standing orders (no event fired).');
      deps.showMapToast('AI: standing orders only (no consultation).', {
        isError: false,
        report: { kind: 'notice', tag: turnReportTag },
      });
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
    const visibility = deriveCombatVisibilityClassification(readyResult, visibleHexes);
    const { unknownCombatHexes, unknownCasualtyHexes } = visibility;
    const needsAnimation = resolutionMoves.length > 0 || hasRanged || hasMelee || hasLegacy || hasAirStrikeResolution;
    if (readyResult.postResolutionConsultDeferred === true) {
      S.pendingDeferredStrategicPostResolutionConsult = true;
      S.deferredResolutionConsultNotifySent = false;
      const planningTurn = readyResult.deferredResolutionPlanningTurnNumber ?? state.turnNumber;
      const sendStrategicNotify = (): void => {
        void window.gameApi?.notifyResolutionPlaybackComplete?.({
          kind: resolutionPlaybackNotifyKind,
          planningTurnNumber: planningTurn,
        });
        S.deferredResolutionConsultNotifySent = true;
        deps.updateReadyButtonState();
      };
      scheduleResolutionPlaybackCompleteNotify(sendStrategicNotify, needsAnimation);
    }
    if (needsAnimation) {
      if (S.resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(S.resolutionMoveAnimationFrameId);
      const marchArrowsUntilMovementEnds = ordersHeldUntilMovementEnds(S.humanStandingOrders, state.units, humanMoves);
      S.resolutionMoveAnimation = {
        moves: resolutionMoves,
        airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined,
        airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined,
        airStrikeCombatHexes: readyResult.airStrikeHexes?.length ? readyResult.airStrikeHexes : undefined,
        airStrikeCasualtyHexes: readyResult.airStrikeCasualtyHexes?.length ? readyResult.airStrikeCasualtyHexes : undefined,
        ...(readyResult.airStrikeRemovedUnits?.length
          ? { airStrikeRemovedUnits: readyResult.airStrikeRemovedUnits }
          : {}),
        startTime: Date.now(),
        combatHexes: readyResult.combatHexes?.length ? readyResult.combatHexes : undefined,
        casualtyHexes: readyResult.casualtyHexes?.length ? readyResult.casualtyHexes : undefined,
        rangedCombatHexes: readyResult.rangedCombatHexes?.length ? readyResult.rangedCombatHexes : undefined,
        rangedCasualtyHexes: readyResult.rangedCasualtyHexes?.length ? readyResult.rangedCasualtyHexes : undefined,
        rangedRemovedUnits: readyResult.rangedRemovedUnits?.length ? readyResult.rangedRemovedUnits : undefined,
        ...(readyResult.rangedResolutionShotLines?.length
          ? { rangedResolutionShotLines: readyResult.rangedResolutionShotLines }
          : {}),
        meleeCombatHexes: readyResult.meleeCombatHexes?.length ? readyResult.meleeCombatHexes : undefined,
        controlLossLightningHexes: readyResult.controlLossLightningHexes?.length ? readyResult.controlLossLightningHexes : undefined,
        meleeCasualtyHexes: readyResult.meleeCasualtyHexes?.length ? readyResult.meleeCasualtyHexes : undefined,
        meleeRemovedUnits: readyResult.meleeRemovedUnits?.length ? readyResult.meleeRemovedUnits : undefined,
        unknownCombatHexes: unknownCombatHexes.length > 0 ? unknownCombatHexes : undefined,
        unknownCasualtyHexes: unknownCasualtyHexes.length > 0 ? unknownCasualtyHexes : undefined,
        ...(marchArrowsUntilMovementEnds.orders.length > 0 ? { marchArrowsUntilMovementEnds } : {}),
        ...pickPlaybackDiceRolls(readyResult, {
          visibleHexesBeforeTurn,
          visibleHexesAfterTurn: visibleHexes,
          unknownHexes: new Set([...unknownCombatHexes, ...unknownCasualtyHexes]),
        }),
      };
      const killToastFormatter = deps.buildKillToastFormatterBundle(
        state,
        readyResult.removedUnits,
        undefined,
        readyResult.killLabelUnits
      );
      await announceResolutionTurnUpdate(
        {
          readySlice: readyResult,
          visibility,
          killToastFormatter,
          reportTag: turnReportTag,
        },
        deps
      );
      if (!rendererMatchEpochCurrent(matchEpoch)) return;
      S.resolutionMoveAnimationFrameId = requestAnimationFrame(deps.tickResolutionMoveAnimation);
    }
    S.hoverRoutePreview = null;
    S.hideCommittedOrderLinesAfterReady = false;
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    await prepareStrategicPlanningUiBeforeTacticalAutoStart(state, deps);
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    deps.updateGameOverUI(state);
    deps.updateReadyButtonState();
    if (S.runButtonOn && !S.pendingDeferredStrategicPostResolutionConsult) deps.startBackgroundRequestIfAllowed();
    deps.redraw();
    if (readyResult.tacticalAutoStartH3Index) {
      await deps.startTacticalBattleFromInterceptHex(readyResult.tacticalAutoStartH3Index);
      if (!rendererMatchEpochCurrent(matchEpoch)) return;
      if (S.runButtonOn && !S.pendingDeferredStrategicPostResolutionConsult) deps.startBackgroundRequestIfAllowed();
    }
  } catch (err) {
    if (!rendererMatchEpochCurrent(matchEpoch)) return;
    deps.showSidebarError(String(err));
    deps.updateReadyButtonState();
  } finally {
    if (rendererMatchEpochCurrent(matchEpoch)) {
      S.readyRequestInFlight = false;
      deps.updateReadyButtonState();
    }
  }
}

/**
 * Dependencies for reloading strategic planning sidebar state before tactical auto-start (melee Fight handoff or magnifier entry).
 *
 * Purpose: Matches the subset of `ReadyHandlerDeps` used together after Ready resolves movement and before `startTacticalBattleFromInterceptHex`.
 * When to use: Pass `deps` from `handleReadyButtonClick` or build an object from renderer closures for magnifier-driven tactical start.
 * Expected outcome: Callers supply real sidebar mutators; tests may stub minimal implementations.
 * Exceptions: None.
 */
export type PrepareStrategicPlanningUiBeforeTacticalAutoStartDeps = {
  clearPendingTacticalOrders: () => void;
  refreshHumanStandingOrders: () => Promise<void>;
  updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
  updatePendingOrdersSidebar: () => void;
  updateRangedSidebar: () => void;
  updateSidebar: () => void;
};

/**
 * Clears tactical-order draft slices, reloads human standing orders from main, and refreshes strategic sidebars (pending orders, ranged/air panel, unit sidebar).
 *
 * Purpose: Single sequence shared by `handleReadyButtonClick` immediately before `tacticalAutoStartStrategicH3Index` tactical entry and magnifier `prepareStrategicUiBeforeTacticalStart` so Fight and magnifier paths cannot drift.
 * When to use: After strategic resolution updates game state and before activating tactical battle from the same planning turn.
 * Expected outcome: Right-hand panels reflect `listHumanStandingOrders` and empty tactical drafts before `stashStrategicOrderDraftsForTacticalSession` runs inside tactical activation. A newer match skips the sidebar refresh after standing orders reload.
 * Exceptions: None.
 */
export async function prepareStrategicPlanningUiBeforeTacticalAutoStart(
  gameState: GameStateSnapshot | null,
  deps: PrepareStrategicPlanningUiBeforeTacticalAutoStartDeps
): Promise<void> {
  const matchEpoch = currentRendererMatchEpoch();
  deps.clearPendingTacticalOrders();
  await deps.refreshHumanStandingOrders();
  if (!rendererMatchEpochCurrent(matchEpoch)) return;
  if (gameState) {
    deps.updateGameStateSidebar(gameState);
  }
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.updateSidebar();
}
