import { logDebug, logError, logTrace } from './logger';
import { loadTerrainStrategicNamingFromPath } from './terrainNamingLoad';
import { resolveBundledGlobalStrategicNamingPath } from './terrainMetadataPaths';
import { GLOBAL_STRATEGIC_H3_RESOLUTION } from '../shared/h3Resolutions';

/**
 * Documents the module-scope binding `PASSABLE_LAND_TERRAIN_KINDS` (PASSABLE_LAND_TERRAIN_KINDS).

 * Purpose: Supports maintainability by documenting why `PASSABLE_LAND_TERRAIN_KINDS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const PASSABLE_LAND_TERRAIN_KINDS = new Set([
  'plains',
  'mountain',
  'mountains',
  'wetlands',
  'coastal',
  'desert',
  'forest',
]);

/**
 * Documents the module-scope binding `cachedRegionHexesByName` (cachedRegionHexesByName: Map<string, string[]> | null).

 * Purpose: Supports maintainability by documenting why `cachedRegionHexesByName` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let cachedRegionHexesByName: Map<string, string[]> | null = null;

/**
 * Side groups of the loaded regional map, or null on the global map.
 *
 * Purpose: Home hexes and display names come from the manifest, not from UN subregion names.
 * When to use: Set by `installSideGroupHomes` during a regional load.
 * Expected outcome: Null means `getScenarioHomeRegionHexes` uses the naming cache.
 * Exceptions: None.
 */
let sideGroupHomes: { id: string; displayName: string; hexes: readonly string[] }[] | null = null;

/**
 * Installs regional side groups as the home areas for the current match.
 *
 * Purpose: Seeding and victory look up hexes by the group's id or display name.
 * When to use: After a regional manifest is read, and with null when the global map is installed.
 * Expected outcome: Later home-hex lookups for those names return that group's land hexes.
 * Exceptions: None.
 */
export function installSideGroupHomes(
  groups: readonly { id: string; displayName: string; hexes: readonly string[] }[] | null
): void {
  logDebug('regionScenario installSideGroupHomes', { groupCount: groups?.length ?? 0 });
  sideGroupHomes = groups ? groups.map((group) => ({ ...group, hexes: [...group.hexes] })) : null;
}

/**
 * Resolves two different side groups to the names stored on the match.
 *
 * Purpose: The dialog sends group ids. Prompts and victory use the display names.
 * When to use: `resetGameForNewMatch` when the chosen map is regional.
 * Expected outcome: The two display names. The hex lists are already installed under those names.
 * Exceptions: Throws when a group is unknown or both sides picked the same group.
 */
export function resolveSideGroupHomeNames(
  humanSideGroupId: string,
  aiSideGroupId: string
): { humanHomeRegion: string; aiHomeRegion: string } {
  logDebug('regionScenario resolveSideGroupHomeNames', { humanSideGroupId, aiSideGroupId });
  if (!sideGroupHomes) {
    const err = new Error('No side groups are loaded');
    logError('regionScenario resolveSideGroupHomeNames: none loaded', err);
    throw err;
  }
  if (humanSideGroupId === aiSideGroupId) {
    const err = new Error('The two sides must be different groups');
    logError('regionScenario resolveSideGroupHomeNames: same group', err);
    throw err;
  }
  const human = sideGroupHomes.find((group) => group.id === humanSideGroupId);
  const ai = sideGroupHomes.find((group) => group.id === aiSideGroupId);
  if (!human || !ai) {
    const err = new Error('Unknown side group');
    logError('regionScenario resolveSideGroupHomeNames: unknown', { humanSideGroupId, aiSideGroupId, err });
    throw err;
  }
  return { humanHomeRegion: human.displayName, aiHomeRegion: ai.displayName };
}

/**
 * Drops the cached UN-subregion hex lists.
 *
 * Purpose: A map change must not keep names built from the previous naming file.
 * When to use: Before reloading terrain, and from tests that swap fixtures.
 * Expected outcome: The next global home-hex lookup rebuilds from the loaded naming snapshot.
 * Exceptions: None.
 */
export function clearScenarioRegionCache(): void {
  logDebug('regionScenario clearScenarioRegionCache');
  cachedRegionHexesByName = null;
}

