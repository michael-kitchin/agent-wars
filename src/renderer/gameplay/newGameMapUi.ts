import type { GameMapListEntry, GameMapListSideGroup } from '../../shared/gameMapList';
import { formatAdvancedTechLine, formatUnitCostLabel } from '../../shared/gameMapList';
import type { HomeOption } from '../../shared/newGameSides';
import { selectTabPanel, type TabPanelBinding } from '../chrome/selectTabPanel';
import { rendererSharedState as S } from '../core/state';
import { refreshNewGameMapPreview } from './newGameMapPreviewUi';
import { syncNewGameBannerToTab } from './newGameBanner';

/**
 * Tab buttons and panels on the new-game dialog.
 *
 * Purpose: `selectTabPanel` needs the same ids the markup uses.
 * When to use: Switching Global and Regional.
 * Expected outcome: Two bindings, global first.
 * Exceptions: None.
 */
const NEW_GAME_TABS: readonly TabPanelBinding[] = [
  { tabId: 'new-game-tab-global', panelId: 'new-game-panel-global' },
  { tabId: 'new-game-tab-regional', panelId: 'new-game-panel-regional' },
];

/**
 * Maps returned the last time the overlay loaded them.
 *
 * Purpose: Region changes and cost labels reuse that list.
 * When to use: After `listGameMaps` resolves.
 * Expected outcome: Empty until the first successful load.
 * Exceptions: None.
 */
let loadedMaps: GameMapListEntry[] = [];

/**
 * True after the tab and randomize listeners are attached.
 *
 * Purpose: Renderer startup and a later overlay open must not stack clicks.
 * When to use: `registerNewGameMapControls`.
 * Expected outcome: The second call returns immediately.
 * Exceptions: None.
 */
let controlsRegistered = false;

/**
 * Told when the tab or the regional map changes.
 *
 * Purpose: The side rows live in another module, and this file must not import it.
 * When to use: `setNewGameHomesChangedListener` from the side-row module.
 * Expected outcome: Called after the tab or region changes, before the preview refresh that follows.
 * Exceptions: None.
 */
let onHomesChanged: (() => void) | null = null;

/**
 * Registers the side-row refresh.
 *
 * Purpose: A tab or region change has to rebuild homes without a circular import.
 * When to use: Once, when the side rows are wired.
 * Expected outcome: Later tab and region changes call `listener`.
 * Exceptions: None.
 */
export function setNewGameHomesChangedListener(listener: () => void): void {
  onHomesChanged = listener;
}

/**
 * Homes on the regional map that is selected.
 *
 * Purpose: Each side row picks one group.
 * When to use: While the Regional tab is showing.
 * Expected outcome: One option per side group, id then display name.
 * Exceptions: None.
 */
export function regionalHomeOptions(): readonly HomeOption[] {
  return selectedSideGroups().map((group) => ({ key: group.id, label: group.displayName }));
}

/**
 * Wires the Global and Regional tabs and the regional randomize buttons.
 *
 * Purpose: Those controls stay live for the whole session. The map list loads when the overlay opens.
 * When to use: Once, from `registerNewGameButton`.
 * Expected outcome: Tab clicks switch panels, costs, and the map preview. The region randomize button, side changes, and side randomize buttons refresh that preview.
 * Exceptions: None. A missing element is skipped.
 */
export function registerNewGameMapControls(): void {
  if (controlsRegistered) return;
  controlsRegistered = true;
  document.getElementById('new-game-tab-global')?.addEventListener('click', () => {
    selectNewGameTab('global');
    onHomesChanged?.();
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-tab-regional')?.addEventListener('click', () => {
    selectNewGameTab('regional');
    onHomesChanged?.();
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-region-select')?.addEventListener('change', () => {
    onRegionalRegionChanged();
  });
  document.getElementById('new-game-region-randomize')?.addEventListener('click', () => {
    randomizeSelectedRegion();
  });
}

/**
 * Loads the map list, draws a random region and two different sides, and opens the loaded match's tab.
 *
 * Purpose: The overlay should not keep a stale region or two copies of the same side.
 * When to use: When the new-game overlay goes from hidden to shown.
 * Expected outcome: Costs and the Advanced line follow the selected tab. A map with fewer than two sides disables Start.
 * Exceptions: A failed list load leaves the controls as they are and clears the Advanced line.
 */
