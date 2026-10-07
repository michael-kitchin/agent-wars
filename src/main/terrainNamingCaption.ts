/**
 * Chooses and builds the hex naming caption for strategic and tactical naming records.
 *
 * Purpose: Caption selection (cities, then states, then countries, then water) with country spans for flags.
 * When to use: From the terrain classification cache when precomputing per-hex captions.
 * Expected outcome: `HexNamingCaption` values whose `text` follows the established caption format.
 * Exceptions: None.
 */
import { HexNamingCaptionBuilder, hexNamingCaptionInternKey, type HexNamingCaption } from '../shared/hexNamingCaption';
import { logDebug } from './logger';
import {
  TOOLTIP_NAME_LIST_MAX_ITEMS,
  type TerrainNamingCityRow,
  type TerrainNamingCountryRow,
  type TerrainNamingRecordStrategic,
  type TerrainNamingRecordTactical,
  type TerrainNamingStateRow,
  type TerrainNamingWaterRow,
} from './terrainNamingLoad';

/**
 * Heading shown when a city row has no country name.
 *
 * Purpose: Keeps grouped city and state captions readable when source data lacks a country.
 * When to use: As the group key for rows without a country; never flagged.
 * Expected outcome: Literal `Unknown Country`.
 * Exceptions: None.
 */
const UNKNOWN_COUNTRY_HEADING = 'Unknown Country';

/**
 * Heading shown when a country row has no continent.
 *
 * Purpose: Groups country captions even when the continent is missing.
 * When to use: As the group key for country rows without a continent.
 * Expected outcome: Literal `Unknown Continent`.
 * Exceptions: None.
 */
const UNKNOWN_CONTINENT_HEADING = 'Unknown Continent';

/**
 * Flag details for one caption group heading.
 *
 * Purpose: Lets each grouped caption decide whether its heading is a country and which code it has.
 * When to use: Returned by `GroupedCaptionSpec.heading`.
 * Expected outcome: `isCountry` false means no flag.
 * Exceptions: None.
 */
interface CaptionHeadingFlag {
  /**
   * Whether the heading is a real country name.
   *
   * Contract: False for continents and fallback headings.
   * When to use: Passed to `HexNamingCaptionBuilder.appendHeading`.
   * Expected outcome: Controls whether a flag is rendered.
   * Exceptions: None.
   */
  readonly isCountry: boolean;
  /**
   * The heading country's ISO alpha-2 code, when known.
   *
   * Contract: `null` for non-countries or countries without a code.
   * When to use: Passed to `HexNamingCaptionBuilder.appendHeading`.
   * Expected outcome: Selects the flag asset.
   * Exceptions: None.
   */
  readonly countryCode: string | null;
}

/**
 * Per-caption behavior for `buildGroupedCaption`.
 *
 * Purpose: Lets city, state, and country captions share one grouping loop.
 * When to use: One spec per caption kind.
 * Expected outcome: Groups appear in first-occurrence order, joined by `'; '`.
 * Exceptions: None.
 */
interface GroupedCaptionSpec<T> {
  /**
   * Returns the group heading text for a row.
   *
   * Contract: Rows with equal keys form one group.
   * When to use: Called once per row.
   * Expected outcome: The heading text shown before the colon.
   * Exceptions: None.
   */
  readonly groupKey: (row: T) => string;
  /**
   * Returns the flag details for a group heading.
   *
   * Contract: Receives the heading text and the group's rows.
   * When to use: Called once per group.
   * Expected outcome: Whether to flag the heading and with which code.
   * Exceptions: None.
   */
  readonly heading: (key: string, groupRows: ReadonlyArray<T>) => CaptionHeadingFlag;
  /**
   * Appends the text after a group's heading.
   *
   * Contract: Appends to the builder after `appendHeading`.
   * When to use: Called once per group.
   * Expected outcome: The comma-separated group body.
   * Exceptions: None.
   */
  readonly appendBody: (builder: HexNamingCaptionBuilder, groupRows: ReadonlyArray<T>) => void;
}

/**
 * Sorts rows by ascending scalerank, keeping source order for ties and putting null ranks last.
 *
 * Purpose: Most prominent names first while respecting the pipeline's stable order.
 * When to use: Before trimming row lists to `TOOLTIP_NAME_LIST_MAX_ITEMS`.
 * Expected outcome: A new array; the input is not mutated.
 * Exceptions: None.
 */
function sortRowsByScalerankAscending<T extends { scalerank: number | null }>(rows: ReadonlyArray<T>): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const aRank = a.row.scalerank ?? Number.MAX_SAFE_INTEGER;
      const bRank = b.row.scalerank ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.index - b.index;
    })
    .map((item) => item.row);
}

