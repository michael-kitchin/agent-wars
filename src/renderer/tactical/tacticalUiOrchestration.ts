/**
 * DOM and renderer-state orchestration for tactical battle HUD, sidebar suppression, and entry-layer sync.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { exitTacticalMapView } from '../map/tacticalMapView';
import { hideTacticalEntryLayer, syncTacticalEntryButton } from '../map/tacticalEntryLayer';

/**
 * Toggles strategic sidebar chrome suppression while tactical res4 mode is active.
 *
 * Contract: Adds/removes `tactical-strategic-suppress` on `#sidebar` without touching other layout classes.
 * When to use: Tactical entry success and tactical exit / reconciliation teardown.
 * Expected outcome: Sidebar styling matches milestone-2.1 strategic pause contract.
 * Exceptions: None when `#sidebar` is missing (no-op toggle).
 */
export function tacticalApplyStrategicSidebarForTacticalMode(tactical: boolean): void {
  document.getElementById('sidebar')?.classList.toggle('tactical-strategic-suppress', tactical);
}

/**
 * Updates tactical HUD visibility, turn label text, and exit/advance disabled state from renderer shared state.
 *
 * Contract: Reads `S.tacticalBattleSnapshot` and `S.tacticalPhasePlanning` only; mutates DOM button disabled flags.
 * When to use: After tactical snapshot changes, phase flips, and redraw passes that affect tactical controls.
 * Expected outcome: Exit/advance disabled whenever not in tactical planning or no snapshot.
 * Exceptions: None.
 */
export function tacticalUpdateExitButtonVisibility(): void {
  const hud = document.getElementById('tactical-battle-hud');
  const exitBtn = document.getElementById('tactical-exit-btn') as HTMLButtonElement | null;
  const advanceBtn = document.getElementById('tactical-advance-turn-btn') as HTMLButtonElement | null;
  const turnLabel = document.getElementById('tactical-turn-label');
  const active = !!S.tacticalBattleSnapshot;
  hud?.classList.toggle('hidden', !active);
  if (turnLabel) {
    turnLabel.textContent = active && S.tacticalBattleSnapshot
      ? `Tactical turn ${S.tacticalBattleSnapshot.tacticalTurnNumber}`
      : '';
  }
  const disabled = !active || !S.tacticalPhasePlanning;
  if (exitBtn) exitBtn.disabled = disabled;
  if (advanceBtn) advanceBtn.disabled = disabled;
}

/**
 * Clears tactical renderer state when the latest strategic snapshot no longer matches the tactical session anchor.
 *
 * Contract: Clears `S.tacticalBattleSnapshot` when strategic phase/turn diverges from the tactical snapshot anchor.
 * When to use: `applyGameStateSnapshot` dependency hook after strategic state replacement.
 * Expected outcome: Tactical res4 view tears down and entry layer hides when reconciliation triggers.
 * Exceptions: None.
 */
export function tacticalReconcileBattleAfterStrategicSnapshot(nextState: GameStateSnapshot): void {
  const snap = S.tacticalBattleSnapshot;
  if (!snap) return;
  if (nextState.phase !== 'planning' || nextState.turnNumber !== snap.strategicTurnNumber) {
    S.tacticalBattleSnapshot = null;
    S.tacticalPhasePlanning = true;
    exitTacticalMapView();
    tacticalApplyStrategicSidebarForTacticalMode(false);
    const el = document.getElementById('tactical-entry-layer');
    if (el) hideTacticalEntryLayer(el, true);
    tacticalUpdateExitButtonVisibility();
  }
}

/**
 * Resynchronizes tactical-entry magnifier controls for contested res1 hexes during strategic planning.
 *
 * Contract: Delegates to `syncTacticalEntryButton` with the same dependency injection shape as the strategic renderer.
 * When to use: Canvas redraw paths that already refresh build-entry controls.
 * Expected outcome: Tactical magnifiers match contested explored res1 cells at eligible zoom levels.
 * Exceptions: None.
 */
export function tacticalSyncTacticalEntryButtonOverlay(deps: {
  isHexExploredByPlayer: (h3: string) => boolean;
  hasRes1OverlayOffsetFeatures: (h3Index: string, visibleUnitHexes: Set<string>) => boolean;
}): void {
  syncTacticalEntryButton(deps);
}