export async function prepareNewGameMapPanel(): Promise<void> {
  setAdvancedTechLine('');
  const maps = await window.gameApi?.listGameMaps?.();
  if (!Array.isArray(maps) || maps.length === 0) return;
  loadedMaps = maps;
  fillRegionSelect(maps.filter((entry) => entry.id !== 'global'));
  randomizeRegionalMap();
  const currentId = S.gameState?.gameMap?.id;
  selectNewGameTab(currentId && currentId !== 'global' ? 'regional' : 'global');
}

/**
 * Reads the start payload for the tab that is showing.
 *
 * Purpose: Global Start keeps home-region names. Regional Start sends the map and two side groups.
 * When to use: The Start button click.
 * Expected outcome: Regional fields are omitted on the Global tab.
 * Exceptions: None. Empty strings when a select is missing.
 */
export function readNewGameMapChoice(): { gameMapId?: string } {
  if (!regionalTabSelected()) return {};
  return { gameMapId: selectValue('new-game-region-select') };
}

/**
 * Shows one new-game tab and refreshes the price after each unit type.
 *
 * Purpose: Prices belong to the tab that is showing.
 * When to use: A tab click and the overlay open.
 * Expected outcome: The other panel is hidden. Costs and the Advanced line match the visible tab.
 * Exceptions: None.
 */
function selectNewGameTab(which: 'global' | 'regional'): void {
  selectTabPanel(which === 'regional' ? 'new-game-tab-regional' : 'new-game-tab-global', NEW_GAME_TABS);
  applyVisibleCosts();
  syncNewGameBannerToTab(which);
}

/**
 * Fills the region selector.
 *
 * Purpose: The player picks one extracted region.
 * When to use: After the map list loads.
 * Expected outcome: One option per regional row, in the list's order.
 * Exceptions: None.
 */
function fillRegionSelect(regions: readonly GameMapListEntry[]): void {
  const select = document.getElementById('new-game-region-select') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = '';
  for (const region of regions) {
    const option = document.createElement('option');
    option.value = region.id;
    option.textContent = region.displayName;
    select.appendChild(option);
  }
}

/**
 * Picks a random regional map.
 *
 * Purpose: Opening the overlay should not always land on the first region.
 * When to use: `prepareNewGameMapPanel`.
 * Expected outcome: The region selector changes. Side rows refresh from the homes listener.
 * Exceptions: None.
 */
function randomizeRegionalMap(): void {
  pickRandomRegionIndex();
}

/**
 * Draws another listed region, including the one already shown, then two different sides.
 *
 * Purpose: The region randomize button matches the home-region buttons. Setting the index does not fire `change`.
 * When to use: The region randomize button.
 * Expected outcome: Prices, the Advanced line, the side rows, and the map preview follow the drawn region.
 * Exceptions: None. An empty list leaves the selectors as they are.
 */
function randomizeSelectedRegion(): void {
  if (!pickRandomRegionIndex()) return;
  onRegionalRegionChanged();
}

/**
 * Chooses one option of the region selector.
 *
 * Purpose: Opening the overlay and the region randomize button share one draw.
 * When to use: `randomizeRegionalMap` and `randomizeSelectedRegion`.
 * Expected outcome: True when an option was selected. False when the selector is missing or empty.
 * Exceptions: None.
 */
function pickRandomRegionIndex(): boolean {
  const select = document.getElementById('new-game-region-select') as HTMLSelectElement | null;
  if (!select || select.options.length <= 0) return false;
  select.selectedIndex = Math.floor(Math.random() * select.options.length);
  return true;
}

/**
 * Applies the region now shown in the selector.
 *
 * Purpose: The dropdown and the randomize button must leave prices and the preview on that region.
 * When to use: The region selector's `change` event and `randomizeSelectedRegion`.
 * Expected outcome: Costs refresh, the side rows hear the change, and the preview refits.
 * Exceptions: None.
 */
function onRegionalRegionChanged(): void {
  if (regionalTabSelected()) applyVisibleCosts();
  onHomesChanged?.();
  void refreshNewGameMapPreview();
}

