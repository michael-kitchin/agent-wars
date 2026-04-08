import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from './state';
import { initializeScenarioRegionSelectorsOnOverlayOpen } from '../gameplay/newGameRegionUi';

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

export function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  const phaseEl = document.getElementById('sidebar-phase');
  const turnEl = document.getElementById('sidebar-turn');
  if (phaseEl) phaseEl.textContent = state ? `Phase: ${state.phase}` : '—';
  if (turnEl) turnEl.textContent = state ? `Turn: ${state.turnNumber}` : '—';
}

export function setMainUIControlsEnabled(enabled: boolean): void {
  const container = document.getElementById('canvas-container');
  if (container) {
    for (const child of container.children) {
      if ((child as HTMLElement).id === 'game-over-overlay') continue;
      (child as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    }
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    (sidebar as HTMLElement).style.pointerEvents = enabled ? '' : 'none';
    sidebar.classList.toggle('main-ui-disabled', !enabled);
  }
}

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
