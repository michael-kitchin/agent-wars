/**
 * Engine-fact sentences both consultation modes need: dice, stats, resolution order,
 * casualty sort, origin bonus, weather, terrain cover, occupancy, movement budgets, ranged reach, air employment, hold-fire,
 * production income, and intel staleness.
 *
 * Purpose: These facts used to live inline in the assembler or not at all. Every number
 * is read from the engine constant so a rules change fails the prompt test instead of
 * silently diverging.
 * When to use: Combat paragraph assembly, the production status block, and fog-on briefing copy.
 * Expected outcome: One wording per fact, gated by mode and roster where the spec requires it.
 * Exceptions: None.
 */

import {
  CASUALTY_PRIORITY_ORDER,
  getAttack,
  getDefense,
  getMovementBudget,
  getRange,
} from '../../combatConstants';
import { buildTechBonusRule } from './gameRuleTechText';
import { STALE_INTEL_TURNS } from '../../gameDb/fogState';
import { logDebug, logTrace } from '../../logger';
import { isMissileUnitType } from '../../../shared/missileRules';
import { ALL_BUILD_UNIT_TYPES } from '../../../shared/ipc/productionTypes';
import { BUILD_PREREQUISITES_BY_TYPE } from '../../productionRules';
import { buildMinimumUrbanCells, unitCostFor } from '../../../shared/gameRules';
import { NAVAL_MOVEMENT_PROMPT_RULE } from '../../navalMovementMessages';
import {
  AIR_FERRY_RANGE_HEXES,
  AIR_STRIKE_RANGE_HEXES,
  MOVEMENT_RANGE_BY_UNIT_TYPE,
  RANGED_RANGE_BY_UNIT_TYPE,
} from '../../../shared/tacticalRanges';
import {
  TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER,
  TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER,
} from '../../../shared/tacticalTransportLink';
import { originHitBonusForSource } from '../../../shared/originBonusRules';
import { TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE } from '../../../shared/terrainBonusMarch';
import type { OriginBonusSettings } from '../../../shared/originBonusTypes';
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
import { COMBAT_DIE_SIDES, MAX_HIT_THRESHOLD, MIN_ATTACK_HIT_THRESHOLD } from '../../combatDice';
import { buildMissileEmploymentRule, MISSILE_CASUALTY_ORDER_SENTENCE } from './gameRuleMissileText';
import { buildFortificationProductionRulePart, buildFortificationRule } from './gameRuleFortificationText';
import type { PromptCoordinateMode } from './envelopeContract';

/**
 * Roster and tool flags that choose optional combat-rule clauses.
 *
 * Purpose: The combat paragraph must not teach air, naval, or hold-fire rules the consultation cannot use.
 * When to use: Passed to `buildCombatRulesParagraph` and `buildAirEmploymentRule`.
 * Expected outcome: Clauses appear only when their gate is true.
 * Exceptions: None.
 */
