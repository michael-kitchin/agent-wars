import { randomizeNewGameStartMonth } from './newGameOptionsUi';

/**
 * UN subregion names already loaded for the global home lists.
 *
 * Purpose: The side rows read the list without a second request.
 * When to use: `cachedScenarioHomeRegionNames` after the overlay has opened once.
 * Expected outcome: Empty until the first successful load.
 * Exceptions: None.
 */
let cachedNames: readonly string[] = [];

/**
 * The global home names loaded so far.
 *
 * Purpose: Side rows on the Global tab list these.
 * When to use: While rendering rows, including before the load finishes.
 * Expected outcome: The cached names, or an empty list.
 * Exceptions: None.
 */
export function cachedScenarioHomeRegionNames(): readonly string[] {
  return cachedNames;
}

/**
 * Loads the global home names once.
 *
 * Purpose: The side rows need the same list the old dropdowns used.
 * When to use: When the new-game overlay opens.
 * Expected outcome: The cached names after the first successful load. A failed or empty load leaves the cache as it was.
 * Exceptions: A rejected list load propagates to the caller.
 */
export async function loadScenarioHomeRegionNames(): Promise<readonly string[]> {
  if (cachedNames.length > 0) return cachedNames;
  const regions = await window.gameApi?.listScenarioHomeRegions?.();
  if (Array.isArray(regions) && regions.length > 0) cachedNames = regions;
  return cachedNames;
}

/**
 * Draws a new starting month and loads the global home names.
 *
 * Purpose: Both belong to the moment the dialog opens.
 * When to use: At renderer startup, when the overlay goes from hidden to shown, and when New game opens it.
 * Expected outcome: The month list shows a random month. The home-name cache is filled when the list loads.
 * Exceptions: None. A failed region load leaves the cache as it is and still draws the month.
 */
export async function initializeScenarioRegionSelectorsOnOverlayOpen(): Promise<void> {
  randomizeNewGameStartMonth();
  await loadScenarioHomeRegionNames();
}
