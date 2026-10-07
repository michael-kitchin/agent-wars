/**
 * Essential contracts for hex naming caption selection and country spans.
 */

import * as assert from 'assert';
import {
  namingCaptionForStrategicRecord,
  namingCaptionForTacticalRecord,
  preferredNamingCaptionForStrategicRecord,
  preferredNamingCaptionForTacticalRecord,
  waterNamingCaptionForStrategicRecord,
  waterNamingCaptionForTacticalRecord,
} from './terrainNamingCaption';
import {
  TOOLTIP_NAME_LIST_MAX_ITEMS,
  type TerrainNamingCityRow,
  type TerrainNamingCountryRow,
  type TerrainNamingRecordStrategic,
  type TerrainNamingRecordTactical,
  type TerrainNamingStateRow,
} from './terrainNamingLoad';

/**
 * Builds a city fixture row.
 *
 * Purpose: Keeps fixtures short; population is irrelevant to captions.
 * When to use: In tactical city caption tests.
 * Expected outcome: A complete `TerrainNamingCityRow`.
 * Exceptions: None.
 */
function city(
  name: string,
  state: string | null,
  country: string | null,
  scalerank: number,
  countryCode: string | null = null
): TerrainNamingCityRow {
  return { name, state, country, population: 1, scalerank, countryCode };
}

/**
 * Builds a state fixture row.
 *
 * Purpose: Keeps fixtures short.
 * When to use: In state caption tests.
 * Expected outcome: A complete `TerrainNamingStateRow`.
 * Exceptions: None.
 */
function state(name: string, country: string, scalerank: number, countryCode: string | null = null): TerrainNamingStateRow {
  return { name, country, scalerank, countryCode };
}

/**
 * Builds a country fixture row.
 *
 * Purpose: Keeps fixtures short; region and population are irrelevant to captions.
 * When to use: In country caption and coverage tests.
 * Expected outcome: A complete `TerrainNamingCountryRow`.
 * Exceptions: None.
 */
function country(
  name: string,
  continent: string,
  scalerank: number,
  countryCode: string | null = null
): TerrainNamingCountryRow {
  return { name, continent, region: 'R', population: 1, scalerank, countryCode };
}

/**
 * Builds a tactical record with the given rows.
 *
 * Purpose: Fills unused arrays with empty lists.
 * When to use: In tactical caption tests.
 * Expected outcome: A complete `TerrainNamingRecordTactical`.
 * Exceptions: None.
 */
function tacticalIndex(rows: Partial<Omit<TerrainNamingRecordTactical, 'h3_index'>>): TerrainNamingRecordTactical {
  return { h3_index: '8400001ffffffff', cities: [], states: [], countries: [], water: [], ...rows };
}

/**
 * Builds a strategic record with the given rows.
 *
 * Purpose: Fills unused arrays with empty lists.
 * When to use: In strategic caption tests.
 * Expected outcome: A complete `TerrainNamingRecordStrategic`.
 * Exceptions: None.
 */
function strategic(rows: Partial<Omit<TerrainNamingRecordStrategic, 'h3_index'>>): TerrainNamingRecordStrategic {
  return { h3_index: '81003ffffffffff', states: [], countries: [], water: [], ...rows };
}

