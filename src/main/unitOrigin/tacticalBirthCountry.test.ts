import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  TerrainNamingCityRow,
  TerrainNamingCountryRow,
  TerrainNamingRecordTactical,
  TerrainNamingStateRow,
} from '../terrainNamingLoad';
import { loadTerrainStrategicNamingBundled } from '../terrainNamingLoad';
import { buildCanonicalCountryNameByCode, buildTacticalBirthCountryByH3, pickTacticalBirthCountry } from './tacticalBirthCountry';

const NO_CANONICAL_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * Builds a tactical naming record with the given rows.
 *
 * Purpose: Keeps fixtures short by defaulting unused arrays to empty.
 * When to use: In the tests below.
 * Expected outcome: A complete `TerrainNamingRecordTactical`.
 * Exceptions: None.
 */
function tacticalIndex(rows: Partial<Omit<TerrainNamingRecordTactical, 'h3_index'>>): TerrainNamingRecordTactical {
  return { h3_index: '8400001ffffffff', cities: [], states: [], countries: [], water: [], ...rows };
}

/**
 * Builds a city row.
 *
 * Purpose: Fixture helper; state is irrelevant to birth countries.
 * When to use: In the tests below.
 * Expected outcome: A complete `TerrainNamingCityRow`.
 * Exceptions: None.
 */
function city(name: string, country: string, countryCode: string, population: number): TerrainNamingCityRow {
  return { name, state: null, country, population, scalerank: 1, countryCode };
}

/**
 * Builds a country row.
 *
 * Purpose: Fixture helper.
 * When to use: In the tests below.
 * Expected outcome: A complete `TerrainNamingCountryRow`.
 * Exceptions: None.
 */
function country(name: string, countryCode: string, scalerank: number): TerrainNamingCountryRow {
  return { name, continent: 'Europe', region: 'R', population: 1, scalerank, countryCode };
}

/**
 * Builds a state row.
 *
 * Purpose: Fixture helper.
 * When to use: In the tests below.
 * Expected outcome: A complete `TerrainNamingStateRow`.
 * Exceptions: None.
 */
function state(name: string, countryName: string, countryCode: string): TerrainNamingStateRow {
  return { name, country: countryName, scalerank: 2, countryCode };
}

test('the largest city decides the birth country', () => {
  const record = tacticalIndex({
    cities: [city('Strasbourg', 'France', 'FR', 280_000), city('Kehl', 'Germany', 'DE', 36_000)],
    countries: [country('France', 'FR', 0), country('Germany', 'DE', 0)],
  });
  assert.deepEqual(pickTacticalBirthCountry(record, NO_CANONICAL_NAMES), { name: 'France', code: 'FR' });
});

test('a border cell without cities picks the country with more states in the cell', () => {
  const record = tacticalIndex({
    states: [state('Bas-Rhin', 'France', 'FR'), state('Haut-Rhin', 'France', 'FR'), state('Baden', 'Germany', 'DE')],
    countries: [country('Germany', 'DE', 0), country('France', 'FR', 0)],
  });
  assert.deepEqual(pickTacticalBirthCountry(record, NO_CANONICAL_NAMES), { name: 'France', code: 'FR' });
});

test('the canonical country name replaces a variant spelling for the same code', () => {
  const record = tacticalIndex({ cities: [city('New York', 'United States', 'US', 8_000_000)] });
  const canonical = new Map([['US', 'United States of America']]);
  assert.deepEqual(pickTacticalBirthCountry(record, canonical), { name: 'United States of America', code: 'US' });
});

test('a cell with no naming rows has no birth country', () => {
  assert.equal(pickTacticalBirthCountry(tacticalIndex({}), NO_CANONICAL_NAMES), null);
});

/**
 * One strategic naming record that carries the given country rows.
 *
 * Purpose: Canonical-name tests only read country rows.
 * When to use: The tests below.
 * Expected outcome: A strategic record whose other row lists are empty.
 * Exceptions: None.
 */
function strategicRecord(h3Index: string, countries: TerrainNamingCountryRow[]) {
  return { h3_index: h3Index, states: [], countries, water: [] };
}

test('the most common country-row name wins for a shared code', () => {
  const names = buildCanonicalCountryNameByCode([
    strategicRecord('a', [country('France', 'FR', 0)]),
    strategicRecord('b', [country('France', 'FR', 0)]),
    strategicRecord('c', [country('Clipperton I.', 'FR', 0)]),
  ]);
  assert.equal(names.get('FR'), 'France');
});

test('an equal count of country-row names keeps the ordinal-first name', () => {
  const names = buildCanonicalCountryNameByCode([
    strategicRecord('a', [country('Bravo', 'QQ', 0)]),
    strategicRecord('b', [country('Alpha', 'QQ', 0)]),
  ]);
  assert.equal(names.get('QQ'), 'Alpha');
});

test('bundled strategic naming uses the most common name for each shared country code', () => {
  const names = buildCanonicalCountryNameByCode(loadTerrainStrategicNamingBundled().records);
  assert.equal(names.get('FR'), 'France');
  assert.equal(names.get('AU'), 'Australia');
  assert.equal(names.get('KZ'), 'Kazakhstan');
  assert.equal(names.get('BR'), 'Brazil');
});

test('buildRes4BirthCountryByH3 uses res1 country names and shares equal countries', () => {
  const strategicRecords = [{ h3_index: '81003ffffffffff', states: [], countries: [country('United States of America', 'US', 0)], water: [] }];
  const tacticalRecords = [
    { ...tacticalIndex({ cities: [city('Boston', 'United States', 'US', 1)] }), h3_index: 'a' },
    { ...tacticalIndex({ cities: [city('Albany', 'United States', 'US', 1)] }), h3_index: 'b' },
    { ...tacticalIndex({}), h3_index: 'c' },
  ];
  const byH3 = buildTacticalBirthCountryByH3({ strategicRecords, tacticalRecords });
  assert.deepEqual(byH3.get('a'), { name: 'United States of America', code: 'US' });
  assert.equal(byH3.get('a'), byH3.get('b'));
  assert.equal(byH3.has('c'), false);
});
