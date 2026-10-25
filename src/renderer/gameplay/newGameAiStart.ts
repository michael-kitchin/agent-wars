import type { StartMatchAiChoice, StartMatchAiInput } from '../../shared/startMatchAiChoice';
import { collapseConsole } from '../chrome/consoleFrame';
import { rendererSharedState as S } from '../core/state';
import { newGameHasRunnableCommander } from './newGameSidesUi';
import { stopOpponentPlanning } from '../openRouter/openRouterRuntime';
import { setPlanningTogglePressed } from '../openRouter/openRouterRunToggle';

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
 * Id of the Start button on the Commanders tab.
 *
 * Purpose: After a match starts, the pressed state and the Start or Stop label are written onto this button. Whether planning turns on was already chosen from the new-game rows.
 * When to use: `applyStartMatchAiChoice`.
 * Expected outcome: Matches `#openrouter-run-btn` in `static/index.html`.
 * Exceptions: None. A missing button still leaves the pressed state on the shared flag.
 */
const RUN_BUTTON_ID = 'openrouter-run-btn';

/**
 * What applying a start choice needs from the rest of the renderer.
 *
 * Contract: `startPlanning` begins one opponent-planning request. `updateReadyButtonState` redraws Ready and the
 *   opponent status from the planning button's pressed state.
 * When to use: The second argument of `applyStartMatchAiChoice`.
 * Expected outcome: Both functions are the renderer's existing ones.
 * Exceptions: None.
 */
export interface StartMatchAiDeps {
  /**
   * Starts one opponent-planning request when the button reads Stop.
   *
   * Contract: Called at most once, and only after the button has been set to Stop.
   * When to use: The successful auto-start branch.
   * Expected outcome: Turn-1 planning begins if the rest of the renderer allows it.
   * Exceptions: None from this module. The function reports its own failures.
   */
  readonly startPlanning: () => void;
  /**
   * Redraws Ready and the opponent status sentence.
   *
   * Contract: Reads the planning button after this module has set its pressed state and label.
   * When to use: After every successful start, whether planning turns on or off.
   * Expected outcome: The status sentence matches that pressed state.
   * Exceptions: None from this module.
   */
  readonly updateReadyButtonState: () => void;
}

/**
 * Reads Auto-start AI and whether the new-game rows can turn planning on.
 *
 * Purpose: The start handler must keep the player's choice from the click, before the request, because the dialog can
 *   still change while the request runs.
 * When to use: At the beginning of the Start game or New game click, before any early return that skips applying the choice.
 * Expected outcome: The checkbox counts as checked only when it is present and checked. Planning can turn on when
 *   some AI row has a key and a model. Both booleans are logged.
 * Exceptions: None.
 */
export function readStartMatchAiInput(): StartMatchAiInput {
  const checkbox = document.getElementById(AUTO_START_CHECKBOX_ID) as HTMLInputElement | null;
  const input = {
    autoStartChecked: checkbox?.checked === true,
    runEnabled: newGameHasRunnableCommander(),
  };
  console.debug('[agent-wars] readStartMatchAiInput', input);
  return input;
}

/**
 * Applies the click-time Auto-start AI choice after a new match is installed.
 *
 * Purpose: Turns Start on and starts turn-1 planning, or turns Start off. Either way the console collapses. It awaits the
 *   stop of any previous consult before starting a new one, so that cancel cannot abort the new request.
 * When to use: Only after a successful start, once the overlay has closed and the precomputed plan has been cleared.
 * Expected outcome: The button's pressed state and label match `choice.runOn`: Stop while planning is on, Start while it is off. Planning starts once when that is true. The console
 *   collapses and the selected tab stays selected. A rejected cancel is logged by `stopOpponentPlanning` and does not throw.
 * Exceptions: None. `stopOpponentPlanning` catches a rejected cancel.
 */
export async function applyStartMatchAiChoice(choice: StartMatchAiChoice, deps: StartMatchAiDeps): Promise<void> {
  console.debug('[agent-wars] applyStartMatchAiChoice', choice);
  await stopOpponentPlanning('run_off');
  S.runButtonOn = choice.runOn;
  const runButton = document.getElementById(RUN_BUTTON_ID);
  if (runButton) setPlanningTogglePressed(runButton, choice.runOn);
  deps.updateReadyButtonState();
  if (choice.runOn) deps.startPlanning();
  collapseConsole();
}
