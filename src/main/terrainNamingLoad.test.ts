/**
 * Essential contracts for tooltip naming headline selection.
 */

import * as assert from 'assert';
import {
  namesForFirstOccurringScalerank,
  namesForFirstOccurringScalerankList,
  preferredNamingLineForRes1Record,
  preferredNamingLineForRes4Record,
  TOOLTIP_NAME_LIST_MAX_ITEMS,
  type TerrainNamingRecordRes1,
  type TerrainNamingRecordRes4,
} from './terrainNamingLoad';

function testNamesForFirstOccurringScalerankKeepsFirstRankOnly(): void {
  const line = namesForFirstOccurringScalerank([
    { name: 'Bridgeport', scalerank: 4 },
    { name: 'Stamford', scalerank: 8 },
  ]);
  assert.strictEqual(line, 'Bridgeport');
}

function testNamesForFirstOccurringScalerankListKeepsSourceOrder(): void {
  const list = namesForFirstOccurringScalerankList([
    { name: 'B', scalerank: 2 },
    { name: 'A', scalerank: 2 },
    { name: 'C', scalerank: 3 },
  ]);
  assert.deepStrictEqual(list, ['B', 'A']);
}

function testRes4PrefersCityLineOverStates(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '842a109ffffffff',
    cities: [
      {
        name: 'Bridgeport',
        state: 'Connecticut',
        country: 'United States of America',
        population: 1018000,
        scalerank: 4,
      },
      {
        name: 'Stamford',
        state: 'Connecticut',
        country: 'United States of America',
        population: 746920,
        scalerank: 8,
      },
    ],
    states: [
      { name: 'Connecticut', country: 'United States of America', scalerank: 2 },
      { name: 'New York', country: 'United States of America', scalerank: 2 },
    ],
    countries: [
      {
        name: 'United States of America',
        continent: 'North America',
        region: 'Northern America',
        population: 328239523,
        scalerank: 0,
      },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'Bridgeport');
}

function testRes4FallsBackToStatesWhenNoCities(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '846a035ffffffff',
    cities: [],
    states: [
      { name: 'Western Equatoria', country: 'S. Sudan', scalerank: 3 },
      { name: 'Haut-Mbomou', country: 'Central African Republic', scalerank: 6 },
    ],
    countries: [
      {
        name: 'Central African Rep.',
        continent: 'Africa',
        region: 'Middle Africa',
        population: 4745185,
        scalerank: 6,
      },
      {
        name: 'S. Sudan',
        continent: 'Africa',
        region: 'Eastern Africa',
        population: 11062113,
        scalerank: 3,
      },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'Western Equatoria');
}

function testRes1UsesFirstOccurringStateScalerank(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [
      { name: 'Alpha', country: 'X', scalerank: 2 },
      { name: 'Beta', country: 'X', scalerank: 2 },
      { name: 'Gamma', country: 'X', scalerank: 3 },
    ],
    countries: [
      { name: 'Xland', continent: 'X', region: 'Y', population: 1, scalerank: 7 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'Alpha, Beta');
}

function testRes4FallsBackToCountriesWhenNoCitiesOrStates(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '846a035ffffffff',
    cities: [],
    states: [],
    countries: [
      { name: 'Central African Rep.', continent: 'Africa', region: 'Middle Africa', population: 4745185, scalerank: 6 },
      { name: 'S. Sudan', continent: 'Africa', region: 'Eastern Africa', population: 11062113, scalerank: 3 },
      { name: 'Another Rank 6 Country', continent: 'Africa', region: 'Middle Africa', population: 2, scalerank: 6 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'Central African Rep., Another Rank 6 Country');
}

function testRes4EscalatesCitiesToStatesWhenCityListTooLarge(): void {
  const cities = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 1 }, (_, i) => ({
    name: `City ${i + 1}`,
    state: 'S',
    country: 'C',
    population: 1,
    scalerank: 2,
  }));
  const record: TerrainNamingRecordRes4 = {
    h3_index: '8400001ffffffff',
    cities,
    states: [
      { name: 'State A', country: 'C', scalerank: 3 },
      { name: 'State B', country: 'C', scalerank: 3 },
    ],
    countries: [{ name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 1 }],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'State A, State B');
}

function testRes4EscalatesStatesToCountriesWhenStateListTooLarge(): void {
  const states = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 2 }, (_, i) => ({
    name: `State ${i + 1}`,
    country: 'C',
    scalerank: 3,
  }));
  const record: TerrainNamingRecordRes4 = {
    h3_index: '8400001ffffffff',
    cities: [],
    states,
    countries: [
      { name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 1 },
      { name: 'Country B', continent: 'X', region: 'Y', population: 1, scalerank: 1 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'Country A, Country B');
}

function testRes1FallsBackToCountriesWhenNoStates(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [],
    countries: [
      { name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 2 },
      { name: 'Country B', continent: 'X', region: 'Y', population: 1, scalerank: 5 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'Country A');
}

function testRes1EscalatesStatesToCountriesWhenStateListTooLarge(): void {
  const states = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 1 }, (_, i) => ({
    name: `State ${i + 1}`,
    country: 'C',
    scalerank: 2,
  }));
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states,
    countries: [
      { name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 1 },
      { name: 'Country B', continent: 'X', region: 'Y', population: 1, scalerank: 1 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'Country A, Country B');
}

function testNoFirstLineWhenNoCitiesStatesOrCountries(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '846a035ffffffff',
    cities: [],
    states: [],
    countries: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), null);
}

function main(): void {
  testNamesForFirstOccurringScalerankKeepsFirstRankOnly();
  testNamesForFirstOccurringScalerankListKeepsSourceOrder();
  testRes4PrefersCityLineOverStates();
  testRes4FallsBackToStatesWhenNoCities();
  testRes1UsesFirstOccurringStateScalerank();
  testRes4FallsBackToCountriesWhenNoCitiesOrStates();
  testRes4EscalatesCitiesToStatesWhenCityListTooLarge();
  testRes4EscalatesStatesToCountriesWhenStateListTooLarge();
  testRes1FallsBackToCountriesWhenNoStates();
  testRes1EscalatesStatesToCountriesWhenStateListTooLarge();
  testNoFirstLineWhenNoCitiesStatesOrCountries();
  console.log('terrainNamingLoad.test: ok');
}

main();
