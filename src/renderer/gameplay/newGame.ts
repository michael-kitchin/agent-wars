import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { clearRememberedUnitOrigins } from '../core/unitOriginFlags';
import { clearOpenRouterLog } from '../openRouter/openRouterUiHelpers';
import { resetPrecomputedAiState } from '../openRouter/precomputedAiState';
import { tacticalReleaseRendererSessionForNewStrategicMatch } from '../tactical/tacticalUiOrchestration';
import { discardStrategicOrderUiStash } from '../tactical/tacticalStrategicOrderUiStash';
import {
  getSelectedScenarioRegions,
  initializeScenarioRegionSelectorsOnOverlayOpen,
  randomizeScenarioRegionSelect,
} from './newGameRegionUi';
import { readSelectedGameSizeFromDocument, registerGameSizeSelect, syncGameSizeCapPreview } from './newGameSizeUi';
import {
  randomizeNewGameStartMonth,
  readNewGameOptionChoices,
  readNewGameStartMonth,
  registerNewGameOptionSeparators,
  resetNewGameOptionControls,
} from './newGameOptionsUi';
import { newGameButtonTooltipText } from '../chrome/controlTooltipText';
import { installRendererGameMap } from '../core/installRendererGameMap';
import { blurMapChromeIfFocused } from '../core/uiState';
import { syncMapExtentToSnapshot } from '../map/mapExtent';
import { prepareNewGameMapPanel, readNewGameMapChoice, regionalStartBlocked, registerNewGameMapControls } from './newGameMapUi';
import {
  holdNewGameMapPreviewCamera,
  refreshNewGameMapPreview,
  releaseNewGameMapPreviewCamera,
  resetNewGameMapPreviewFrame,
} from './newGameMapPreviewUi';
import { repaintNewGameMapPreview } from '../map/newGameMapPreviewRendering';
import { showMapToast } from '../openRouter/openRouterUiHelpers';

/**
 * Wires the new-game randomize buttons.
 *
 * Purpose: Each button redraws only the control beside it.
 * When to use: Once, while the renderer is starting.
 * Expected outcome: Human and AI region buttons redraw those dropdowns and refresh the map preview. The starting-month button redraws the month list and the weather icons. The weather and tech bonus dropdowns redraw the icons. A missing button is skipped.
 * Exceptions: None.
 */
