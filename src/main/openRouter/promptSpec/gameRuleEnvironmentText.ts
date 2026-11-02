/**
 * Weather and terrain-cover sentences for the combat paragraph.
 *
 * Purpose: Those sentences are long enough to stand apart from dice, movement, and reach.
 * When to use: `buildCombatRulesParagraph` after the tech or origin sentence, and before occupancy.
 * Expected outcome: Weather is five paragraphs when the bonus is on, and null when it is off. Cover is one sentence in both modes.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';
import type { OriginBonusSettings } from '../../../shared/originBonusTypes';
import type { PromptCoordinateMode } from './envelopeContract';
import {
  TACTICAL_WEATHER_BUDGET_CAP,
  WEATHER_ATTACK_PENALTY_BY_LEVEL,
  WEATHER_SLOWING_STATES,
  weatherBonusLevelOf,
} from '../../../shared/weatherBonusRules';
import {
  TERRAIN_COVER_BY_CATEGORY,
  URBAN_OR_RUBBLE_TERRAIN_COVER,
  type TerrainCoverPair,
  type TerrainCoverShooter,
} from '../../../shared/terrainCoverRules';
import type { TacticalMovementCategory } from '../../../shared/tacticalTerrainMovement';

/**
 * Joins names into an "or" list for prompt prose.
 *
 * Purpose: Weather and cover lists come from tables, so the sentence must read naturally for any number of names.
 * When to use: `buildWeatherRule` and `buildTerrainCoverRule`.
 * Expected outcome: `snow`, `snow or rain`, or `snow, rain, or heat`, in the order given.
 * Exceptions: None.
 */
function formatOrList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(' or ');
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

/**
 * Weather penalty sentence for a match that has the weather bonus on.
 *
 * Purpose: The model must know movement and attack are reduced, and that tags cancel the reduction.
 * When to use: Combat paragraph after the tech sentence, or after the origin sentence when tech is off.
 * Expected outcome: Null when the flag is off, so the combat rules stay unchanged. Otherwise five paragraphs: the date rule, the movement budgets, the attack penalties, the tag exemption, and the Weather column. The argument is only `originBonusSettings`, which `GameRuleTextGates` already carries, so this file does not import that gate type.
 * Exceptions: None.
 */
export function buildWeatherRule(gates: { readonly originBonusSettings: OriginBonusSettings }): string | null {
  const level = weatherBonusLevelOf(gates.originBonusSettings);
  logTrace('promptSpec buildWeatherRule', { level });
  if (gates.originBonusSettings.weatherBonusEnabled !== true || level === 'off') return null;
  const armor = formatOrList(WEATHER_SLOWING_STATES[level].armor ?? []);
  const naval = formatOrList(WEATHER_SLOWING_STATES[level].naval ?? []);
  const budget = TACTICAL_WEATHER_BUDGET_CAP[level];
  const penalty = WEATHER_ATTACK_PENALTY_BY_LEVEL[level];
  return [
    'Weather bonus is on: the date is on the turn line, weather changes when that date enters a new month, and every beat of a battle shares the enclosing hex\'s weather.',
    `Armor strategic movement is 1 in ${armor}, and naval strategic movement is 1 in ${naval}. ` +
      `In battle, armor's point budget is ${budget} in ${armor} and naval's is ${budget} in ${naval}; infantry pays 2 to enter open ground in snow or rain.`,
    `Armor ranged attack is ${penalty} lower in snow or heat, including return fire and air-strike counter-fire. ` +
      `An air strike is ${penalty} lower once when its base or its target is snow, rain, or heat the unit lacks. ` +
      'A strategic ferry into snow is 2 hexes.',
    'None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. ' +
      'Weather does not change defense, melee, or casualty order.',
    'The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.',
  ].join('\n\n');
}

/**
 * Prompt name for each terrain category in the cover sentence.
 *
 * Purpose: The cover table is keyed by plural movement categories; the prose uses the singular terrain words players see.
 * When to use: `terrainCoverPromptEntries` only.
 * Expected outcome: One word per category, so a category that gains cover later is named without a code change here.
 * Exceptions: None.
 */
