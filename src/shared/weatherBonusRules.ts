/**
 * Pure rules for the optional weather bonus, shared by movement, dice, AI tools, and the renderer.
 *
 * Purpose: One place decides the month, the tags, and the penalties, so live play and estimates never disagree.
 * When to use: Any code that needs a weather label, a movement budget, a ferry range, or an attack penalty.
 * Expected outcome: Deterministic results with no logging and no I/O.
 * Exceptions: None.
 */

import type { WeatherAttackKind, WeatherMonthRecord, WeatherState } from './weatherBonusTypes';

/**
 * Full month names, January first.
 *
 * Purpose: The new-game control, the turn line, and `parseStartMonth` share one list.
 * When to use: Building the start-month options and formatting the current month.
 * Expected outcome: Twelve English names. Index 0 is January, which is start month 1.
 * Exceptions: None.
 */
export const WEATHER_MONTH_NAMES: readonly string[] = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

/**
 * Monthly mean at or below this, in °C, is a snow month.
 *
 * Purpose: The single snow threshold for climate classification.
 * When to use: `classifyWeatherMonth` only.
 * Expected outcome: 0.
 * Exceptions: None.
 */
export const WEATHER_SNOW_MEAN_C = 0;

/**
 * Monthly precipitation at or above this, in millimetres, is a rain month when it is not snow.
 *
 * Purpose: The single rain threshold for climate classification.
 * When to use: `classifyWeatherMonth` only.
 * Expected outcome: 120.
 * Exceptions: None.
 */
export const WEATHER_RAIN_PRECIP_MM = 120;

/**
 * Monthly mean at or above this, in °C, counts as heat when the month is not snow.
 *
 * Purpose: The single heat threshold. A wet month at this temperature still displays as rain.
 * When to use: `classifyWeatherMonth` only.
 * Expected outcome: 23.
 * Exceptions: None.
 */
export const WEATHER_HEAT_MEAN_C = 23;

/**
 * How many months of a condition earn an acclimation tag.
 *
 * Purpose: Stops a single odd month from tagging a unit.
 * When to use: `acclimationTags` only.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const WEATHER_ACCLIMATION_MONTHS = 3;

/**
 * Most tags a unit can carry.
 *
 * Purpose: Keeps a birth hex from granting rain, snow, and heat together.
 * When to use: `acclimationTags` only.
 * Expected outcome: 2. Mild is never a tag, so the cap rarely matters.
 * Exceptions: None.
 */
export const WEATHER_MAX_TAGS = 2;

/**
 * Printed strategic movement, in hexes, before weather.
 *
 * Purpose: The documented campaign-map budgets. Tactical point budgets are a different table.
 * When to use: `strategicMovementHexes` and any prompt that states the printed move.
 * Expected outcome: Infantry 1, armor 2, naval 2, air 0.
 * Exceptions: None.
 */
const STRATEGIC_MOVEMENT_HEXES: Readonly<Record<string, number>> = Object.freeze({
  infantry: 1,
  armor: 2,
  naval: 2,
  air: 0,
});

/**
 * Infantry terrain categories whose open-ground enter cost rises in snow and rain.
 *
 * Purpose: Forest and mountains already cost 2, and roads are priced elsewhere.
 * When to use: `tacticalWeatherOpenGroundCost` only.
 * Expected outcome: Plains, desert, wetlands, arctic, and coastal.
 * Exceptions: None.
 */
const OPEN_GROUND_CATEGORIES: ReadonlySet<string> = new Set(['plains', 'desert', 'wetlands', 'arctic', 'coastal']);

/**
 * Tie order when two conditions cover the same number of months. Earlier wins.
 *
 * Purpose: The cap drops the later name when counts are equal.
 * When to use: `acclimationTags` only.
 * Expected outcome: Snow, then heat, then rain.
 * Exceptions: None.
 */
const TAG_TIE_ORDER = Object.freeze(['snow', 'heat', 'rain'] as const);

/**
 * Order of tags on tooltips and in assessments.
 *
 * Purpose: Two units with the same tags render the same text.
 * When to use: The final sort in `acclimationTags`, and `weatherTagsInDisplayOrder`.
 * Expected outcome: Snow, then rain, then heat.
 * Exceptions: None.
 */
const TAG_DISPLAY_ORDER = Object.freeze(['snow', 'rain', 'heat'] as const);

/**
 * Parses a start month from the new-game control or a persisted config value.
 *
 * Purpose: Unknown or out-of-range input must not throw and must not shift the calendar.
 * When to use: When reading `start_month` or the start-month select.
 * Expected outcome: 1 for January through 12 for December. Names are matched case-insensitively. Digit strings from the month select and the saved config row are accepted. Anything else, including null, is 1.
 * Exceptions: None.
 */
