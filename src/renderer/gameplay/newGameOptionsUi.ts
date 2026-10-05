import { DEFAULT_BONUS_LEVEL, parseBonusLevel, type BonusLevel } from '../../shared/bonusLevel';
import { parseStartMonth } from '../../shared/weatherBonusRules';

/**
 * Id of the Fog of war checkbox.
 *
 * Purpose: The only on/off new-game option; the bonuses are levels.
 * When to use: `readNewGameOptionChoices` and `resetNewGameOptionControls`.
 * Expected outcome: Matches the checkbox in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_FOG_CHECKBOX_ID = 'new-game-fog-checkbox';

/**
 * DOM ids of the bonus level dropdowns, keyed by the `newGame` payload field each one fills.
 *
 * Purpose: One table shared by the read and reset helpers so a new dropdown cannot be read but never reset.
 * When to use: Querying the Country, Terrain, Weather, and Tech bonus dropdowns.
 * Expected outcome: Matches the `id` attributes in `static/index.html`; option values match `BonusLevel`.
 * Exceptions: None.
 */
const NEW_GAME_BONUS_LEVEL_SELECT_IDS = {
  countryBonusLevel: 'new-game-country-bonus-select',
  terrainBonusLevel: 'new-game-terrain-bonus-select',
  weatherBonusLevel: 'new-game-weather-bonus-select',
  techBonusLevel: 'new-game-tech-bonus-select',
} as const;

/**
 * Id of the start-month control.
 *
 * Purpose: The dialog draws a month when it opens, and the randomize button draws another.
 * When to use: `readNewGameStartMonth` and `randomizeNewGameStartMonth`.
 * Expected outcome: Matches the select in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_START_MONTH_ID = 'new-game-start-month';

/**
 * The choices the new-game option controls contribute to the `newGame` payload.
 *
 * Contract: Fog is a flag; each bonus is a level.
 * When to use: Spread into the `newGame` IPC payload.
 * Expected outcome: See `readNewGameOptionChoices`.
 * Exceptions: None.
 */
export type NewGameOptionChoices = Readonly<
  { fogOfWarEnabled: boolean } & Record<keyof typeof NEW_GAME_BONUS_LEVEL_SELECT_IDS, BonusLevel>
>;

/**
 * Looks up the Fog of war checkbox.
 *
 * Purpose: Keeps the element cast in one place.
 * When to use: Inside this module.
 * Expected outcome: The input element, or null when the markup lacks it.
 * Exceptions: None.
 */
function fogCheckbox(): HTMLInputElement | null {
  return document.getElementById(NEW_GAME_FOG_CHECKBOX_ID) as HTMLInputElement | null;
}

/**
 * Looks up one select control by id.
 *
 * Purpose: Keeps the element cast in one place for the bonus and month dropdowns.
 * When to use: Inside this module.
 * Expected outcome: The select element, or null when the markup lacks it.
 * Exceptions: None.
 */
function optionSelect(id: string): HTMLSelectElement | null {
  return document.getElementById(id) as HTMLSelectElement | null;
}

/**
 * Reads the new-game option controls.
 *
 * Purpose: Start-game IPC needs the player's choices in one object.
 * When to use: When the Start game button is clicked.
 * Expected outcome: Fog is on unless its box is present and unchecked (the historical default). Each bonus is
 * the dropdown's level; a missing dropdown or an unexpected value is `off`.
 * Exceptions: None.
 */
export function readNewGameOptionChoices(): NewGameOptionChoices {
  const levelOf = (id: string): BonusLevel => parseBonusLevel(optionSelect(id)?.value, 'off');
  return {
    fogOfWarEnabled: fogCheckbox()?.checked !== false,
    countryBonusLevel: levelOf(NEW_GAME_BONUS_LEVEL_SELECT_IDS.countryBonusLevel),
    terrainBonusLevel: levelOf(NEW_GAME_BONUS_LEVEL_SELECT_IDS.terrainBonusLevel),
    weatherBonusLevel: levelOf(NEW_GAME_BONUS_LEVEL_SELECT_IDS.weatherBonusLevel),
    techBonusLevel: levelOf(NEW_GAME_BONUS_LEVEL_SELECT_IDS.techBonusLevel),
  };
}

/**
 * Reads the start-month control.
 *
 * Purpose: Turn 1 of the new match uses this month.
 * When to use: When the Start game button is clicked.
 * Expected outcome: 1 through 12. A missing control or an unexpected value is January.
 * Exceptions: None.
 */
export function readNewGameStartMonth(): number {
  return parseStartMonth(optionSelect(NEW_GAME_START_MONTH_ID)?.value);
}

/**
 * Chooses a starting month at random from the months listed in the dropdown.
 *
 * Purpose: The dialog and its randomize button offer the same kind of draw as the home-region buttons.
 * When to use: When the dialog opens, and when the player clicks the starting-month randomize button.
 * Expected outcome: The dropdown shows one of its options, each equally likely, including the month already shown. A missing control or an empty list is left unchanged.
 * Exceptions: None.
 */
export function randomizeNewGameStartMonth(): void {
  const select = optionSelect(NEW_GAME_START_MONTH_ID);
  if (!select || select.options.length <= 0) return;
  select.selectedIndex = Math.floor(Math.random() * select.options.length);
}

/**
 * Restores Fog of war and the bonus dropdowns.
 *
 * Purpose: Each refresh while the overlay is showing turns Fog of war on and sets every bonus to the default level.
 * The starting month is drawn when the dialog opens, and a refresh leaves that draw in place.
 * When to use: Whenever the overlay is shown, including a refresh that does not reopen it.
 * Expected outcome: Fog is checked and each present bonus dropdown is Low. The month control is unchanged. Missing controls are skipped.
 * Exceptions: None.
 */
export function resetNewGameOptionControls(): void {
  const fog = fogCheckbox();
  if (fog) fog.checked = true;
  for (const id of Object.values(NEW_GAME_BONUS_LEVEL_SELECT_IDS)) {
    const select = optionSelect(id);
    if (select) select.value = DEFAULT_BONUS_LEVEL;
  }
}