const TERRAIN_COVER_PROMPT_NAME: Readonly<Record<TacticalMovementCategory, string>> = Object.freeze({
  plains: 'plains',
  forests: 'forest',
  mountains: 'mountain',
  wetlands: 'wetlands',
  desert: 'desert',
  arctic: 'arctic',
  coastal: 'coastal',
  water: 'water',
});

/**
 * Lists the named cover sources that exist in one mode.
 *
 * Purpose: Strategic hexes read only their dominant terrain kind; battle cells add urban and rubble.
 * When to use: `buildTerrainCoverRule` only.
 * Expected outcome: Terrain entries in table order, then urban and rubble in battle mode.
 * Exceptions: None.
 */
function terrainCoverPromptEntries(mode: PromptCoordinateMode): ReadonlyArray<{ readonly name: string; readonly pair: TerrainCoverPair }> {
  const terrain = (Object.keys(TERRAIN_COVER_BY_CATEGORY) as TacticalMovementCategory[]).map((category) => ({
    name: TERRAIN_COVER_PROMPT_NAME[category],
    pair: TERRAIN_COVER_BY_CATEGORY[category],
  }));
  if (mode !== 'tactical') return terrain;
  return [...terrain, { name: 'urban', pair: URBAN_OR_RUBBLE_TERRAIN_COVER }, { name: 'rubble', pair: URBAN_OR_RUBBLE_TERRAIN_COVER }];
}

/**
 * Writes one cover clause for one shooter column, largest cover first.
 *
 * Purpose: Groups sources that share a cover value so the sentence names each value once.
 * When to use: `buildTerrainCoverRule` only.
 * Expected outcome: `<lead> <place for the largest group> needs a roll N lower, or M lower for <names>.`; null when no source covers against this shooter.
 * Exceptions: None.
 */
function terrainCoverClause(input: {
  readonly entries: ReadonlyArray<{ readonly name: string; readonly pair: TerrainCoverPair }>;
  readonly shooter: TerrainCoverShooter;
  readonly lead: string;
  readonly place: (names: string) => string;
}): string | null {
  const namesByCover = new Map<number, string[]>();
  for (const { name, pair } of input.entries) {
    const cover = pair[input.shooter];
    if (cover > 0) namesByCover.set(cover, [...(namesByCover.get(cover) ?? []), name]);
  }
  const [top, ...rest] = [...namesByCover.entries()].sort(([a], [b]) => b - a);
  if (!top) return null;
  const [topCover, topNames] = top;
  const tail = rest.map(([cover, names]) => `, or ${cover} lower for ${formatOrList(names)}`).join('');
  return `${input.lead} ${input.place(formatOrList(topNames))} needs a roll ${topCover} lower${tail}.`;
}

/**
 * Terrain cover sentence for this mode.
 *
 * Purpose: Cover changes every ranged and air-strike hit number at covered targets, so the model must know where it applies and where it does not.
 * When to use: Combat paragraph right after the weather sentence; always included, because cover has no setting.
 * Expected outcome: Strategic text names hexes by main terrain; battle text names cells and adds urban and rubble. Values come from the cover tables.
 * Exceptions: None.
 */
export function buildTerrainCoverRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildTerrainCoverRule', { mode });
  const tactical = mode === 'tactical';
  const entries = terrainCoverPromptEntries(mode);
  const place = (names: string): string => (tactical ? `a ${names} cell` : `a hex whose main terrain is ${names}`);
  const clauses = [
    terrainCoverClause({ entries, shooter: 'surface', lead: 'ranged fire at', place }),
    terrainCoverClause({ entries, shooter: 'air', lead: 'An air strike on units in', place }),
  ].filter((clause): clause is string => clause !== null);
  const ignored = tactical
    ? 'Melee, return fire, anti-air fire, and shots at infrastructure ignore cover.'
    : 'Melee, return fire, anti-air fire, and strikes on infrastructure ignore cover. A city hex uses the higher of its terrain cover and city cover in each column. A rugged hex uses the higher of its terrain cover and rugged ground cover.';
  return `Terrain cover: ${[...clauses, ignored].join(' ')}`;
}
