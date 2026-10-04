/**
 * Loads the generated res1 weather pack and answers month questions from it.
 *
 * Purpose: Movement, dice, and snapshots share one table of twelve months per hex.
 * When to use: After terrain startup, and whenever a hex's current weather or a birth hex's tags are needed.
 * Expected outcome: A missing pack fails startup. An unknown hex is mild all year.
 * Exceptions: Throws when the pack is missing or not the expected shape.
 */

import * as fs from 'fs';
import { logDebug, logError, logTrace } from '../logger';
import { resolveTerrainRes1WeatherPath } from '../terrainMetadataPaths';
import type { WeatherMonthRecord, WeatherState } from '../../shared/weatherBonusTypes';
import { acclimationTags, calendarMonthIndex } from '../../shared/weatherBonusRules';

/**
 * Twelve mild months for a hex the pack does not list.
 *
 * Purpose: Open ocean and test fixtures still have a year to read.
 * When to use: `weatherYearForHex` when the index is absent.
 * Expected outcome: Twelve mild months that do not count as heat.
 * Exceptions: None.
 */
const MILD_YEAR: readonly WeatherMonthRecord[] = Object.freeze(
  Array.from({ length: 12 }, () => Object.freeze({ display: 'mild' as const, countsAsHeat: false }))
);

/**
 * Parsed years keyed by res1 index.
 *
 * Purpose: Avoids rereading the pack on every order check.
 * When to use: Set by `ensureWeatherPackLoaded`.
 * Expected outcome: Null until the first successful load.
 * Exceptions: None.
 */
let yearsByHex: ReadonlyMap<string, readonly WeatherMonthRecord[]> | null = null;

/**
 * Accepts one month object from the pack.
 *
 * Purpose: Rejects a corrupt file before any match uses it.
 * When to use: While parsing `terrain_res1_weather.json`.
 * Expected outcome: True for a display state and a boolean heat flag.
 * Exceptions: None.
 */
function isMonthRecord(value: unknown): value is WeatherMonthRecord {
  if (!value || typeof value !== 'object') return false;
  const row = value as { display?: unknown; countsAsHeat?: unknown };
  return (
    (row.display === 'mild' || row.display === 'rain' || row.display === 'snow' || row.display === 'heat') &&
    typeof row.countsAsHeat === 'boolean'
  );
}

/**
 * Reads and caches the weather pack.
 *
 * Purpose: Startup and the first weather question share one load.
 * When to use: From terrain cache startup. Hex lookups use the cache directly so a full-map scan does not log once per hex.
 * Expected outcome: Later calls return the same map. A missing or empty pack throws.
 * Exceptions: Throws when the file is missing, unreadable, or has no valid twelve-month rows.
 */
export function ensureWeatherPackLoaded(): ReadonlyMap<string, readonly WeatherMonthRecord[]> {
  logDebug('weatherPackLoad ensureWeatherPackLoaded', { loaded: yearsByHex != null });
  return readWeatherPack();
}

/**
 * Returns the cached pack, reading the file on the first call.
 *
 * Purpose: Hex scans ask for weather thousands of times. Those reads must not each emit a debug line.
 * When to use: From `ensureWeatherPackLoaded` and from the weather getters.
 * Expected outcome: The same map after the first successful read. A missing or empty pack throws.
 * Exceptions: Throws when the file is missing, unreadable, or has no valid twelve-month rows.
 */
function readWeatherPack(): ReadonlyMap<string, readonly WeatherMonthRecord[]> {
  if (yearsByHex) return yearsByHex;
  try {
    const filePath = resolveTerrainRes1WeatherPath();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { records?: unknown };
    if (!Array.isArray(parsed.records)) {
      throw new Error('terrain_res1_weather.json has no records array');
    }
    const next = new Map<string, readonly WeatherMonthRecord[]>();
    for (const row of parsed.records) {
      if (!row || typeof row !== 'object') continue;
      const record = row as { h3Index?: unknown; months?: unknown };
      if (typeof record.h3Index !== 'string' || !Array.isArray(record.months) || record.months.length !== 12) continue;
      if (!record.months.every(isMonthRecord)) continue;
      next.set(record.h3Index, record.months);
    }
    if (next.size === 0) throw new Error('terrain_res1_weather.json contained no twelve-month hexes');
    yearsByHex = next;
    logDebug('weatherPackLoad readWeatherPack: loaded', { hexes: next.size });
    return next;
  } catch (err) {
    logError('weatherPackLoad readWeatherPack: failed', err);
    throw err;
  }
}

/**
 * Drops the cached pack.
 *
 * Purpose: Tests can load a fixture after pointing path resolution at a temp root.
 * When to use: Test setup and teardown only.
 * Expected outcome: The next read loads from disk again.
 * Exceptions: None.
 */
export function resetWeatherPackCacheForTests(): void {
  logDebug('weatherPackLoad resetWeatherPackCacheForTests');
  yearsByHex = null;
}

/**
 * Returns the twelve classified months for one res1 hex.
 *
 * Purpose: Acclimation and the current month both start from this year.
 * When to use: When the hex may be missing from the pack.
 * Expected outcome: The pack's year, or twelve mild months.
 * Exceptions: Throws when the pack cannot be loaded.
 */
export function weatherYearForHex(h3Index: string): readonly WeatherMonthRecord[] {
  logTrace('weatherPackLoad weatherYearForHex', { h3Index });
  return readWeatherPack().get(h3Index) ?? MILD_YEAR;
}

/**
 * Returns the display weather for a hex on a strategic turn.
 *
 * Purpose: One month covers the whole turn, including every beat of a battle in that hex.
 * When to use: Snapshots, movement, and dice.
 * Expected outcome: The month's display state. An unknown hex is mild.
 * Exceptions: Throws when the pack cannot be loaded.
 */
export function displayWeatherForHex(h3Index: string, turnNumber: number, startMonth: number): WeatherState {
  logTrace('weatherPackLoad displayWeatherForHex', { h3Index, turnNumber, startMonth });
  const year = weatherYearForHex(h3Index);
  return year[calendarMonthIndex(turnNumber, startMonth)]?.display ?? 'mild';
}

/**
 * Returns the acclimation tags for a birth hex.
 *
 * Purpose: A unit keeps these tags for the match. No birth hex means no tags.
 * When to use: Snapshot assembly and combat rolls.
 * Expected outcome: Zero to two of snow, rain, and heat.
 * Exceptions: Throws when the pack cannot be loaded and a birth hex was given.
 */
export function weatherTagsForBirthHex(birthH3Index: string | null | undefined): WeatherState[] {
  logTrace('weatherPackLoad weatherTagsForBirthHex', { birthH3Index: birthH3Index ?? null });
  if (!birthH3Index) return [];
  return acclimationTags(weatherYearForHex(birthH3Index));
}
