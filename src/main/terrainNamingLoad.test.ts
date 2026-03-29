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
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'United States of America: Connecticut, New York');
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
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Africa: S. Sudan, Central African Rep.'
  );
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
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Xland');
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
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Africa: S. Sudan, Central African Rep., Another Rank 6 Country'
  );
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
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'X: Country A');
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
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'X: Country A, Country B');
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
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Country A, Country B');
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
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Country A, Country B');
}

function testRes4GroupsCitiesByCountryAndState(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '8400001ffffffff',
    cities: [
      { name: 'City1', state: 'State1', country: 'Country1', population: 1, scalerank: 4 },
      { name: 'City2', state: 'State1', country: 'Country1', population: 1, scalerank: 4 },
      { name: 'City3', state: 'State1', country: 'Country1', population: 1, scalerank: 4 },
      { name: 'City4', state: 'State2', country: 'Country1', population: 1, scalerank: 4 },
      { name: 'City5', state: 'State3', country: 'Country2', population: 1, scalerank: 4 },
      { name: 'City5', state: 'State4', country: 'Country2', population: 1, scalerank: 6 },
    ],
    states: [],
    countries: [],
  };
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Country1: City1, City2, City3 (State1), City4 (State2); Country2: City5 (State3)'
  );
}

function testRes4GroupsStatesByCountryWithinSameScalerank(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '8400001ffffffff',
    cities: [],
    states: [
      { name: 'State1', country: 'Country1', scalerank: 2 },
      { name: 'State2', country: 'Country1', scalerank: 2 },
      { name: 'State3', country: 'Country2', scalerank: 2 },
      { name: 'State4', country: 'Country2', scalerank: 4 },
    ],
    countries: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'Country1: State1, State2; Country2: State3, State4');
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

function testRes4FallsBackToStatesWhenCitiesMissSomeStates(): void {
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
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'United States of America: Connecticut, New York');
}

function testRes1FallsBackToCountriesWhenStatesMissSomeCountries(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [{ name: 'State A', country: 'Country A', scalerank: 2 }],
    countries: [
      { name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 1 },
      { name: 'Country B', continent: 'X', region: 'Y', population: 1, scalerank: 5 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Country A, Country B');
}

function testRes4UsesTopFiveCitiesWhenTheyCoverStatesAndCountries(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '842a109ffffffff',
    cities: [
      { name: 'C4', state: 'S4', country: 'Country B', population: 1, scalerank: 4 },
      { name: 'C3', state: 'S3', country: 'Country B', population: 1, scalerank: 3 },
      { name: 'C5', state: 'S5', country: 'Country A', population: 1, scalerank: 5 },
      { name: 'C2', state: 'S2', country: 'Country A', population: 1, scalerank: 2 },
      { name: 'C6', state: 'S6', country: 'Country B', population: 1, scalerank: 6 },
      { name: 'C1', state: 'S1', country: 'Country A', population: 1, scalerank: 1 },
    ],
    states: [
      { name: 'S1', country: 'Country A', scalerank: 1 },
      { name: 'S2', country: 'Country A', scalerank: 1 },
      { name: 'S3', country: 'Country B', scalerank: 1 },
      { name: 'S4', country: 'Country B', scalerank: 1 },
      { name: 'S5', country: 'Country A', scalerank: 1 },
    ],
    countries: [
      { name: 'Country A', continent: 'North America', region: 'X', population: 1, scalerank: 1 },
      { name: 'Country B', continent: 'Europe', region: 'Y', population: 1, scalerank: 1 },
    ],
  };
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Country A: C1 (S1), C2 (S2), C5 (S5); Country B: C3 (S3), C4 (S4)'
  );
}

function testRes1UsesTopFiveStatesWhenTheyCoverCountriesAndContinents(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [
      { name: 'State 4', country: 'Country B', scalerank: 4 },
      { name: 'State 2', country: 'Country A', scalerank: 2 },
      { name: 'State 3', country: 'Country B', scalerank: 3 },
      { name: 'State 1', country: 'Country A', scalerank: 1 },
      { name: 'State 5', country: 'Country A', scalerank: 5 },
      { name: 'State 6', country: 'Country A', scalerank: 6 },
    ],
    countries: [
      { name: 'Country A', continent: 'North America', region: 'X', population: 1, scalerank: 1 },
      { name: 'Country B', continent: 'Europe', region: 'Y', population: 1, scalerank: 1 },
    ],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'Country A: State 1, State 2, State 5; Country B: State 3, State 4');
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
  testRes4GroupsCitiesByCountryAndState();
  testRes4GroupsStatesByCountryWithinSameScalerank();
  testNoFirstLineWhenNoCitiesStatesOrCountries();
  testRes4FallsBackToStatesWhenCitiesMissSomeStates();
  testRes1FallsBackToCountriesWhenStatesMissSomeCountries();
  testRes4UsesTopFiveCitiesWhenTheyCoverStatesAndCountries();
  testRes1UsesTopFiveStatesWhenTheyCoverCountriesAndContinents();
  console.log('terrainNamingLoad.test: ok');
}

main();