export function parseStartMonth(raw: string | number | null | undefined): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 12) return raw;
  const text = String(raw ?? '').trim();
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return numeric >= 1 && numeric <= 12 ? numeric : 1;
  }
  const index = WEATHER_MONTH_NAMES.findIndex((name) => name.toLowerCase() === text.toLowerCase());
  return index >= 0 ? index + 1 : 1;
}

/**
 * Returns the calendar index for a strategic turn.
 *
 * Purpose: Turn 1 of a January match is January, and later turns advance one month each.
 * When to use: Before formatting the month or looking up a hex's weather.
 * Expected outcome: 0 through 11. A turn below 1 is treated as turn 1. `startMonth` is parsed by `parseStartMonth`.
 * Exceptions: None.
 */
export function calendarMonthIndex(turnNumber: number, startMonth: string | number | null | undefined): number {
  const turn = Number.isFinite(turnNumber) && turnNumber >= 1 ? Math.floor(turnNumber) : 1;
  const start = parseStartMonth(startMonth);
  return (turn - 1 + start - 1) % 12;
}

/**
 * Returns the full month name for a strategic turn.
 *
 * Purpose: The turn line and prompts share this wording.
 * When to use: Whenever the player or the model is told the current month.
 * Expected outcome: One entry of `WEATHER_MONTH_NAMES`.
 * Exceptions: None.
 */
export function calendarMonthName(turnNumber: number, startMonth: string | number | null | undefined): string {
  return WEATHER_MONTH_NAMES[calendarMonthIndex(turnNumber, startMonth)] ?? 'January';
}

/**
 * Classifies one month from its mean temperature and precipitation.
 *
 * Purpose: The climate pack and the tests use one rule.
 * When to use: While building a hex's twelve-month record. Not at combat time.
 * Expected outcome: Snow at or below 0°C. Otherwise rain at or above 120 mm, and that month still counts as heat at or above 23°C. Otherwise heat at or above 23°C, else mild.
 * Exceptions: None. Non-finite inputs classify as mild and do not count as heat.
 */
export function classifyWeatherMonth(meanC: number, precipMm: number): WeatherMonthRecord {
  if (!Number.isFinite(meanC) || !Number.isFinite(precipMm)) {
    return { display: 'mild', countsAsHeat: false };
  }
  if (meanC <= WEATHER_SNOW_MEAN_C) return { display: 'snow', countsAsHeat: false };
  const hot = meanC >= WEATHER_HEAT_MEAN_C;
  if (precipMm >= WEATHER_RAIN_PRECIP_MM) return { display: 'rain', countsAsHeat: hot };
  if (hot) return { display: 'heat', countsAsHeat: true };
  return { display: 'mild', countsAsHeat: false };
}

/**
 * Lists the acclimation tags for twelve classified months.
 *
 * Purpose: A unit born on a hex keeps these tags for the match.
 * When to use: When a snapshot is built, with the birth hex's year.
 * Expected outcome: Zero to two of `snow`, `rain`, and `heat`, in that display order. A condition needs three months. Mild is never included. Three qualifiers keep the two with more months; equal counts prefer snow, then heat, then rain.
 * Exceptions: None. A short or empty list simply counts the months it has.
 */
export function acclimationTags(months: readonly WeatherMonthRecord[]): WeatherState[] {
  const counts = { snow: 0, rain: 0, heat: 0 };
  for (const month of months) {
    if (month.display === 'snow') counts.snow += 1;
    if (month.display === 'rain') counts.rain += 1;
    if (month.countsAsHeat) counts.heat += 1;
  }
  const qualifying = TAG_TIE_ORDER.filter((state) => counts[state] >= WEATHER_ACCLIMATION_MONTHS);
  qualifying.sort(
    (left, right) => counts[right] - counts[left] || TAG_TIE_ORDER.indexOf(left) - TAG_TIE_ORDER.indexOf(right)
  );
  const kept = new Set(qualifying.slice(0, WEATHER_MAX_TAGS));
  return TAG_DISPLAY_ORDER.filter((state) => kept.has(state)).slice();
}

/**
 * Puts acclimation tags into the order players see.
 *
 * Purpose: Tooltips and other readers should not depend on the order a caller stored.
 * When to use: When rendering tags. `acclimationTags` already returns this order.
 * Expected outcome: Snow, then rain, then heat. Mild, duplicates, and anything else are dropped.
 * Exceptions: None.
 */
export function weatherTagsInDisplayOrder(tags: readonly WeatherState[] | null | undefined): WeatherState[] {
  const present = new Set(tags ?? []);
  return TAG_DISPLAY_ORDER.filter((state) => present.has(state)).slice();
}

