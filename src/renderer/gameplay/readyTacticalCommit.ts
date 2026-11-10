/**
 * Ready's tactical beat commit, split from the strategic turn path.
 *
 * Purpose: A beat commit updates the battle, starts playback, and may latch a post-beat consult. That sequence stays
 * out of the world-map Ready path.
 * When to use: `handleReadyButtonClick` after the shared guards.
 * Expected outcome: `runTacticalReadyCommit` returns false outside tactical planning. Inside it, the beat is committed
 * or the failure is shown, and the caller does not also resolve the world-map turn.
 * Exceptions: None. A failed refresh of the strategic snapshot is logged and the beat commit still finishes.
 */

import type { CommitHumanTacticalDraftOrdersIpcResult, GameStateSnapshot } from '../../shared/ipcTypes';
import { buildAirDropOutboundPlaybackMoves, buildAirDropReturnPlaybackMoves } from '../rendering/orderDrawing';
import { currentConsoleReportTag } from '../chrome/consoleReports';
import { pickPlaybackDiceRolls } from '../../shared/combatDiceChips';
import { tacticalOpponentPlanPayloadHasAnyOrders } from '../../shared/ipc/tacticalOpponentPlanMerge';
import { rendererSharedState as S } from '../core/state';
import { getExploredHexSet, reconcileSelectionToCurrentState } from '../core/selection';
import { rendererMatchEpochCurrent } from '../core/matchEpoch';
import { fetchMatchSnapshot } from '../core/matchSnapshotClient';
import { readCommanderPoolAndApply } from '../openRouter/commanderPoolClient';
import {
  applyTacticalPostBeatConsultSideEffects,
  isTacticalPostBeatConsultOnCommit,
  tacticalBattleHasAiSide,
} from '../tactical/applyTacticalPostBeatConsultSideEffects';
import { buildTacticalPendingMarchRowsFromContinuations } from '../tactical/tacticalPendingMarchPath';
import {
  announceResolutionTurnUpdate,
  buildTacticalCommitReadyResultForToast,
  deriveCombatVisibilityClassification,
  reportViewerSeatId,
  scheduleResolutionPlaybackCompleteNotify,
} from './readyResolutionAnnouncements';
import type { ReadyHandlerDeps } from './readyHandlerTypes';
import { buildTacticalSubUnitKillLabelOverlay } from './sidebarSupport';

/**
 * Values captured at the start of a Ready click that the tactical commit still needs.
 *
 * Purpose: One argument so the beat-commit path does not grow a long parameter list.
 * When to use: Pass this from `handleReadyButtonClick` into `runTacticalReadyCommit`.
 * Expected outcome: The commit uses the same deps and match epoch as the click that started it.
 * Exceptions: None.
 */
export interface TacticalReadyCommitContext {
  /**
   * Ready button callbacks for this click.
   *
   * Contract: The same `deps` object `handleReadyButtonClick` received.
   * When to use: Sidebar, playback, and snapshot updates during the beat commit.
   * Expected outcome: Those updates go through the renderer's existing Ready callbacks.
   * Exceptions: None.
   */
  deps: ReadyHandlerDeps;
  /**
   * Renderer match epoch captured when this Ready click began.
   *
   * Contract: The value of `currentRendererMatchEpoch()` at the start of the click.
   * When to use: Immediately before applying a refreshed strategic snapshot.
   * Expected outcome: A newer New-game epoch skips that snapshot apply.
   * Exceptions: None.
   */
  matchEpoch: number;
}

/**
 * Commits the current tactical beat when Ready is pressed during battle planning.
 *
 * Purpose: Plays the beat back, refreshes the strategic snapshot, and latches a deferred post-beat consult when the commit asked for one.
 * When to use: From `handleReadyButtonClick` after the shared Ready guards.
 * Expected outcome: Returns false when the player is not in tactical planning, so the caller continues with the strategic turn.
 * Returns true after a tactical commit attempt, including an early failure, so the caller does not also resolve the world-map turn.
 * Exceptions: A failed strategic-state refresh is logged and the beat commit still finishes, unless a newer match has started. A newer match epoch skips the snapshot apply and the playback writes.
 */
