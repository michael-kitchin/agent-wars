/**
 * Essential contracts for hex naming caption selection and country spans.
 */

import * as assert from 'assert';
import {
  namingCaptionForRes1Record,
  namingCaptionForRes4Record,
  preferredNamingCaptionForRes1Record,
  preferredNamingCaptionForRes4Record,
  waterNamingCaptionForRes1Record,
  waterNamingCaptionForRes4Record,
} from './terrainNamingCaption';
import {
  TOOLTIP_NAME_LIST_MAX_ITEMS,
  type TerrainNamingCityRow,
  type TerrainNamingCountryRow,
  type TerrainNamingRecordRes1,
  type TerrainNamingRecordRes4,
  type TerrainNamingStateRow,
} from './terrainNamingLoad';

/**
 * Builds a city fixture row.
 *
 * Purpose: Keeps fixtures short; population is irrelevant to captions.
 * When to use: In res4 city caption tests.
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
 * Builds a res4 record with the given rows.
 *
 * Purpose: Fills unused arrays with empty lists.
 * When to use: In res4 caption tests.
 * Expected outcome: A complete `TerrainNamingRecordRes4`.
 * Exceptions: None.
 */
function res4(rows: Partial<Omit<TerrainNamingRecordRes4, 'h3_index'>>): TerrainNamingRecordRes4 {
  return { h3_index: '8400001ffffffff', cities: [], states: [], countries: [], water: [], ...rows };
}

/**
 * Builds a res1 record with the given rows.
 *
 * Purpose: Fills unused arrays with empty lists.
 * When to use: In res1 caption tests.
 * Expected outcome: A complete `TerrainNamingRecordRes1`.
 * Exceptions: None.
 */
function res1(rows: Partial<Omit<TerrainNamingRecordRes1, 'h3_index'>>): TerrainNamingRecordRes1 {
  return { h3_index: '81003ffffffffff', states: [], countries: [], water: [], ...rows };
}

/**
 * Res4 cells use cities only when they cover every state; otherwise states.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testRes4CityCoverageFallsBackToStates(): void {
  const usa = country('United States of America', 'North America', 0);
  const states = [
    state('Connecticut', 'United States of America', 2),
    state('New York', 'United States of America', 2),
  ];
  const twoCities = res4({
    cities: [
      city('Bridgeport', 'Connecticut', 'United States of America', 4),
      city('Stamford', 'Connecticut', 'United States of America', 8),
    ],
    states,
    countries: [usa],
  });
  assert.strictEqual(preferredNamingCaptionForRes4Record(twoCities)?.text, 'United States of America: Connecticut, New York');
  const oneCity = res4({ cities: [city('Bridgeport', 'Connecticut', 'United States of America', 4)], states, countries: [usa] });
  assert.strictEqual(preferredNamingCaptionForRes4Record(oneCity)?.text, 'United States of America: Connecticut, New York');
}

/**
 * Res4 cells without cities fall back to states, then countries sorted by scalerank.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testRes4FallsBackToStatesThenCountries(): void {
  const withStates = res4({
    states: [state('Western Equatoria', 'S. Sudan', 3), state('Haut-Mbomou', 'Central African Republic', 6)],
    countries: [country('Central African Rep.', 'Africa', 6), country('S. Sudan', 'Africa', 3)],
  });
  assert.strictEqual(preferredNamingCaptionForRes4Record(withStates)?.text, 'Africa: S. Sudan, Central African Rep.');
  const countriesOnly = res4({
    countries: [
      country('Central African Rep.', 'Africa', 6),
      country('S. Sudan', 'Africa', 3),
      country('Another Rank 6 Country', 'Africa', 6),
    ],
  });
  assert.strictEqual(
    preferredNamingCaptionForRes4Record(countriesOnly)?.text,
    'Africa: S. Sudan, Central African Rep., Another Rank 6 Country'
  );
  assert.strictEqual(preferredNamingCaptionForRes4Record(res4({})), null);
}

/**
 * Too many cities or states escalate to the next broader level.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testRes4EscalatesWhenListsTooLarge(): void {
  const manyCities = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 1 }, (_, i) => city(`City ${i + 1}`, 'S', 'C', 2));
  const tooManyCities = res4({
    cities: manyCities,
    states: [state('State A', 'C', 3), state('State B', 'C', 3)],
    countries: [country('Country A', 'X', 1)],
  });
  assert.strictEqual(preferredNamingCaptionForRes4Record(tooManyCities)?.text, 'X: Country A');
  const manyStates = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 2 }, (_, i) => state(`State ${i + 1}`, 'C', 3));
  const tooManyStates = res4({ states: manyStates, countries: [country('Country A', 'X', 1), country('Country B', 'X', 1)] });
  assert.strictEqual(preferredNamingCaptionForRes4Record(tooManyStates)?.text, 'X: Country A, Country B');
}

/**
 * City captions group by country, then by state in first-occurrence order.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testRes4GroupsCitiesByCountryAndState(): void {
  const record = res4({
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
    preferredNamingCaptionForRes4Record(record)?.text,
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
function testRes4UsesTopFiveCitiesWhenTheyCover(): void {
  const record = res4({
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
    preferredNamingCaptionForRes4Record(record)?.text,
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
function testRes4GroupsStatesByCountry(): void {
  const record = res4({
    states: [
      state('State1', 'Country1', 2),
      state('State2', 'Country1', 2),
      state('State3', 'Country2', 2),
      state('State4', 'Country2', 4),
    ],
  });
  assert.strictEqual(preferredNamingCaptionForRes4Record(record)?.text, 'Country1: State1, State2; Country2: State3, State4');
}

/**
 * Res1 hexes escalate from states to countries when states miss countries or are too many.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testRes1StateCoverageAndEscalation(): void {
  const twoCountries = [country('Country A', 'X', 1), country('Country B', 'X', 1)];
  const uncovered = res1({
    states: [state('Alpha', 'X', 2), state('Beta', 'X', 2), state('Gamma', 'X', 3)],
    countries: [country('Xland', 'X', 7)],
  });
  assert.strictEqual(preferredNamingCaptionForRes1Record(uncovered)?.text, 'X: Xland');
  assert.strictEqual(
    preferredNamingCaptionForRes1Record(res1({ countries: [country('Country A', 'X', 2), country('Country B', 'X', 5)] }))?.text,
    'X: Country A, Country B'
  );
  const manyStates = Array.from({ length: TOOLTIP_NAME_LIST_MAX_ITEMS + 1 }, (_, i) => state(`State ${i + 1}`, 'C', 2));
  assert.strictEqual(
    preferredNamingCaptionForRes1Record(res1({ states: manyStates, countries: twoCountries }))?.text,
    'X: Country A, Country B'
  );
  const missesCountry = res1({ states: [state('State A', 'Country A', 2)], countries: twoCountries });
  assert.strictEqual(preferredNamingCaptionForRes1Record(missesCountry)?.text, 'X: Country A, Country B');
}

/**
 * The top five states by scalerank are used when they cover all countries and continents.
 *
 * Purpose: Guards this contract against regressions.
 * When to use: Called from `main` by the test runner.
 * Expected outcome: Returns normally when the contract holds.
 * Exceptions: Throws `AssertionError` when the contract is broken.
 */
