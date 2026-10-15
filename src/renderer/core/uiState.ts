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
import { expandNewGameDialog, newGameOverlayIsOpen, syncNewGameDialogMapPointer } from '../gameplay/newGameDialogCollapse';
import { renderTopBarStatus } from '../chrome/topBar';
import { closeGameMenu, syncGameMenuNewGameItem } from '../chrome/gameMenu';
import { refreshConsoleHeader } from '../chrome/consoleFrame';
import { syncSidebarOrderRowSelection } from '../gameplay/sidebarOrderRow';
import { renderSelectionPanel } from '../gameplay/selectionPanel';
import { renderSelectionBarState } from '../gameplay/selectionBar';

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
 * Refreshes the match status in the top bar, the console header, and the selection bar's hint, from the latest snapshot.
 *
 * Purpose: Keeps the name every caller already uses; the old Phase and Turn lines now live in the top bar.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The top bar's sides, readouts, and date block match `state` and the current battle. The
 *   console subtitle follows the active tab: the queued-order line, "this match", or the opponent's home region.
 *   The selection bar's hint follows playback, which starts and ends around these calls. Null shows em dashes in the
 *   top bar.
 * Exceptions: None.
 */
export function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  renderTopBarStatus(state);
  refreshConsoleHeader();
  renderSelectionBarState();
}

/**
 * Drops focus and a control tip from chrome the new-game overlay is about to cover.
 *
 * Purpose: The minimap panel, the legend, the top bar, the game menu, and the console are not on screen while that overlay is open. A focused control would still take keys, and a tip for New game would stay up over the map.
 * When to use: When that overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: Focus leaves the minimap panel, the legend, the top bar, the game menu, or the console. A dialog control that already has focus is left alone. A tip whose control has no box is dismissed.
 * Exceptions: None.
 */
export function blurMapChromeIfFocused(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const insideHiddenChrome = active.closest('#minimap-panel') != null
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
 * Expected outcome: Children of the map pane other than the annihilation dialog, and the console, ignore the pointer
 *   while `enabled` is false. The top bar does too, except while the new-game overlay is open: it is the new-game bar
 *   then, and its game menu keeps working. The game menu closes whenever the top bar stops taking the pointer, and its
 *   New game item follows the overlay. The new-game overlay sits beside the map pane, not in it, so this never turns
 *   it off. While it is open, the main map takes the pointer again so drag and the wheel move the preview.
 * Exceptions: None.
 */
export function setMainUIControlsEnabled(enabled: boolean): void {
  const container = document.getElementById('canvas-container');
  if (container) {
    for (const child of container.children) {
      const id = (child as HTMLElement).id;
      if (id === 'tactical-annihilation-overlay') continue;
      (child as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    }
  }
  const topBarEnabled = enabled || newGameOverlayIsOpen();
  const chromeEnabled: readonly (readonly [string, boolean])[] = [
    ['app-topbar', topBarEnabled],
    ['sidebar', enabled],
  ];
  for (const [id, on] of chromeEnabled) {
    const chrome = document.getElementById(id);
    if (!chrome) continue;
    chrome.style.pointerEvents = on ? '' : 'none';
    chrome.classList.toggle('main-ui-disabled', !on);
  }
  if (!topBarEnabled) closeGameMenu();
  syncGameMenuNewGameItem();
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
 *   drawn only when the overlay opens, and that open closes the game menu. The choices start showing only on that
 *   open. A later refresh leaves hidden choices hidden.
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
    closeGameMenu();
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
