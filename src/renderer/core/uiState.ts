import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { formatSidebarPhaseText } from '../../shared/sidebarPhaseLabel';
import { rendererSharedState as S } from './state';
import { initializeScenarioRegionSelectorsOnOverlayOpen } from '../gameplay/newGameRegionUi';
import { syncGameSizeCapPreview } from '../gameplay/newGameSizeUi';

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
 * Defines the `updateSidebar` function shape (export function updateSidebar().

 * Purpose: Supports maintainability by documenting why `updateSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateSidebar(
  getPrimarySelectedUnitId: () => string | null,
  formatUnitDisplayName: (unitId: string) => string
): void {
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');
  if (selectedUnitEl) {
    const primary = getPrimarySelectedUnitId();
    if (S.selectedUnitIds.length <= 1) selectedUnitEl.textContent = primary ? formatUnitDisplayName(primary) : '—';
    else selectedUnitEl.textContent = `${primary ? formatUnitDisplayName(primary) : '—'} (+${S.selectedUnitIds.length - 1})`;
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
      turnEl.textContent = `Turn: ${S.tacticalBattleSnapshot.tacticalTurnNumber}`;
    } else {
      turnEl.textContent = `Turn: ${state.turnNumber}`;
    }
  }
}

/**
 * Defines the `setMainUIControlsEnabled` function shape (export function setMainUIControlsEnabled(enabled: boolean): void).

 * Purpose: Supports maintainability by documenting why `setMainUIControlsEnabled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Defines the `updateGameOverUI` function shape (export function updateGameOverUI().

 * Purpose: Supports maintainability by documenting why `updateGameOverUI` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateGameOverUI(
  state: GameStateSnapshot | null,
  updateReadyButtonState: () => void
): void {
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  const fogCheckbox = document.getElementById('new-game-fog-checkbox') as HTMLInputElement | null;
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
  if (fogCheckbox) fogCheckbox.checked = true;
  if (wasHidden) {
    void initializeScenarioRegionSelectorsOnOverlayOpen();
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
  }
  if (rangedBtn) rangedBtn.disabled = true;
  updateReadyButtonState();
}