export interface GameRuleTextGates {
  /**
   * Strategic turn versus tactical beat.
   *
   * Contract: Selects period nouns, reach tables, movement budgets, and whether production exists in the order.
   * When to use: Set from the same `coordinateContext.mode` as the rest of the prompt.
   * Expected outcome: `'strategic'` or `'tactical'`.
   * Exceptions: None.
   */
  readonly coordinateMode: PromptCoordinateMode;
  /**
   * Whether the opponent roster includes an air unit (or air sub-unit).
   *
   * Contract: Air employment and the air-strike tempo wording apply only when a unit could use them.
   * When to use: Set from the opponent roster the assembler already inspected.
   * Expected outcome: False omits air radius and ferry text.
   * Exceptions: None.
   */
  readonly hasAirUnits: boolean;
  /**
   * Whether the opponent roster includes a naval unit (or naval sub-unit).
   *
   * Contract: Naval movement and land-target fire apply only when a unit could use them.
   * When to use: Set from the opponent roster the assembler already inspected.
   * Expected outcome: False omits the naval clause.
   * Exceptions: None.
   */
  readonly hasNavalUnits: boolean;
  /**
   * Whether the roster includes a missile.
   *
   * Contract: Omitted means false.
   * When to use: Set from the opponent roster the assembler already inspected.
   * Expected outcome: False omits the missile employment sentence.
   * Exceptions: None.
   */
  readonly hasMissileUnits?: boolean;
  /**
   * Whether the battle being briefed has a fortified cell.
   *
   * Contract: Omitted means false.
   * When to use: Set from the tactical battle's fortification owner record.
   * Expected outcome: False omits the tactical fortification sentence. Strategic text does not read this flag.
   * Exceptions: None.
   */
  readonly hasFortifiedCells?: boolean;
  /**
   * Whether standing-order tools are enabled for this consultation.
   *
   * Contract: Hold-fire can only be issued as a standing order, so a prompt without that group must not teach it.
   * When to use: Set from `getToolFlags().ordersEnabled`.
   * Expected outcome: False omits the hold-fire sentence from the combat paragraph.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
  /**
   * Origin bonus flags chosen at new-game time.
   *
   * Contract: The origin bonus sentence appears only when a flag that applies in this mode is on.
   * When to use: Set from `originBonusSettingsFromSnapshot` on the same snapshot the briefing uses.
   * Expected outcome: `ORIGIN_BONUS_OFF` omits the sentence.
   * Exceptions: None.
   */
  readonly originBonusSettings: OriginBonusSettings;
}

/**
 * Period noun used in combat sentences.
 *
 * Purpose: Strategic copy says "turn"; tactical copy says "beat".
 * When to use: Inside the builders in this module.
 * Expected outcome: `'turn'` or `'beat'`.
 * Exceptions: None.
 */
function periodNoun(mode: PromptCoordinateMode): 'turn' | 'beat' {
  return mode === 'tactical' ? 'beat' : 'turn';
}

/**
 * Per-type attack, defense, and reach clause for the combat stats sentence.
 *
 * Purpose: Reach wording differs by mode: strategic uses `getRange`, tactical uses the tactical table,
 * and air in battle is "anywhere" rather than a number.
 * When to use: Inside `buildCombatStatsLine`.
 * Expected outcome: `, range N`, `, melee only`, or `, strike anywhere in the battle`.
 * Exceptions: None.
 */
function formatReachClause(unitType: string, mode: PromptCoordinateMode): string {
  if (mode === 'tactical') {
    if (unitType === 'air') return ', strike anywhere in the battle';
    const reach = RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0;
    return reach >= 1 ? `, range ${reach}` : ', melee only';
  }
  const reach = getRange(unitType);
  return reach >= 1 ? `, range ${reach}` : ', melee only';
}

/**
 * Dice model plus per-type attack, defense, and reach.
 *
 * Purpose: strategic-prompt.md section 1.5 items 1–2. The model cannot choose a target without the stats.
 * When to use: First clause of `buildCombatRulesParagraph`.
 * Expected outcome: The "Combat: d20 per shot" sentence with the hit-number floor, the cap, and engine stats interpolated; air is omitted when `hasAirUnits` is false.
 * Exceptions: None.
 */
export function buildCombatStatsLine(mode: PromptCoordinateMode, hasAirUnits = true): string {
  logDebug('promptSpec buildCombatStatsLine', { mode, hasAirUnits });
  const types = (hasAirUnits ? ALL_BUILD_UNIT_TYPES : ALL_BUILD_UNIT_TYPES.filter((unitType) => unitType !== 'air'))
    .filter((unitType) => !isMissileUnitType(unitType));
  const summary = types.map(
    (unitType) =>
      `${unitType}: ${getAttack(unitType)} attack / ${getDefense(unitType)} defense${formatReachClause(unitType, mode)}`
  ).join('; ');
  return (
    `Combat: d${COMBAT_DIE_SIDES} per shot — an attack hits on a roll at or below its attack value and a defensive melee roll hits at or below its defense value, after the changes below. ` +
    `Penalties and cover never lower an attack value below ${MIN_ATTACK_HIT_THRESHOLD} before bonuses, and no value exceeds ${MAX_HIT_THRESHOLD}. ${summary}.`
  );
}

