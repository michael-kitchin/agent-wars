import { randomizeNewGameStartMonth } from './newGameOptionsUi';

/**
 * Documents the module-scope binding `HUMAN_REGION_SELECT_ID` (HUMAN_REGION_SELECT_ID).

 * Purpose: Supports maintainability by documenting why `HUMAN_REGION_SELECT_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const HUMAN_REGION_SELECT_ID = 'new-game-human-region-select';
/**
 * Documents the module-scope binding `AI_REGION_SELECT_ID` (AI_REGION_SELECT_ID).

 * Purpose: Supports maintainability by documenting why `AI_REGION_SELECT_ID` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const AI_REGION_SELECT_ID = 'new-game-ai-region-select';

/**
 * Defines the `getRegionSelect` function shape (function getRegionSelect(id: string): HTMLSelectElement | null).

 * Purpose: Supports maintainability by documenting why `getRegionSelect` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getRegionSelect(id: string): HTMLSelectElement | null {
  return document.getElementById(id) as HTMLSelectElement | null;
}

/**
 * Defines the `randomizeScenarioRegionSelect` function shape (export function randomizeScenarioRegionSelect(id: string): void).

 * Purpose: Supports maintainability by documenting why `randomizeScenarioRegionSelect` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function randomizeScenarioRegionSelect(id: string): void {
  const select = getRegionSelect(id);
  if (!select || select.options.length <= 0) return;
  const idx = Math.floor(Math.random() * select.options.length);
  select.selectedIndex = idx;
}

/**
 * Defines the `randomizeScenarioRegionSelects` function shape (export function randomizeScenarioRegionSelects(): void).

 * Purpose: Supports maintainability by documenting why `randomizeScenarioRegionSelects` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function randomizeScenarioRegionSelects(): void {
  randomizeScenarioRegionSelect(HUMAN_REGION_SELECT_ID);
  randomizeScenarioRegionSelect(AI_REGION_SELECT_ID);
}

/**
 * Fills both global home-region dropdowns from the scenario list.
 *
 * Purpose: The two home lists stay the same.
 * When to use: When the new-game overlay opens.
 * Expected outcome: The first successful load writes the options. A later call leaves those options in place. A missing control or an empty list leaves the options unchanged.
 * Exceptions: A rejected list load propagates to the caller.
 */
export async function ensureScenarioRegionOptionsLoaded(): Promise<void> {
  const humanSelect = getRegionSelect(HUMAN_REGION_SELECT_ID);
  const aiSelect = getRegionSelect(AI_REGION_SELECT_ID);
  if (!humanSelect || !aiSelect) return;
  if (humanSelect.options.length > 0 && aiSelect.options.length > 0) return;
  const regions = await window.gameApi?.listScenarioHomeRegions?.();
  if (!Array.isArray(regions) || regions.length <= 0) return;
  const renderOptions = (select: HTMLSelectElement): void => {
    select.innerHTML = '';
    for (const region of regions) {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region;
      select.appendChild(option);
    }
  };
  renderOptions(humanSelect);
  renderOptions(aiSelect);
}

/**
 * Draws new home regions and a new starting month for one opening of the dialog.
 *
 * Purpose: Both draws belong to the moment the dialog opens. A later refresh while it stays open leaves them alone, so a player's change survives.
 * When to use: At renderer startup, when the overlay goes from hidden to shown, and when New game in the game menu opens it.
 * Expected outcome: The month list shows a random month immediately. After the region lists load, each shows a random legal region. A missing control is left unchanged.
 * Exceptions: None. A failed region load leaves the region lists as they are and still draws the month.
 */
export async function initializeScenarioRegionSelectorsOnOverlayOpen(): Promise<void> {
  randomizeNewGameStartMonth();
  await ensureScenarioRegionOptionsLoaded();
  randomizeScenarioRegionSelects();
}

/**
 * Defines the `getSelectedScenarioRegions` function shape (export function getSelectedScenarioRegions():).

 * Purpose: Supports maintainability by documenting why `getSelectedScenarioRegions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getSelectedScenarioRegions(): { humanHomeRegion: string; aiHomeRegion: string } {
  return {
    humanHomeRegion: getRegionSelect(HUMAN_REGION_SELECT_ID)?.value ?? '',
    aiHomeRegion: getRegionSelect(AI_REGION_SELECT_ID)?.value ?? '',
  };
}
