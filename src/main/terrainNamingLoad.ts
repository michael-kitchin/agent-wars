/** Loads and validates terrain naming envelopes emitted by the Python naming pipeline. */

import * as fs from 'fs';
import { getResolution } from 'h3-js';
import { logDebug, logError, logTrace } from './logger';
import { resolveTerrainRes1NamingPath, resolveTerrainRes4NamingPath } from './terrainMetadataPaths';

export const EXPECTED_HEX_NAMING_SCHEMA_VERSION = '1.0.0';
export const TOOLTIP_NAME_LIST_MAX_ITEMS = 5;

export interface TerrainNamingStateRow {
  name: string;
  country: string;
  scalerank: number | null;
}

export interface TerrainNamingCityRow {
  name: string;
  state: string | null;
  country: string | null;
  population: number | null;
  scalerank: number | null;
}

export interface TerrainNamingCountryRow {
  name: string;
  continent: string | null;
  region: string | null;
  population: number | null;
  scalerank: number | null;
}

export interface TerrainNamingRecordRes1 {
  h3_index: string;
  states: TerrainNamingStateRow[];
  countries: TerrainNamingCountryRow[];
}

export interface TerrainNamingRecordRes4 extends TerrainNamingRecordRes1 {
  cities: TerrainNamingCityRow[];
}

export interface TerrainNamingEnvelope {
  schema_version: string;
  resolution: number;
  record_count: number;
  records: TerrainNamingRecordRes1[] | TerrainNamingRecordRes4[];
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function readStr(r: Record<string, unknown>, key: string): string {
  const v = r[key];
  if (typeof v !== 'string' || !v) throw new Error(`terrain naming: "${key}" must be a non-empty string`);
  return v;
}

function readNumOrNull(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`terrain naming: "${key}" must be a number or null`);
  }
  return v;
}

function readIntOrNull(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`terrain naming: "${key}" must be an integer or null`);
  }
  return v;
}

function readRequiredIntOrNull(r: Record<string, unknown>, key: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(r, key)) {
    throw new Error(`terrain naming: "${key}" is required`);
  }
  return readIntOrNull(r, key);
}

function readOptionalStrOrNull(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') throw new Error(`terrain naming: "${key}" must be a string or null`);
  return v;
}

function readStateArray(r: Record<string, unknown>, key: string): TerrainNamingStateRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    return {
      name: readStr(el, 'name'),
      country: readStr(el, 'country'),
      scalerank: readIntOrNull(el, 'scalerank'),
    };
  });
}

function readCountryArray(r: Record<string, unknown>, key: string): TerrainNamingCountryRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    return {
      name: readStr(el, 'name'),
      continent: readOptionalStrOrNull(el, 'continent'),
      region: readOptionalStrOrNull(el, 'region'),
      population: readNumOrNull(el, 'population'),
      scalerank: readRequiredIntOrNull(el, 'scalerank'),
    };
  });
}

function readCityArray(r: Record<string, unknown>, key: string): TerrainNamingCityRow[] {
  const v = r[key];
  if (!Array.isArray(v)) throw new Error(`terrain naming: "${key}" must be an array`);
  return v.map((el, i) => {
    if (!isRecord(el)) throw new Error(`terrain naming: ${key}[${i}] must be an object`);
    return {
      name: readStr(el, 'name'),
      state: readOptionalStrOrNull(el, 'state'),
      country: readOptionalStrOrNull(el, 'country'),
      population: readNumOrNull(el, 'population'),
      scalerank: readIntOrNull(el, 'scalerank'),
    };
  });
}

function parseRes1Row(raw: unknown, resolution: number): TerrainNamingRecordRes1 {
  if (!isRecord(raw)) throw new Error('terrain naming: record must be an object');
  const h3_index = readStr(raw, 'h3_index');
  if (getResolution(h3_index) !== resolution) {
    throw new Error(`terrain naming: h3_index ${h3_index} resolution != envelope ${resolution}`);
  }
  return {
    h3_index,
    states: readStateArray(raw, 'states'),
    countries: readCountryArray(raw, 'countries'),
  };
}

