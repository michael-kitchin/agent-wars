import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { formatSidebarPhaseText } from '../../shared/sidebarPhaseLabel';
import { formatWeatherIconHtml } from '../../shared/weatherIcons';
import { rendererSharedState as S } from './state';
import { setUnitNameContent } from './unitOriginFlags';
import { initializeScenarioRegionSelectorsOnOverlayOpen } from '../gameplay/newGameRegionUi';
import { prepareNewGameMapPanel } from '../gameplay/newGameMapUi';
import { refreshNewGameMapPreview, resetNewGameMapPreviewFrame } from '../gameplay/newGameMapPreviewUi';
import { repaintNewGameMapPreview } from '../map/newGameMapPreviewRendering';
import { syncGameSizeCapPreview } from '../gameplay/newGameSizeUi';
import { resetNewGameOptionControls } from '../gameplay/newGameOptionsUi';
import { newGameButtonTooltipText } from '../chrome/controlTooltipText';

/**
 * Title-cases the strategic phase id from main (`planning` / `resolution`) for the sidebar line.
 *
 * Purpose: Keeps raw enum-style ids out of the player-facing panel while remaining stable if new phases are added.
 * When to use: Only from `updateGameStateSidebar` when `state.phase` is present.
 * Expected outcome: `Planning`, `Resolution`, or similar single-token labels.
 * Exceptions: None; empty string passes through unchanged.
 */
function formatStrategicPhaseLabelForSidebar(phase: string): string {
  if (!phase) return phase;
  return phase.charAt(0).toUpperCase() + phase.slice(1).toLowerCase();
}

/**
 * Refreshes the selected-unit line in the right sidebar.
 *
 * Purpose: Shows which unit the player has selected, with its origin flag.
 * When to use: After any selection change or snapshot that can change unit names.
 * Expected outcome: The primary unit's flag and name, followed by ` (+N)` when more units are selected;
 *   an em dash when nothing is selected.
 * Exceptions: None.
 */
export function updateSidebar(
  getPrimarySelectedUnitId: () => string | null,
  formatUnitDisplayName: (unitId: string) => string
): void {
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
  if (selectedUnitEl) {
    const primary = getPrimarySelectedUnitId();
    if (!primary) {
      selectedUnitEl.textContent = S.selectedUnitIds.length <= 1 ? '—' : `— (+${S.selectedUnitIds.length - 1})`;
      return;
    }
    const extraCount = S.selectedUnitIds.length - 1;
    const suffix = extraCount > 0 ? ` (+${extraCount})` : '';
    setUnitNameContent(selectedUnitEl, primary, `${formatUnitDisplayName(primary)}${suffix}`);
  }
}

/**
 * Defines the `updateGameStateSidebar` function shape (export function updateGameStateSidebar(state: GameStateSnapshot | null): void).

 * Purpose: Refreshes phase and turn lines in the right sidebar from the latest snapshot.
 * When to use: After `applyGameStateSnapshot`, tactical entry/exit, tactical Ready commit, and when beat playback ends.
 * Expected outcome: The phase line is tactical planning or tactical resolution while a battle snapshot is set, otherwise the strategic label, or an em dash when `state` is null. `Turn:` shows `S.tacticalBattleSnapshot.tacticalTurnNumber` while a tactical session is active, otherwise `state.turnNumber`.
 * Exceptions: None.
 */
export function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  const phaseEl = document.getElementById('sidebar-phase');
  const turnEl = document.getElementById('sidebar-turn');
  if (phaseEl) {
    phaseEl.textContent = formatSidebarPhaseText({
      hasGameState: state != null,
      strategicPhaseLabel: state ? formatStrategicPhaseLabelForSidebar(state.phase) : '',
      battleActive: S.tacticalBattleSnapshot != null,
      beatPlaybackActive: S.resolutionMoveAnimation != null,
    });
  }
  if (turnEl) {
    if (!state) {
      turnEl.textContent = '—';
    } else if (S.tacticalBattleSnapshot) {
      const month = state.monthName ? ` · ${state.monthName}` : '';
      const weather = S.tacticalBattleSnapshot.weather
        ? ` · ${formatWeatherIconHtml(S.tacticalBattleSnapshot.weather)}`
        : '';
      turnEl.innerHTML = `Turn: ${S.tacticalBattleSnapshot.tacticalTurnNumber}${month}${weather}`;
    } else if (state.monthName) {
      turnEl.textContent = `Turn: ${state.turnNumber} · ${state.monthName}`;
    } else {
      turnEl.textContent = `Turn: ${state.turnNumber}`;
    }
  }
}

/**
 * Drops focus when it is inside the minimap or the terrain legend.
 *
 * Purpose: Those elements are hidden while the new-game overlay is open. A focused style dropdown would still take keys.
 * When to use: When that overlay goes from hidden to shown.
 * Expected outcome: Focus leaves the minimap or the legend. A dialog control that already has focus is left alone.
 * Exceptions: None.
 */
export function blurMapChromeIfFocused(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (active.closest('#minimap') != null || active.closest('#terrain-legend') != null) active.blur();
}

/**
 * Turns pointer input on or off for the map and the right panel.
 *
 * Purpose: The new-game overlay and the annihilation dialog stay clickable while the match controls do not.
 * When to use: When those overlays open or close, and when the tactical battles list opens or closes.
 * Expected outcome: Children of the map pane other than those two overlays ignore the pointer while `enabled` is false. The right panel matches.
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
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    (sidebar as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    sidebar.classList.toggle('main-ui-disabled', !enabled);
  }
}

/**
 * Shows or hides the new-game overlay to match the current state.
 *
 * Purpose: Keeps the overlay up while there is no game or the game is over, and the main controls disabled with it.
 * When to use: After every state refresh.
 * Expected outcome: With a live game the overlay hides and controls are enabled. Otherwise the overlay shows a
 *   win, loss, or start message. Fog of war and the bonus dropdowns return to their defaults on every call while
 *   it shows. The home regions, the starting month, and the map preview are drawn only when the overlay opens.
 * Exceptions: None.
 */
export function updateGameOverUI(
  state: GameStateSnapshot | null,
  updateReadyButtonState: () => void
): void {
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  const rangedBtn = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;

  const noGame = !state || state.hexes.length === 0;
  const gameOver = !!state?.gameOver;
  const showOverlay = noGame || gameOver;

  const wasHidden = overlay?.classList.contains('hidden') !== false;
  if (!showOverlay) {
    overlay?.classList.add('hidden');
    setMainUIControlsEnabled(true);
    if (rangedBtn) rangedBtn.disabled = false;
    updateReadyButtonState();
    return;
  }

  overlay?.classList.remove('hidden');
  resetNewGameOptionControls();
  if (wasHidden) {
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
  if (messageEl) {
    if (gameOver) {
      messageEl.textContent = state!.winner === 'human' ? 'You win!' : 'You lose.';
      messageEl.style.display = '';
    } else {
      messageEl.textContent = 'Start the world map game when ready.';
      messageEl.style.display = '';
    }
  }
  if (newGameBtn) {
    newGameBtn.textContent = noGame ? 'Start game' : 'New game';
    newGameBtn.setAttribute('data-control-tooltip', newGameButtonTooltipText(noGame));
  }
  if (rangedBtn) rangedBtn.disabled = true;
  updateReadyButtonState();
}
