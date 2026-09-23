/**
 * DOM sync for the tactical battle HUD exit control from `rendererSharedState`.
 */

import { rendererSharedState as S } from '../core/state';

/**
 * Updates `#tactical-battle-hud` / `#tactical-exit-btn` visibility and disabled state from tactical session flags.
 *
 * Purpose: Single place for exit-button rules so annihilation dialog code does not import the broader tactical UI orchestration module.
 * When to use: After tactical snapshot or phase changes, beat playback start or end, annihilation dialog open/close, and tactical HUD teardown.
 * Expected outcome: HUD hidden when no snapshot; exit hidden and disabled while `S.tacticalAnnihilationOutcomeDialog` is set; otherwise exit is disabled when there is no battle, when `S.tacticalPhasePlanning` is false, or while a battle snapshot is set and beat playback is running.
 * Exceptions: None when nodes are missing (no-op for absent elements).
 */
export function syncTacticalExitButtonElementVisibility(): void {
  const hud = document.getElementById('tactical-battle-hud');
  const exitBtn = document.getElementById('tactical-exit-btn') as HTMLButtonElement | null;
  const active = !!S.tacticalBattleSnapshot;
  const annihilationDialogOpen = S.tacticalAnnihilationOutcomeDialog != null;
  hud?.classList.toggle('hidden', !active);
  const playbackDisablesExit = S.tacticalBattleSnapshot != null && S.resolutionMoveAnimation != null;
  const disabled = !active || !S.tacticalPhasePlanning || playbackDisablesExit;
  if (exitBtn) {
    if (annihilationDialogOpen) {
      exitBtn.classList.add('hidden');
      exitBtn.disabled = true;
    } else {
      exitBtn.classList.remove('hidden');
      exitBtn.disabled = disabled;
    }
  }
}
