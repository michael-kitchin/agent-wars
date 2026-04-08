import { logDebug, logError, logTrace } from './logger';
import { loadTerrainRes1NamingBundled } from './terrainNamingLoad';

const PASSABLE_LAND_TERRAIN_KINDS = new Set([
  'plains',
  'mountain',
  'mountains',
  'wetlands',
  'coastal',
  'desert',
  'forest',
]);

let cachedRegionHexesByName: Map<string, string[]> | null = null;

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
 * Why this exists:
 *     Returns the canonical sorted home-region option list sourced from res1 naming data.
 * When to use:
 *     New-game UI region selector population and backend payload validation.
 * What to expect:
 *     Returns unique region names sorted lexicographically; never includes empty/null names.
 */
export function listScenarioHomeRegions(): string[] {
  logTrace('regionScenario listScenarioHomeRegions');
  const names = [...getRegionHexCache().keys()];
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/**
 * Why this exists:
 *     Normalizes requested region selections against canonical region options with deterministic fallbacks.
 * When to use:
 *     New-game initialization and payload validation before persisting scenario state.
 * What to expect:
 *     Always returns non-empty valid region names when options exist; defaults prefer non-Antarctica regions.
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
 * Why this exists:
 *     Resolves the set of res1 hexes intersecting one named home region.
 * When to use:
 *     Scenario spawn placement, objective evaluation, and always-visible region outline rendering.
 * What to expect:
 *     Returns sorted unique h3 indices; returns empty array when the region name is unknown.
 */
export function getScenarioHomeRegionHexes(regionName: string): string[] {
  logTrace('regionScenario getScenarioHomeRegionHexes', { regionName });
  const key = regionName.trim();
  if (!key) return [];
  return [...(getRegionHexCache().get(key) ?? [])];
}

/**
 * Why this exists:
 *     Centralizes which terrain kinds count as passable land for region-based spawn seeding.
 * When to use:
 *     Scenario land-unit spawn candidate filtering.
 * What to expect:
 *     True only for plains, mountains, wetlands, coastal, desert, and forest.
 */
export function isScenarioPassableLandTerrainKind(terrainKind: string): boolean {
  return PASSABLE_LAND_TERRAIN_KINDS.has(terrainKind);
}

/**
 * Why this exists:
 *     Allows tests to rebuild region-derived caches after fixture or metadata changes.
 * When to use:
 *     Main-process test teardown where naming inputs differ between cases.
 * What to expect:
 *     Next region lookup rebuilds cache from disk.
 */
export function clearScenarioRegionCacheForTests(): void {
  cachedRegionHexesByName = null;
}
