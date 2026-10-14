import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { initializeScenarioRegionSelectorsOnOverlayOpen } from '../gameplay/newGameRegionUi';
import { prepareNewGameMapPanel, selectedNewGameTab } from '../gameplay/newGameMapUi';
import { showGameOverBanner, showNewGameBanner } from '../gameplay/newGameBanner';
import { refreshNewGameMapPreview, resetNewGameMapPreviewFrame } from '../gameplay/newGameMapPreviewUi';
import { repaintNewGameMapPreview } from '../map/newGameMapPreviewRendering';
import { syncGameSizeCapPreview } from '../gameplay/newGameSizeUi';
import { resetNewGameOptionControls } from '../gameplay/newGameOptionsUi';
import { dismissStaleControlTooltip } from '../chrome/controlTooltip';
import { newGameButtonTooltipText } from '../chrome/controlTooltipText';
import { expandNewGameDialog, syncNewGameDialogMapPointer } from '../gameplay/newGameDialogCollapse';
import { renderTopBarStatus } from '../chrome/topBar';
import { closeGameMenu } from '../chrome/gameMenu';
import { refreshConsoleHeader } from '../chrome/consoleFrame';
import { syncSidebarOrderRowSelection } from '../gameplay/sidebarOrderRow';
import { renderSelectionPanel } from '../gameplay/selectionPanel';

/**
 * Refreshes everything that shows the selection: the selection panel and the highlight of the order rows.
 *
 * Purpose: Keeps the name every caller already uses; the "Selected unit" line is now the selection panel.
 * When to use: After any selection change or snapshot that can change unit names.
 * Expected outcome: The selection panel describes the selected units, or hides when none are selected. Order rows of
 *   selected units are highlighted.
 * Exceptions: None.
 */
export function updateSidebar(formatUnitDisplayName: (unitId: string) => string): void {
  syncSidebarOrderRowSelection();
  renderSelectionPanel({ formatUnitDisplayName });
}

/**
 * Refreshes the match status in the top bar, and the console header that names the turn, from the latest snapshot.
 *
 * Purpose: Keeps the name every caller already uses; the old Phase and Turn lines now live in the top bar.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The top bar's sides, readouts, and date block match `state` and the current battle, and the
 *   console subtitle names the current turn or beat. Null shows em dashes.
 * Exceptions: None.
 */
export function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  renderTopBarStatus(state);
  refreshConsoleHeader();
}

/**
 * Drops focus and a control tip from chrome the new-game overlay is about to cover.
 *
 * Purpose: The minimap, the legend, the top bar, the game menu, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for New game would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap, the legend, the top bar, the game menu, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
 * Exceptions: None.
 */
export function blurMapChromeIfFocused(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const insideHiddenChrome = active.closest('#minimap') != null
      || active.closest('#terrain-legend') != null
      || active.closest('#app-topbar') != null
      || active.closest('#game-menu') != null
      || active.closest('#sidebar') != null;
    if (insideHiddenChrome) active.blur();
  }
  dismissStaleControlTooltip();
}

/**
 * Turns pointer input on or off for the map, the top bar, and the console.
 *
 * Purpose: The new-game overlay and the annihilation dialog stay clickable while the match controls do not.
 * When to use: When those overlays open or close, and when the tactical battles list opens or closes.
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The top bar and the console match, and the game menu closes. While the new-game form is hidden, the main map takes the pointer again so drag and the wheel still move the preview.
 * Exceptions: None.
 */
export function setMainUIControlsEnabled(enabled: boolean): void {
  const container = document.getElementById('canvas-container');
  if (container) {
    for (const child of container.children) {
      const id = (child as HTMLElement).id;
      if (id === 'game-over-overlay' || id === 'tactical-annihilation-overlay') continue;
      (child as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    }
  }
  for (const id of ['app-topbar', 'sidebar']) {
    const chrome = document.getElementById(id);
    if (!chrome) continue;
    chrome.style.pointerEvents = enabled ? '' : 'none';
    chrome.classList.toggle('main-ui-disabled', !enabled);
  }
  if (!enabled) closeGameMenu();
  syncNewGameDialogMapPointer();
}

/**
 * Shows or hides the new-game overlay to match the current state.
 *
 * Purpose: Keeps the overlay up while there is no game or the game is over, and the main controls disabled with it.
 * When to use: After every state refresh.
 * Expected outcome: Returns true only when `#game-over-overlay` gains or loses `hidden`. Returns false when it
 *   stays open, stays closed, or the element is missing. With a live game the overlay hides and controls are
 *   enabled. Otherwise the overlay shows a win, loss, or start message. Fog of war and the bonus dropdowns return
 *   to their defaults on every call while it shows. The home regions, the starting month, and the map preview are
 *   drawn only when the overlay opens. The form starts showing only on that open. A later refresh leaves a hidden
 *   form hidden.
 * Exceptions: None.
 */
export function updateGameOverUI(
  state: GameStateSnapshot | null,
  updateReadyButtonState: () => void
): boolean {
  const overlay = document.getElementById('game-over-overlay');
  const newGameBtn = document.getElementById('new-game-btn');

  const noGame = !state || state.hexes.length === 0;
  const gameOver = !!state?.gameOver;
  const showOverlay = noGame || gameOver;

  const wasHidden = overlay?.classList.contains('hidden') !== false;
  if (!showOverlay) {
    overlay?.classList.add('hidden');
    setMainUIControlsEnabled(true);
    updateReadyButtonState();
    return overlay != null && wasHidden === false;
  }

  overlay?.classList.remove('hidden');
  resetNewGameOptionControls();
  if (wasHidden) {
    expandNewGameDialog();
    blurMapChromeIfFocused();
    resetNewGameMapPreviewFrame();
    repaintNewGameMapPreview();
    void (async () => {
      await Promise.all([initializeScenarioRegionSelectorsOnOverlayOpen(), prepareNewGameMapPanel()]);
      await refreshNewGameMapPreview();
    })();
  }
  syncGameSizeCapPreview();
  setMainUIControlsEnabled(false);
  if (gameOver) {
    showGameOverBanner(state!.winner === 'human' ? 'You win!' : 'You lose.');
  } else {
    showNewGameBanner('startup', selectedNewGameTab());
  }
  if (newGameBtn) {
    newGameBtn.textContent = noGame ? 'Start game' : 'New game';
    newGameBtn.setAttribute('data-control-tooltip', newGameButtonTooltipText(noGame));
  }
  updateReadyButtonState();
  return overlay != null && wasHidden === true;
}