/**
 * Writes the four prices and the Advanced line for the tab that is showing.
 *
 * Purpose: The unit row and the Advanced line sit outside the tabs, so both follow the selection.
 * When to use: A tab change and a regional region change while Regional is selected.
 * Expected outcome: Each unit type's price reads like `$20`, from the global catalog on Global and the region's catalog on Regional. The Advanced line beside the Forces title uses that same map's threshold, or is cleared when that map is missing.
 * Exceptions: None.
 */
function applyVisibleCosts(): void {
  const entry = regionalTabSelected() ? selectedRegionalEntry() : loadedMaps.find((map) => map.id === 'global');
  if (!entry) {
    setAdvancedTechLine('');
    return;
  }
  setCost('new-game-cost-infantry', entry.costs.infantry);
  setCost('new-game-cost-armor', entry.costs.armor);
  setCost('new-game-cost-naval', entry.costs.naval);
  setCost('new-game-cost-air', entry.costs.air);
  setCost('new-game-cost-missile', entry.costs.missile);
  setAdvancedTechLine(formatAdvancedTechLine(entry.advancedMinUrbanCells));
}

/**
 * Writes the Advanced threshold beside the Forces title.
 *
 * Purpose: One line serves both tabs, and an empty line must not keep the previous map's threshold.
 * When to use: `applyVisibleCosts`, and at the start of `prepareNewGameMapPanel` before the map list returns.
 * Expected outcome: The paragraph shows the given text. An empty string removes the previous threshold.
 * Exceptions: None.
 */
function setAdvancedTechLine(text: string): void {
  const advanced = document.getElementById('new-game-advanced-tech');
  if (advanced) advanced.textContent = text;
}

/**
 * Writes one unit price.
 *
 * Purpose: The four prices share one format.
 * When to use: `applyVisibleCosts`.
 * Expected outcome: The element's text is the price, such as `$20`.
 * Exceptions: None.
 */
function setCost(id: string, cost: number): void {
  const el = document.getElementById(id);
  if (el) el.textContent = formatUnitCostLabel(cost);
}

/**
 * Side groups of the region currently selected.
 *
 * Purpose: Randomize and Start both read that list.
 * When to use: Regional tab helpers.
 * Expected outcome: An empty array when the region is missing from the loaded list.
 * Exceptions: None.
 */
function selectedSideGroups(): readonly GameMapListSideGroup[] {
  return selectedRegionalEntry()?.sideGroups ?? [];
}

/**
 * The regional row selected in the region dropdown.
 *
 * Purpose: Costs, the Advanced line, and sides come from one row.
 * When to use: Regional tab helpers.
 * Expected outcome: Null when the list is empty or the value is unknown.
 * Exceptions: None.
 */
function selectedRegionalEntry(): GameMapListEntry | null {
  const id = selectValue('new-game-region-select');
  return loadedMaps.find((entry) => entry.id === id) ?? null;
}

/**
 * True when the Regional tab is the selected one.
 *
 * Purpose: Start and the cost labels follow that attribute.
 * When to use: Before reading regional fields.
 * Expected outcome: False when the tab is missing or Global is selected.
 * Exceptions: None.
 */
function regionalTabSelected(): boolean {
  return document.getElementById('new-game-tab-regional')?.getAttribute('aria-selected') === 'true';
}

/**
 * The new-game tab that is selected.
 *
 * Purpose: The overlay banner names that tab.
 * When to use: When the overlay opens, before writing the banner.
 * Expected outcome: `'regional'` when that tab is selected, otherwise `'global'`.
 * Exceptions: None. A missing tab is global.
 */
export function selectedNewGameTab(): 'global' | 'regional' {
  return regionalTabSelected() ? 'regional' : 'global';
}

/**
 * Reads a select's current value.
 *
 * Purpose: Start sends the option values, not the labels.
 * When to use: `readNewGameMapChoice` and the regional entry lookup.
 * Expected outcome: The value, or an empty string when the select is missing.
 * Exceptions: None.
 */
function selectValue(id: string): string {
  return (document.getElementById(id) as HTMLSelectElement | null)?.value ?? '';
}
