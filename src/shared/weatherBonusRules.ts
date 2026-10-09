/**
 * Pure rules for the optional weather bonus, shared by movement, dice, AI tools, and the renderer.
 *
 * Purpose: One place decides the tags and the penalties, so live play and estimates never disagree. The date lives in `gameCalendar`.
 * When to use: Any code that needs a weather label, a movement budget, a ferry range, or an attack penalty.
 * Expected outcome: Deterministic results with no logging and no I/O.
 * Exceptions: None.
 */

import { bonusLevelOf, type ActiveBonusLevel, type BonusLevel } from './bonusLevel';
import type { WeatherAttackKind, WeatherAttackPenalty, WeatherMonthRecord, WeatherState } from './weatherBonusTypes';

export { parseStartMonth } from './gameCalendar';

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
 * Weather that slows an untagged unit, by level and unit type.
 *
 * Purpose: One table drives strategic movement, the tactical budget, the tactical tooltip, and the prompt text, so they cannot disagree.
 * When to use: `weatherSlowsMovement`, and prompt text that lists the slowing weather.
 * Expected outcome: Low slows armor in snow or rain and naval in snow. High slows armor in snow, rain, or heat and naval in snow or rain. Lists are in display order. Unlisted types are never slowed.
 * Exceptions: None.
 */
export const WEATHER_SLOWING_STATES: Readonly<
  Record<ActiveBonusLevel, Readonly<Record<string, ReadonlyArray<WeatherState>>>>
> = Object.freeze({
  low: Object.freeze({ armor: Object.freeze(['snow', 'rain'] as const), naval: Object.freeze(['snow'] as const) }),
  high: Object.freeze({
    armor: Object.freeze(['snow', 'rain', 'heat'] as const),
    naval: Object.freeze(['snow', 'rain'] as const),
  }),
});

/**
 * Strategic movement, in hexes, of a unit slowed by weather.
 *
 * Purpose: Slowed armor and naval keep one hex at every level, so a slowed unit can always move.
 * When to use: `strategicMovementHexesFor` only.
 * Expected outcome: 1.
 * Exceptions: None.
 */
const SLOWED_STRATEGIC_MOVEMENT_HEXES = 1;

/**
 * Highest tactical point budget a slowed unit keeps, by level.
 *
 * Purpose: Low keeps 2 points; High keeps 1, which still lets the march planner make one cell of progress.
 * When to use: `tacticalWeatherMovementBudget`, and prompt text that states the battle budget.
 * Expected outcome: Low 2, High 1.
 * Exceptions: None.
 */
export const TACTICAL_WEATHER_BUDGET_CAP: Readonly<Record<ActiveBonusLevel, number>> = Object.freeze({
  low: 2,
  high: 1,
});

/**
 * Points a penalized ranged attack or air strike loses, by level.
 *
 * Purpose: High cuts deeper than Low; `attackHitThreshold` floors the penalized attack at 2, so a shot keeps at least a 10% chance.
 * When to use: `weatherAttackPenalty`, and prompt text that states the penalty.
 * Expected outcome: Low 3, High 5. High is one more than the High origin bonus, so the two never cancel exactly.
 * Exceptions: None.
 */
export const WEATHER_ATTACK_PENALTY_BY_LEVEL: Readonly<Record<ActiveBonusLevel, Exclude<WeatherAttackPenalty, 0>>> =
  Object.freeze({
    low: 3,
    high: 5,
  });

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
 * Returns the weather level of a snapshot or settings object.
 *
 * Purpose: Strategic snapshots, battle snapshots, and settings all store the weather flag and level separately.
 * When to use: Before any weather rule that takes a level.
 * Expected outcome: `off` unless `weatherBonusEnabled` is exactly true; otherwise the level, or `low` when it is missing.
 * Exceptions: None.
 */
export function weatherBonusLevelOf(source: {
  readonly weatherBonusEnabled?: boolean;
  readonly weatherBonusLevel?: ActiveBonusLevel;
}): BonusLevel {
  return bonusLevelOf(source.weatherBonusEnabled, source.weatherBonusLevel);
}

/**
 * Returns the weather flag and level fields for one level.
 *
 * Purpose: The reverse of `weatherBonusLevelOf`, so a weather-state literal can be built from a level in one spread.
 * When to use: When a caller holds a level and needs snapshot-shaped weather fields.
 * Expected outcome: `{ weatherBonusEnabled: false }` for off; otherwise the flag set to true and the level.
 * Exceptions: None.
 */
