/**
 * Holds the res4 birth-country map built with the terrain classification cache.
 *
 * Purpose: Keeps that map out of the classification snapshot so birth lookup stays next to birth selection.
 * When to use: `storeRes4BirthCountryCache` from snapshot build; `getRes4BirthCountryFromSnapshot` at unit insert.
 * Expected outcome: One map for the loaded terrain cache, cleared with it.
 * Exceptions: Reading before a store throws.
 */
import { cellToParent } from 'h3-js';
import type { BirthCountry } from '../../shared/unitOriginTypes';
import { logDebug, logError, logTrace } from '../logger';
import type { TerrainNamingRecordRes1, TerrainNamingRecordRes4 } from '../terrainNamingLoad';
import { buildRes1MajorityCountryNameByH3 } from './res1MajorityCountry';
import { buildRes4BirthCountryByH3 } from './res4BirthCountry';

/**
 * Shared empty answer for `getRes1MajorityCountryNamesFromSnapshot` before the cache loads.
 *
 * Contract: Never mutated; callers treat it as "no hex has a country".
 * When to use: Only as that getter's fallback.
 * Expected outcome: Every lookup misses.
 * Exceptions: None.
 */
const NO_RES1_COUNTRY_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * Birth country per res4 cell for the currently loaded terrain cache.
 *
 * Purpose: Answers "what country is this cell?" without walking naming rows at spawn time.
 * When to use: Set by `storeRes4BirthCountryCache`; read by `getRes4BirthCountryFromSnapshot`.
 * Expected outcome: `null` until the terrain cache has been built; an empty map is a loaded cache with no countries.
 * Exceptions: None.
 */
let res4BirthCountryByH3: ReadonlyMap<string, BirthCountry> | null = null;

/**
 * Majority country name per res1 hex for the currently loaded terrain cache.
 *
 * Contract: Built from `res4BirthCountryByH3` in the same store call, so the two never disagree.
 * When to use: Set by `storeRes4BirthCountryCache`; read by `getRes1MajorityCountryNamesFromSnapshot`.
 * Expected outcome: `null` until the terrain cache has been built.
 * Exceptions: None.
 */
let res1MajorityCountryNameByH3: ReadonlyMap<string, string> | null = null;

/**
 * Builds and remembers birth countries from the naming rows the terrain cache just loaded.
 *
 * Purpose: Publishes naming-derived countries for unit birth selection.
 * When to use: At the end of terrain-cache snapshot build, including when no cell has a country.
 * Expected outcome: Later lookups see this map, and the res1 majority-country map derived from it, until `clearRes4BirthCountryCache`.
 * Exceptions: None.
 */
export function storeRes4BirthCountryCache(
  res1Records: readonly TerrainNamingRecordRes1[],
  res4Records: readonly TerrainNamingRecordRes4[]
): void {
  const countriesByH3 = buildRes4BirthCountryByH3({ res1Records, res4Records });
  const majorityByRes1 = buildRes1MajorityCountryNameByH3(countriesByH3, (h3Index) => cellToParent(h3Index, 1));
  logDebug('res4BirthCountryCache storeRes4BirthCountryCache', { cells: countriesByH3.size, res1Hexes: majorityByRes1.size });
  res4BirthCountryByH3 = countriesByH3;
  res1MajorityCountryNameByH3 = majorityByRes1;
}

/**
 * Returns the majority country name of every res1 hex that has one.
 *
 * Purpose: Strategic place country for the country bonus, read by snapshot assembly and combat resolution.
 * When to use: Once per snapshot or turn; look hexes up in the returned map.
 * Expected outcome: The loaded map, or an empty map (after logging an error) when the cache is not loaded, so callers keep running with no country bonus.
 * Exceptions: None.
 */
export function getRes1MajorityCountryNamesFromSnapshot(): ReadonlyMap<string, string> {
  logTrace('res4BirthCountryCache getRes1MajorityCountryNamesFromSnapshot', { loaded: res1MajorityCountryNameByH3 !== null });
  if (!res1MajorityCountryNameByH3) {
    logError(
      'res4BirthCountryCache getRes1MajorityCountryNamesFromSnapshot: cache empty',
      new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first')
    );
    return NO_RES1_COUNTRY_NAMES;
  }
  return res1MajorityCountryNameByH3;
}

/**
 * Returns the precomputed birth country of a res4 cell.
 *
 * Purpose: Lets unit birth selection name the country of the chosen cell.
 * When to use: After the terrain cache has been loaded, once per unit insert.
 * Expected outcome: The shared `BirthCountry`, or `null` for cells without naming rows.
 * Exceptions: Throws when the cache has not been loaded.
 */
export function getRes4BirthCountryFromSnapshot(h3Index: string): BirthCountry | null {
  logTrace('res4BirthCountryCache getRes4BirthCountryFromSnapshot', { h3Index });
  if (!res4BirthCountryByH3) {
    const err = new Error('terrainClassificationCache: load ensureTerrainClassificationCacheLoaded() first');
    logError('res4BirthCountryCache getRes4BirthCountryFromSnapshot: cache empty', err);
    throw err;
  }
  return res4BirthCountryByH3.get(h3Index) ?? null;
}

/**
 * Collects the birth-country names of the given res4 cells for a battle snapshot.
 *
 * Purpose: Tactical place country for the country bonus, frozen when the battle starts.
 * When to use: Once per new tactical battle, with its footprint cells.
 * Expected outcome: A record of the cells that have a country, or `undefined` when none do or the cache is not loaded (an error is logged), so the battle still starts.
 * Exceptions: None.
 */
export function res4CountryNamesForCells(cells: readonly string[]): Record<string, string> | undefined {
  logTrace('res4BirthCountryCache res4CountryNamesForCells', { cells: cells.length });
  try {
    const namesByH3 = Object.fromEntries(
      cells.flatMap((cell) => {
        const name = getRes4BirthCountryFromSnapshot(cell)?.name;
        return name ? [[cell, name] as const] : [];
      })
    );
    return Object.keys(namesByH3).length > 0 ? namesByH3 : undefined;
  } catch (err) {
    logError('res4BirthCountryCache res4CountryNamesForCells: lookup failed', { cells: cells.length, err });
    return undefined;
  }
}

/**
 * Forgets the birth-country map.
 *
 * Purpose: Matches `clearTerrainClassificationCacheForTests`, so a rebuilt cache cannot see stale countries.
 * When to use: Whenever the terrain classification cache is cleared.
 * Expected outcome: The next res4 lookup throws, and the res1 lookup returns an empty map, until the cache is stored again.
 * Exceptions: None.
 */
export function clearRes4BirthCountryCache(): void {
  logDebug('res4BirthCountryCache clearRes4BirthCountryCache');
  res4BirthCountryByH3 = null;
  res1MajorityCountryNameByH3 = null;
}