/**
 * Names the resolution stages in engine order.
 *
 * Purpose: The model cannot reason about firing then closing, ferry arriving after ground movement,
 * or cargo remaining on the transport until sync, from "ranged uses pre-move positions" alone.
 * When to use: Combat paragraph after the casualty rule.
 * Expected outcome: Strategic names embark, missile launches, air strikes, ranged fire, movement, cargo sync, ferry, then melee. Tactical omits missile launches, puts cargo sync after ferry, and notes that the beat has no production.
 * Exceptions: None.
 */
export function buildResolutionOrderRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildResolutionOrderRule', { mode });
  if (mode === 'tactical') {
    return `This beat resolves as embark, then air strikes, then ranged fire, then movement, then ferry, then cargo sync, then melee, with no production step.`;
  }
  return 'This turn resolves as embark, then missile launches, then air strikes, then ranged fire, then movement, then cargo sync, then ferry, then melee.';
}

/**
 * Hits land on the lowest-defense defender first, then the engine type order.
 *
 * Purpose: Firing into a stack removes its weakest unit. The type sequence is `CASUALTY_PRIORITY_ORDER`.
 * When to use: Combat paragraph after the stats line.
 * Expected outcome: Mentions lowest defence and lists the imported type order.
 * Exceptions: None.
 */
export function buildCasualtySortRule(): string {
  logTrace('promptSpec buildCasualtySortRule', {});
  return `Hits land on the lowest-defense unit in the target stack first, then in the fixed type order ${CASUALTY_PRIORITY_ORDER.join(', ')}. ${MISSILE_CASUALTY_ORDER_SENTENCE}`;
}

/**
 * Origin bonus sentence for the flags that apply in this mode.
 *
 * Purpose: With a flag on, units roll better at home; the model must know this to weigh fights and estimates.
 * When to use: Combat paragraph right after the casualty rule.
 * Expected outcome: Null when no flag applies (terrain alone does nothing on the strategic map); otherwise the
 * applicable clauses, each stating that bonus's level amount, the no-stacking note with the larger amount when both
 * apply, the air base note when air exists, and the unchanged casualty order. The tactical terrain clause also carries
 * `TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE`.
 * Exceptions: None.
 */
export function buildOriginBonusRule(gates: GameRuleTextGates): string | null {
  logTrace('promptSpec buildOriginBonusRule', { ...gates });
  const { originBonusEnabled, terrainBonusEnabled } = gates.originBonusSettings;
  const tactical = gates.coordinateMode === 'tactical';
  const terrainApplies = tactical && terrainBonusEnabled;
  if (!originBonusEnabled && !terrainApplies) return null;
  const place = tactical ? 'cell' : 'hex';
  const onPlace = tactical ? 'on a cell' : 'in a hex';
  const originAmount = originHitBonusForSource(gates.originBonusSettings, 'origin');
  const terrainAmount = originHitBonusForSource(gates.originBonusSettings, 'terrain');
  const rollClause = (amount: number): string => `adds ${amount} to every attack or defense value it rolls there`;
  const parts: string[] = [];
  if (originBonusEnabled) {
    const strategicDetail = tactical
      ? ''
      : ', including ranged fire, return fire, melee, and air-strike counter-fire';
    parts.push(
      `Origin bonus is on: a unit ${onPlace} in the area where it was built ${rollClause(originAmount)}${strategicDetail}. ` +
        'That area is its birth country in a global game and its origin area in a regional game.'
    );
  }
  if (terrainApplies) {
    parts.push(
      `Terrain bonus is on: a unit on a cell whose terrain kind matches its birth terrain kind ${rollClause(terrainAmount)}; urban and rubble do not change a cell's terrain kind. ${TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE}`
    );
  }
  if (originBonusEnabled && terrainApplies) {
    parts.push(`The two bonuses do not stack; the most is +${Math.max(originAmount, terrainAmount)}.`);
  }
  if (gates.hasAirUnits) parts.push(`An air unit qualifies by the ${place} of its base, whatever it strikes.`);
  parts.push('Casualty order still uses the printed defense values.');
  return parts.join(' ');
}

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
 * Expected outcome: Null when the flag is off, so the paragraph stays unchanged. Otherwise the slowing weather, the
 * battle budget cap, and the attack penalty for the match's level, read from the weather rule tables.
 * Exceptions: None.
 */
