import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { clearRememberedUnitOrigins } from '../core/unitOriginFlags';
import { clearOpenRouterLog } from '../openRouter/openRouterUiHelpers';
import { clearConsoleReports } from '../chrome/consoleReports';
import { tacticalReleaseRendererSessionForNewStrategicMatch } from '../tactical/tacticalUiOrchestration';
import { discardStrategicOrderUiStash } from '../tactical/tacticalStrategicOrderUiStash';
import { initializeScenarioRegionSelectorsOnOverlayOpen } from './newGameRegionUi';
import { readSelectedGameSizeFromDocument, registerGameSizeSelect, syncGameSizeCapPreview } from './newGameSizeUi';
import {
  randomizeNewGameStartMonth,
  readNewGameOptionChoices,
  readNewGameStartMonth,
  resetNewGameOptionControls,
} from './newGameOptionsUi';
import { newGameButtonTooltipText } from '../chrome/controlTooltipText';
import { installRendererGameMap } from '../core/installRendererGameMap';
import { blurMapChromeIfFocused } from '../core/uiState';
import { expandNewGameDialog, toggleNewGameDialogCollapsed } from './newGameDialogCollapse';
import { placeNewGameDialogAtInset, wireNewGameDialogMove } from './newGameDialogMove';
import {
  closeNewGameOverlayToMatch,
  forgetMatchUnderNewGame,
  holdMatchUnderNewGame,
  isMatchWaitingUnderNewGame,
} from './newGameReturn';
import { syncMapExtentToSnapshot } from '../map/mapExtent';
import { prepareNewGameMapPanel, readNewGameMapChoice, registerNewGameMapControls, selectedNewGameTab } from './newGameMapUi';
import { bindNewGameSides, readNewGameSeatsStart, refreshNewGameSides } from './newGameSidesUi';
import { showNewGameBanner } from './newGameBanner';
import { clearObserveAfterKnockout } from './observeIntent';
import { chooseStartMatchAi } from '../../shared/startMatchAiChoice';
import { applyStartMatchAiChoice, readStartMatchAiInput } from './newGameAiStart';
import { advanceRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { stopOpponentPlanning } from '../openRouter/openRouterRuntime';
import { clearResolutionPlaybackAnimationState } from '../tactical/tacticalUiOrchestration';
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
 * Stops the match that was left running under the new-game screen, just before a new one starts.
 *
 * Purpose: Opening the screen no longer stops the match, so the player can close it and carry on. Starting replaces the
 *   match, so its planning, playback, and battle must stop first, or their results could land on the new one.
 * When to use: From the Start handler, after the match epoch advances and before the start request.
 * Expected outcome: Nothing when no match is waiting. Otherwise the close control hides, the saved camera is dropped,
 *   opponent planning and playback stop, a battle under the screen is released, and the planning flags are cleared.
 * Exceptions: None.
 */
function stopMatchWaitingUnderNewGame(): void {
  if (!isMatchWaitingUnderNewGame()) return;
  forgetMatchUnderNewGame();
  void stopOpponentPlanning('new_game');
  clearResolutionPlaybackAnimationState();
  if (S.tacticalBattleSnapshot && S.gameState) {
    tacticalReleaseRendererSessionForNewStrategicMatch(S.gameState, false);
  }
  S.pendingDeferredStrategicPostResolutionConsult = false;
  S.pendingDeferredTacticalPostBeatConsult = false;
  S.readyRequestInFlight = false;
}

/**
 * Wires the new-game dialog's controls and its Start button.
 *
 * Purpose: Starts a match from the dialog's choices and resets every renderer cache the old match left behind.
 * When to use: Once at renderer startup.
 * Expected outcome: The randomize buttons, the game-size caps, the panel's grip, and its close control are live. Close
 *   goes back to a match waiting under the screen. Clicking Start stops that match, if any, then sends
 *   fog, the four bonus levels, the starting month, home regions, and game size to `newGame`. Auto-start AI is not sent.
 *   A successful start then applies that click-time choice: planning turns on, or Run turns off and the Opponent tab opens.
 *   A failure leaves Run and the console unchanged. Start reloads the map,
 *   sidebars, and overlay from the returned state. The overlay closes, and the map is resized beside the console,
 *   before the loaded extent is fit. Start then zooms one level toward human infantry and armor, or any human units
 *   when those are absent. While that attempt runs, a preview reply cannot move the camera. Failures are logged with
 *   `console.error`, and the dialog's map is framed again.
 * Exceptions: None; click handler errors are caught.
 */
export function registerNewGameButton(deps: NewGameDeps): void {
  document.getElementById('new-game-dialog-collapse')?.addEventListener('click', () => {
    toggleNewGameDialogCollapsed();
  });
  wireNewGameDialogMove();
  document.getElementById('new-game-dialog-close')?.addEventListener('click', () => {
    closeNewGameOverlayToMatch(deps);
  });
  registerRegionRandomizeButtons();
  registerNewGameMapControls();
  bindNewGameSides();
  registerGameSizeSelect();
  document.getElementById('new-game-btn')?.addEventListener('click', async () => {
    const startMatchAi = chooseStartMatchAi(readStartMatchAiInput());
    if (!window.gameApi?.newGame) return;
    const seatsStart = readNewGameSeatsStart();
    if (seatsStart.blocked) {
      showMapToast(seatsStart.blocked);
      return;
    }
    const matchEpoch = advanceRendererMatchEpoch();
    stopMatchWaitingUnderNewGame();
    const cameraHold = holdNewGameMapPreviewCamera();
    try {
      const state = (await window.gameApi.newGame({
        ...readNewGameOptionChoices(),
        startMonth: readNewGameStartMonth(),
        ...readNewGameMapChoice(),
        seats: seatsStart.seats,
        turnLimit: seatsStart.turnLimit,
        gameSize: readSelectedGameSizeFromDocument(),
      })) as GameStateSnapshot;
      if (!rendererMatchEpochCurrent(matchEpoch)) return;
      installRendererGameMap(state);
      await deps.refreshTacticalTerrainOverridesForRenderer({ reloadStaticOverlays: true });
      S.gameState = state;
      S.strategicScenarioInitialLeafletView = null;
      tacticalReleaseRendererSessionForNewStrategicMatch(state);
      clearObserveAfterKnockout();
      clearRememberedUnitOrigins();
      deps.rebuildUnitDisplayNameLookup(state);
      deps.reconcileSelectionToCurrentState();
      S.clientStaleEnemyIntelByUnitId.clear();
      S.lastObservedEnemyByUnitId.clear();
      S.lastRenderedVisibleEnemyByUnitId.clear();
      deps.updateClientStaleEnemyIntel(null, state);
      S.initialCameraApplied = false;
      deps.updateGameOverUI(state);
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
      S.pendingDeferredStrategicPostResolutionConsult = false;
      S.pendingDeferredTacticalPostBeatConsult = false;
      clearOpenRouterLog();
      clearConsoleReports();
      deps.updateOpenRouterCostLabel();
      deps.updateGameStateSidebar(state);
      await deps.refreshHumanStandingOrders();
      deps.updatePendingOrdersSidebar();
      deps.updateRangedSidebar();
      deps.updateSidebar();
      await applyStartMatchAiChoice(startMatchAi, {
        startPlanning: () => deps.startBackgroundRequestIfAllowed(),
        updateReadyButtonState: () => deps.updateReadyButtonState(),
      });
      deps.resizeAndRedraw();
    } catch (err) {
      console.error('newGame failed:', err);
      showMapToast('The new game did not start. This screen stays open.');
      if (releaseNewGameMapPreviewCamera(cameraHold)) void refreshNewGameMapPreview();
    }
  });
}

/**
 * Opens the new-game dialog mid-match from the game menu.
 *
 * Purpose: Lets the player set up a new match while the current one keeps running underneath, then either start the
 *   new match or close the dialog and carry on.
 * When to use: The game menu's New game item.
 * Expected outcome: Returns false, and changes nothing, while the annihilation dialog is open or a Ready is being
 *   resolved. Otherwise, when the overlay was hidden and a live match is loaded, that match is marked as waiting, its
 *   camera is saved, and the renderer match epoch moves forward; nothing about the match stops. Moving the epoch
 *   retires a Ready, battle-exit, or battle-start handler that is still awaiting its reply, so its result cannot land
 *   on the match after close or on the new match after Start. A reply already in flight when the screen opened is
 *   discarded rather than applied. Fog of war, Auto-start AI, and the bonus dropdowns return to their defaults, the home regions,
 *   starting month, and map preview are drawn again, the panel opens expanded at the map's corner, and the overlay
 *   opens. Returns true only when this call removes `hidden` from `#game-over-overlay`.
 * Exceptions: None.
 */
export function openNewGameOverlayFromModelTab(setMainUIControlsEnabled: (enabled: boolean) => void, updateReadyButtonState: () => void): boolean {
  if (S.tacticalAnnihilationOutcomeDialog != null) return false;
  if (S.readyRequestInFlight) return false;
  const overlay = document.getElementById('game-over-overlay');
  const newGameBtn = document.getElementById('new-game-btn');
  const opened = overlay?.classList.contains('hidden') === true;
  if (opened && S.gameState && S.gameState.hexes.length > 0 && !S.gameState.gameOver) {
    holdMatchUnderNewGame();
    advanceRendererMatchEpoch();
  }
  showNewGameBanner('newGame', selectedNewGameTab());
  if (newGameBtn) {
    newGameBtn.textContent = 'Start game';
    newGameBtn.setAttribute('data-control-tooltip', newGameButtonTooltipText(true));
  }
  resetNewGameOptionControls();
  void (async () => {
    await Promise.all([initializeScenarioRegionSelectorsOnOverlayOpen(), prepareNewGameMapPanel()]);
    refreshNewGameSides({ reset: true });
    await refreshNewGameMapPreview();
  })();
  syncGameSizeCapPreview();
  overlay?.classList.remove('hidden');
  expandNewGameDialog();
  placeNewGameDialogAtInset();
  blurMapChromeIfFocused();
  resetNewGameMapPreviewFrame();
  repaintNewGameMapPreview();
  setMainUIControlsEnabled(false);
  updateReadyButtonState();
  return opened;
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