function parseRes4Row(raw: unknown, resolution: number): TerrainNamingRecordRes4 {
  if (!isRecord(raw)) throw new Error('terrain naming: record must be an object');
  const base = parseRes1Row(raw, resolution);
  return {
    ...base,
    cities: readCityArray(raw, 'cities'),
  };
}

function parseNamingEnvelope(raw: unknown, expectedResolution: number): TerrainNamingEnvelope {
  if (!isRecord(raw)) throw new Error('terrain naming: root must be an object');
  if (raw.schema_version !== EXPECTED_HEX_NAMING_SCHEMA_VERSION) {
    throw new Error(
      `terrain naming: schema_version ${String(raw.schema_version)} != ${EXPECTED_HEX_NAMING_SCHEMA_VERSION}`
    );
  }
  const resolution = readIntOrNull(raw, 'resolution');
  if (resolution === null) throw new Error('terrain naming: "resolution" must be an integer');
  if (resolution !== expectedResolution) {
    throw new Error(`terrain naming: resolution ${resolution} != expected ${expectedResolution}`);
  }
  const record_count = readIntOrNull(raw, 'record_count');
  if (record_count === null) throw new Error('terrain naming: "record_count" must be an integer');
  const recs = raw.records;
  if (!Array.isArray(recs)) throw new Error('terrain naming: records must be an array');
  if (recs.length !== record_count) {
    throw new Error(`terrain naming: record_count ${record_count} != len(records) ${recs.length}`);
  }
  const parseRow =
    expectedResolution === 4 ? (r: unknown) => parseRes4Row(r, 4) : (r: unknown) => parseRes1Row(r, 1);
  const records = recs.map((r, i) => {
    try {
      return parseRow(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`terrain naming: records[${i}]: ${msg}`);
    }
  }) as TerrainNamingRecordRes1[] | TerrainNamingRecordRes4[];
  const seen = new Set<string>();
  for (const row of records) {
    if (seen.has(row.h3_index)) throw new Error(`terrain naming: duplicate h3_index ${row.h3_index}`);
    seen.add(row.h3_index);
  }
  return {
    schema_version: String(raw.schema_version),
    resolution,
    record_count,
    records,
  };
}

/**
 * Why this exists:
 *     Build the tooltip headline list from first-occurring scalerank only.
 * When to use:
 *     Renderer hover naming line generation for city/state/country name rows.
 * What to expect:
 *     Returns comma-delimited names preserving source order; empty string when no rows exist.
 */
export function namesForFirstOccurringScalerank(
  rows: ReadonlyArray<{ name: string; scalerank: number | null }>
): string {
  return namesForFirstOccurringScalerankList(rows).join(', ');
}

/**
 * Why this exists:
 *     Return first-occurring-scalerank names as an ordered list for tooltip fallback decisions.
 * When to use:
 *     Res-1/Res-4 naming headline selection when deciding whether to escalate geographic level.
 * What to expect:
 *     Preserves source order and returns an empty list when no rows exist.
 */
export function namesForFirstOccurringScalerankList(
  rows: ReadonlyArray<{ name: string; scalerank: number | null }>
): string[] {
  if (rows.length === 0) return [];
  const firstRank = rows[0]?.scalerank ?? null;
  const names: string[] = [];
  for (const row of rows) {
    if ((row.scalerank ?? null) !== firstRank) continue;
    names.push(row.name);
  }
  return names;
}

function firstOccurringScalerankRows<T extends { scalerank: number | null }>(rows: ReadonlyArray<T>): T[] {
  if (rows.length === 0) return [];
  const firstRank = rows[0]?.scalerank ?? null;
  const out: T[] = [];
  for (const row of rows) {
    if ((row.scalerank ?? null) !== firstRank) continue;
    out.push(row);
  }
  return out;
}

