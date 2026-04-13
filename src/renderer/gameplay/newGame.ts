import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';
import { tacticalReleaseRendererSessionForNewStrategicMatch } from '../tactical/tacticalUiOrchestration';
import { discardStrategicOrderUiStash } from '../tactical/tacticalStrategicOrderUiStash';
import {
  getSelectedScenarioRegions,
  initializeScenarioRegionSelectorsOnOverlayOpen,
  randomizeScenarioRegionSelect,
} from './newGameRegionUi';

/**
 * Defines the `registerRegionRandomizeButtons` function shape (function registerRegionRandomizeButtons(): void).

 * Purpose: Supports maintainability by documenting why `registerRegionRandomizeButtons` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function registerRegionRandomizeButtons(): void {
  document.getElementById('new-game-human-region-randomize')?.addEventListener('click', () => {
    randomizeScenarioRegionSelect('new-game-human-region-select');
  });
  document.getElementById('new-game-ai-region-randomize')?.addEventListener('click', () => {
    randomizeScenarioRegionSelect('new-game-ai-region-select');
  });
}

/**
 * Documents the `NewGameDeps` type alias (type NewGameDeps).

 * Purpose: Supports maintainability by documenting why `NewGameDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
type NewGameDeps = {
    /**
   * Specifies the contract for the `refreshRes4TerrainOverridesForRenderer` member (refreshRes4TerrainOverridesForRenderer: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshRes4TerrainOverridesForRenderer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshRes4TerrainOverridesForRenderer: () => Promise<void>;
    /**
   * Specifies the contract for the `rebuildUnitDisplayNameLookup` member (rebuildUnitDisplayNameLookup: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `rebuildUnitDisplayNameLookup` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
rebuildUnitDisplayNameLookup: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `reconcileSelectionToCurrentState` member (reconcileSelectionToCurrentState: () => void;).

   * Contract: Describes stable behavior for callers of `reconcileSelectionToCurrentState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
reconcileSelectionToCurrentState: () => void;
    /**
   * Specifies the contract for the `updateClientStaleEnemyIntel` member (updateClientStaleEnemyIntel: (previousState: GameStateSnapshot | null, state: GameStateSnapshot) => void;).

   * Contract: Describes stable behavior for callers of `updateClientStaleEnemyIntel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateClientStaleEnemyIntel: (previousState: GameStateSnapshot | null, state: GameStateSnapshot) => void;
    /**
   * Specifies the contract for the `applyInitialCameraForState` member (applyInitialCameraForState: (state: GameStateSnapshot) => void;).

   * Contract: Describes stable behavior for callers of `applyInitialCameraForState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyInitialCameraForState: (state: GameStateSnapshot) => void;
    /**
   * Specifies the contract for the `clearRes1TooltipSummaryCaches` member (clearRes1TooltipSummaryCaches: () => void;).

   * Contract: Describes stable behavior for callers of `clearRes1TooltipSummaryCaches` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearRes1TooltipSummaryCaches: () => void;
    /**
   * Specifies the contract for the `clearPendingTacticalOrders` member (clearPendingTacticalOrders: () => void;).

   * Contract: Describes stable behavior for callers of `clearPendingTacticalOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearPendingTacticalOrders: () => void;
    /**
   * Specifies the contract for the `hideStackCallout` member (hideStackCallout: () => void;).

   * Contract: Describes stable behavior for callers of `hideStackCallout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideStackCallout: () => void;
    /**
   * Specifies the contract for the `updateOpenRouterCostLabel` member (updateOpenRouterCostLabel: () => void;).

   * Contract: Describes stable behavior for callers of `updateOpenRouterCostLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateOpenRouterCostLabel: () => void;
    /**
   * Specifies the contract for the `updateGameStateSidebar` member (updateGameStateSidebar: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `updateGameStateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHumanStandingOrders: () => Promise<void>;
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
   * Specifies the contract for the `updateGameOverUI` member (updateGameOverUI: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `updateGameOverUI` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameOverUI: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `updateReadyButtonState` member (updateReadyButtonState: () => void;).

   * Contract: Describes stable behavior for callers of `updateReadyButtonState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateReadyButtonState: () => void;
    /**
   * Specifies the contract for the `startBackgroundRequestIfAllowed` member (startBackgroundRequestIfAllowed: () => void;).

   * Contract: Describes stable behavior for callers of `startBackgroundRequestIfAllowed` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
startBackgroundRequestIfAllowed: () => void;
    /**
   * Specifies the contract for the `resizeAndRedraw` member (resizeAndRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `resizeAndRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resizeAndRedraw: () => void;
    /**
   * Specifies the contract for the `setMainUIControlsEnabled` member (setMainUIControlsEnabled: (enabled: boolean) => void;).

   * Contract: Describes stable behavior for callers of `setMainUIControlsEnabled` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
setMainUIControlsEnabled: (enabled: boolean) => void;
};

/**
 * Defines the `registerNewGameButton` function shape (export function registerNewGameButton(deps: NewGameDeps): void).

 * Purpose: Supports maintainability by documenting why `registerNewGameButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function registerNewGameButton(deps: NewGameDeps): void {
  void initializeScenarioRegionSelectorsOnOverlayOpen();
  registerRegionRandomizeButtons();
  document.getElementById('new-game-btn')?.addEventListener('click', async () => {
    if (!window.gameApi?.newGame) return;
    try {
      const fogCheckbox = document.getElementById('new-game-fog-checkbox') as HTMLInputElement | null;
      const selectedRegions = getSelectedScenarioRegions();
      const state = (await window.gameApi.newGame({
        fogOfWarEnabled: fogCheckbox?.checked !== false,
        humanHomeRegion: selectedRegions.humanHomeRegion,
        aiHomeRegion: selectedRegions.aiHomeRegion,
      })) as GameStateSnapshot;
      await deps.refreshRes4TerrainOverridesForRenderer();
      S.gameState = state;
      S.strategicScenarioInitialLeafletView = null;
      tacticalReleaseRendererSessionForNewStrategicMatch(state);
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
      discardStrategicOrderUiStash();
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

/**
 * Defines the `openNewGameOverlayFromModelTab` function shape (export function openNewGameOverlayFromModelTab(setMainUIControlsEnabled: (enabled: boolean) => void, updateReadyButtonState: () => void): void).

 * Purpose: Supports maintainability by documenting why `openNewGameOverlayFromModelTab` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  void initializeScenarioRegionSelectorsOnOverlayOpen();
  overlay?.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  updateReadyButtonState();
}

/**
 * Defines the `refreshHumanStandingOrders` function shape (export async function refreshHumanStandingOrders(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshHumanStandingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
