import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  TerrainNamingCityRow,
  TerrainNamingCountryRow,
  TerrainNamingRecordRes4,
  TerrainNamingStateRow,
} from '../terrainNamingLoad';
import { buildRes4BirthCountryByH3, pickRes4BirthCountry } from './res4BirthCountry';

const NO_CANONICAL_NAMES: ReadonlyMap<string, string> = new Map();

/**
 * Builds a res4 naming record with the given rows.
 *
 * Purpose: Keeps fixtures short by defaulting unused arrays to empty.
 * When to use: In the tests below.
 * Expected outcome: A complete `TerrainNamingRecordRes4`.
 * Exceptions: None.
 */
function res4(rows: Partial<Omit<TerrainNamingRecordRes4, 'h3_index'>>): TerrainNamingRecordRes4 {
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
  const record = res4({
    cities: [city('Strasbourg', 'France', 'FR', 280_000), city('Kehl', 'Germany', 'DE', 36_000)],
    countries: [country('France', 'FR', 0), country('Germany', 'DE', 0)],
  });
  assert.deepEqual(pickRes4BirthCountry(record, NO_CANONICAL_NAMES), { name: 'France', code: 'FR' });
});

test('a border cell without cities picks the country with more states in the cell', () => {
  const record = res4({
    states: [state('Bas-Rhin', 'France', 'FR'), state('Haut-Rhin', 'France', 'FR'), state('Baden', 'Germany', 'DE')],
    countries: [country('Germany', 'DE', 0), country('France', 'FR', 0)],
  });
  assert.deepEqual(pickRes4BirthCountry(record, NO_CANONICAL_NAMES), { name: 'France', code: 'FR' });
});

test('the canonical country name replaces a variant spelling for the same code', () => {
  const record = res4({ cities: [city('New York', 'United States', 'US', 8_000_000)] });
  const canonical = new Map([['US', 'United States of America']]);
  assert.deepEqual(pickRes4BirthCountry(record, canonical), { name: 'United States of America', code: 'US' });
});

test('a cell with no naming rows has no birth country', () => {
  assert.equal(pickRes4BirthCountry(res4({}), NO_CANONICAL_NAMES), null);
});

test('buildRes4BirthCountryByH3 uses res1 country names and shares equal countries', () => {
  const res1Records = [{ h3_index: '81003ffffffffff', states: [], countries: [country('United States of America', 'US', 0)], water: [] }];
  const res4Records = [
    { ...res4({ cities: [city('Boston', 'United States', 'US', 1)] }), h3_index: 'a' },
    { ...res4({ cities: [city('Albany', 'United States', 'US', 1)] }), h3_index: 'b' },
    { ...res4({}), h3_index: 'c' },
  ];
  const byH3 = buildRes4BirthCountryByH3({ res1Records, res4Records });
  assert.deepEqual(byH3.get('a'), { name: 'United States of America', code: 'US' });
  assert.equal(byH3.get('a'), byH3.get('b'));
  assert.equal(byH3.has('c'), false);
});