export function weatherLevelFields(level: BonusLevel): {
  readonly weatherBonusEnabled: boolean;
  readonly weatherBonusLevel?: ActiveBonusLevel;
} {
  return level === 'off' ? { weatherBonusEnabled: false } : { weatherBonusEnabled: true, weatherBonusLevel: level };
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
 * Reports whether weather slows a unit's movement.
 *
 * Purpose: The single slowing test behind strategic movement, the tactical budget, and the tactical tooltip.
 * When to use: With the weather where the unit stands (strategic) or the battle's weather (tactical).
 * Expected outcome: False when the level is off, the weather is missing, or the unit is tagged for it. Otherwise true when `WEATHER_SLOWING_STATES` lists that weather for the unit type at this level.
 * Exceptions: None.
 */
export function weatherSlowsMovement(input: {
  readonly unitType: string;
  readonly weather: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly level: BonusLevel;
}): boolean {
  const { unitType, weather, tags, level } = input;
  if (level === 'off' || !weather || hasWeatherTag(tags, weather)) return false;
  return WEATHER_SLOWING_STATES[level][unitType]?.includes(weather) === true;
}

/**
 * Returns the strategic movement for a unit standing in the current hex's weather.
 *
 * Purpose: Armor and naval lose their extra hex in slowing weather they are not tagged for.
 * When to use: Every strategic reach check, with the weather of the hex the unit occupies now.
 * Expected outcome: The printed budget unless `weatherSlowsMovement`, in which case 1. Infantry never changes. Air stays 0.
 * Exceptions: None.
 */
export function strategicMovementHexesFor(input: {
  readonly unitType: string;
  readonly weather: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly level: BonusLevel;
}): number {
  return weatherSlowsMovement(input) ? SLOWED_STRATEGIC_MOVEMENT_HEXES : strategicMovementHexes(input.unitType);
}

/**
 * Returns the tactical movement budget after weather.
 *
 * Purpose: A slowed armor or naval unit keeps at most `TACTICAL_WEATHER_BUDGET_CAP` points, but never fewer than 1, so it can always move.
 * When to use: `effectiveTacticalMovementPointBudgetForMarchLeg`, with the budget after terrain and the battle's single weather.
 * Expected outcome: `printedBudget` unless `weatherSlowsMovement`; otherwise `max(1, min(printedBudget, cap))`.
 * Exceptions: None.
 */
export function tacticalWeatherMovementBudget(input: {
  readonly unitType: string;
  readonly printedBudget: number;
  readonly weather: WeatherState | null | undefined;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly level: BonusLevel;
}): number {
  const { printedBudget, level } = input;
  if (level === 'off' || !weatherSlowsMovement(input)) return printedBudget;
  return Math.max(1, Math.min(printedBudget, TACTICAL_WEATHER_BUDGET_CAP[level]));
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
 * Returns the points a ranged attack or an air strike loses to weather.
 *
 * Purpose: Armor is less effective at range in snow and heat. Air is less effective when its base or its target is a weather it lacks.
 * When to use: Ranged hit thresholds, air-strike rolls, and air-strike counter-fire. Never for melee or defense.
 * Expected outcome: 0 when the level is off. Armor ranged fire in snow or heat unless tagged, and an air strike when either hex is snow, rain, or heat the unit lacks, lose `WEATHER_ATTACK_PENALTY_BY_LEVEL` (3 at Low, 5 at High), once per roll. Infantry, naval, mild weather, and a tagged weather return 0.
 * Exceptions: None.
 */
export function weatherAttackPenalty(input: {
  readonly unitType: string;
  readonly kind: WeatherAttackKind;
  readonly weatherAtUnit: WeatherState | null | undefined;
  readonly weatherAtTarget?: WeatherState | null;
  readonly tags: readonly WeatherState[] | null | undefined;
  readonly level: BonusLevel;
}): WeatherAttackPenalty {
  const { level } = input;
  if (level === 'off') return 0;
  const penalized =
    input.kind === 'ranged'
      ? penalizesRangedAttack(input.unitType, input.weatherAtUnit, input.tags)
      : input.unitType === 'air' &&
        [input.weatherAtUnit, input.weatherAtTarget].some((weather) => penalizesAirStrike(weather, input.tags));
  return penalized ? WEATHER_ATTACK_PENALTY_BY_LEVEL[level] : 0;
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
 * Reports whether armor ranged fire is penalized in this weather.
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
