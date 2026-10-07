import type {
  CommitHumanTacticalDraftOrdersIpcResult,
  GameReadyIpcPayload,
  GameStateSnapshot,
} from '../../shared/ipcTypes';
import {
  applyTacticalPostBeatConsultSideEffects,
  isTacticalPostBeatConsultOnCommit,
} from '../tactical/applyTacticalPostBeatConsultSideEffects';
import type { MeleeInterceptModalOutcome } from './meleeInterceptModal';
import { buildTacticalSubUnitKillLabelOverlay } from './sidebarSupport';
import { readTacticalBattlesInterceptPromptEnabled } from './tacticalBattlePromptPreference';
import type { ResolutionMove } from '../core/types';
import { rendererSharedState as S } from '../core/state';
import { tacticalOpponentPlanPayloadHasAnyOrders } from '../../shared/ipc/tacticalOpponentPlanMerge';
import { pickPlaybackDiceRolls } from '../../shared/combatDiceChips';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';
import {
  isDeferredResolutionPlaybackConsultPending,
  isWaitingForPrecomputedAiOrders,
} from '../openRouter/aiPlanningState';
import { buildTacticalPendingMarchRowsFromContinuations } from '../tactical/tacticalPendingMarchPath';
import { reconcileSelectionToCurrentState } from '../core/selection';
import { applyToolInvocationCountsAfterReady } from '../openRouter/openRouterUiHelpers';

