import { logDebug, logError, logTrace } from './logger';
import { loadTerrainRes1NamingBundled } from './terrainNamingLoad';

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
 * Defines the `buildRegionHexCache` function shape (function buildRegionHexCache(): Map<string, string[]> { logDebug('regionScenario buildRegionHexCache'); const env = loadTerrainRes1NamingBundled(); con).

 * Purpose: Supports maintainability by documenting why `buildRegionHexCache` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildRegionHexCache(): Map<string, string[]> {
  logDebug('regionScenario buildRegionHexCache');
  const env = loadTerrainRes1NamingBundled();
  const byRegion = new Map<string, Set<string>>();
  for (const row of env.records) {
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
  cachedRegionHexesByName = null;
}