export function buildWeatherRule(gates: GameRuleTextGates): string | null {
  const level = weatherBonusLevelOf(gates.originBonusSettings);
  logTrace('promptSpec buildWeatherRule', { level });
  if (gates.originBonusSettings.weatherBonusEnabled !== true || level === 'off') return null;
  const armor = formatOrList(WEATHER_SLOWING_STATES[level].armor ?? []);
  const naval = formatOrList(WEATHER_SLOWING_STATES[level].naval ?? []);
  const budget = TACTICAL_WEATHER_BUDGET_CAP[level];
  const penalty = WEATHER_ATTACK_PENALTY_BY_LEVEL[level];
  return (
    'Weather bonus is on: the date is on the turn line, weather changes when that date enters a new month, and every beat of a battle shares the enclosing hex\'s weather. ' +
    `Armor strategic movement is 1 in ${armor}, and naval strategic movement is 1 in ${naval}. ` +
    `In battle, armor's point budget is ${budget} in ${armor} and naval's is ${budget} in ${naval}; infantry pays 2 to enter open ground in snow or rain. ` +
    `Armor ranged attack is ${penalty} lower in snow or heat, including return fire and air-strike counter-fire. ` +
    `An air strike is ${penalty} lower once when its base or its target is snow, rain, or heat the unit lacks. ` +
    'A strategic ferry into snow is 2 hexes. ' +
    'None of these penalties applies to a unit tagged for that weather; a tag is earned by the birth hex. ' +
    'Weather does not change defense, melee, or casualty order. ' +
    'The Unit Status Weather column names the weather where that unit stands. Birth tags, when the unit has any, follow in parentheses.'
  );
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

/**
 * Friendly stacking is legal; enemy cells are move/melee contact; approach omits stay-put stacks.
 *
 * Purpose: Best Options lists enemy-occupied cells as move/melee dests the engine will accept. Friendly stacking
 * is legal in both modes; approach rows omit stay-put friendlies so closing dests are not crowded by idle stacks,
 * but a cell a friendly is leaving this period is listed.
 * When to use: Combat paragraph after movement budgets.
 * Expected outcome: Stacking-legal sentence plus enemy contact and stay-put vs leaving coaching, identical in both modes.
 * Exceptions: None.
 */
export function buildDestinationOccupancyRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildDestinationOccupancyRule', { mode });
  return 'Friendly units may stack on the same cell. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes omit stay-put friendlies; a cell a friendly is leaving this period is a legal dest.';
}

/**
 * Infantry and armor enter costs for an intact line, a roadless urban cell, and rubble.
 *
 * Purpose: The combat paragraph and the tactical coaching bullet must state the same enter costs.
 * When to use: From `buildMovementBudgetRule` and `REACH_BULLET`.
 * Expected outcome: The line-entry sentence refers to the intact road or rail cell, which may be terrain the unit could not otherwise enter. Rubble does not open blocked terrain.
 * Exceptions: None.
 */
export function tacticalLandEnterCostRule(): string {
  logTrace('promptSpec tacticalLandEnterCostRule', {});
  return (
    `Entering an intact road cell costs 1/${TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER} point and an intact rail cell costs 1/${TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER} point, for every terrain, for infantry and armor. ` +
    'That cell may be entered from a neighbor that is not on the line, including terrain the unit could not otherwise enter, and a blocked line cell may be left only onto terrain the unit can enter without a line or onto another intact line cell. ' +
    'Entering an urban cell with no road or rail costs 1. ' +
    'Rubble with no road or rail costs 2. Rubble on a road or rail costs 1 where the unit could already enter, and does not open blocked terrain.'
  );
}