function groupedLabel<T>(
  rows: ReadonlyArray<T>,
  groupKey: (row: T) => string,
  itemLabel: (row: T, groupRows: ReadonlyArray<T>) => string
): string {
  const groupOrder: string[] = [];
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupKey(row);
    let list = grouped.get(key);
    if (!list) {
      list = [];
      grouped.set(key, list);
      groupOrder.push(key);
    }
    list.push(row);
  }
  return groupOrder
    .map((key) => {
      const groupRows = grouped.get(key) ?? [];
      const body = groupRows.map((row) => itemLabel(row, groupRows)).join(', ');
      return `${key}: ${body}`;
    })
    .join('; ');
}

function formatGroupedCitiesForTooltip(rows: ReadonlyArray<TerrainNamingCityRow>): string {
  const countryOrder: string[] = [];
  const citiesByCountry = new Map<string, TerrainNamingCityRow[]>();
  for (const row of rows) {
    const country = row.country ?? 'Unknown Country';
    let cityRows = citiesByCountry.get(country);
    if (!cityRows) {
      cityRows = [];
      citiesByCountry.set(country, cityRows);
      countryOrder.push(country);
    }
    cityRows.push(row);
  }
  return countryOrder
    .map((country) => {
      const cityRows = citiesByCountry.get(country) ?? [];
      const stateOrder: string[] = [];
      const citiesByState = new Map<string, string[]>();
      for (const cityRow of cityRows) {
        const stateKey = cityRow.state ?? '';
        let stateCities = citiesByState.get(stateKey);
        if (!stateCities) {
          stateCities = [];
          citiesByState.set(stateKey, stateCities);
          stateOrder.push(stateKey);
        }
        stateCities.push(cityRow.name);
      }
      const groupedCityLabels = stateOrder
        .map((stateKey) => {
          const cityNames = citiesByState.get(stateKey) ?? [];
          const joinedCities = cityNames.join(', ');
          return stateKey ? `${joinedCities} (${stateKey})` : joinedCities;
        })
        .filter((label) => label.length > 0);
      return `${country}: ${groupedCityLabels.join(', ')}`;
    })
    .join('; ');
}

function formatGroupedStatesForTooltip(rows: ReadonlyArray<TerrainNamingStateRow>): string {
  return groupedLabel(
    rows,
    (row) => row.country || 'Unknown Country',
    (row) => row.name
  );
}

function formatGroupedCountriesForTooltip(rows: ReadonlyArray<TerrainNamingCountryRow>): string {
  return groupedLabel(
    rows,
    (row) => row.continent ?? 'Unknown Continent',
    (row) => row.name
  );
}

function citiesCoverAllStates(
  cityRows: ReadonlyArray<TerrainNamingCityRow>,
  associatedStates: ReadonlyArray<TerrainNamingStateRow>
): boolean {
  if (associatedStates.length === 0) return true;
  const coveredStates = new Set(
    cityRows
      .map((row) => row.state)
      .filter((state): state is string => typeof state === 'string' && state.length > 0)
  );
  for (const stateRow of associatedStates) {
    if (!coveredStates.has(stateRow.name)) return false;
  }
  return true;
}

function statesCoverAllCountries(
  stateRows: ReadonlyArray<TerrainNamingStateRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(stateRows.map((row) => row.country || 'Unknown Country'));
  for (const countryRow of associatedCountries) {
    if (!coveredCountries.has(countryRow.name)) return false;
  }
  return true;
}

/**
 * Why this exists:
 *     Resolve preferred naming headline for a res-4 hex with capped list size before escalation.
 * When to use:
 *     Build tooltip title line for detail-mode hover.
 * What to expect:
 *     Uses first-occurring-scalerank city/state rows with coverage gates:
 *       - cities when count is 1..TOOLTIP_NAME_LIST_MAX_ITEMS and those city state labels cover all associated states
 *       - otherwise states when count is 1..TOOLTIP_NAME_LIST_MAX_ITEMS and those state country labels cover all associated countries
 *       - otherwise countries (final fallback, uncapped), grouped by continent (all associated countries included)
 *     Returns null only when all levels are empty.
 */
