import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';

type NewGameDeps = {
  refreshRes4TerrainOverridesForRenderer: () => Promise<void>;
  rebuildUnitDisplayNameLookup: (state: GameStateSnapshot | null) => void;
  reconcileSelectionToCurrentState: () => void;
  updateClientStaleEnemyIntel: (previousState: GameStateSnapshot | null, state: GameStateSnapshot) => void;
  applyInitialCameraForState: (state: GameStateSnapshot) => void;
  clearRes1TooltipSummaryCaches: () => void;
  clearPendingTacticalOrders: () => void;
  hideStackCallout: () => void;
  updateOpenRouterCostLabel: () => void;
  updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
  refreshHumanStandingOrders: () => Promise<void>;
  updatePendingOrdersSidebar: () => void;
  updateRangedSidebar: () => void;
  updateSidebar: () => void;
  updateGameOverUI: (state: GameStateSnapshot | null) => void;
  updateReadyButtonState: () => void;
  startBackgroundRequestIfAllowed: () => void;
  resizeAndRedraw: () => void;
  setMainUIControlsEnabled: (enabled: boolean) => void;
};

export function registerNewGameButton(deps: NewGameDeps): void {
  document.getElementById('new-game-btn')?.addEventListener('click', async () => {
    if (!window.gameApi?.newGame) return;
    try {
      const fogCheckbox = document.getElementById('new-game-fog-checkbox') as HTMLInputElement | null;
      const state = (await window.gameApi.newGame({
        fogOfWarEnabled: fogCheckbox?.checked !== false,
      })) as GameStateSnapshot;
      await deps.refreshRes4TerrainOverridesForRenderer();
      S.gameState = state;
      deps.rebuildUnitDisplayNameLookup(state);
      deps.reconcileSelectionToCurrentState();
      S.clientStaleEnemyIntelByUnitId.clear();
      S.lastObservedEnemyByUnitId.clear();
      S.lastRenderedVisibleEnemyByUnitId.clear();
      deps.updateClientStaleEnemyIntel(null, state);
      S.initialCameraApplied = false;
      if (state.hexes.length > 0) {
        deps.applyInitialCameraForState(state);
      }
      deps.clearRes1TooltipSummaryCaches();
      S.humanStandingOrders = [];
      S.hoverRoutePreview = null;
      deps.clearPendingTacticalOrders();
      S.selectedUnitIds = [];
      S.selectedUnitIdsAtMouseDown = [];
      S.selectedHexIndex = null;
      deps.hideStackCallout();
      resetPrecomputedAiState('null');
      S.backgroundRequestInFlight = false;
      S.eventDrivenInitialConsultationDone = false;
      S.openRouterGameCost = 0;
      deps.updateOpenRouterCostLabel();
      deps.updateGameStateSidebar(state);
      await deps.refreshHumanStandingOrders();
      deps.updatePendingOrdersSidebar();
      deps.updateRangedSidebar();
      deps.updateSidebar();
      deps.updateGameOverUI(state);
      deps.updateReadyButtonState();
      if (S.runButtonOn) deps.startBackgroundRequestIfAllowed();
      deps.resizeAndRedraw();
    } catch (err) {
      console.error('newGame failed:', err);
    }
  });
}

export function openNewGameOverlayFromModelTab(setMainUIControlsEnabled: (enabled: boolean) => void, updateReadyButtonState: () => void): void {
  window.gameApi?.cancelRequestAiOrders?.();
  resetPrecomputedAiState('null');
  S.backgroundRequestInFlight = false;
  S.readyRequestInFlight = false;
  S.eventDrivenInitialConsultationDone = false;
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  const fogCheckbox = document.getElementById('new-game-fog-checkbox') as HTMLInputElement | null;
  if (messageEl) {
    messageEl.textContent = 'Start a new world map game when ready.';
    messageEl.style.display = '';
  }
  if (newGameBtn) newGameBtn.textContent = 'Start game';
  if (fogCheckbox) fogCheckbox.checked = true;
  overlay?.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  updateReadyButtonState();
}

export async function refreshHumanStandingOrders(): Promise<void> {
  if (!window.gameApi?.listHumanStandingOrders) {
    S.humanStandingOrders = [];
    return;
  }
  try {
    S.humanStandingOrders = await window.gameApi.listHumanStandingOrders();
  } catch {
    S.humanStandingOrders = [];
  }
}
