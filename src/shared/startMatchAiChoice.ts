/**
 * The click-time reading of Auto-start AI and of whether Run can be pressed.
 *
 * Contract: `autoStartChecked` is true only when that checkbox is present and checked. `runEnabled` is true only when
 *   the Run button is present and not disabled, which means an API key and a model are set.
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
   * Whether Run can be pressed.
   *
   * Contract: True only when the Run button exists and is not disabled.
   * When to use: With `autoStartChecked`. A disabled Run never starts planning.
   * Expected outcome: The button's enabled state at the click.
   * Exceptions: None.
   */
  readonly runEnabled: boolean;
}

/**
 * The opponent-planning outcome of a successful start.
 *
 * Contract: `runOn` and `openOpponentTab` are never both true.
 * When to use: The result of `chooseStartMatchAi`, applied after the new match is installed.
 * Expected outcome: See `chooseStartMatchAi`.
 * Exceptions: None.
 */
export interface StartMatchAiChoice {
  /**
   * Whether Run should be pressed and turn-1 planning started once.
   *
   * Contract: True only when Auto-start AI was checked and Run was enabled.
   * When to use: Setting the Run flag and starting one planning request. It does not open the Opponent tab.
   * Expected outcome: One planning start, and the console stays on its current tab.
   * Exceptions: None.
   */
  readonly runOn: boolean;
  /**
   * Whether the console should expand on the Opponent tab with planning off.
   *
   * Contract: True whenever `runOn` is false.
   * When to use: Releasing Run and showing the Opponent tab. It does not start planning.
   * Expected outcome: The player can press Run from that tab.
   * Exceptions: None.
   */
  readonly openOpponentTab: boolean;
}

/**
 * Chooses what a successful start does with opponent planning.
 *
 * Purpose: Checked plus an enabled Run turns planning on. Every other combination leaves planning off and opens the
 *   Opponent tab, including a checked box whose Run button is disabled and an unchecked box whose Run button is enabled.
 * When to use: Once per Start click, with the values captured before the start request.
 * Expected outcome: `{ runOn: true, openOpponentTab: false }` only when both inputs are true. Otherwise
 *   `{ runOn: false, openOpponentTab: true }`.
 * Exceptions: None.
 */
export function chooseStartMatchAi(input: StartMatchAiInput): StartMatchAiChoice {
  if (input.autoStartChecked && input.runEnabled) {
    return { runOn: true, openOpponentTab: false };
  }
  return { runOn: false, openOpponentTab: true };
}
