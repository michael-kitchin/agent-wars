const HUMAN_REGION_SELECT_ID = 'new-game-human-region-select';
const AI_REGION_SELECT_ID = 'new-game-ai-region-select';

function getRegionSelect(id: string): HTMLSelectElement | null {
  return document.getElementById(id) as HTMLSelectElement | null;
}

export function randomizeScenarioRegionSelect(id: string): void {
  const select = getRegionSelect(id);
  if (!select || select.options.length <= 0) return;
  const idx = Math.floor(Math.random() * select.options.length);
  select.selectedIndex = idx;
}

export function randomizeScenarioRegionSelects(): void {
  randomizeScenarioRegionSelect(HUMAN_REGION_SELECT_ID);
  randomizeScenarioRegionSelect(AI_REGION_SELECT_ID);
}

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

export async function initializeScenarioRegionSelectorsOnOverlayOpen(): Promise<void> {
  await ensureScenarioRegionOptionsLoaded();
  randomizeScenarioRegionSelects();
}

export function getSelectedScenarioRegions(): { humanHomeRegion: string; aiHomeRegion: string } {
  return {
    humanHomeRegion: getRegionSelect(HUMAN_REGION_SELECT_ID)?.value ?? '',
    aiHomeRegion: getRegionSelect(AI_REGION_SELECT_ID)?.value ?? '',
  };
}