/**
 * Returns the first non-null country code among a group's rows.
 *
 * Purpose: Picks the flag code for a country heading from the rows grouped under it.
 * When to use: In city and state caption headings.
 * Expected outcome: An uppercase code, or `null` when no row has one.
 * Exceptions: None.
 */
function firstCountryCode(rows: ReadonlyArray<{ countryCode: string | null }>): string | null {
  return rows.find((row) => row.countryCode !== null)?.countryCode ?? null;
}

/**
 * Builds a caption of `Heading: body` groups joined by `'; '`.
 *
 * Purpose: Shared grouping loop for city, state, and country captions.
 * When to use: With a spec describing the caption kind.
 * Expected outcome: Groups in first-occurrence order of their keys.
 * Exceptions: None.
 */
function buildGroupedCaption<T>(rows: ReadonlyArray<T>, spec: GroupedCaptionSpec<T>): HexNamingCaption {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = spec.groupKey(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const builder = new HexNamingCaptionBuilder();
  let isFirstGroup = true;
  for (const [key, groupRows] of groups) {
    if (!isFirstGroup) builder.appendText('; ');
    isFirstGroup = false;
    const heading = spec.heading(key, groupRows);
    builder.appendHeading(key, heading.countryCode, heading.isCountry);
    spec.appendBody(builder, groupRows);
  }
  return builder.build();
}

/**
 * Heading rule shared by city and state captions: flag real country names only.
 *
 * Purpose: The `Unknown Country` fallback and empty names are not countries and get no flag.
 * When to use: As `GroupedCaptionSpec.heading` for city and state captions.
 * Expected outcome: `isCountry` true for real names, with the group's first known code.
 * Exceptions: None.
 */
function countryHeadingFlag(
  groupRows: ReadonlyArray<{ country: string | null; countryCode: string | null }>
): CaptionHeadingFlag {
  const country = groupRows[0]?.country;
  const isCountry = typeof country === 'string' && country.length > 0;
  return { isCountry, countryCode: isCountry ? firstCountryCode(groupRows) : null };
}

/**
 * Builds the city caption: `Country: City1, City2 (State); Country2: ...`.
 *
 * Purpose: Most specific tactical caption when a few cities cover the cell's states and countries.
 * When to use: From `preferredNamingCaptionForTacticalRecord`.
 * Expected outcome: Countries flagged; cities grouped by state in first-occurrence order.
 * Exceptions: None.
 */
function buildGroupedCitiesCaption(rows: ReadonlyArray<TerrainNamingCityRow>): HexNamingCaption {
  return buildGroupedCaption(rows, {
    groupKey: (row) => row.country ?? UNKNOWN_COUNTRY_HEADING,
    heading: (_key, groupRows) => countryHeadingFlag(groupRows),
    appendBody: (builder, groupRows) => {
      const citiesByState = new Map<string, string[]>();
      for (const cityRow of groupRows) {
        const stateKey = cityRow.state ?? '';
        const stateCities = citiesByState.get(stateKey);
        if (stateCities) stateCities.push(cityRow.name);
        else citiesByState.set(stateKey, [cityRow.name]);
      }
      const labels = [...citiesByState]
        .map(([stateKey, cityNames]) => {
          const joinedCities = cityNames.join(', ');
          return stateKey ? `${joinedCities} (${stateKey})` : joinedCities;
        })
        .filter((label) => label.length > 0);
      builder.appendText(labels.join(', '));
    },
  });
}

/**
 * Builds the state caption: `Country: State1, State2; Country2: ...`.
 *
 * Purpose: Caption when a few states cover the cell's countries and continents.
 * When to use: From the preferred strategic and tactical caption functions.
 * Expected outcome: Countries flagged; states plain.
 * Exceptions: None.
 */
function buildGroupedStatesCaption(rows: ReadonlyArray<TerrainNamingStateRow>): HexNamingCaption {
  return buildGroupedCaption(rows, {
    groupKey: (row) => row.country || UNKNOWN_COUNTRY_HEADING,
    heading: (_key, groupRows) => countryHeadingFlag(groupRows),
    appendBody: (builder, groupRows) => {
      builder.appendText(groupRows.map((row) => row.name).join(', '));
    },
  });
}

/**
 * Builds the country caption: `Continent: Country1, Country2; ...`.
 *
 * Purpose: Broadest geographic caption, used when states are too many or missing.
 * When to use: From the preferred strategic and tactical caption functions.
 * Expected outcome: Continent headings plain; every country item flagged.
 * Exceptions: None.
 */
function buildGroupedCountriesCaption(rows: ReadonlyArray<TerrainNamingCountryRow>): HexNamingCaption {
  return buildGroupedCaption(rows, {
    groupKey: (row) => row.continent ?? UNKNOWN_CONTINENT_HEADING,
    heading: () => ({ isCountry: false, countryCode: null }),
    appendBody: (builder, groupRows) => {
      groupRows.forEach((row, index) => {
        if (index > 0) builder.appendText(', ');
        builder.appendCountryItem(row.name, row.countryCode);
      });
    },
  });
}

/**
 * Checks that the chosen cities name every state in the cell.
 *
 * Purpose: Avoids a city caption that hides a state the cell overlaps.
 * When to use: Before choosing the city caption.
 * Expected outcome: True when no states are listed or every state has a city.
 * Exceptions: None.
 */
function citiesCoverAllStates(
  cityRows: ReadonlyArray<TerrainNamingCityRow>,
  associatedStates: ReadonlyArray<TerrainNamingStateRow>
): boolean {
  if (associatedStates.length === 0) return true;
  const coveredStates = new Set(
    cityRows.map((row) => row.state).filter((state): state is string => typeof state === 'string' && state.length > 0)
  );
  return associatedStates.every((stateRow) => coveredStates.has(stateRow.name));
}

/**
 * Checks that the chosen cities name every country in the cell.
 *
 * Purpose: Avoids a city caption that hides a country the cell overlaps.
 * When to use: Before choosing the city caption.
 * Expected outcome: True when no countries are listed or every country has a city.
 * Exceptions: None.
 */
function citiesCoverAllCountries(
  cityRows: ReadonlyArray<TerrainNamingCityRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(
    cityRows
      .map((row) => row.country)
      .filter((country): country is string => typeof country === 'string' && country.length > 0)
  );
  return associatedCountries.every((countryRow) => coveredCountries.has(countryRow.name));
}

/**
 * Checks that the chosen states name every country in the cell.
 *
 * Purpose: Avoids a state caption that hides a country the cell overlaps.
 * When to use: Before choosing the state caption.
 * Expected outcome: True when no countries are listed or every country has a state.
 * Exceptions: None.
 */
function statesCoverAllCountries(
  stateRows: ReadonlyArray<TerrainNamingStateRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(stateRows.map((row) => row.country || UNKNOWN_COUNTRY_HEADING));
  return associatedCountries.every((countryRow) => coveredCountries.has(countryRow.name));
}

/**
 * Checks that the chosen states reach every continent of the cell's countries.
 *
 * Purpose: Avoids a state caption that hides a whole continent in a border cell.
 * When to use: Before choosing the state caption.
 * Expected outcome: True when no countries are listed or every continent is covered.
 * Exceptions: None.
 */
function statesCoverAllContinents(
  stateRows: ReadonlyArray<TerrainNamingStateRow>,
  associatedCountries: ReadonlyArray<TerrainNamingCountryRow>
): boolean {
  if (associatedCountries.length === 0) return true;
  const coveredCountries = new Set(stateRows.map((row) => row.country || UNKNOWN_COUNTRY_HEADING));
  const allContinents = new Set(associatedCountries.map((row) => row.continent ?? UNKNOWN_CONTINENT_HEADING));
  const coveredContinents = new Set(
    associatedCountries
      .filter((row) => coveredCountries.has(row.name))
      .map((row) => row.continent ?? UNKNOWN_CONTINENT_HEADING)
  );
  return [...allContinents].every((continent) => coveredContinents.has(continent));
}

/**
 * Chooses the tactical geographic caption: cities, then states, then countries.
 *
 * Purpose: Most specific caption that still names every state and country the cell touches.
 * When to use: From `namingCaptionForTacticalRecord`, or directly in tests.
 * Expected outcome: A caption, or `null` when the cell has no geographic rows.
 * Exceptions: None.
 */
export function preferredNamingCaptionForTacticalRecord(record: TerrainNamingRecordTactical): HexNamingCaption | null {
  const firstRankCities = sortRowsByScalerankAscending(record.cities).slice(0, TOOLTIP_NAME_LIST_MAX_ITEMS);
  if (
    firstRankCities.length > 0 &&
    citiesCoverAllStates(firstRankCities, record.states) &&
    citiesCoverAllCountries(firstRankCities, record.countries)
  ) {
    return buildGroupedCitiesCaption(firstRankCities);
  }
  return preferredNamingCaptionForStrategicRecord(record);
}

/**
 * Chooses the strategic geographic caption: states, then countries.
 *
 * Purpose: Strategic hex caption that names every country and continent the hex touches.
 * When to use: From `namingCaptionForStrategicRecord`, and as the tactical fallback after cities.
 * Expected outcome: A caption, or `null` when the record has no states or countries.
 * Exceptions: None.
 */
export function preferredNamingCaptionForStrategicRecord(record: TerrainNamingRecordStrategic): HexNamingCaption | null {
  const firstRankStates = sortRowsByScalerankAscending(record.states).slice(0, TOOLTIP_NAME_LIST_MAX_ITEMS);
  if (
    firstRankStates.length > 0 &&
    statesCoverAllCountries(firstRankStates, record.countries) &&
    statesCoverAllContinents(firstRankStates, record.countries)
  ) {
    return buildGroupedStatesCaption(firstRankStates);
  }
  if (record.countries.length > 0) return buildGroupedCountriesCaption(sortRowsByScalerankAscending(record.countries));
  return null;
}

/**
 * Formats lake and ocean rows into the shared water caption.
 *
 * Purpose: Keeps water captions identical at both resolutions.
 * When to use: From the strategic and tactical water caption functions.
 * Expected outcome: Comma-separated scalerank groups (descending rank; null rank first; names sorted), or `null` when empty.
 * Exceptions: None.
 */
function buildWaterCaption(water: ReadonlyArray<TerrainNamingWaterRow>): HexNamingCaption | null {
  if (water.length === 0) return null;
  const byRank = new Map<number | null, string[]>();
  for (const row of water) {
    const rank = row.scalerank ?? null;
    const names = byRank.get(rank);
    if (names) names.push(row.name);
    else byRank.set(rank, [row.name]);
  }
  const ranks = [...byRank.keys()].sort((a, b) => (b ?? Number.POSITIVE_INFINITY) - (a ?? Number.POSITIVE_INFINITY));
  const text = ranks.map((rank) => [...(byRank.get(rank) ?? [])].sort((x, y) => x.localeCompare(y)).join(', ')).join(', ');
  return new HexNamingCaptionBuilder().appendText(text).build();
}

/**
 * Builds the water-body caption for a strategic hex.
 *
 * Purpose: Fallback when the hex has no geographic naming rows.
 * When to use: From `namingCaptionForStrategicRecord`.
 * Expected outcome: Water caption with no spans, or `null` when there is no water.
 * Exceptions: None.
 */
export function waterNamingCaptionForStrategicRecord(record: TerrainNamingRecordStrategic): HexNamingCaption | null {
  return buildWaterCaption(record.water);
}

/**
 * Builds the water-body caption for a tactical cell.
 *
 * Purpose: Fallback when the cell has no geographic naming rows.
 * When to use: From `namingCaptionForTacticalRecord`.
 * Expected outcome: Same format as the strategic water caption.
 * Exceptions: None.
 */
export function waterNamingCaptionForTacticalRecord(record: TerrainNamingRecordStrategic): HexNamingCaption | null {
  return buildWaterCaption(record.water);
}

/**
 * Resolves the strategic caption: geographic first, then water.
 *
 * Purpose: Single entry point for strategic captions in the terrain classification cache.
 * When to use: From `buildSnapshot` when precomputing `namingCaptionsStrategicByH3`.
 * Expected outcome: A caption, or `null` when the hex has no naming rows.
 * Exceptions: None.
 */
export function namingCaptionForStrategicRecord(record: TerrainNamingRecordStrategic): HexNamingCaption | null {
  return preferredNamingCaptionForStrategicRecord(record) ?? waterNamingCaptionForStrategicRecord(record);
}

/**
 * Resolves the tactical caption: geographic first, then water.
 *
 * Purpose: Single entry point for tactical captions in the terrain classification cache.
 * When to use: From `buildSnapshot` when precomputing `namingCaptionsTacticalByH3`.
 * Expected outcome: A caption, or `null` when the cell has no naming rows.
 * Exceptions: None.
 */
export function namingCaptionForTacticalRecord(record: TerrainNamingRecordTactical): HexNamingCaption | null {
  return preferredNamingCaptionForTacticalRecord(record) ?? waterNamingCaptionForTacticalRecord(record);
}

/**
 * Builds the per-hex caption map, sharing one object among hexes with identical captions.
 *
 * Purpose: Neighboring tactical cells often share a caption; interning keeps the cache small.
 * When to use: From `buildSnapshot`, once per resolution, with the matching caption function.
 * Expected outcome: Map from `h3_index` to caption; hexes without a caption or with empty text are omitted.
 * Exceptions: None.
 */
export function buildNamingCaptionsByH3<T extends { h3_index: string }>(
  records: ReadonlyArray<T>,
  captionFor: (record: T) => HexNamingCaption | null
): ReadonlyMap<string, HexNamingCaption> {
  const internedByKey = new Map<string, HexNamingCaption>();
  const captionsByH3 = new Map<string, HexNamingCaption>();
  for (const record of records) {
    const caption = captionFor(record);
    if (!caption || caption.text === '') continue;
    const key = hexNamingCaptionInternKey(caption);
    const interned = internedByKey.get(key) ?? caption;
    internedByKey.set(key, interned);
    captionsByH3.set(record.h3_index, interned);
  }
  logDebug('terrainNamingCaption buildNamingCaptionsByH3', {
    records: records.length,
    captionedHexes: captionsByH3.size,
    distinctCaptions: internedByKey.size,
  });
  return captionsByH3;
}