/**
 * Defines the `buildRegionHexCache` function shape (function buildRegionHexCache(): Map<string, string[]> { logDebug('regionScenario buildRegionHexCache'); const env = loadTerrainStrategicNamingBundled(); con).

 * Purpose: Supports maintainability by documenting why `buildRegionHexCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildRegionHexCache(): Map<string, string[]> {
  logDebug('regionScenario buildRegionHexCache');
  const env = loadTerrainStrategicNamingFromPath(
    resolveBundledGlobalStrategicNamingPath(),
    GLOBAL_STRATEGIC_H3_RESOLUTION
  );
  const records = env.records;
  const byRegion = new Map<string, Set<string>>();
  for (const row of records) {
    for (const country of row.countries) {
      const region = (country.region ?? '').trim();
      if (!region) continue;
      let hexes = byRegion.get(region);
      if (!hexes) {
        hexes = new Set<string>();
        byRegion.set(region, hexes);
      }
      hexes.add(row.h3_index);
    }
  }
  const out = new Map<string, string[]>();
  for (const [region, hexes] of byRegion) {
    out.set(region, [...hexes].sort());
  }
  return out;
}

/**
 * Defines the `getRegionHexCache` function shape (function getRegionHexCache(): Map<string, string[]>).

 * Purpose: Supports maintainability by documenting why `getRegionHexCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getRegionHexCache(): Map<string, string[]> {
  if (cachedRegionHexesByName) return cachedRegionHexesByName;
  try {
    cachedRegionHexesByName = buildRegionHexCache();
    return cachedRegionHexesByName;
  } catch (err) {
    logError('regionScenario getRegionHexCache: failed to build cache', err);
    throw err;
  }
}

/**
 * Defines the `listScenarioHomeRegions` function shape (export function listScenarioHomeRegions(): string[]).

 * Purpose: Supports maintainability by documenting why `listScenarioHomeRegions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function listScenarioHomeRegions(): string[] {
  logTrace('regionScenario listScenarioHomeRegions');
  const names = [...getRegionHexCache().keys()];
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/**
 * Defines the `resolveScenarioHomeRegions` function shape (export function resolveScenarioHomeRegions(options?: { humanHomeRegion?: string; aiHomeRegion?: string; }): { humanHomeRegion: string; aiHomeRegion: stri).

 * Purpose: Supports maintainability by documenting why `resolveScenarioHomeRegions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function resolveScenarioHomeRegions(options?: {
  humanHomeRegion?: string;
  aiHomeRegion?: string;
}): { humanHomeRegion: string; aiHomeRegion: string } {
  logTrace('regionScenario resolveScenarioHomeRegions');
  const regionOptions = listScenarioHomeRegions();
  const preferred = regionOptions.filter((name) => name.trim().toLowerCase() !== 'antarctica');
  const fallbackHuman = preferred[0] ?? regionOptions[0] ?? '';
  const fallbackAi =
    preferred.find((name) => name !== fallbackHuman) ??
    regionOptions.find((name) => name !== fallbackHuman) ??
    fallbackHuman;
  const requestedHuman = (options?.humanHomeRegion ?? '').trim();
  const requestedAi = (options?.aiHomeRegion ?? '').trim();
  const humanHomeRegion = regionOptions.includes(requestedHuman) ? requestedHuman : fallbackHuman;
  const aiHomeRegion = regionOptions.includes(requestedAi) ? requestedAi : fallbackAi;
  return { humanHomeRegion, aiHomeRegion };
}

/**
 * Defines the `getScenarioHomeRegionHexes` function shape (export function getScenarioHomeRegionHexes(regionName: string): string[]).

 * Purpose: Supports maintainability by documenting why `getScenarioHomeRegionHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getScenarioHomeRegionHexes(regionName: string): string[] {
  logTrace('regionScenario getScenarioHomeRegionHexes', { regionName });
  const key = regionName.trim();
  if (!key) return [];
  const group = sideGroupHomes?.find((entry) => entry.id === key || entry.displayName === key);
  if (group) return [...group.hexes];
  return [...(getRegionHexCache().get(key) ?? [])];
}

/**
 * Defines the `isScenarioPassableLandTerrainKind` function shape (export function isScenarioPassableLandTerrainKind(terrainKind: string): boolean).

 * Purpose: Supports maintainability by documenting why `isScenarioPassableLandTerrainKind` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isScenarioPassableLandTerrainKind(terrainKind: string): boolean {
  return PASSABLE_LAND_TERRAIN_KINDS.has(terrainKind);
}

/**
 * Defines the `clearScenarioRegionCacheForTests` function shape (export function clearScenarioRegionCacheForTests(): void).

 * Purpose: Supports maintainability by documenting why `clearScenarioRegionCacheForTests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearScenarioRegionCacheForTests(): void {
  clearScenarioRegionCache();
}