/**
 * Per-type movement budget for this consultation mode.
 *
 * Purpose: Multi-turn and intra-beat reach cannot be judged from the options table alone.
 * When to use: Combat paragraph after the infantry reach clause.
 * Expected outcome: Strategic cell counts from `getMovementBudget` are clear-weather counts. A lower number applies only when the weather sentence states one for a unit that lacks that weather. An over-budget strategic explicit move is dropped. Tactical type numbers are the clear-weather point baselines from `MOVEMENT_RANGE_BY_UNIT_TYPE`; the weather sentence, when the bonus is on, states any lower budget. Origin urban/rubble collapse and enter costs for an intact line, a roadless urban cell, and rubble follow. The line-entry sentence refers to the road or rail cell. A tactical destination past the beat budget is clamped to the first reachable leg.
 * Exceptions: None.
 */
export function buildMovementBudgetRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildMovementBudgetRule', { mode });
  if (mode === 'tactical') {
    return (
      `Clear of weather, the point budget is ${MOVEMENT_RANGE_BY_UNIT_TYPE.infantry} points for infantry, ` +
      `${MOVEMENT_RANGE_BY_UNIT_TYPE.armor} for armor, ${MOVEMENT_RANGE_BY_UNIT_TYPE.naval} for naval, and air does not march. ` +
      'Infantry or armor whose current cell is urban or rubble has a 1-point budget this beat, not the type baseline. ' +
      'Armor in forest is penalised to the infantry baseline. ' +
      `${tacticalLandEnterCostRule()} ` +
      'A non-air unit always retains at least one point. ' +
      "A destination beyond this beat's budget is clamped to the first reachable leg rather than rejected; when the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step instead."
    );
  }
  return (
    `Movement budgets in clear weather: ${getMovementBudget('infantry')} cell for infantry, ` +
    `${getMovementBudget('armor')} for armor and naval, and air never marches. ` +
    "When the weather sentence states a lower budget for a unit that lacks that weather, that lower number is this turn's budget. " +
    'Armor that enters a rugged, arctic, or city hex ends its move there. Armor already on that hex may leave. ' +
    'A longer route continues on the next turn, and the turn count includes that halt. ' +
    "An explicit_move farther than this turn's budget is dropped, not shortened to the first step."
  );
}

/**
 * Infantry (and mode-specific) ranged reach, including tactical terrain caps and mountain LOS.
 *
 * Purpose: Strategic infantry is melee-only. Tactical infantry and armor have tactical baselines; forest, urban, or rubble caps infantry and armor to 1; a mountain between the shooter and the target blocks armor and naval.
 * When to use: Combat paragraph after the one-attack-per-unit clause.
 * Expected outcome: Strategic melee-only sentence, or tactical baselines plus the engine cap and LOS rules.
 * Exceptions: None.
 */
export function buildRangedReachRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildRangedReachRule', { mode });
  if (mode === 'tactical') {
    return (
      `Infantry and armor fire at their tactical baselines (infantry ${RANGED_RANGE_BY_UNIT_TYPE.infantry}, armor ${RANGED_RANGE_BY_UNIT_TYPE.armor}); ` +
      'forest, urban, or rubble on the attacker\'s cell caps infantry and armor to range 1. ' +
      'A mountain cell between the shooter and the target blocks armor and naval shots. The cell the shooter stands on and the target cell do not. Infantry is exempt. Air strikes and ferry are not blocked by mountains. ' +
      'Close to melee when out of range.'
    );
  }
  return 'Infantry has no strategic ranged_attack (melee only); use movement and melee.';
}

/**
 * Strike and ferry limits for air units, or empty when the roster has none.
 *
 * Purpose: Strategic radius comes from `AIR_STRIKE_RANGE_HEXES` / `AIR_FERRY_RANGE_HEXES`; a beat strikes anywhere in the footprint.
 * When to use: Combat paragraph when `hasAirUnits` is true; also asserted on its own.
 * Expected outcome: Tactical text never quotes the strategic strike radius.
 * Exceptions: None.
 */
