import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { applyInitialCameraForState } from '../map/mapUtils';
import { rendererSharedState as S } from './state';

interface ApplySnapshotDeps {
  rebuildUnitDisplayNameLookup: (state: GameStateSnapshot | null) => void;
  reconcileSelectionToCurrentState: () => void;
  updateClientStaleEnemyIntel: (previousState: GameStateSnapshot | null, state: GameStateSnapshot) => void;
  clearRes1TooltipSummaryCaches: () => void;
  refreshHumanStandingOrders: () => Promise<void>;
  updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
  updateRangedSidebar: () => void;
  updateSidebar: () => void;
  updatePendingOrdersSidebar: () => void;
  updateGameOverUI: (state: GameStateSnapshot) => void;
  updateReadyButtonState: () => void;
  redraw: () => void;
  refreshBuildPopupIfOpen: () => void;
}

interface RefreshBuildQueueDeps {
  applyGameStateSnapshot: (
    nextState: GameStateSnapshot,
    options?: {
      refreshStandingOrders?: boolean;
      updateGameStateSidebarUi?: boolean;
      updateSelectionUi?: boolean;
      updateGameOverUi?: boolean;
      updateReadyButton?: boolean;
      refreshBuildPopup?: boolean;
      redraw?: boolean;
    }
  ) => Promise<void>;
}

export async function refreshGameStateAfterBuildQueueChange(deps: RefreshBuildQueueDeps): Promise<void> {
  if (!window.gameApi?.getGameState) return;
  try {
    const nextState = (await window.gameApi.getGameState()) as GameStateSnapshot;
    await deps.applyGameStateSnapshot(nextState, {
      refreshStandingOrders: false,
      updateGameStateSidebarUi: false,
      updateSelectionUi: false,
      updateGameOverUi: false,
      updateReadyButton: false,
      refreshBuildPopup: false,
      redraw: true,
    });
  } catch (err) {
    console.error('refreshGameStateAfterBuildQueueChange failed:', err);
  }
}

export async function applyGameStateSnapshot(
  deps: ApplySnapshotDeps,
  nextState: GameStateSnapshot,
  options: {
    refreshStandingOrders?: boolean;
    updateGameStateSidebarUi?: boolean;
    updateSelectionUi?: boolean;
    updateGameOverUi?: boolean;
    updateReadyButton?: boolean;
    refreshBuildPopup?: boolean;
    redraw?: boolean;
  } = {}
): Promise<void> {
  const previousState = S.gameState;
  S.gameState = nextState;
  deps.rebuildUnitDisplayNameLookup(nextState);
  deps.reconcileSelectionToCurrentState();
  deps.updateClientStaleEnemyIntel(previousState, nextState);
  if (!S.initialCameraApplied && nextState.hexes.length > 0) {
    applyInitialCameraForState(nextState);
  }
  deps.clearRes1TooltipSummaryCaches();
  if (options.refreshStandingOrders) await deps.refreshHumanStandingOrders();
  if (options.updateGameStateSidebarUi) deps.updateGameStateSidebar(nextState);
  if (options.updateSelectionUi) {
    deps.updateRangedSidebar();
    deps.updateSidebar();
    deps.updatePendingOrdersSidebar();
  }
  if (options.updateGameOverUi) deps.updateGameOverUI(nextState);
  if (options.updateReadyButton) deps.updateReadyButtonState();
  if (options.redraw) deps.redraw();
  if (options.refreshBuildPopup) deps.refreshBuildPopupIfOpen();
}

export function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void {
  const currentTurn = state.turnNumber;
  const hasFogData = Array.isArray(state.visibleHexes);
  const visibleHexes = hasFogData ? new Set(state.visibleHexes!) : new Set<string>();
  const visibleEnemiesNow = state.units.filter((u) => u.player !== 'human');
  const visibleEnemyIdsNow = new Set(visibleEnemiesNow.map((u) => u.id));
  const visibleEnemyHexesNow = new Set(visibleEnemiesNow.map((u) => u.h3Index));

  for (const enemy of visibleEnemiesNow) {
    S.lastObservedEnemyByUnitId.set(enemy.id, { h3Index: enemy.h3Index, lastSeenTurn: currentTurn });
    S.clientStaleEnemyIntelByUnitId.delete(enemy.id);
  }

  if (previousState) {
    const previousVisibleEnemies = previousState.units.filter((u) => u.player !== 'human');
    for (const enemy of previousVisibleEnemies) {
      if (visibleEnemyIdsNow.has(enemy.id)) continue;
      S.lastObservedEnemyByUnitId.set(enemy.id, {
        h3Index: enemy.h3Index,
        lastSeenTurn: previousState.turnNumber,
      });
      if (!hasFogData || !visibleHexes.has(enemy.h3Index)) {
        S.clientStaleEnemyIntelByUnitId.set(enemy.id, {
          unitId: enemy.id,
          lastKnownH3Index: enemy.h3Index,
          lastSeenTurn: previousState.turnNumber,
          staleUntilTurn: previousState.turnNumber + 2,
        });
      }
    }
  }

  for (const [unitId, stale] of S.clientStaleEnemyIntelByUnitId) {
    const isNowVisible = visibleEnemyIdsNow.has(unitId);
    const contradictedOnVisibleHex = hasFogData && visibleHexes.has(stale.lastKnownH3Index) && !visibleEnemyHexesNow.has(stale.lastKnownH3Index);
    const expired = currentTurn > stale.staleUntilTurn;
    if (isNowVisible || contradictedOnVisibleHex || expired) {
      S.clientStaleEnemyIntelByUnitId.delete(unitId);
      S.lastRenderedVisibleEnemyByUnitId.delete(unitId);
    }
  }
}
