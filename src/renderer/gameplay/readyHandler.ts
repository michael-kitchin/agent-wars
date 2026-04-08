import type {
  AirStrikeAnimationMove,
  GameReadyIpcPayload,
  GameStateSnapshot,
  ReadyResult,
  RemovedUnitSnapshot,
} from '../../shared/ipcTypes';
import { buildTurnUpdateBullets } from './turnUpdateSummary';
import type { ResolutionMove, ResolutionPlaybackMove } from '../core/types';
import { rendererSharedState as S } from '../core/state';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';
import { isWaitingForPrecomputedAiOrders } from '../openRouter/aiPlanningState';

export interface ReadyHandlerDeps {
  clearSidebarError: () => void;
  updateReadyButtonState: () => void;
  updateOpenRouterToolCountLabels: () => void;
  showSidebarError: (message: string) => void;
  callReadyWithTimeout: (payload: GameReadyIpcPayload) => Promise<ReadyResult>;
  refreshRes4TerrainOverridesForRenderer: () => Promise<void>;
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
  buildAirStrikeOutboundPlaybackMoves: (moves: AirStrikeAnimationMove[] | undefined) => ResolutionPlaybackMove[];
  buildAirStrikeReturnPlaybackMoves: (moves: AirStrikeAnimationMove[] | undefined) => ResolutionPlaybackMove[];
  showAiStrategyToast: (content: string) => void;
  hideAiStrategyToast: () => void;
  updateOpenRouterCostLabel: () => void;
  appendOpenRouterLog: (line: string, isError?: boolean) => void;
  showMapToast: (message: string, options?: { isError?: boolean }) => void;
  getVisibleHexSet: (state: GameStateSnapshot | null) => Set<string>;
  buildKillToastFormatterBundle: (
    state: GameStateSnapshot,
    removedUnits?: RemovedUnitSnapshot[]
  ) => { formatKillLine: (entry: { victimId: string; killerIds: string[] }) => string; formatUnitName: (unitId: string) => string };
  formatUnknownBattleAnnouncement: (continentNames: string[]) => string;
  tickResolutionMoveAnimation: () => void;
  clearPendingTacticalOrders: () => void;
  refreshHumanStandingOrders: () => Promise<void>;
  updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
  updatePendingOrdersSidebar: () => void;
  updateRangedSidebar: () => void;
  updateSidebar: () => void;
  updateGameOverUI: (state: GameStateSnapshot) => void;
  startBackgroundRequestIfAllowed: () => void;
  redraw: () => void;
}

interface ReadyPayloadBuildArgs {
  enabledToolGroupsPayload: string[];
  useEventDriven: boolean;
  usePrecomputed: boolean;
}

/**
 * Use this to keep game:ready payload construction consistent for Run/event-driven/precomputed combinations.
 * The payload never enables Ready-time AI planning, because Run mode requires background precomputation first.
 */
function buildReadyPayload(args: ReadyPayloadBuildArgs): GameReadyIpcPayload {
  const { enabledToolGroupsPayload, useEventDriven, usePrecomputed } = args;
  const base: GameReadyIpcPayload = {
    enabledToolGroups: enabledToolGroupsPayload,
    aiPlanningRunEnabled: false,
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

interface CombatVisibilityClassification {
  unknownCombatHexes: string[];
  unknownCasualtyHexes: string[];
  knownVictimIds: Set<string>;
  unknownVictimIds: string[];
}

/**
 * Use this to classify combat visibility for turn updates and unknown-battle announcements.
 * Human-involved combat is treated as observable even when the post-resolution hex is not currently visible.
 */
function deriveCombatVisibilityClassification(
  readyResult: ReadyResult,
  visibleHexes: ReadonlySet<string>
): CombatVisibilityClassification {
  const allKills = readyResult.kills ?? [];
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

export async function handleReadyButtonClick(deps: ReadyHandlerDeps): Promise<void> {
  if (!window.gameApi) return;
  if (S.gameState?.gameOver) return;
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
    const enabledToolGroupsPayload = Array.from(S.enabledToolGroups).filter((id) => id !== 'events');
    const useEventDriven = S.useEventDrivenConsultation;
    const usePrecomputed = S.runButtonOn && S.precomputedAiOrders !== null;
    const readyPayload = buildReadyPayload({ enabledToolGroupsPayload, useEventDriven, usePrecomputed });
    const readyResult = await deps.callReadyWithTimeout(readyPayload);
    if (!readyResult.success) {
      deps.showSidebarError(readyResult.reason ?? 'Ready failed');
      deps.updateReadyButtonState();
      return;
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
    } else if (usePrecomputed && S.precomputedToolInvocationCounts) {
      const precomputedCounts = S.precomputedToolInvocationCounts;
      S.toolInvocationCounts = Object.assign({}, precomputedCounts ?? {});
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
      if (bullets.length > 0) deps.showMapToast(bullets.join('\n'), { isError: false });
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
  } catch (err) {
    deps.showSidebarError(String(err));
    deps.updateReadyButtonState();
  } finally {
    S.readyRequestInFlight = false;
    deps.updateReadyButtonState();
  }
}