function registerRegionRandomizeButtons(): void {
  document.getElementById('new-game-human-region-randomize')?.addEventListener('click', () => {
    randomizeScenarioRegionSelect('new-game-human-region-select');
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-ai-region-randomize')?.addEventListener('click', () => {
    randomizeScenarioRegionSelect('new-game-ai-region-select');
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-human-region-select')?.addEventListener('change', () => {
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-ai-region-select')?.addEventListener('change', () => {
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-start-month-randomize')?.addEventListener('click', () => {
    randomizeNewGameStartMonth();
    repaintNewGameMapPreview();
  });
  document.getElementById('new-game-start-month')?.addEventListener('change', () => {
    repaintNewGameMapPreview();
  });
  document.getElementById('new-game-weather-bonus-select')?.addEventListener('change', () => {
    repaintNewGameMapPreview();
  });
  document.getElementById('new-game-tech-bonus-select')?.addEventListener('change', () => {
    repaintNewGameMapPreview();
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
   * Specifies the contract for the `refreshTacticalTerrainOverridesForRenderer` member.
   *
   * Contract: Reloads tactical terrain override rows from main. Pass `{ reloadStaticOverlays: true }` to also
   * re-fetch static city/road/rail/vector overlay payloads (required after `newGame` resets all terrain).
   * When to use: After newGame (with reloadStaticOverlays), and on routine Ready refreshes (without it).
   * Expected outcome: Renderer maps aligned with main-process caches after the promise settles.
   * Exceptions: None; implementations log failures without throwing.
   */
refreshTacticalTerrainOverridesForRenderer: (options?: { reloadStaticOverlays?: boolean }) => Promise<void>;
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
   * Specifies the contract for the `clearStrategicTooltipSummaryCaches` member (clearStrategicTooltipSummaryCaches: () => void;).

   * Contract: Describes stable behavior for callers of `clearStrategicTooltipSummaryCaches` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearStrategicTooltipSummaryCaches: () => void;
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
 * Wires the new-game dialog's controls and its Start button.
 *
 * Purpose: Starts a match from the dialog's choices and resets every renderer cache the old match left behind.
 * When to use: Once at renderer startup.
 * Expected outcome: The randomize buttons, game-size preview, and bonus-line separators are live. Clicking Start sends
 *   fog, the four bonus levels, the starting month, home regions, and game size to `newGame`, then reloads the map,
 *   sidebars, and overlay from the returned state. Start fits the loaded extent, then zooms one level toward human infantry and armor, or any human units when those are absent.
 *   While that attempt runs, a preview reply cannot move the camera. Failures are logged to the console and the dialog's map is framed again.
 * Exceptions: None; click handler errors are caught.
 */
export function registerNewGameButton(deps: NewGameDeps): void {
  registerRegionRandomizeButtons();
  registerNewGameMapControls();
  registerGameSizeSelect();
  registerNewGameOptionSeparators();
  document.getElementById('new-game-btn')?.addEventListener('click', async () => {
    if (!window.gameApi?.newGame) return;
    if (regionalStartBlocked()) {
      showMapToast('This map has no two sides.');
      return;
    }
    const cameraHold = holdNewGameMapPreviewCamera();
    try {
      const selectedRegions = getSelectedScenarioRegions();
      const state = (await window.gameApi.newGame({
        ...readNewGameOptionChoices(),
        startMonth: readNewGameStartMonth(),
        humanHomeRegion: selectedRegions.humanHomeRegion,
        aiHomeRegion: selectedRegions.aiHomeRegion,
        ...readNewGameMapChoice(),
        gameSize: readSelectedGameSizeFromDocument(),
      })) as GameStateSnapshot;
      installRendererGameMap(state);
      await deps.refreshTacticalTerrainOverridesForRenderer({ reloadStaticOverlays: true });
      S.gameState = state;
      S.strategicScenarioInitialLeafletView = null;
      tacticalReleaseRendererSessionForNewStrategicMatch(state);
      clearRememberedUnitOrigins();
      deps.rebuildUnitDisplayNameLookup(state);
      deps.reconcileSelectionToCurrentState();
      S.clientStaleEnemyIntelByUnitId.clear();
      S.lastObservedEnemyByUnitId.clear();
      S.lastRenderedVisibleEnemyByUnitId.clear();
      deps.updateClientStaleEnemyIntel(null, state);
      S.initialCameraApplied = false;
      syncMapExtentToSnapshot(state, { refit: true });
      if (state.hexes.length > 0) {
        deps.applyInitialCameraForState(state);
      }
      deps.clearStrategicTooltipSummaryCaches();
      S.humanStandingOrders = [];
      S.hoverRoutePreview = null;
      deps.clearPendingTacticalOrders();
      discardStrategicOrderUiStash();
      S.selectedUnitIds = [];
      S.selectedUnitIdsAtMouseDown = [];
      S.gestureSelectionSnapshotAtMs = 0;
      S.selectedHexIndex = null;
      deps.hideStackCallout();
      resetPrecomputedAiState('null');
      S.pendingDeferredStrategicPostResolutionConsult = false;
      S.pendingDeferredTacticalPostBeatConsult = false;
      S.backgroundRequestInFlight = false;
      S.eventDrivenInitialConsultationDone = false;
      S.openRouterGameCost = 0;
      clearOpenRouterLog();
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
      showMapToast('The new game did not start. This screen stays open.');
      if (releaseNewGameMapPreviewCamera(cameraHold)) void refreshNewGameMapPreview();
    }
  });
}

/**
 * Opens the new-game dialog mid-match from the Model tab.
 *
 * Purpose: Lets the player abandon the current match; stops pending AI work first so it cannot land on the new one.
 * When to use: The Model tab's New game button.
 * Expected outcome: During a battle or resolution playback the click returns without cancelling planning, showing
 *   the overlay, or disabling the map. Otherwise AI requests are cancelled, Fog of war and the bonus dropdowns
 *   return to their defaults, the home regions, starting month, and map preview are drawn again, and the new-game overlay opens.
 * Exceptions: None.
 */
export function openNewGameOverlayFromModelTab(setMainUIControlsEnabled: (enabled: boolean) => void, updateReadyButtonState: () => void): void {
  if (S.tacticalBattleSnapshot != null || S.resolutionMoveAnimation != null) return;
  window.gameApi?.cancelRequestAiOrders?.();
  resetPrecomputedAiState('null');
  S.pendingDeferredStrategicPostResolutionConsult = false;
  S.pendingDeferredTacticalPostBeatConsult = false;
  S.backgroundRequestInFlight = false;
  S.readyRequestInFlight = false;
  S.eventDrivenInitialConsultationDone = false;
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  if (messageEl) {
    messageEl.textContent = 'Start a new world map game when ready.';
    messageEl.style.display = '';
  }
  if (newGameBtn) {
    newGameBtn.textContent = 'Start game';
    newGameBtn.setAttribute('data-control-tooltip', newGameButtonTooltipText(true));
  }
  resetNewGameOptionControls();
  void (async () => {
    await Promise.all([initializeScenarioRegionSelectorsOnOverlayOpen(), prepareNewGameMapPanel()]);
    await refreshNewGameMapPreview();
  })();
  syncGameSizeCapPreview();
  overlay?.classList.remove('hidden');
  blurMapChromeIfFocused();
  resetNewGameMapPreviewFrame();
  repaintNewGameMapPreview();
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
