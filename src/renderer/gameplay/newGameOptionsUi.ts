/**
 * DOM ids of the new-game option checkboxes, in display order.
 *
 * Purpose: One list shared by the read and reset helpers so a new option cannot be read but never reset.
 * When to use: Querying the Fog of war, Country bonus, and Terrain bonus checkboxes.
 * Expected outcome: Matches the `id` attributes in `static/index.html`.
 * Exceptions: None.
 */
const NEW_GAME_OPTION_CHECKBOX_IDS = {
  fogOfWarEnabled: 'new-game-fog-checkbox',
  countryBonusEnabled: 'new-game-country-bonus-checkbox',
  terrainBonusEnabled: 'new-game-terrain-bonus-checkbox',
} as const;

/**
 * The flags the new-game checkboxes contribute to the `newGame` payload.
 *
 * Contract: Each field mirrors one checkbox.
 * When to use: Spread into the `newGame` IPC payload.
 * Expected outcome: See `readNewGameOptionFlags`.
 * Exceptions: None.
 */
export type NewGameOptionFlags = Readonly<Record<keyof typeof NEW_GAME_OPTION_CHECKBOX_IDS, boolean>>;

/**
 * Looks up one option checkbox by id.
 *
 * Purpose: Keeps the element cast in one place.
 * When to use: Inside this module.
 * Expected outcome: The input element, or null when the markup lacks it.
 * Exceptions: None.
 */
function optionCheckbox(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

/**
 * Reads the three new-game option checkboxes.
 *
 * Purpose: Start-game IPC needs the player's choices in one object.
 * When to use: When the Start game button is clicked.
 * Expected outcome: Fog is on unless its box is present and unchecked (the historical default); each bonus is on
 * only when its box is present and checked.
 * Exceptions: None.
 */
export function readNewGameOptionFlags(): NewGameOptionFlags {
  return {
    fogOfWarEnabled: optionCheckbox(NEW_GAME_OPTION_CHECKBOX_IDS.fogOfWarEnabled)?.checked !== false,
    countryBonusEnabled: optionCheckbox(NEW_GAME_OPTION_CHECKBOX_IDS.countryBonusEnabled)?.checked === true,
    terrainBonusEnabled: optionCheckbox(NEW_GAME_OPTION_CHECKBOX_IDS.terrainBonusEnabled)?.checked === true,
  };
}

/**
 * Checks every new-game option checkbox.
 *
 * Purpose: All options default to on each time the new-game overlay opens.
 * When to use: When the overlay is shown, before the player can interact with it.
 * Expected outcome: Every present checkbox is checked; missing ones are skipped.
 * Exceptions: None.
 */
export function resetNewGameOptionCheckboxes(): void {
  for (const id of Object.values(NEW_GAME_OPTION_CHECKBOX_IDS)) {
    const checkbox = optionCheckbox(id);
    if (checkbox) checkbox.checked = true;
  }
}
