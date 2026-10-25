/**
 * The click-time reading of Auto-start AI and of whether Start can be pressed.
 *
 * Contract: `autoStartChecked` is true only when that checkbox is present and checked. `runEnabled` is true only when
 *   at least one AI row has a key and a model. That is also what enables Start once the match is installed.
 * When to use: The argument to `chooseStartMatchAi`.
 * Expected outcome: Both flags are booleans captured before the start request.
 * Exceptions: None.
 */
export interface StartMatchAiInput {
  /**
   * Whether Auto-start AI was checked when Start was clicked.
   *
   * Contract: False when the checkbox is missing or unchecked.
   * When to use: With `runEnabled` to choose the start outcome.
   * Expected outcome: The player's click-time choice.
   * Exceptions: None.
   */
  readonly autoStartChecked: boolean;
  /**
   * Whether Start can turn planning on.
   *
   * Contract: True only when at least one AI row has a non-empty key and a model id.
   * When to use: With `autoStartChecked`. False leaves planning off.
   * Expected outcome: The click-time row check.
   * Exceptions: None.
   */
  readonly runEnabled: boolean;
}

/**
 * The opponent-planning outcome of a successful start.
 *
 * Contract: `runOn` is the only field. The console collapse is applied for every successful start, not chosen here.
 * When to use: The result of `chooseStartMatchAi`, applied after the new match is installed.
 * Expected outcome: See `chooseStartMatchAi`.
 * Exceptions: None.
 */
export interface StartMatchAiChoice {
  /**
   * Whether Start should be pressed and turn-1 planning started once.
   *
   * Contract: True only when Auto-start AI was checked and Start was enabled.
   * When to use: Setting the planning flag and starting one planning request.
   * Expected outcome: One planning start when true. Planning stays off when false.
   * Exceptions: None.
   */
  readonly runOn: boolean;
}

/**
 * Chooses what a successful start does with opponent planning.
 *
 * Purpose: Checked plus a runnable commander turns planning on. Every other combination leaves planning off, including a
 *   checked box with no runnable commander and an unchecked box that has one. The console collapse is not chosen here.
 * When to use: Once per Start click, with the values captured before the start request.
 * Expected outcome: `{ runOn: true }` only when both inputs are true. Otherwise `{ runOn: false }`.
 * Exceptions: None.
 */
export function chooseStartMatchAi(input: StartMatchAiInput): StartMatchAiChoice {
  return { runOn: input.autoStartChecked && input.runEnabled };
}
