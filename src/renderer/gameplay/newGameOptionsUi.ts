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
 * When to use: Querying the Origin, Tech, Terrain, and Weather bonus dropdowns.
 * Expected outcome: Matches the `id` attributes in `static/index.html`; option values match `BonusLevel`.
 * Exceptions: None.
 */
const NEW_GAME_BONUS_LEVEL_SELECT_IDS = {
  originBonusLevel: 'new-game-origin-bonus-select',
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
 * Selector for the bonus options block.
 *
 * Purpose: Its slash separators are hidden when a line wraps a slash to the edge of that line.
 * When to use: `registerNewGameOptionSeparators`.
 * Expected outcome: Matches the block in `static/index.html`. That block is two lines: Country with Tech, then Terrain with Weather.
 * Exceptions: None.
 */
const NEW_GAME_OPTIONS_BLOCK_SELECTOR = '.game-over-options';

/**
 * Class of the slash separators between the bonus dropdowns.
 *
 * Purpose: Finds the separators without depending on their position on a line.
 * When to use: `syncNewGameOptionSeparators`.
 * Expected outcome: Matches the separator spans in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_OPTION_SEPARATOR_CLASS = 'game-over-options-separator';

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
    originBonusLevel: levelOf(NEW_GAME_BONUS_LEVEL_SELECT_IDS.originBonusLevel),
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

/**
 * Returns true when an element shares a flex line with a separator.
 *
 * Purpose: Items on one flex line can differ in height, so the test uses the separator's vertical midpoint
 *   instead of comparing tops.
 * When to use: `syncNewGameOptionSeparators`.
 * Expected outcome: True when the midpoint falls inside the neighbor's vertical extent. A missing neighbor counts as
 *   a different line.
 * Exceptions: None.
 */
function isOnSeparatorLine(separatorMidY: number, neighbor: Element | null): boolean {
  if (!neighbor) return false;
  const rect = neighbor.getBoundingClientRect();
  return separatorMidY >= rect.top && separatorMidY <= rect.bottom;
}

/**
 * Hides each slash separator that a line wrapped to its start or end.
 *
 * Purpose: A narrow window can wrap one bonus line, and a slash left at a line edge separates nothing.
 * When to use: Through `registerNewGameOptionSeparators`, whenever the block changes size.
 * Expected outcome: A separator stays visible only when both neighbors are on its line. Hidden separators keep their
 *   space, so hiding one never re-wraps the line.
 * Exceptions: None.
 */
function syncNewGameOptionSeparators(block: Element): void {
  for (const separator of block.querySelectorAll<HTMLElement>(`.${NEW_GAME_OPTION_SEPARATOR_CLASS}`)) {
    const rect = separator.getBoundingClientRect();
    const midY = (rect.top + rect.bottom) / 2;
    const joinsNeighbors =
      isOnSeparatorLine(midY, separator.previousElementSibling) && isOnSeparatorLine(midY, separator.nextElementSibling);
    separator.style.visibility = joinsNeighbors ? '' : 'hidden';
  }
}

/**
 * Keeps each bonus line's slash in step with how that line wraps.
 *
 * Purpose: Line width depends on the window and on the region lists, which load after the dialog opens.
 * When to use: Once while the renderer is starting.
 * Expected outcome: The separators are checked now and again each time the block changes size, including when the
 *   dialog opens. A missing block or a missing `ResizeObserver` leaves every separator visible.
 * Exceptions: None.
 */
export function registerNewGameOptionSeparators(): void {
  const block = document.querySelector(NEW_GAME_OPTIONS_BLOCK_SELECTOR);
  if (!block || typeof ResizeObserver === 'undefined') return;
  new ResizeObserver(() => syncNewGameOptionSeparators(block)).observe(block);
}