/**
 * Tactical cells use cities only when they cover every state; otherwise states.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testTacticalCityCoverageFallsBackToStates(): void {
  const usa = country('United States of America', 'North America', 0);
  const states = [
    state('Connecticut', 'United States of America', 2),
    state('New York', 'United States of America', 2),
  ];
  const twoCities = tacticalIndex({
    cities: [
      city('Bridgeport', 'Connecticut', 'United States of America', 4),
      city('Stamford', 'Connecticut', 'United States of America', 8),
    ],
    states,
    countries: [usa],
  });
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(twoCities)?.text, 'United States of America: Connecticut, New York');
  const oneCity = tacticalIndex({ cities: [city('Bridgeport', 'Connecticut', 'United States of America', 4)], states, countries: [usa] });
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(oneCity)?.text, 'United States of America: Connecticut, New York');
}

/**
 * Tactical cells without cities fall back to states, then countries sorted by scalerank.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testTacticalFallsBackToStatesThenCountries(): void {
  const withStates = tacticalIndex({
    states: [state('Western Equatoria', 'S. Sudan', 3), state('Haut-Mbomou', 'Central African Republic', 6)],
    countries: [country('Central African Rep.', 'Africa', 6), country('S. Sudan', 'Africa', 3)],
  });
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(withStates)?.text, 'Africa: S. Sudan, Central African Rep.');
  const countriesOnly = tacticalIndex({
    countries: [
      country('Central African Rep.', 'Africa', 6),
      country('S. Sudan', 'Africa', 3),
      country('Another Rank 6 Country', 'Africa', 6),
    ],
  });
  assert.strictEqual(
    preferredNamingCaptionForTacticalRecord(countriesOnly)?.text,
    'Africa: S. Sudan, Central African Rep., Another Rank 6 Country'
  );
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(tacticalIndex({})), null);
}

/**
 * Too many cities or states escalate to the next broader level.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testTacticalEscalatesWhenListsTooLarge(): void {
  const manyCities = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 1 }, (_, i) => city(`City ${i + 1}`, 'S', 'C', 2));
  const tooManyCities = tacticalIndex({
    cities: manyCities,
    states: [state('State A', 'C', 3), state('State B', 'C', 3)],
    countries: [country('Country A', 'X', 1)],
  });
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(tooManyCities)?.text, 'X: Country A');
  const manyStates = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 2 }, (_, i) => state(`State ${i + 1}`, 'C', 3));
  const tooManyStates = tacticalIndex({ states: manyStates, countries: [country('Country A', 'X', 1), country('Country B', 'X', 1)] });
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(tooManyStates)?.text, 'X: Country A, Country B');
}

/**
 * City captions group by country, then by state in first-occurrence order.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testTacticalGroupsCitiesByCountryAndState(): void {
  const record = tacticalIndex({
    cities: [
      city('City1', 'State1', 'Country1', 4),
      city('City2', 'State1', 'Country1', 4),
      city('City3', 'State1', 'Country1', 4),
      city('City4', 'State2', 'Country1', 4),
      city('City5', 'State3', 'Country2', 4),
      city('City5', 'State4', 'Country2', 6),
    ],
  });
  assert.strictEqual(
    preferredNamingCaptionForTacticalRecord(record)?.text,
    'Country1: City1, City2, City3 (State1), City4 (State2); Country2: City5 (State3)'
  );
}

/**
 * The top five cities by scalerank are used when they cover all states and countries.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testTacticalUsesTopFiveCitiesWhenTheyCover(): void {
  const record = tacticalIndex({
    cities: [
      city('C4', 'S4', 'Country B', 4),
      city('C3', 'S3', 'Country B', 3),
      city('C5', 'S5', 'Country A', 5),
      city('C2', 'S2', 'Country A', 2),
      city('C6', 'S6', 'Country B', 6),
      city('C1', 'S1', 'Country A', 1),
    ],
    states: [
      state('S1', 'Country A', 1),
      state('S2', 'Country A', 1),
      state('S3', 'Country B', 1),
      state('S4', 'Country B', 1),
      state('S5', 'Country A', 1),
    ],
    countries: [country('Country A', 'North America', 1), country('Country B', 'Europe', 1)],
  });
  assert.strictEqual(
    preferredNamingCaptionForTacticalRecord(record)?.text,
    'Country A: C1 (S1), C2 (S2), C5 (S5); Country B: C3 (S3), C4 (S4)'
  );
}

/**
 * State captions group by country across scaleranks.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testTacticalGroupsStatesByCountry(): void {
  const record = tacticalIndex({
    states: [
      state('State1', 'Country1', 2),
      state('State2', 'Country1', 2),
      state('State3', 'Country2', 2),
      state('State4', 'Country2', 4),
    ],
  });
  assert.strictEqual(preferredNamingCaptionForTacticalRecord(record)?.text, 'Country1: State1, State2; Country2: State3, State4');
}

/**
 * Strategic hexes escalate from states to countries when states miss countries or are too many.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testStrategicStateCoverageAndEscalation(): void {
  const twoCountries = [country('Country A', 'X', 1), country('Country B', 'X', 1)];
  const uncovered = strategic({
    states: [state('Alpha', 'X', 2), state('Beta', 'X', 2), state('Gamma', 'X', 3)],
    countries: [country('Xland', 'X', 7)],
  });
  assert.strictEqual(preferredNamingCaptionForStrategicRecord(uncovered)?.text, 'X: Xland');
  assert.strictEqual(
    preferredNamingCaptionForStrategicRecord(strategic({ countries: [country('Country A', 'X', 2), country('Country B', 'X', 5)] }))?.text,
    'X: Country A, Country B'
  );
  const manyStates = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 1 }, (_, i) => state(`State ${i + 1}`, 'C', 2));
  assert.strictEqual(
    preferredNamingCaptionForStrategicRecord(strategic({ states: manyStates, countries: twoCountries }))?.text,
    'X: Country A, Country B'
  );
  const missesCountry = strategic({ states: [state('State A', 'Country A', 2)], countries: twoCountries });
  assert.strictEqual(preferredNamingCaptionForStrategicRecord(missesCountry)?.text, 'X: Country A, Country B');
}

/**
 * The top five states by scalerank are used when they cover all countries and continents.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testStrategicUsesTopFiveStatesWhenTheyCover(): void {
  const record = strategic({
    states: [
      state('State 4', 'Country B', 4),
      state('State 2', 'Country A', 2),
      state('State 3', 'Country B', 3),
      state('State 1', 'Country A', 1),
      state('State 5', 'Country A', 5),
      state('State 6', 'Country A', 6),
    ],
    countries: [country('Country A', 'North America', 1), country('Country B', 'Europe', 1)],
  });
  assert.strictEqual(
    preferredNamingCaptionForStrategicRecord(record)?.text,
    'Country A: State 1, State 2, State 5; Country B: State 3, State 4'
  );
}

/**
 * Water captions group by descending scalerank (null first) and match at both resolutions.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testWaterCaptions(): void {
  assert.strictEqual(waterNamingCaptionForStrategicRecord(strategic({})), null);
  const lakesAndOcean = strategic({
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
      { name: 'Small Pond', type: 'lake', scalerank: 8 },
    ],
  });
  assert.strictEqual(waterNamingCaptionForStrategicRecord(lakesAndOcean)?.text, 'Small Pond, Tiny Lake, North Pacific Ocean');
  assert.deepStrictEqual(waterNamingCaptionForTacticalRecord(lakesAndOcean), waterNamingCaptionForStrategicRecord(lakesAndOcean));
  assert.deepStrictEqual(waterNamingCaptionForStrategicRecord(lakesAndOcean)?.spans, []);
  const unranked = strategic({
    water: [
      { name: 'Named Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Unranked Lake', type: 'lake', scalerank: null },
    ],
  });
  assert.strictEqual(waterNamingCaptionForStrategicRecord(unranked)?.text, 'Unranked Lake, Named Ocean');
}

/**
 * Combined captions prefer geographic names and fall back to water.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testNamingCaptionPrefersGeographicThenWater(): void {
  const iceland = strategic({
    states: ['Austurland', 'Höfuðborgarsvæði', 'Norðurland eystra', 'Norðurland vestra', 'Reykjavík'].map((name) =>
      state(name, 'Iceland', 2)
    ),
    countries: [country('Iceland', 'Europe', 0)],
    water: [{ name: 'North Atlantic Ocean', type: 'ocean', scalerank: 0 }],
  });
  assert.strictEqual(
    namingCaptionForStrategicRecord(iceland)?.text,
    'Iceland: Austurland, Höfuðborgarsvæði, Norðurland eystra, Norðurland vestra, Reykjavík'
  );
  const oceans = strategic({
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Arctic Ocean', type: 'ocean', scalerank: 0 },
    ],
  });
  assert.strictEqual(namingCaptionForStrategicRecord(oceans)?.text, 'Arctic Ocean, North Pacific Ocean');
  const lakeCell = tacticalIndex({
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
    ],
  });
  assert.strictEqual(namingCaptionForTacticalRecord(lakeCell)?.text, 'Tiny Lake, North Pacific Ocean');
}

/**
 * Country headings and country items carry spans with their codes; continents and unknown countries do not.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testCaptionSpansMarkCountries(): void {
  const states = preferredNamingCaptionForStrategicRecord(
    strategic({ states: [state('Normandy', 'France', 2, 'FR')], countries: [country('France', 'Europe', 0, 'FR')] })
  );
  assert.strictEqual(states?.text, 'France: Normandy');
  assert.deepStrictEqual(states?.spans, [{ start: 0, end: 6, role: 'heading', isCountry: true, countryCode: 'FR' }]);

  const countries = preferredNamingCaptionForStrategicRecord(
    strategic({ countries: [country('France', 'Europe', 0, 'FR'), country('Somaliland', 'Africa', 1)] })
  );
  assert.strictEqual(countries?.text, 'Europe: France; Africa: Somaliland');
  assert.deepStrictEqual(
    countries?.spans.map((span) => [span.role, span.isCountry, span.countryCode]),
    [
      ['heading', false, null],
      ['item', true, 'FR'],
      ['heading', false, null],
      ['item', true, null],
    ]
  );

  const unknownCountry = preferredNamingCaptionForTacticalRecord(tacticalIndex({ cities: [city('Nowhere', null, null, 1)] }));
  assert.strictEqual(unknownCountry?.text, 'Unknown Country: Nowhere');
  assert.strictEqual(unknownCountry?.spans[0]?.isCountry, false);
}

/**
 * Runs all caption tests.
 *
 * Purpose: Entry point for the compiled test file.
 * When to use: Invoked by the test runner via `node`.
 * Expected outcome: Logs `ok`, or throws on the first failed assertion.
 * Exceptions: `AssertionError` when a contract is broken.
 */
function main(): void {
  testTacticalCityCoverageFallsBackToStates();
  testTacticalFallsBackToStatesThenCountries();
  testTacticalEscalatesWhenListsTooLarge();
  testTacticalGroupsCitiesByCountryAndState();
  testTacticalUsesTopFiveCitiesWhenTheyCover();
  testTacticalGroupsStatesByCountry();
  testStrategicStateCoverageAndEscalation();
  testStrategicUsesTopFiveStatesWhenTheyCover();
  testWaterCaptions();
  testNamingCaptionPrefersGeographicThenWater();
  testCaptionSpansMarkCountries();
  console.log('terrainNamingCaption.test: ok');
}

main();