/**
 * Returns the printed strategic movement for a unit type, in hexes.
 *
 * Purpose: Campaign-map movement before weather. This is not the tactical point budget.
 * When to use: Validation, destination search, and the printed movement sentence.
 * Expected outcome: Infantry 1, armor 2, naval 2, air 0. An unknown type returns 1.
 * Exceptions: None.
 */
export function strategicMovementHexes(unitType: string): number {
  return STRATEGIC_MOVEMENT_HEXES[unitType] ?? 1;
}

/**
 * Returns the strategic movement for a unit standing in the current hex's weather.
 *
 * Purpose: Armor loses its extra hex in snow and rain. Naval loses its extra hex in snow. Tagged units do not.
 * When to use: Every strategic reach check, with the weather of the hex the unit occupies now.
 * Expected outcome: The printed budget when the flag is off, the weather is missing, or the unit has that tag. Otherwise armor in snow or rain, and naval in snow, move 1. Infantry never changes. Air stays 0.
 * Exceptions: None.
 */
export function strategicMovementHexesFor(input: {
  readonly unitType: string;
  readonly weather: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly enabled: boolean;
}): number {
  const printed = strategicMovementHexes(input.unitType);
  if (!input.enabled || !input.weather || hasWeatherTag(input.tags, input.weather)) return printed;
  if (input.unitType === 'armor' && (input.weather === 'snow' || input.weather === 'rain')) return 1;
  if (input.unitType === 'naval' && input.weather === 'snow') return 1;
  return printed;
}

/**
 * Returns the tactical movement budget after weather, before forest and urban cuts.
 *
 * Purpose: Armor's budget falls to 2 in snow and rain, and naval's falls to 2 in snow. Callers then keep the lower of this and the terrain budget.
 * When to use: `effectiveTacticalMovementPointBudgetForMarchLeg`, with the battle's single weather.
 * Expected outcome: `printedBudget` when the flag is off, the weather is missing, or the unit has that tag. Otherwise the lowered armor or naval budget, never above the printed budget.
 * Exceptions: None.
 */
export function tacticalWeatherMovementBudget(input: {
  readonly unitType: string;
  readonly printedBudget: number;
  readonly weather: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly enabled: boolean;
}): number {
  const printed = input.printedBudget;
  if (!input.enabled || !input.weather || hasWeatherTag(input.tags, input.weather)) return printed;
  if (input.unitType === 'armor' && (input.weather === 'snow' || input.weather === 'rain')) return Math.min(printed, 2);
  if (input.unitType === 'naval' && input.weather === 'snow') return Math.min(printed, 2);
  return printed;
}

/**
 * Returns the infantry enter cost for one open-ground step.
 *
 * Purpose: Snow and rain make open ground cost 2 for infantry who lack that tag. Roads, urban, rubble, forest, and mountains are left to their own rules.
 * When to use: Only on a step whose cost is the raw terrain cost, not a road, rail, urban, or rubble override.
 * Expected outcome: 2 for unacclimated infantry on plains, desert, wetlands, arctic, or coastal in snow or rain. Every other call returns `baseCost`.
 * Exceptions: None.
 */
export function tacticalWeatherOpenGroundCost(input: {
  readonly unitType: string;
  readonly category: string;
  readonly baseCost: number;
  readonly weather: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly enabled: boolean;
}): number {
  if (!input.enabled || input.unitType !== 'infantry' || !input.weather) return input.baseCost;
  if (input.weather !== 'snow' && input.weather !== 'rain') return input.baseCost;
  if (hasWeatherTag(input.tags, input.weather)) return input.baseCost;
  if (!OPEN_GROUND_CATEGORIES.has(input.category)) return input.baseCost;
  return Math.max(input.baseCost, 2);
}

/**
 * Returns 1 when a ranged attack or an air strike loses one point of attack, otherwise 0.
 *
 * Purpose: Armor is less effective at range in snow and heat. Air is less effective when its base or its target is a weather it lacks.
 * When to use: Ranged hit thresholds, air-strike rolls, and air-strike counter-fire. Never for melee or defense.
 * Expected outcome: 0 when the flag is off. Armor ranged fire loses 1 in snow or heat unless tagged. An air strike loses 1 once when either hex is snow, rain, or heat and the unit lacks that tag. Infantry, naval, mild weather, and a tagged weather return 0.
 * Exceptions: None.
 */