export function buildAirEmploymentRule(gates: GameRuleTextGates): string {
  logTrace('promptSpec buildAirEmploymentRule', { ...gates });
  if (!gates.hasAirUnits) return '';
  if (gates.coordinateMode === 'tactical') {
    return 'An air unit may strike anywhere in the battle or ferry to an intact airport cell in the footprint; the strategic strike radius and 4-cell ferry hop do not apply. It cannot strike and ferry in the same beat.';
  }
  return (
    `An air unit may strike a target within ${AIR_STRIKE_RANGE_HEXES} cells of its base (strike radius of ${AIR_STRIKE_RANGE_HEXES}) ` +
    `and may ferry up to ${AIR_FERRY_RANGE_HEXES} cells. It cannot strike and ferry in the same turn.`
  );
}

/**
 * What a fire-withholding standing order does, and what omitting an attack does not do.
 *
 * Purpose: `hold_fire` is listed as a legal order with no other explanation today.
 * When to use: Combat paragraph only when standing-order tools are enabled; also as a coaching item.
 * Expected outcome: Suppresses automatic engagement until replaced; leaving a unit without an attack is not the same.
 * Exceptions: None.
 */
export function buildHoldFireRule(): string {
  logTrace('promptSpec buildHoldFireRule', {});
  return 'A unit that should not engage is given a fire-withholding standing order, which suppresses automatic engagement for that unit until replaced. Leaving a unit without an attack is not the same as ordering it to hold fire.';
}

/**
 * How a controlled cell earns and spends production points.
 *
 * Purpose: Caps and costs are already printed; without income the model cannot tell a cheap queue from an unaffordable one.
 * When to use: Production status block, after current counts and before the maxed-type list.
 * Expected outcome: Urban count becomes points each turn; spend is in queue order.
 * Exceptions: None.
 */
export function buildProductionIncomeRule(): string {
  logTrace('promptSpec buildProductionIncomeRule', {});
  return 'A controlled cell earns production points equal to its urban count each turn and spends them in queue order.';
}

/**
 * Unit costs and build prerequisites interpolated from the engine tables.
 *
 * Purpose: The production status block must not retype costs or urban minima as literals.
 * When to use: Production Status rules line.
 * Expected outcome: Each buildable type names its cost from `unitCostFor` and its urban minimum from `buildMinimumUrbanCells`. Seaport minimums come from `BUILD_PREREQUISITES_BY_TYPE`. Air also requires an airport.
 * Exceptions: None.
 */
export function buildProductionCostRulesLine(): string {
  logTrace('promptSpec buildProductionCostRulesLine', {});
  const parts = ALL_BUILD_UNIT_TYPES.map((unitType) => {
    const cost = unitCostFor(unitType);
    const req = BUILD_PREREQUISITES_BY_TYPE[unitType];
    const extras: string[] = [`min urban ${buildMinimumUrbanCells(unitType)}`];
    if (req.minSeaports > 0) extras.push(`min seaports ${req.minSeaports}`);
    if (unitType === 'air') extras.push('requires airport');
    return `${unitType} cost ${cost} (${extras.join(' + ')})`;
  });
  return `Rules: ${parts.join(', ')}. ${buildFortificationProductionRulePart()}.`;
}

/**
 * How long a last-known enemy position remains on the briefing after contact is lost.
 *
 * Purpose: Fog-on nearest-enemy cells show a last-seen turn with no window, so the model cannot tell current from expired.
 * When to use: Strategic briefing next to the other fog wording, only when fog is on.
 * Expected outcome: Quotes `STALE_INTEL_TURNS` and states that older reports are dropped, not shown as old.
 * Exceptions: None.
 */
export function buildIntelStalenessRule(): string {
  logTrace('promptSpec buildIntelStalenessRule', {});
  return `A last-known enemy position is a report with an age; a report older than ${STALE_INTEL_TURNS} turns is dropped rather than shown as old.`;
}