import type { ReadyHandlerDeps } from './readyHandlerTypes';
import {
  announceResolutionTurnUpdate,
  buildTacticalCommitReadyResultForToast,
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
 * Restores tool invocation counts captured before Ready and refreshes the OpenRouter count labels.
 *
 * Purpose: One restore path for Ready aborts that already zeroed `S.toolInvocationCounts`.
 * When to use: When a Ready or tactical-commit path returns after the pre-click snapshot was taken.
 * Expected outcome: `S.toolInvocationCounts` matches `snapshot` and labels are updated.
 * Exceptions: None.
 */
function rollbackReadyToolCounts(
  deps: ReadyHandlerDeps,
  snapshot: Readonly<typeof S.toolInvocationCounts>
): void {
  S.toolInvocationCounts = snapshot;
  deps.updateOpenRouterToolCountLabels();
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
 * Exceptions: None; errors are caught and reported.
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
    if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
      const commit = window.gameApi.commitHumanTacticalDraftOrders;
      if (!commit) {
        rollbackReadyToolCounts(deps, toolCountsBeforeReadyClick);
        deps.showSidebarError('Tactical commit is not available in this build.');
        deps.updateReadyButtonState();
        return;
      }
      const livingSubUnitIds = new Set(S.tacticalBattleSnapshot.subUnits.map((u) => u.id));
      S.tacticalPendingMarches = S.tacticalPendingMarches.filter((row) =>
        livingSubUnitIds.has(row.subUnitId)
      );
      const movementOrders = S.tacticalPendingMarches.map((r) => ({
        unitId: r.subUnitId,
        toH3Index: r.destinationH3Index,
      }));
      const commitResult = (await commit({
        movementOrders,
        rangedAttacks: [...S.pendingRangedAttacks],
        airStrikes: [...S.pendingAirStrikes],
        ferryOrders: [...S.pendingFerryOrders],
        embarkOrders: [...S.pendingEmbarkOrders],
        ...(S.tacticalOpponentDraft && tacticalOpponentPlanPayloadHasAnyOrders(S.tacticalOpponentDraft)
          ? { opponentTacticalDraft: S.tacticalOpponentDraft }
          : {}),
        useEventDrivenConsultation: S.useEventDrivenConsultation,
        aiPlanningRunEnabled: S.runButtonOn,
      })) as CommitHumanTacticalDraftOrdersIpcResult;
      if (!commitResult.success) {
        rollbackReadyToolCounts(deps, toolCountsBeforeReadyClick);
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
      const hasAirStrikePlaybackAnim =
        (playback?.airStrikeAttemptCount ?? 0) > 0 ||
        (playback?.airStrikeMoves?.length ?? 0) > 0 ||
        (playback?.airStrikeHexes?.length ?? 0) > 0 ||
        (playback?.airStrikeCasualtyHexes?.length ?? 0) > 0;
      const needsResolutionPlayback =
        hasMoves || hasRangedPlayback || hasMeleePlayback || hasKillPlayback || hasAirStrikePlaybackAnim;
      // Start resolution playback before updating the tactical snapshot so no redraw can paint post-commit cells
      // while `resolutionMoveAnimation` is still null (avoids a one-frame teleport hop).
      // Defer the playback clock and the first rAF until after post-commit `getGameState` / terrain refresh so the
      // movement segment is not consumed invisibly (avoids a short initial glide, pause, then tail).
      if (playback && needsResolutionPlayback) {
        if (S.resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(S.resolutionMoveAnimationFrameId);
        S.resolutionMoveAnimationFrameId = null;
        const tacticalMarchPlaybackUnits = tacticalSubUnitsBeforeCommit?.length
          ? (tacticalSubUnitsBeforeCommit.map((u) => ({
              id: u.id,
              player: u.player,
              unitType: u.unitType,
              h3Index: u.h3Index,
            })) as GameStateSnapshot['units'])
          : undefined;
        const airStrikeOutboundMoves = deps.buildAirStrikeOutboundPlaybackMoves(playback.airStrikeMoves);
        const airStrikeReturnMoves = deps.buildAirStrikeReturnPlaybackMoves(playback.airStrikeMoves);
        S.resolutionMoveAnimation = {
          moves: [...playback.humanMoves, ...(playback.opponentMoves ?? [])],
          startTime: Date.now(),
          tacticalDeferResolutionClock: true,
          ...(tacticalMarchPlaybackUnits ? { tacticalMarchPlaybackUnits } : {}),
          ...(airStrikeOutboundMoves.length > 0 ? { airStrikeOutboundMoves } : {}),
          ...(airStrikeReturnMoves.length > 0 ? { airStrikeReturnMoves } : {}),
          ...(playback.airStrikeHexes?.length ? { airStrikeCombatHexes: playback.airStrikeHexes } : {}),
          ...(playback.airStrikeCasualtyHexes?.length ? { airStrikeCasualtyHexes: playback.airStrikeCasualtyHexes } : {}),
          rangedCombatHexes: playback.rangedCombatHexes,
          rangedCasualtyHexes: playback.rangedCasualtyHexes,
          rangedRemovedUnits: playback.rangedRemovedUnits,
          ...(playback.rangedResolutionShotLines?.length
            ? { rangedResolutionShotLines: playback.rangedResolutionShotLines }
            : {}),
          meleeCombatHexes: playback.meleeCombatHexes?.length ? playback.meleeCombatHexes : undefined,
          meleeCasualtyHexes: playback.meleeCasualtyHexes?.length ? playback.meleeCasualtyHexes : undefined,
          meleeRemovedUnits: playback.meleeRemovedUnits?.length ? playback.meleeRemovedUnits : undefined,
          ...pickPlaybackDiceRolls(playback),
        };
      }
      if (commitResult.tacticalBattle) {
        S.tacticalBattleSnapshot = commitResult.tacticalBattle;
      }
      if (S.resolutionMoveAnimation != null && S.tacticalBattleSnapshot != null) {
        deps.updateGameStateSidebar(S.gameState);
        deps.syncTacticalExitButton?.();
      }
      // Drop selection / drafts that referenced sub-units removed during this beat before the next planning click.
      reconcileSelectionToCurrentState();
      // Consume any opponent draft that was just applied (or emptied by sanitize). Post-beat consult may refill below.
      if ('committedOpponentTacticalDraft' in commitResult) {
        S.tacticalOpponentDraft = null;
      }
      if (commitResult.tacticalPostBeatConsultDeferred) {
        S.pendingDeferredTacticalPostBeatConsult = true;
        S.deferredResolutionConsultNotifySent = false;
      }
      if (!commitResult.tacticalPostBeatConsultDeferred && isTacticalPostBeatConsultOnCommit(commitResult)) {
        applyTacticalPostBeatConsultSideEffects(commitResult, deps);
      } else if (!commitResult.tacticalPostBeatConsultDeferred) {
        if ('tacticalOpponentPlan' in commitResult) {
          S.tacticalOpponentDraft = commitResult.tacticalOpponentPlan ?? null;
        }
        deps.showAiStrategyToast({ message: commitResult.aiMessage, strategy: commitResult.aiStrategy });
      }
      // Same rule as strategic Ready: prefer this beat's consult counts, else keep prefetch telemetry visible.
      applyToolInvocationCountsAfterReady({
        fromResult: commitResult.toolInvocationCounts,
        cachedPrecomputed: cachedPrecomputedToolCountsAtReadyStart,
        allowPrecomputedFallback: S.runButtonOn && cachedPrecomputedToolCountsAtReadyStart != null,
      });
      // Replaces pending rows from the successful commit (continuations plus cleared ranged/air/ferry/embark). A late
      // requestAiOrders result is dropped in openRouterRuntime when tacticalBattleSnapshot is gone.
      const previousPendingMarches = new Map(S.tacticalPendingMarches.map((row) => [row.subUnitId, row]));
      S.tacticalPendingMarches = commitResult.tacticalMarchContinuations?.length
        ? buildTacticalPendingMarchRowsFromContinuations({
            battle: commitResult.tacticalBattle ?? S.tacticalBattleSnapshot!,
            continuations: commitResult.tacticalMarchContinuations,
            previousBySubUnitId: previousPendingMarches,
          })
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
            refreshBuildPopup: true,
            redraw: false,
          });
        } catch (err) {
          console.error('tactical commit: failed to refresh strategic game state snapshot', err);
        }
      }
      if (playback && S.gameState && needsResolutionPlayback) {
        const tacticalReadySlice = buildTacticalCommitReadyResultForToast(playback);
        const visibleHexes = deps.getVisibleHexSet(S.gameState);
        const visibility = deriveCombatVisibilityClassification(tacticalReadySlice, visibleHexes);
        const killToastFormatter = deps.buildKillToastFormatterBundle(
          S.gameState,
          tacticalReadySlice.removedUnits,
          buildTacticalSubUnitKillLabelOverlay({
            subUnitsBeforeCommit: tacticalSubUnitsBeforeCommit,
            subUnitsAfterCommit: S.tacticalBattleSnapshot?.subUnits,
            removedUnits: tacticalReadySlice.removedUnits,
          })
        );
        await announceResolutionTurnUpdate(
          {
            readySlice: tacticalReadySlice,
            visibility,
            killToastFormatter,
            extraKills: {
              killsByMelee: playback.killsByMelee,
              killsByAirStrike: playback.killsByAirStrike,
            },
          },
          deps
        );
      }
      await deps.refreshTacticalTerrainOverridesForRenderer();
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
      if (commitResult.tacticalPostBeatConsultDeferred) {
        const bid = commitResult.tacticalBattle?.battleId;
        if (bid) {
          const sendTacticalNotify = (): void => {
            void window.gameApi?.notifyResolutionPlaybackComplete?.({ kind: 'tactical', battleId: bid });
            S.deferredResolutionConsultNotifySent = true;
            deps.updateReadyButtonState();
          };
          scheduleResolutionPlaybackCompleteNotify(sendTacticalNotify, needsResolutionPlayback);
        }
      }
      if (S.runButtonOn && !commitResult.tacticalPostBeatConsultDeferred) {
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
        ...(readyResult.rangedResolutionShotLines?.length
          ? { rangedResolutionShotLines: readyResult.rangedResolutionShotLines }
          : {}),
        meleeCombatHexes: readyResult.meleeCombatHexes?.length ? readyResult.meleeCombatHexes : undefined,
        controlLossLightningHexes: readyResult.controlLossLightningHexes?.length ? readyResult.controlLossLightningHexes : undefined,
        meleeCasualtyHexes: readyResult.meleeCasualtyHexes?.length ? readyResult.meleeCasualtyHexes : undefined,
        meleeRemovedUnits: readyResult.meleeRemovedUnits?.length ? readyResult.meleeRemovedUnits : undefined,
        unknownCombatHexes: unknownCombatHexes.length > 0 ? unknownCombatHexes : undefined,
        unknownCasualtyHexes: unknownCasualtyHexes.length > 0 ? unknownCasualtyHexes : undefined,
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
        },
        deps
      );
      S.resolutionMoveAnimationFrameId = requestAnimationFrame(deps.tickResolutionMoveAnimation);
    }
    S.hoverRoutePreview = null;
    S.hideCommittedOrderLinesAfterReady = false;
    await prepareStrategicPlanningUiBeforeTacticalAutoStart(state, deps);
    deps.updateGameOverUI(state);
    deps.updateReadyButtonState();
    if (S.runButtonOn && !S.pendingDeferredStrategicPostResolutionConsult) deps.startBackgroundRequestIfAllowed();
    deps.redraw();
    if (readyResult.tacticalAutoStartH3Index) {
      await deps.startTacticalBattleFromInterceptHex(readyResult.tacticalAutoStartH3Index);
      if (S.runButtonOn && !S.pendingDeferredStrategicPostResolutionConsult) deps.startBackgroundRequestIfAllowed();
    }
  } catch (err) {
    deps.showSidebarError(String(err));
    deps.updateReadyButtonState();
  } finally {
    S.readyRequestInFlight = false;
    deps.updateReadyButtonState();
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
 * Expected outcome: Right-hand panels reflect `listHumanStandingOrders` and empty tactical drafts before `stashStrategicOrderDraftsForTacticalSession` runs inside tactical activation.
 * Exceptions: None.
 */
export async function prepareStrategicPlanningUiBeforeTacticalAutoStart(
  gameState: GameStateSnapshot | null,
  deps: PrepareStrategicPlanningUiBeforeTacticalAutoStartDeps
): Promise<void> {
  deps.clearPendingTacticalOrders();
  await deps.refreshHumanStandingOrders();
  if (gameState) {
    deps.updateGameStateSidebar(gameState);
  }
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.updateSidebar();
}