function testRes1UsesTopFiveStatesWhenTheyCover(): void {
  const record = res1({
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
    preferredNamingCaptionForRes1Record(record)?.text,
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
  assert.strictEqual(waterNamingCaptionForRes1Record(res1({})), null);
  const lakesAndOcean = res1({
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
      { name: 'Small Pond', type: 'lake', scalerank: 8 },
    ],
  });
  assert.strictEqual(waterNamingCaptionForRes1Record(lakesAndOcean)?.text, 'Small Pond, Tiny Lake, North Pacific Ocean');
  assert.deepStrictEqual(waterNamingCaptionForRes4Record(lakesAndOcean), waterNamingCaptionForRes1Record(lakesAndOcean));
  assert.deepStrictEqual(waterNamingCaptionForRes1Record(lakesAndOcean)?.spans, []);
  const unranked = res1({
    water: [
      { name: 'Named Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Unranked Lake', type: 'lake', scalerank: null },
    ],
  });
  assert.strictEqual(waterNamingCaptionForRes1Record(unranked)?.text, 'Unranked Lake, Named Ocean');
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
  const iceland = res1({
    states: ['Austurland', 'Höfuðborgarsvæði', 'Norðurland eystra', 'Norðurland vestra', 'Reykjavík'].map((name) =>
      state(name, 'Iceland', 2)
    ),
    countries: [country('Iceland', 'Europe', 0)],
    water: [{ name: 'North Atlantic Ocean', type: 'ocean', scalerank: 0 }],
  });
  assert.strictEqual(
    namingCaptionForRes1Record(iceland)?.text,
    'Iceland: Austurland, Höfuðborgarsvæði, Norðurland eystra, Norðurland vestra, Reykjavík'
  );
  const oceans = res1({
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Arctic Ocean', type: 'ocean', scalerank: 0 },
    ],
  });
  assert.strictEqual(namingCaptionForRes1Record(oceans)?.text, 'Arctic Ocean, North Pacific Ocean');
  const lakeCell = res4({
    water: [
      { name: 'North Pacific Ocean', type: 'ocean', scalerank: 0 },
      { name: 'Tiny Lake', type: 'lake', scalerank: 8 },
    ],
  });
  assert.strictEqual(namingCaptionForRes4Record(lakeCell)?.text, 'Tiny Lake, North Pacific Ocean');
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
  const states = preferredNamingCaptionForRes1Record(
    res1({ states: [state('Normandy', 'France', 2, 'FR')], countries: [country('France', 'Europe', 0, 'FR')] })
  );
  assert.strictEqual(states?.text, 'France: Normandy');
  assert.deepStrictEqual(states?.spans, [{ start: 0, end: 6, role: 'heading', isCountry: true, countryCode: 'FR' }]);

  const countries = preferredNamingCaptionForRes1Record(
    res1({ countries: [country('France', 'Europe', 0, 'FR'), country('Somaliland', 'Africa', 1)] })
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

  const unknownCountry = preferredNamingCaptionForRes4Record(res4({ cities: [city('Nowhere', null, null, 1)] }));
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
  testRes4CityCoverageFallsBackToStates();
  testRes4FallsBackToStatesThenCountries();
  testRes4EscalatesWhenListsTooLarge();
  testRes4GroupsCitiesByCountryAndState();
  testRes4UsesTopFiveCitiesWhenTheyCover();
  testRes4GroupsStatesByCountry();
  testRes1StateCoverageAndEscalation();
  testRes1UsesTopFiveStatesWhenTheyCover();
  testWaterCaptions();
  testNamingCaptionPrefersGeographicThenWater();
  testCaptionSpansMarkCountries();
  console.log('terrainNamingCaption.test: ok');
}

main();
