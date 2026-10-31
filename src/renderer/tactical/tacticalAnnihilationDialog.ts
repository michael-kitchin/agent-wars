/**
 * Tactical annihilation result modal: game-over-style overlay until the player exits the battle.
 */

import type { TacticalAnnihilationOutcomeKind } from '../../shared/tacticalAnnihilation';
import { rendererSharedState as S } from '../core/state';
import { setMainUIControlsEnabled } from '../core/uiState';
import { updateReadyButtonState } from '../openRouter/openRouterUiHelpers';
import { stopOpponentPlanning } from '../openRouter/openRouterRuntime';
import { syncTacticalExitButtonElementVisibility } from './tacticalExitButtonDom';
import { aiOnlyResultOkTooltipText, annihilationExitTooltipText } from '../chrome/controlTooltipText';

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
 * Shows the annihilation overlay, blocks map interaction, and refreshes Exit Battle and Ready.
 *
 * Purpose: Replaces the former annihilation toast + immediate auto-exit with an explicit confirmation step.
 * When to use: From `tacticalMaybeScheduleAnnihilationExit` when a planning-phase snapshot is terminal.
 * Expected outcome: Overlay visible, `S.tacticalAnnihilationOutcomeDialog` set, exit button hidden, Ready disabled.
 * Stops in-flight commander planning so a consult cannot finish with a model call after the modal is shown.
 * Exceptions: None; idempotent if the same outcome is already displayed.
 */
export function openTacticalAnnihilationOutcomeDialog(outcome: TacticalAnnihilationOutcomeKind): void {
  S.tacticalAnnihilationOutcomeDialog = outcome;
  void stopOpponentPlanning('teardown');
  const overlay = document.getElementById('tactical-annihilation-overlay');
  const messageEl = document.getElementById('tactical-annihilation-message');
  if (messageEl) messageEl.textContent = tacticalAnnihilationMessageForOutcome(outcome);
  overlay?.classList.remove('hidden');
  setMainUIControlsEnabled(false);
  syncTacticalExitButtonElementVisibility();
  updateReadyButtonState();
}

/**
 * Shows the same overlay for an AI-only result, with Ok instead of Exit Battle.
 *
 * Purpose: The human win/loss kind cannot hold an idle or commander-exit sentence.
 * When to use: After playback when the checkbox is off, and when the header Exit Battle control is used then.
 * Expected outcome: The message is `sentence`. Ready stays blocked until Ok. The human dialog field stays null.
 * Exceptions: None.
 */
export function openAiOnlyBattleResultDialog(sentence: string): void {
  S.aiOnlyBattleResultSentence = sentence;
  S.tacticalAnnihilationOutcomeDialog = null;
  void stopOpponentPlanning('teardown');
  const overlay = document.getElementById('tactical-annihilation-overlay');
  const messageEl = document.getElementById('tactical-annihilation-message');
  const button = document.getElementById('tactical-annihilation-exit-btn');
  if (messageEl) messageEl.textContent = sentence;
  if (button) {
    button.textContent = 'Ok';
    button.setAttribute('data-control-tooltip', aiOnlyResultOkTooltipText);
  }
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
  S.aiOnlyBattleResultSentence = null;
  const button = document.getElementById('tactical-annihilation-exit-btn');
  if (button) {
    button.textContent = 'Exit Battle';
    button.setAttribute('data-control-tooltip', annihilationExitTooltipText);
  }
  document.getElementById('tactical-annihilation-overlay')?.classList.add('hidden');
  setMainUIControlsEnabled(true);
  syncTacticalExitButtonElementVisibility();
  updateReadyButtonState();
}
