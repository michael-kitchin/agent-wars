import type { StartMatchAiChoice, StartMatchAiInput } from '../../shared/startMatchAiChoice';
import { showConsoleTab } from '../chrome/consoleFrame';
import { rendererSharedState as S } from '../core/state';
import { stopOpponentPlanning } from '../openRouter/openRouterRuntime';

/**
 * Id of the Auto-start AI checkbox.
 *
 * Purpose: The start handler reads the click-time choice from this control. The reset lives with the other dialog options.
 * When to use: `readStartMatchAiInput`.
 * Expected outcome: Matches the checkbox in `static/index.html`.
 * Exceptions: None.
 */
const AUTO_START_CHECKBOX_ID = 'new-game-auto-start-checkbox';

/**
 * Id of the Run button.
 *
 * Purpose: A successful start treats Run as enabled only when this button is present and not disabled.
 * When to use: `readStartMatchAiInput` and `applyStartMatchAiChoice`.
 * Expected outcome: Matches the button in `static/index.html`.
 * Exceptions: None.
 */
const RUN_BUTTON_ID = 'openrouter-run-btn';

/**
 * What applying a start choice needs from the rest of the renderer.
 *
 * Contract: `startPlanning` begins one opponent-planning request. `updateReadyButtonState` redraws Ready and the
 *   opponent status from the Run flag.
 * When to use: The second argument of `applyStartMatchAiChoice`.
 * Expected outcome: Both functions are the renderer's existing ones.
 * Exceptions: None.
 */
export interface StartMatchAiDeps {
  /**
   * Starts one opponent-planning request when Run is on.
   *
   * Contract: Called at most once, and only after Run has been set on.
   * When to use: The successful auto-start branch.
   * Expected outcome: Turn-1 planning begins if the rest of the renderer allows it.
   * Exceptions: None from this module. The function reports its own failures.
   */
  readonly startPlanning: () => void;
  /**
   * Redraws Ready and the opponent status sentence.
   *
   * Contract: Reads the Run flag after this module has set it.
   * When to use: After every successful start, whether planning turns on or off.
   * Expected outcome: The status sentence matches Run.
   * Exceptions: None from this module.
   */
  readonly updateReadyButtonState: () => void;
}

/**
 * Reads Auto-start AI and whether Run can be pressed.
 *
 * Purpose: The start handler must keep the player's choice from the click, before the request, because the dialog can
 *   still change while the request runs.
 * When to use: At the beginning of the Start click, before any early return that skips applying the choice.
 * Expected outcome: The checkbox counts as checked only when it is present and checked. Run counts as enabled only
 *   when its button is present and not disabled. Both booleans are logged.
 * Exceptions: None.
 */
export function readStartMatchAiInput(): StartMatchAiInput {
  const checkbox = document.getElementById(AUTO_START_CHECKBOX_ID) as HTMLInputElement | null;
  const runButton = document.getElementById(RUN_BUTTON_ID) as HTMLButtonElement | null;
  const input = {
    autoStartChecked: checkbox?.checked === true,
    runEnabled: runButton != null && runButton.disabled === false,
  };
  console.debug('[agent-wars] readStartMatchAiInput', input);
  return input;
}

/**
 * Applies the click-time Auto-start AI choice after a new match is installed.
 *
 * Purpose: Turns Run on and starts turn-1 planning, or turns Run off and opens the Opponent tab. It awaits the stop
 *   of any previous consult before starting a new one, so that cancel cannot abort the new request.
 * When to use: Only after a successful start, once the overlay has closed and the precomputed plan has been cleared.
 * Expected outcome: Run's pressed state matches `choice.runOn`. Planning starts once when that is true. The Opponent
 *   tab opens expanded when `choice.openOpponentTab` is true. A rejected cancel is logged by `stopOpponentPlanning`
 *   and does not throw.
 * Exceptions: None. `stopOpponentPlanning` catches a rejected cancel.
 */
export async function applyStartMatchAiChoice(choice: StartMatchAiChoice, deps: StartMatchAiDeps): Promise<void> {
  console.debug('[agent-wars] applyStartMatchAiChoice', choice);
  await stopOpponentPlanning('run_off');
  S.runButtonOn = choice.runOn;
  const runButton = document.getElementById(RUN_BUTTON_ID);
  if (runButton) runButton.setAttribute('aria-pressed', choice.runOn ? 'true' : 'false');
  deps.updateReadyButtonState();
  if (choice.runOn) deps.startPlanning();
  if (choice.openOpponentTab) showConsoleTab('console-tab-opponent');
}
