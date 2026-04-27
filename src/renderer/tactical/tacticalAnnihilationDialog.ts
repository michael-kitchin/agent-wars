/**
 * Tactical annihilation result modal: game-over-style overlay until the player exits the battle.
 */

import type { TacticalAnnihilationOutcomeKind } from '../../shared/tacticalAnnihilation';
import { rendererSharedState as S } from '../core/state';
import { setMainUIControlsEnabled } from '../core/uiState';
import { updateReadyButtonState } from '../openRouter/openRouterUiHelpers';
import { syncTacticalExitButtonElementVisibility } from './tacticalExitButtonDom';

/** Neutral copy when both tactical sides have zero sub-units after the same beat. */
const TACTICAL_ANNIHILATION_NEUTRAL_MESSAGE = 'All units destroyed.';

/**
 * Maps a terminal annihilation outcome to the player-facing headline (matches strategic win/loss tone where applicable).
 *
 * Purpose: Keeps message strings in one place next to the overlay DOM ids.
 * When to use: Only while opening `#tactical-annihilation-overlay`.
 * Expected outcome: `You win!` / `You lose.` for one-sided wipes; `All units destroyed.` for mutual annihilation.
 * Exceptions: None.
 */
function tacticalAnnihilationMessageForOutcome(outcome: TacticalAnnihilationOutcomeKind): string {
  if (outcome === 'human_win') return 'You win!';
  if (outcome === 'human_loss') return 'You lose.';
  return TACTICAL_ANNIHILATION_NEUTRAL_MESSAGE;
}

/**
 * Shows the annihilation overlay, blocks map interaction, and refreshes tactical HUD / Ready affordances.
 *
 * Purpose: Replaces the former annihilation toast + immediate auto-exit with an explicit confirmation step.
 * When to use: From `tacticalMaybeScheduleAnnihilationExit` when a planning-phase snapshot is terminal.
 * Expected outcome: Overlay visible, `S.tacticalAnnihilationOutcomeDialog` set, exit button hidden, Ready disabled.
 * Exceptions: None; idempotent if the same outcome is already displayed.
 */
export function openTacticalAnnihilationOutcomeDialog(outcome: TacticalAnnihilationOutcomeKind): void {
  S.tacticalAnnihilationOutcomeDialog = outcome;
  const overlay = document.getElementById('tactical-annihilation-overlay');
  const messageEl = document.getElementById('tactical-annihilation-message');
  if (messageEl) messageEl.textContent = tacticalAnnihilationMessageForOutcome(outcome);
  overlay?.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  syncTacticalExitButtonElementVisibility();
  updateReadyButtonState();
}

/**
 * Hides the annihilation overlay and clears renderer dialog state after exit, teardown, or reconciliation.
 *
 * Purpose: Prevents a stuck modal when the tactical session ends without using the overlay button.
 * When to use: Successful `tacticalPerformBattleExit`, `tacticalReleaseRendererSessionForNewStrategicMatch`, and tactical reconcile paths.
 * Expected outcome: `S.tacticalAnnihilationOutcomeDialog` null, overlay `hidden`, main map interactions restored unless another overlay owns blocking.
 * Exceptions: None; safe when the dialog was never opened.
 */
export function closeTacticalAnnihilationOutcomeDialog(): void {
  S.tacticalAnnihilationOutcomeDialog = null;
  document.getElementById('tactical-annihilation-overlay')?.classList.add('hidden');
  setMainUIControlsEnabled(true);
  syncTacticalExitButtonElementVisibility();
  updateReadyButtonState();
}
