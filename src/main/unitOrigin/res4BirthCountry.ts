/**
 * Decides which country each res4 cell counts as for unit births.
 *
 * Purpose: Precomputes one `BirthCountry` per res4 cell from naming rows, so spawns need only a map lookup.
 * When to use: Once while building the terrain classification snapshot.
 * Expected outcome: Deterministic results from the naming data alone.
 * Exceptions: None.
 */
import type { BirthCountry } from '../../shared/unitOriginTypes';
import { logDebug } from '../logger';
import type {
  TerrainNamingCityRow,
  TerrainNamingCountryRow,
  TerrainNamingRecordRes1,
  TerrainNamingRecordRes4,
  TerrainNamingStateRow,
} from '../terrainNamingLoad';

/**
 * Orders strings by UTF-16 code units.
 *
 * Purpose: Locale-independent tie-breaks so every machine picks the same country.
 * When to use: As the final tie-break in this module's sorts and in other country picks that must agree with them.
 * Expected outcome: Negative, zero, or positive like any comparator.
 * Exceptions: None.
 */
export function compareOrdinal(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Orders scaleranks ascending with `null` last.
 *
 * Purpose: Lower Natural Earth scalerank means more prominent.
 * When to use: Tie-breaks between rows.
 * Expected outcome: Negative when `a` is more prominent.
 * Exceptions: None.
 */
function compareScalerank(a: number | null, b: number | null): number {
  return (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Picks the most populous city that names a country.
 *
 * Purpose: In cells with cities, the biggest city decides the country.
 * When to use: First rule of `pickRes4BirthCountry`.
 * Expected outcome: Largest population (null counts as 0), then lower scalerank, then name; `undefined` when no city has a country.
 * Exceptions: None.
 */
function pickDominantCity(cities: ReadonlyArray<TerrainNamingCityRow>): TerrainNamingCityRow | undefined {
  return cities
    .filter((city) => typeof city.country === 'string' && city.country.length > 0)
    .sort(
      (a, b) =>
        (b.population ?? 0) - (a.population ?? 0) ||
        compareScalerank(a.scalerank, b.scalerank) ||
        compareOrdinal(a.name, b.name)
    )[0];
}

/**
 * Picks the country row for a cell that touches one or more countries.
 *
 * Purpose: In border cells, the country with more states in the cell wins.
 * When to use: Second rule of `pickRes4BirthCountry`.
 * Expected outcome: Most states by code, then lower scalerank, then name; `undefined` when there are no country rows.
 * Exceptions: None.
 */
function pickDominantCountry(
  countries: ReadonlyArray<TerrainNamingCountryRow>,
  states: ReadonlyArray<TerrainNamingStateRow>
): TerrainNamingCountryRow | undefined {
  if (countries.length <= 1) return countries[0];
  const stateCountByCode = new Map<string, number>();
  for (const state of states) {
    if (state.countryCode) stateCountByCode.set(state.countryCode, (stateCountByCode.get(state.countryCode) ?? 0) + 1);
  }
  const stateCount = (row: TerrainNamingCountryRow): number =>
    row.countryCode ? (stateCountByCode.get(row.countryCode) ?? 0) : 0;
  return [...countries].sort(
    (a, b) => stateCount(b) - stateCount(a) || compareScalerank(a.scalerank, b.scalerank) || compareOrdinal(a.name, b.name)
  )[0];
}

/**
 * Picks the most prominent state.
 *
 * Purpose: Fallback for cells with states but no city or country rows.
 * When to use: Third rule of `pickRes4BirthCountry`.
 * Expected outcome: Lowest scalerank, then name; `undefined` when there are no states.
 * Exceptions: None.
 */
function pickDominantState(states: ReadonlyArray<TerrainNamingStateRow>): TerrainNamingStateRow | undefined {
  return [...states].sort((a, b) => compareScalerank(a.scalerank, b.scalerank) || compareOrdinal(a.name, b.name))[0];
}

/**
 * Decides the birth country of one res4 cell: cities, then countries, then states.
 *
 * Purpose: Gives each cell one country even in border cells.
 * When to use: From `buildRes4BirthCountryByH3`, or directly in tests.
 * Expected outcome: Name and code of the chosen country, with the name replaced by the canonical name for its code; `null` when the cell has no naming rows.
 * Exceptions: None.
 */
export function pickRes4BirthCountry(
  record: TerrainNamingRecordRes4,
  canonicalNameByCode: ReadonlyMap<string, string>
): BirthCountry | null {
  const picked = pickBirthCountryFromRows(record);
  if (!picked) return null;
  const canonicalName = picked.code ? canonicalNameByCode.get(picked.code) : undefined;
  return { name: canonicalName ?? picked.name, code: picked.code };
}

/**
 * Applies the city, country, and state rules in order, before canonical naming.
 *
 * Purpose: Keeps the rule order readable in one place.
 * When to use: From `pickRes4BirthCountry`.
 * Expected outcome: The row's own country name and code, or `null` when the cell has no naming rows.
 * Exceptions: None.
 */
function pickBirthCountryFromRows(record: TerrainNamingRecordRes4): BirthCountry | null {
  const city = pickDominantCity(record.cities);
  if (city?.country) return { name: city.country, code: city.countryCode };
  const country = pickDominantCountry(record.countries, record.states);
  if (country) return { name: country.name, code: country.countryCode };
  const state = pickDominantState(record.states);
  if (state) return { name: state.country, code: state.countryCode };
  return null;
}

/**
 * Builds the canonical country name for each code from res1 country rows.
 *
 * Purpose: Cities and states sometimes spell a country differently from its own row.
 * When to use: Once, before picking birth countries.
 * Expected outcome: After sorting rows by name, the first name seen per code wins.
 * Exceptions: None.
 */
function buildCanonicalCountryNameByCode(res1Records: ReadonlyArray<TerrainNamingRecordRes1>): Map<string, string> {
  const rows = res1Records
    .flatMap((record) => record.countries)
    .filter((row): row is TerrainNamingCountryRow & { countryCode: string } => row.countryCode !== null)
    .sort((a, b) => compareOrdinal(a.name, b.name));
  const nameByCode = new Map<string, string>();
  for (const row of rows) {
    if (!nameByCode.has(row.countryCode)) nameByCode.set(row.countryCode, row.name);
  }
  return nameByCode;
}

/**
 * Builds the birth-country map for every res4 cell that has one.
 *
 * Purpose: Lets birth selection look up a cell's country in constant time.
 * When to use: From the terrain classification snapshot build, while naming envelopes are in memory.
 * Expected outcome: Map from res4 `h3_index` to an interned `BirthCountry`; cells without naming rows are absent.
 * Exceptions: None.
 */
export function buildRes4BirthCountryByH3(args: {
  readonly res1Records: ReadonlyArray<TerrainNamingRecordRes1>;
  readonly res4Records: ReadonlyArray<TerrainNamingRecordRes4>;
}): ReadonlyMap<string, BirthCountry> {
  const canonicalNameByCode = buildCanonicalCountryNameByCode(args.res1Records);
  const internedByKey = new Map<string, BirthCountry>();
  const birthCountryByH3 = new Map<string, BirthCountry>();
  for (const record of args.res4Records) {
    const country = pickRes4BirthCountry(record, canonicalNameByCode);
    if (!country) continue;
    const key = `${country.name}|${country.code ?? ''}`;
    const interned = internedByKey.get(key) ?? Object.freeze(country);
    internedByKey.set(key, interned);
    birthCountryByH3.set(record.h3_index, interned);
  }
  logDebug('res4BirthCountry buildRes4BirthCountryByH3', {
    res4Records: args.res4Records.length,
    cellsWithCountry: birthCountryByH3.size,
    distinctCountries: internedByKey.size,
    canonicalCodes: canonicalNameByCode.size,
  });
  return birthCountryByH3;
}
