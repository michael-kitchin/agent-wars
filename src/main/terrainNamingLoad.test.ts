/**
 * Essential contracts for tooltip naming headline selection.
 */

import * as assert from 'assert';
import {
  namesForFirstOccurringScalerank,
  namesForFirstOccurringScalerankList,
  preferredNamingLineForRes1Record,
  preferredNamingLineForRes4Record,
  namingLineForRes1Record,
  namingLineForRes4Record,
  waterNamingLineForRes1Record,
  waterNamingLineForRes4Record,
  TOOLTIP_NAME_LIST_MAX_ITEMS,
  type TerrainNamingRecordRes1,
  type TerrainNamingRecordRes4,
} from './terrainNamingLoad';

/**
 * Defines the `testNamesForFirstOccurringScalerankKeepsFirstRankOnly` function shape (function testNamesForFirstOccurringScalerankKeepsFirstRankOnly(): void).

 * Purpose: Supports maintainability by documenting why `testNamesForFirstOccurringScalerankKeepsFirstRankOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNamesForFirstOccurringScalerankKeepsFirstRankOnly(): void {
  const line = namesForFirstOccurringScalerank([
    { name: 'Bridgeport', scalerank: 4 },
    { name: 'Stamford', scalerank: 8 },
  ]);
  assert.strictEqual(line, 'Bridgeport');
}

/**
 * Defines the `testNamesForFirstOccurringScalerankListKeepsSourceOrder` function shape (function testNamesForFirstOccurringScalerankListKeepsSourceOrder(): void).

 * Purpose: Supports maintainability by documenting why `testNamesForFirstOccurringScalerankListKeepsSourceOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNamesForFirstOccurringScalerankListKeepsSourceOrder(): void {
  const list = namesForFirstOccurringScalerankList([
    { name: 'B', scalerank: 2 },
    { name: 'A', scalerank: 2 },
    { name: 'C', scalerank: 3 },
  ]);
  assert.deepStrictEqual(list, ['B', 'A']);
}

/**
 * Defines the `testRes4PrefersCityLineOverStates` function shape (function testRes4PrefersCityLineOverStates(): void).

 * Purpose: Supports maintainability by documenting why `testRes4PrefersCityLineOverStates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'United States of America: Connecticut, New York');
}

/**
 * Defines the `testRes4FallsBackToStatesWhenNoCities` function shape (function testRes4FallsBackToStatesWhenNoCities(): void).

 * Purpose: Supports maintainability by documenting why `testRes4FallsBackToStatesWhenNoCities` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Africa: S. Sudan, Central African Rep.'
  );
}

/**
 * Defines the `testRes1UsesFirstOccurringStateScalerank` function shape (function testRes1UsesFirstOccurringStateScalerank(): void).

 * Purpose: Supports maintainability by documenting why `testRes1UsesFirstOccurringStateScalerank` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Xland');
}

/**
 * Defines the `testRes4FallsBackToCountriesWhenNoCitiesOrStates` function shape (function testRes4FallsBackToCountriesWhenNoCitiesOrStates(): void).

 * Purpose: Supports maintainability by documenting why `testRes4FallsBackToCountriesWhenNoCitiesOrStates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Africa: S. Sudan, Central African Rep., Another Rank 6 Country'
  );
}

/**
 * Defines the `testRes4EscalatesCitiesToStatesWhenCityListTooLarge` function shape (function testRes4EscalatesCitiesToStatesWhenCityListTooLarge(): void).

 * Purpose: Supports maintainability by documenting why `testRes4EscalatesCitiesToStatesWhenCityListTooLarge` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'X: Country A');
}

/**
 * Defines the `testRes4EscalatesStatesToCountriesWhenStateListTooLarge` function shape (function testRes4EscalatesStatesToCountriesWhenStateListTooLarge(): void).

 * Purpose: Supports maintainability by documenting why `testRes4EscalatesStatesToCountriesWhenStateListTooLarge` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'X: Country A, Country B');
}

/**
 * Defines the `testRes1FallsBackToCountriesWhenNoStates` function shape (function testRes1FallsBackToCountriesWhenNoStates(): void).

 * Purpose: Supports maintainability by documenting why `testRes1FallsBackToCountriesWhenNoStates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes1FallsBackToCountriesWhenNoStates(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [],
    countries: [
      { name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 2 },
      { name: 'Country B', continent: 'X', region: 'Y', population: 1, scalerank: 5 },
    ],
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Country A, Country B');
}

/**
 * Defines the `testRes1EscalatesStatesToCountriesWhenStateListTooLarge` function shape (function testRes1EscalatesStatesToCountriesWhenStateListTooLarge(): void).

 * Purpose: Supports maintainability by documenting why `testRes1EscalatesStatesToCountriesWhenStateListTooLarge` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Country A, Country B');
}

/**
 * Defines the `testRes4GroupsCitiesByCountryAndState` function shape (function testRes4GroupsCitiesByCountryAndState(): void).

 * Purpose: Supports maintainability by documenting why `testRes4GroupsCitiesByCountryAndState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Country1: City1, City2, City3 (State1), City4 (State2); Country2: City5 (State3)'
  );
}

/**
 * Defines the `testRes4GroupsStatesByCountryWithinSameScalerank` function shape (function testRes4GroupsStatesByCountryWithinSameScalerank(): void).

 * Purpose: Supports maintainability by documenting why `testRes4GroupsStatesByCountryWithinSameScalerank` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'Country1: State1, State2; Country2: State3, State4');
}

/**
 * Defines the `testNoFirstLineWhenNoCitiesStatesOrCountries` function shape (function testNoFirstLineWhenNoCitiesStatesOrCountries(): void).

 * Purpose: Supports maintainability by documenting why `testNoFirstLineWhenNoCitiesStatesOrCountries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testNoFirstLineWhenNoCitiesStatesOrCountries(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '846a035ffffffff',
    cities: [],
    states: [],
    countries: [],
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), null);
}

/**
 * Defines the `testRes4FallsBackToStatesWhenCitiesMissSomeStates` function shape (function testRes4FallsBackToStatesWhenCitiesMissSomeStates(): void).

 * Purpose: Supports maintainability by documenting why `testRes4FallsBackToStatesWhenCitiesMissSomeStates` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes4Record(record), 'United States of America: Connecticut, New York');
}

/**
 * Defines the `testRes1FallsBackToCountriesWhenStatesMissSomeCountries` function shape (function testRes1FallsBackToCountriesWhenStatesMissSomeCountries(): void).

 * Purpose: Supports maintainability by documenting why `testRes1FallsBackToCountriesWhenStatesMissSomeCountries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRes1FallsBackToCountriesWhenStatesMissSomeCountries(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [{ name: 'State A', country: 'Country A', scalerank: 2 }],
    countries: [
      { name: 'Country A', continent: 'X', region: 'Y', population: 1, scalerank: 1 },
      { name: 'Country B', continent: 'X', region: 'Y', population: 1, scalerank: 5 },
    ],
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'X: Country A, Country B');
}

/**
 * Defines the `testRes4UsesTopFiveCitiesWhenTheyCoverStatesAndCountries` function shape (function testRes4UsesTopFiveCitiesWhenTheyCoverStatesAndCountries(): void).

 * Purpose: Supports maintainability by documenting why `testRes4UsesTopFiveCitiesWhenTheyCoverStatesAndCountries` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(
    preferredNamingLineForRes4Record(record),
    'Country A: C1 (S1), C2 (S2), C5 (S5); Country B: C3 (S3), C4 (S4)'
  );
}

/**
 * Defines the `testRes1UsesTopFiveStatesWhenTheyCoverCountriesAndContinents` function shape (function testRes1UsesTopFiveStatesWhenTheyCoverCountriesAndContinents(): void).

 * Purpose: Supports maintainability by documenting why `testRes1UsesTopFiveStatesWhenTheyCoverCountriesAndContinents` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
    water: [],
  };
  assert.strictEqual(preferredNamingLineForRes1Record(record), 'Country A: State 1, State 2, State 5; Country B: State 3, State 4');
}

function testWaterNamingLineRes1EmptyReturnsNull(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [],
    countries: [],
    water: [],
  };
  assert.strictEqual(waterNamingLineForRes1Record(record), null);
}

function testWaterNamingLineRes1GroupsDescendingScalerank(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81003ffffffffff',
    states: [],
    countries: [],
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
      { name: 'Small Pond', type: 'lake', scalerank: 8 },
    ],
  };
  assert.strictEqual(
    waterNamingLineForRes1Record(record),
    'Water: Small Pond, Tiny Lake; North Pacific Ocean'
  );
}

function testWaterNamingLineRes4GroupsDescendingScalerank(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '8400001ffffffff',
    states: [],
    countries: [],
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
      { name: 'Small Pond', type: 'lake', scalerank: 8 },
    ],
  };
  assert.strictEqual(
    waterNamingLineForRes4Record(record),
    'Water: Small Pond, Tiny Lake; North Pacific Ocean'
  );
  assert.strictEqual(waterNamingLineForRes1Record(record), waterNamingLineForRes4Record(record));
}

function testNamingLineRes1PrefersGeographicOverWater(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '81077ffffffffff',
    states: [
      { name: 'Austurland', country: 'Iceland', scalerank: 2 },
      { name: 'Höfuðborgarsvæði', country: 'Iceland', scalerank: 2 },
      { name: 'Norðurland eystra', country: 'Iceland', scalerank: 2 },
      { name: 'Norðurland vestra', country: 'Iceland', scalerank: 2 },
      { name: 'Reykjavík', country: 'Iceland', scalerank: 2 },
    ],
    countries: [
      { name: 'Iceland', continent: 'Europe', region: 'Northern Europe', population: 366463, scalerank: 0 },
    ],
    water: [{ name: 'North Atlantic Ocean', type: 'ocean', scalerank: 0 }],
  };
  assert.strictEqual(
    namingLineForRes1Record(record),
    'Iceland: Austurland, Höfuðborgarsvæði, Norðurland eystra, Norðurland vestra, Reykjavík'
  );
}

function testNamingLineRes1FallsBackToWaterWhenNoGeographic(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '810000000000000',
    states: [],
    countries: [],
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Arctic Ocean', type: 'ocean', scalerank: 0 },
    ],
  };
  assert.strictEqual(namingLineForRes1Record(record), 'Water: Arctic Ocean, North Pacific Ocean');
  assert.strictEqual(waterNamingLineForRes1Record(record), namingLineForRes1Record(record));
}

function testNamingLineRes4FallsBackToWaterWhenNoGeographic(): void {
  const record: TerrainNamingRecordRes4 = {
    h3_index: '8400001ffffffff',
    cities: [],
    states: [],
    countries: [],
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
    ],
  };
  assert.strictEqual(namingLineForRes4Record(record), 'Water: Tiny Lake; North Pacific Ocean');
}

function testWaterNamingLineNullScalerankLeastProminentFirst(): void {
  const record: TerrainNamingRecordRes1 = {
    h3_index: '8400001ffffffff',
    states: [],
    countries: [],
    water: [
      { name: 'Named Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Unranked Lake', type: 'lake', scalerank: null },
    ],
  };
  const expected = 'Water: Unranked Lake; Named Ocean';
  assert.strictEqual(waterNamingLineForRes1Record(record), expected);
  assert.strictEqual(waterNamingLineForRes4Record(record), expected);
}

/**
 * Defines the `main` function shape (function main(): void).

 * Purpose: Supports maintainability by documenting why `main` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  testWaterNamingLineRes1EmptyReturnsNull();
  testWaterNamingLineRes1GroupsDescendingScalerank();
  testWaterNamingLineRes4GroupsDescendingScalerank();
  testWaterNamingLineNullScalerankLeastProminentFirst();
  testNamingLineRes1PrefersGeographicOverWater();
  testNamingLineRes1FallsBackToWaterWhenNoGeographic();
  testNamingLineRes4FallsBackToWaterWhenNoGeographic();
  console.log('terrainNamingLoad.test: ok');
}

main();
