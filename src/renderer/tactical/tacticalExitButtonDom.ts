/**
 * DOM sync for Exit Battle in the battle header from `rendererSharedState`.
 */

import { rendererSharedState as S } from '../core/state';
import { dismissStaleControlTooltip } from '../chrome/controlTooltip';

/**
 * Updates `#tactical-exit-btn` visibility and disabled state from tactical session flags.
 *
 * Purpose: Single place for exit-button rules so annihilation dialog code does not import the broader tactical UI orchestration module.
 * When to use: After tactical snapshot or phase changes, beat playback start or end, annihilation dialog open/close, and battle teardown.
 * Expected outcome: Hidden and disabled while no battle snapshot is active, and while
 *   `S.tacticalAnnihilationOutcomeDialog` is set. Hiding it with the snapshot keeps it off screen when a battle ends
 *   before `renderBattleHeader` leaves battle form. Otherwise it stays shown and is disabled when
 *   `S.tacticalPhasePlanning` is false or while beat playback is running. A control tip whose control no longer has an
 *   on-screen area is hidden.
 * Exceptions: None when nodes are missing (no-op for absent elements).
 */
export function syncTacticalExitButtonElementVisibility(): void {
  const exitBtn = document.getElementById('tactical-exit-btn') as HTMLButtonElement | null;
  const active = !!S.tacticalBattleSnapshot;
  const annihilationDialogOpen = S.tacticalAnnihilationOutcomeDialog != null;
  const playbackDisablesExit = S.tacticalBattleSnapshot != null && S.resolutionMoveAnimation != null;
  const disabled = !S.tacticalPhasePlanning || playbackDisablesExit;
  if (exitBtn) {
    if (annihilationDialogOpen || !active) {
      exitBtn.classList.add('hidden');
      exitBtn.disabled = true;
    } else {
      exitBtn.classList.remove('hidden');
      exitBtn.disabled = disabled;
    }
  }
  dismissStaleControlTooltip();
}