/**
 * Naval fire, movement domain, and land-target routing.
 *
 * Purpose: strategic-prompt.md section 1.5 item 14. Reach is `getRange('naval')`, not a copied numeral.
 * When to use: Combat paragraph when `hasNavalUnits` is true.
 * Expected outcome: Fire within engine range, water/coastal movement, route to the nearest water or coastal cell.
 * Exceptions: None.
 */
function buildNavalClause(mode: PromptCoordinateMode): string {
  const navalRange = getRange('naval');
  const period = periodNoun(mode);
  return (
    ` Naval units fire on land targets within ${navalRange} cells (range ${navalRange}). ` +
    `Add ranged_attack when a naval unit is within ${navalRange} cells of an enemy at ${period} start. ` +
    `${NAVAL_MOVEMENT_PROMPT_RULE} To engage a land target, move to the nearest water or coastal cell within range.`
  );
}

/**
 * One-attack-per-unit and target-field constraints, plus the period-start tempo sentence.
 *
 * Purpose: One attack per unit, the reach sentence, and the Best Options tempo sentence. Air-strike wording joins that sentence only when air is present.
 * When to use: Inside `buildCombatRulesParagraph`.
 * Expected outcome: Existing targetHexCode/targetUnitId wording, a tempo clause that copies listed Best Options rows, and the "does not prevent movement" fact.
 * Exceptions: None.
 */
function buildAttackConstraintsClause(gates: GameRuleTextGates): string {
  const period = periodNoun(gates.coordinateMode);
  const listedRows = gates.hasAirUnits ? 'ranged or air-strike row' : 'ranged row';
  const tempo =
    `Copy each ${listedRows} that Best Options This Turn lists for that unit, and choose among those listed rows. ` +
    `Do not invent a target the table does not list. Those attacks resolve from ${period}-start positions and do not prevent movement in the same ${period}.`;
  return (
    `At most one ranged_attack per unit from ${period}-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId (not your move destination). ` +
    `${buildRangedReachRule(gates.coordinateMode)} ${tempo} Drop invalid attacks before submit.`
  );
}

/**
 * Composes the combat-and-attack-rules paragraph for this consultation.
 *
 * Purpose: Replaces the inline `Combat: ...` template in `buildSystemPromptForTools` so every clause
 * has one home. Clause order follows strategic-prompt.md section 1.5, with tactical substitutions from 2.5.
 * When to use: Once per assembled system prompt, after roster and tool flags are known.
 * Expected outcome: Hold-fire only when `ordersEnabled`; air and naval clauses only when those units exist;
 * the origin bonus sentence only when a flag applies in this mode; the tech sentence only when that option is on, between origin and weather; the terrain cover sentence always, after weather.
 * Exceptions: None.
 */
export function buildCombatRulesParagraph(gates: GameRuleTextGates): string {
  logDebug('promptSpec buildCombatRulesParagraph', { ...gates });
  const originBonus = buildOriginBonusRule(gates);
  const techBonus = buildTechBonusRule(gates.originBonusSettings);
  const weatherRule = buildWeatherRule(gates);
  const parts: string[] = [
    buildCombatStatsLine(gates.coordinateMode, gates.hasAirUnits),
    buildCasualtySortRule(),
    ...(originBonus ? [originBonus] : []),
    ...(techBonus ? [techBonus] : []),
    ...(weatherRule ? [weatherRule] : []),
    buildTerrainCoverRule(gates.coordinateMode),
    buildResolutionOrderRule(gates.coordinateMode),
    'Ranged uses pre-move positions.',
    buildAttackConstraintsClause(gates),
    buildMovementBudgetRule(gates.coordinateMode),
    buildDestinationOccupancyRule(gates.coordinateMode),
  ];
  if (gates.hasNavalUnits) {
    parts.push(buildNavalClause(gates.coordinateMode).trim());
  }
  const air = buildAirEmploymentRule(gates);
  if (air) parts.push(air);
  const missile = buildMissileEmploymentRule(gates);
  if (missile) parts.push(missile);
  const fortification = buildFortificationRule(gates);
  if (fortification) parts.push(fortification);
  if (gates.ordersEnabled) parts.push(buildHoldFireRule());
  return parts.join(' ');
}