export function preferredNamingLineForRes4Record(record: TerrainNamingRecordRes4): string | null {
  const firstRankCities = firstOccurringScalerankRows(record.cities);
  if (
    firstRankCities.length > 0 &&
    firstRankCities.length <= TOOLTIP_NAME_LIST_MAX_ITEMS &&
    citiesCoverAllStates(firstRankCities, record.states)
  ) {
    return formatGroupedCitiesForTooltip(firstRankCities);
  }
  const firstRankStates = firstOccurringScalerankRows(record.states);
  if (
    firstRankStates.length > 0 &&
    firstRankStates.length <= TOOLTIP_NAME_LIST_MAX_ITEMS &&
    statesCoverAllCountries(firstRankStates, record.countries)
  ) {
    return formatGroupedStatesForTooltip(firstRankStates);
  }
  if (record.countries.length > 0) return formatGroupedCountriesForTooltip(record.countries);
  return null;
}

/**
 * Why this exists:
 *     Resolve preferred naming headline for a res-1 hex with capped list size before escalation.
 * When to use:
 *     Build tooltip title line for world-map hover.
 * What to expect:
 *     Uses first-occurring-scalerank states with country-coverage gate:
 *       - states when count is 1..TOOLTIP_NAME_LIST_MAX_ITEMS and state country labels cover all associated countries
 *       - otherwise countries (final fallback, uncapped), grouped by continent (all associated countries included)
 *     Returns null when neither states nor countries exist.
 */
export function preferredNamingLineForRes1Record(record: TerrainNamingRecordRes1): string | null {
  const firstRankStates = firstOccurringScalerankRows(record.states);
  if (
    firstRankStates.length > 0 &&
    firstRankStates.length <= TOOLTIP_NAME_LIST_MAX_ITEMS &&
    statesCoverAllCountries(firstRankStates, record.countries)
  ) {
    return formatGroupedStatesForTooltip(firstRankStates);
  }
  if (record.countries.length > 0) return formatGroupedCountriesForTooltip(record.countries);
  return null;
}

/**
 * Why this exists:
 *     Load res-1 naming metadata from disk with strict validation for tooltip naming lookups.
 * When to use:
 *     Terrain naming cache build.
 * What to expect:
 *     Throws on invalid JSON, schema mismatch, or H3 / field contract violations.
 */
export function loadTerrainRes1NamingFromPath(absPath: string): TerrainNamingEnvelope {
  logDebug('terrainNamingLoad loadTerrainRes1NamingFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainNamingLoad loadTerrainRes1NamingFromPath: read/parse failed', err);
    throw err;
  }
  return parseNamingEnvelope(parsed, 1);
}

/**
 * Why this exists:
 *     Load res-4 naming metadata from disk for detail-hover naming lookups.
 * When to use:
 *     Terrain naming cache build.
 * What to expect:
 *     Throws on invalid JSON, schema mismatch, or res-4 naming record contract violations.
 */
export function loadTerrainRes4NamingFromPath(absPath: string): TerrainNamingEnvelope {
  logDebug('terrainNamingLoad loadTerrainRes4NamingFromPath', { absPath });
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
  } catch (err) {
    logError('terrainNamingLoad loadTerrainRes4NamingFromPath: read/parse failed', err);
    throw err;
  }
  return parseNamingEnvelope(parsed, 4);
}

/**
 * Why this exists:
 *     Load bundled res-1 naming metadata using standard generated-data path resolution.
 * When to use:
 *     Terrain naming cache initialization in app startup.
 * What to expect:
 *     Same behavior as `loadTerrainRes1NamingFromPath`.
 */
export function loadTerrainRes1NamingBundled(): TerrainNamingEnvelope {
  logTrace('terrainNamingLoad loadTerrainRes1NamingBundled');
  return loadTerrainRes1NamingFromPath(resolveTerrainRes1NamingPath());
}

/**
 * Why this exists:
 *     Load bundled res-4 naming metadata using standard generated-data path resolution.
 * When to use:
 *     Terrain naming cache initialization in app startup.
 * What to expect:
 *     Same behavior as `loadTerrainRes4NamingFromPath`.
 */
export function loadTerrainRes4NamingBundled(): TerrainNamingEnvelope {
  logTrace('terrainNamingLoad loadTerrainRes4NamingBundled');
  return loadTerrainRes4NamingFromPath(resolveTerrainRes4NamingPath());
}