export function weatherAttackPenalty(input: {
  readonly unitType: string;
  readonly kind: WeatherAttackKind;
  readonly weatherAtUnit: WeatherState | null | undefined;
  readonly weatherAtTarget?: WeatherState | null;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly enabled: boolean;
}): 0 | 1 {
  if (!input.enabled) return 0;
  if (input.kind === 'ranged') {
    return penalizesRangedAttack(input.unitType, input.weatherAtUnit, input.tags) ? 1 : 0;
  }
  if (input.unitType !== 'air') return 0;
  const penalized = [input.weatherAtUnit, input.weatherAtTarget].some((weather) => penalizesAirStrike(weather, input.tags));
  return penalized ? 1 : 0;
}

/**
 * Returns the strategic ferry range in hexes.
 *
 * Purpose: Unacclimated air rebases only 2 hexes into a snow destination. The printed range stays 4.
 * When to use: Strategic ferry validation, resolution, previews, and tempo ferry. Not tactical ferry.
 * Expected outcome: 2 when the flag is on, the destination is snow, and the unit lacks the snow tag. Otherwise 4.
 * Exceptions: None.
 */
export function strategicFerryRangeHexes(input: {
  readonly weatherAtDestination: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly enabled: boolean;
}): number {
  if (input.enabled && input.weatherAtDestination === 'snow' && !hasWeatherTag(input.tags, 'snow')) return 2;
  return 4;
}

/**
 * Returns the player-facing weather word.
 *
 * Purpose: Tooltips and the turn line use the same capitalization.
 * When to use: Next to a weather icon.
 * Expected outcome: `Mild`, `Rain`, `Snow`, or `Heat`. An unknown value returns `Mild`.
 * Exceptions: None.
 */
export function formatWeatherLabel(weather: WeatherState | null | undefined): string {
  switch (weather) {
    case 'rain':
      return 'Rain';
    case 'snow':
      return 'Snow';
    case 'heat':
      return 'Heat';
    default:
      return 'Mild';
  }
}

/**
 * Formats the Unit Status Weather cell.
 *
 * Purpose: The column has to name the weather where the unit stands. Tags alone read as that weather, so a heat-tagged unit in a mild month looks penalized when it is not.
 * When to use: While building the briefing table, with the occupied hex's display weather and the unit's birth tags.
 * Expected outcome: `Mild` when the unit has no tags. `Mild (Heat)` when it stands in mild weather and is tagged for heat. Tags stay in display order. A missing weather falls back to the tags, or `None` when there are none.
 * Exceptions: None.
 */
export function formatBriefingWeatherCell(input: {
  readonly weatherHere: string | null | undefined;
  readonly tags: readonly string[] | null | undefined;
}): string {
  const here =
    input.weatherHere === 'mild' || input.weatherHere === 'rain' || input.weatherHere === 'snow' || input.weatherHere === 'heat'
      ? formatWeatherLabel(input.weatherHere)
      : null;
  const tagText = weatherTagsInDisplayOrder(
    (input.tags ?? []).filter(
      (tag): tag is WeatherState => tag === 'snow' || tag === 'rain' || tag === 'heat' || tag === 'mild'
    )
  )
    .map((tag) => formatWeatherLabel(tag))
    .join(', ');
  if (here && tagText.length > 0) return `${here} (${tagText})`;
  if (here) return here;
  return tagText.length > 0 ? tagText : 'None';
}

/**
 * Reports whether a tag list contains one weather.
 *
 * Purpose: Every penalty exemption goes through one check.
 * When to use: Inside this module only.
 * Expected outcome: False for a missing list. Mild is never stored as a tag.
 * Exceptions: None.
 */
function hasWeatherTag(tags: readonly WeatherState[] | null | undefined, weather: WeatherState): boolean {
  return tags?.includes(weather) === true;
}

/**
 * Reports whether armor ranged fire loses a point in this weather.
 *
 * Purpose: Rain slows armor and does not change its attack.
 * When to use: `weatherAttackPenalty` for `ranged`.
 * Expected outcome: True only for unacclimated armor in snow or heat.
 * Exceptions: None.
 */
function penalizesRangedAttack(
  unitType: string,
  weather: WeatherState | null | undefined,
  tags: readonly WeatherState[] | null | undefined
): boolean {
  if (unitType !== 'armor' || (weather !== 'snow' && weather !== 'heat')) return false;
  return !hasWeatherTag(tags, weather);
}

/**
 * Reports whether one hex penalizes an air strike.
 *
 * Purpose: Mild never penalizes. A tagged weather does not either.
 * When to use: Once per hex inside `weatherAttackPenalty` for `airStrike`.
 * Expected outcome: True for snow, rain, or heat when the unit lacks that tag.
 * Exceptions: None.
 */
function penalizesAirStrike(
  weather: WeatherState | null | undefined,
  tags: readonly WeatherState[] | null | undefined
): boolean {
  if (weather !== 'snow' && weather !== 'rain' && weather !== 'heat') return false;
  return !hasWeatherTag(tags, weather);
}
