/**
 * Whether opponent planning is off, on and idle, or on and planning now. This module holds what the console says
 * about opponent planning, in the Opponent tab's status sentence and in the footer line; both read the same state.
 *
 * Purpose: Names the three states the footer dot and label show.
 * When to use: Returned by `opponentPlanningStatus`.
 * Expected outcome: `planning` only while Run is on.
 * Exceptions: None.
 */
export type OpponentPlanningStatus = 'off' | 'on' | 'planning';

/**
 * The footer line's label for each state.
 *
 * Purpose: One short phrase per state.
 * When to use: The footer status line.
 * Expected outcome: "Opponent planning off", "Opponent planning on", or "Opponent planning…".
 * Exceptions: None.
 */
export const OPPONENT_STATUS_LINE_LABELS: Readonly<Record<OpponentPlanningStatus, string>> = Object.freeze({
  off: 'Opponent planning off',
  on: 'Opponent planning on',
  planning: 'Opponent planning…',
});

/**
 * The model name the footer shows while no model is chosen.
 *
 * Purpose: The line never shows an empty gap.
 * When to use: When the model list has no selection.
 * Expected outcome: Shown as written.
 * Exceptions: None.
 */
export const NO_MODEL_LABEL = 'No model';

/**
 * Works out the planning state from Run and the wait that Ready already tracks.
 *
 * Purpose: The footer and the Opponent tab agree with Ready's "AI:" timer.
 * When to use: Pass whether Run is on, and whether the opponent's orders are still being planned.
 * Expected outcome: `off` while Run is off, `planning` while Run is on and the opponent is planning, `on` otherwise.
 * Exceptions: None.
 */
export function opponentPlanningStatus(runOn: boolean, planning: boolean): OpponentPlanningStatus {
  if (!runOn) return 'off';
  return planning ? 'planning' : 'on';
}

/**
 * Builds the Opponent tab's status sentence.
 *
 * Purpose: Says in one sentence whether opponent planning is on.
 * When to use: Next to Run on the Opponent tab.
 * Expected outcome: "Opponent planning is off." while off, "Opponent planning is on." otherwise.
 * Exceptions: None.
 */
export function opponentStatusSentence(status: OpponentPlanningStatus): string {
  return status === 'off' ? 'Opponent planning is off.' : 'Opponent planning is on.';
}

/**
 * Takes the model's name from its option label in the model list.
 *
 * Purpose: The footer shows the name without the price and reasoning suffix.
 * When to use: With the selected option's text; pass an empty string when no model is selected.
 * Expected outcome: The text before " [", trimmed, or `NO_MODEL_LABEL` when that is empty.
 * Exceptions: None.
 */
export function modelNameFromOptionLabel(optionLabel: string): string {
  const bracket = optionLabel.indexOf(' [');
  const name = (bracket >= 0 ? optionLabel.slice(0, bracket) : optionLabel).trim();
  return name || NO_MODEL_LABEL;
}