export async function runTacticalReadyCommit(context: TacticalReadyCommitContext): Promise<boolean> {
  const { deps, matchEpoch } = context;
  if (!(S.tacticalBattleSnapshot && S.tacticalPhasePlanning)) return false;
  if (!window.gameApi) return true;
  // The beat this commit resolves; its reports are filed under it after the battle moves on to the next beat.
  const beatReportTag = currentConsoleReportTag();
  const commit = window.gameApi.commitHumanTacticalDraftOrders;
  if (!commit) {
    deps.showSidebarError('Tactical commit is not available in this build.');
    deps.updateReadyButtonState();
    return true;
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
    airDropOrders: [...S.pendingAirDrops],
    ferryOrders: [...S.pendingFerryOrders],
    embarkOrders: [...S.pendingEmbarkOrders],
    useEventDrivenConsultation: S.useEventDrivenConsultation,
    aiPlanningRunEnabled: S.runButtonOn,
  })) as CommitHumanTacticalDraftOrdersIpcResult;
  if (!rendererMatchEpochCurrent(matchEpoch)) return true;
  if (!commitResult.success) {
    deps.showSidebarError(commitResult.reason ?? 'Tactical commit failed');
    deps.updateReadyButtonState();
    return true;
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
  const hasDicePlayback =
    (playback?.airStrikeDiceRolls?.length ?? 0) > 0 ||
    (playback?.rangedDiceRolls?.length ?? 0) > 0 ||
    (playback?.meleeDiceRolls?.length ?? 0) > 0;
  const needsResolutionPlayback =
    hasMoves || hasRangedPlayback || hasMeleePlayback || hasKillPlayback || hasAirStrikePlaybackAnim || hasDicePlayback;
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
    const airStrikeOutboundMoves = [
      ...deps.buildAirStrikeOutboundPlaybackMoves(playback.airStrikeMoves),
      ...buildAirDropOutboundPlaybackMoves(playback.airDropMoves),
    ];
    const airStrikeReturnMoves = [
      ...deps.buildAirStrikeReturnPlaybackMoves(playback.airStrikeMoves),
      ...buildAirDropReturnPlaybackMoves(playback.airDropMoves),
    ];
    S.resolutionMoveAnimation = {
      moves: [...playback.humanMoves, ...(playback.opponentMoves ?? [])],
      startTime: Date.now(),
      tacticalDeferResolutionClock: true,
      ...(tacticalMarchPlaybackUnits ? { tacticalMarchPlaybackUnits } : {}),
      ...(airStrikeOutboundMoves.length > 0 ? { airStrikeOutboundMoves } : {}),
      ...(airStrikeReturnMoves.length > 0 ? { airStrikeReturnMoves } : {}),
      ...(playback.airStrikeHexes?.length ? { airStrikeCombatHexes: playback.airStrikeHexes } : {}),
      ...(playback.airStrikeCasualtyHexes?.length
        ? { airStrikeCasualtyHexes: playback.airStrikeCasualtyHexes }
        : {}),
      ...(playback.airStrikeRemovedUnits?.length ? { airStrikeRemovedUnits: playback.airStrikeRemovedUnits } : {}),
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
  if (commitResult.tacticalPostBeatConsultDeferred) {
    S.pendingDeferredTacticalPostBeatConsult = true;
    S.deferredResolutionConsultNotifySent = false;
  }
  if (!commitResult.tacticalPostBeatConsultDeferred && isTacticalPostBeatConsultOnCommit(commitResult)) {
    applyTacticalPostBeatConsultSideEffects(commitResult, deps);
  } else if (!commitResult.tacticalPostBeatConsultDeferred) {
    const plan = 'tacticalOpponentPlan' in commitResult ? commitResult.tacticalOpponentPlan : null;
    if (!tacticalOpponentPlanPayloadHasAnyOrders(plan) && S.runButtonOn && tacticalBattleHasAiSide()) {
      deps.startBackgroundRequestIfAllowed();
    }
    void readCommanderPoolAndApply(true);
  }
  // Replaces pending rows from the successful commit (continuations plus cleared ranged/air/ferry/embark).
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
  S.pendingAirDrops = [];
  S.pendingMissileLaunches = [];
  S.pendingFerryOrders = [];
  S.pendingEmbarkOrders = [];
  S.rangedModeActive = false;
  S.airStrikeModeActive = false;
  S.airDropModeActive = false;
  S.missileLaunchModeActive = false;
  try {
    const refreshedStrategic = await fetchMatchSnapshot();
    if (!rendererMatchEpochCurrent(matchEpoch)) return true;
    await deps.applyGameStateSnapshot(refreshedStrategic, {
      refreshStandingOrders: false,
      updateGameStateSidebarUi: false,
      updateSelectionUi: false,
      updateGameOverUi: false,
      updateReadyButton: false,
      refreshBuildPopup: true,
      redraw: false,
    });
    if (!rendererMatchEpochCurrent(matchEpoch)) return true;
  } catch (err) {
    console.error('tactical commit: failed to refresh strategic game state snapshot', err);
    if (!rendererMatchEpochCurrent(matchEpoch)) return true;
  }
  if (playback && S.gameState && needsResolutionPlayback) {
    const tacticalReadySlice = buildTacticalCommitReadyResultForToast(playback);
    // A battle has no fog, so every battle cell is visible to the turn report.
    const visibleHexes = new Set([
      ...deps.getVisibleHexSet(S.gameState),
      ...(S.tacticalBattleSnapshot?.tacticalChildH3Indexes ?? []),
    ]);
    const visibility = deriveCombatVisibilityClassification(tacticalReadySlice, visibleHexes, reportViewerSeatId());
    const killToastFormatter = deps.buildKillToastFormatterBundle(
      S.gameState,
      tacticalReadySlice.removedUnits,
      buildTacticalSubUnitKillLabelOverlay({
        subUnitsBeforeCommit: tacticalSubUnitsBeforeCommit,
        subUnitsAfterCommit: S.tacticalBattleSnapshot?.subUnits,
        removedUnits: tacticalReadySlice.removedUnits,
      })
    );
    const battleForReport = commitResult.tacticalBattle ?? S.tacticalBattleSnapshot;
    await announceResolutionTurnUpdate(
      {
        readySlice: tacticalReadySlice,
        visibility,
        killToastFormatter,
        reportTag: beatReportTag,
        extraKills: {
          killsByMelee: playback.killsByMelee,
          killsByAirStrike: playback.killsByAirStrike,
        },
        hexCodeBattle: battleForReport ?? null,
        // A battle has no fog, so an opponent's absorbed hits are visible. visibleHexes does not feed this filter.
        exploredHexes: new Set([
          ...getExploredHexSet(S.gameState),
          ...(battleForReport?.tacticalChildH3Indexes ?? []),
        ]),
      },
      deps
    );
    if (!rendererMatchEpochCurrent(matchEpoch)) return true;
  }
  await deps.refreshTacticalTerrainOverridesForRenderer();
  if (!rendererMatchEpochCurrent(matchEpoch)) return true;
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
  deps.updateReadyButtonState();
  return true;
}
