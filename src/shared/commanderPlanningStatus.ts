/**
 * Whether opponent planning is off, on and idle, or on and planning now. This module holds what the console says
 * about opponent planning, in the Commanders tab's status sentence and in the footer line; both read the same state.
 *
 * Purpose: Names the three states the footer dot and label show.
 * When to use: Returned by `commanderPlanningStatus`.
 * Expected outcome: `planning` only while Run is on.
 * Exceptions: None.
 */
export type CommanderPlanningStatus = 'off' | 'on' | 'planning';

/**
 * Counts the footer needs while commanders are working.
 *
 * Purpose: The line names how many are ready, not only that planning is on.
 * When to use: `commanderFooterLabel`.
 * Expected outcome: `ready` and `active` are whole numbers. `active` counts seats still in the match.
 * Exceptions: None.
 */
export interface CommanderFooterCounts {
  /**
   * The planning state from Run and the pool.
   *
   * Contract: An `CommanderPlanningStatus`.
   * When to use: `commanderFooterLabel`.
   * Expected outcome: `off` while Run is off.
   * Exceptions: None.
   */
  readonly status: CommanderPlanningStatus;
  /**
   * Commanders whose orders are ready.
   *
   * Contract: A whole number, not above `active`.
   * When to use: The planning line.
   * Expected outcome: Shown as the first count.
   * Exceptions: None.
   */
  readonly ready: number;
  /**
   * Commanders still in the match.
   *
   * Contract: A whole number.
   * When to use: The planning line.
   * Expected outcome: Shown as the second count.
   * Exceptions: None.
   */
  readonly active: number;
  /**
   * True when the match has no active human seat.
   *
   * Contract: Observe mode.
   * When to use: The planning line drops the word "Commanders".
   * Expected outcome: "Planning · {ready} of {active} ready".
   * Exceptions: None.
   */
  readonly observing: boolean;
}

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
 * Purpose: The footer and the Commanders tab agree with Ready's "AI:" timer.
 * When to use: Pass whether Run is on, and whether the opponent's orders are still being planned.
 * Expected outcome: `off` while Run is off, `planning` while Run is on and the opponent is planning, `on` otherwise.
 * Exceptions: None.
 */
export function commanderPlanningStatus(runOn: boolean, planning: boolean): CommanderPlanningStatus {
  if (!runOn) return 'off';
  return planning ? 'planning' : 'on';
}

/**
 * Builds the sentence next to Run.
 *
 * Purpose: Says whether planning is on for every commander.
 * When to use: The Commanders tab, beside Run.
 * Expected outcome: "Planning is off." while Run is off. Otherwise "Planning is on for all {n} commanders."
 * Exceptions: None.
 */
export function commanderPlanningSentence(runOn: boolean, commanderCount: number): string {
  return runOn ? `Planning is on for all ${commanderCount} commanders.` : 'Planning is off.';
}

/**
 * Builds the footer status line.
 *
 * Purpose: The line counts ready commanders while any is planning.
 * When to use: `#commander-status-label`.
 * Expected outcome: "Commanders off", "Commanders ready", or "Commanders planning · {ready} of {active} ready".
 *   Observe mode uses "Planning · {ready} of {active} ready" while planning.
 * Exceptions: None.
 */
export function commanderFooterLabel(counts: CommanderFooterCounts): string {
  if (counts.status === 'off') return 'Commanders off';
  if (counts.status !== 'planning') return 'Commanders ready';
  const progress = `${counts.ready} of ${counts.active} ready`;
  return counts.observing ? `Planning · ${progress}` : `Commanders planning · ${progress}`;
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
