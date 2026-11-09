/**
 * Beat limit on the new-game screen.
 *
 * Purpose: The player sets how many beats an AI-only battle can run. None turns the control off.
 * When to use: `bindNewGameVictory`, `renderNewGameVictory`, and `resetNewGameVictory`.
 * Expected outcome: The select shows 20, 30, 40, 50, and Unlimited, unless AI-only battles is None.
 * Exceptions: None. A missing select leaves the stored default for Start.
 */

import {
  AI_ONLY_BEAT_LIMIT_OPTIONS,
  AI_ONLY_BEAT_LIMIT_UNLIMITED,
  DEFAULT_AI_ONLY_BEAT_LIMIT,
  aiOnlyBeatLimitFromStored,
  aiOnlyBeatLimitToStored,
  type AiOnlyBeatLimit,
} from '../../shared/aiOnlyBeatLimit';
import { UNLIMITED_TURN_LIMIT_LABEL } from '../../shared/victoryRules';

/**
 * The limit to restore when AI-only battles leaves None.
 *
 * Purpose: The disabled select shows Unlimited, and reading that would forget 20, 40, 50, or Unlimited.
 * When to use: `renderNewGameBeatLimit` and `resetNewGameBeatLimit`.
 * Expected outcome: Starts at 30. A listed selection, including Unlimited, replaces it.
 * Exceptions: None.
 */
let rememberedBeatLimit: AiOnlyBeatLimit = DEFAULT_AI_ONLY_BEAT_LIMIT;

/**
 * Whether the AI-only select already has its change listener.
 *
 * Purpose: Side-row redraws call bind again and must not stack listeners.
 * When to use: `bindNewGameBeatLimit`.
 * Expected outcome: True after the listener is attached.
 * Exceptions: None.
 */
let beatLimitChangeBound = false;

/**
 * The Beat limit select, when it is in the document.
 *
 * Purpose: Every paint and read uses the same element.
 * When to use: The beat-limit functions.
 * Expected outcome: The select, or null when the screen has not been built.
 * Exceptions: None.
 */
function beatLimitSelect(): HTMLSelectElement | null {
  const select = document.getElementById('new-game-beat-limit-select');
  return select instanceof HTMLSelectElement ? select : null;
}

/**
 * One option on the Beat limit select.
 *
 * Purpose: The numbered options and Unlimited are built the same way.
 * When to use: `renderNewGameBeatLimit`.
 * Expected outcome: An option with the given value and text.
 * Exceptions: None.
 */
function beatLimitOption(value: string, text: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

/**
 * Listens for an AI-only battles change once.
 *
 * Purpose: Choosing None disables Beat limit, and choosing another mode restores the last limit.
 * When to use: `bindNewGameVictory`, before the first paint.
 * Expected outcome: One change listener. A second call does nothing. A missing select does not count as bound.
 * Exceptions: None.
 */
export function bindNewGameBeatLimit(): void {
  if (beatLimitChangeBound) return;
  const aiOnly = document.getElementById('new-game-ai-only-battles-select');
  if (!(aiOnly instanceof HTMLSelectElement)) return;
  beatLimitChangeBound = true;
  aiOnly.addEventListener('change', () => {
    renderNewGameBeatLimit();
  });
}

/**
 * Paints Beat limit for the AI-only choice already selected.
 *
 * Purpose: None shows Unlimited and disables the control. Any other mode shows the four counts and Unlimited.
 * When to use: After the AI-only select changes, after the overlay opens, and after a side-row redraw.
 * Expected outcome: An enabled select with a chosen option restores that limit. An empty or disabled select is not read, so a reset or Unlimited does not replace the memory.
 * Exceptions: None. A missing select returns.
 */
export function renderNewGameBeatLimit(): void {
  const select = beatLimitSelect();
  if (!select) return;
  if (!select.disabled && select.value !== '') rememberedBeatLimit = aiOnlyBeatLimitFromStored(select.value);
  const aiOnly = document.getElementById('new-game-ai-only-battles-select');
  const aiOnlyValue = aiOnly instanceof HTMLSelectElement ? aiOnly.value : '';
  if (aiOnlyValue === 'none') {
    select.replaceChildren(beatLimitOption(AI_ONLY_BEAT_LIMIT_UNLIMITED, UNLIMITED_TURN_LIMIT_LABEL));
    select.disabled = true;
    return;
  }
  select.replaceChildren(
    ...AI_ONLY_BEAT_LIMIT_OPTIONS.map((beats) => beatLimitOption(String(beats), `${beats} beats`)),
    beatLimitOption(AI_ONLY_BEAT_LIMIT_UNLIMITED, UNLIMITED_TURN_LIMIT_LABEL)
  );
  select.value = aiOnlyBeatLimitToStored(rememberedBeatLimit);
  select.disabled = false;
}

/**
 * Puts the default limit back without painting.
 *
 * Purpose: Opening the overlay starts from 30. The next paint must not copy the previous choice.
 * When to use: `resetNewGameVictory`, after AI-only battles is set back to Balanced and before the paint.
 * Expected outcome: The memory is 30 and the select has no options, so its value is empty. The following paint shows 30.
 * Exceptions: None. A missing select still resets the memory.
 */
export function resetNewGameBeatLimit(): void {
  rememberedBeatLimit = DEFAULT_AI_ONLY_BEAT_LIMIT;
  const select = beatLimitSelect();
  if (!select) return;
  // No options leaves the value empty. The next paint keeps 30 instead of copying the previous choice.
  select.replaceChildren();
}

/**
 * The beat limit Start should send.
 *
 * Purpose: The select is the only place the player sets this. A missing control still starts at 30.
 * When to use: `readNewGameSeatsStart`.
 * Expected outcome: Null when Unlimited is selected. A listed number otherwise. An empty or missing select is 30.
 * Exceptions: None.
 */
export function readNewGameAiOnlyBeatLimit(): AiOnlyBeatLimit {
  const select = beatLimitSelect();
  if (!select || select.value === '') return DEFAULT_AI_ONLY_BEAT_LIMIT;
  return aiOnlyBeatLimitFromStored(select.value);
}
