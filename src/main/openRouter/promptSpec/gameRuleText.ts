/**
 * Engine-fact sentences both consultation modes need: dice, stats, resolution order,
 * casualty sort, origin bonus, occupancy, movement budgets, ranged reach, air employment, hold-fire,
 * production income, and intel staleness. Weather and terrain cover are re-exported from `gameRuleEnvironmentText`.
 *
 * Purpose: These facts used to live inline in the assembler or not at all. Every number
 * is read from the engine constant so a rules change fails the prompt test instead of
 * silently diverging.
 * When to use: The Rules section, including Production and the intel-age sentence the reading guide quotes.
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
import { subHeading } from './sectionHeadings';
import {
  SECTION_TITLE_AIR_UNITS,
  SECTION_TITLE_BONUSES,
  SECTION_TITLE_COMBAT,
  SECTION_TITLE_FORTIFICATIONS,
  SECTION_TITLE_HOLDING_FIRE,
  SECTION_TITLE_MISSILES,
  SECTION_TITLE_MOVEMENT,
  SECTION_TITLE_NAVAL_UNITS,
  SECTION_TITLE_PRODUCTION,
  SECTION_TITLE_RESOLUTION_ORDER,
  SECTION_TITLE_RULE_LOOKUP,
  SECTION_TITLE_TERRAIN_COVER,
  SECTION_TITLE_WEATHER,
} from './subsectionHeadings';
import { isMissileUnitType } from '../../../shared/missileRules';
import { ALL_BUILD_UNIT_TYPES, type BuildUnitType } from '../../../shared/ipc/productionTypes';
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
import { strategicFerryRangeHexes } from '../../../shared/weatherBonusRules';
import { TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE } from '../../../shared/terrainBonusMarch';
import type { OriginBonusSettings } from '../../../shared/originBonusTypes';
import { buildTerrainCoverRule, buildWeatherRule } from './gameRuleEnvironmentText';
import { COMBAT_DIE_SIDES, MAX_HIT_THRESHOLD, MIN_ATTACK_HIT_THRESHOLD } from '../../combatDice';
import { buildMissileEmploymentRule, MISSILE_CASUALTY_ORDER_SENTENCE } from './gameRuleMissileText';
import { buildFortificationProductionRulePart, buildFortificationRule } from './gameRuleFortificationText';
import { buildBuildabilityRule, buildCreditsProductionRulePart } from './gameRuleMercenaryText';
import type { PromptCoordinateMode } from './envelopeContract';

export { buildTerrainCoverRule, buildWeatherRule };

/**
 * Roster and tool flags that choose optional combat-rule clauses.
 *
 * Purpose: The combat paragraph must not teach air, naval, or hold-fire rules the consultation cannot use.
 * When to use: Passed to `buildRulesSections` and `buildAirEmploymentRule`.
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
  /**
   * Whether this consultation's map has weather the rules must explain.
   *
   * Contract: Omitted includes the weather text when the bonus is on. False omits it.
   * When to use: Tactical when the battle weather is not mild. Strategic when some hex is not mild, or a hex has no weather.
   * Expected outcome: False returns no weather paragraph and the briefing hides the Weather column.
   * Exceptions: None.
   */
  readonly weatherApplies?: boolean;
  /**
   * Whether the armor and wetlands-naval terrain-entry sentence applies.
   *
   * Contract: Omitted includes the sentence. False omits only that sentence, not the terrain-bonus dice clause.
   * When to use: The consulted side has armor, or naval whose birth terrain grants the entry. Unknown birth includes it.
   * Expected outcome: The movement sentence is absent when this is false.
   * Exceptions: None.
   */
  readonly includeArmorTerrainEntry?: boolean;
  /**
   * Whether a mountain between shooter and target can block a shot.
   *
   * Contract: Omitted includes the sentence. False omits it. Infantry baselines and the range-1 cap stay.
   * When to use: Either side has armor or naval.
   * Expected outcome: The mountain line-of-sight sentence is absent when this is false.
   * Exceptions: None.
   */
  readonly includeMountainLineOfSight?: boolean;
  /**
   * Unit types named on the tactical combat-stats line.
   *
   * Contract: Omitted or empty prints every non-missile type, with air still gated by `hasAirUnits`.
   * When to use: Tactical consultations, from the types present on either side.
   * Expected outcome: The stats line names only these types.
   * Exceptions: None.
   */
  readonly tacticalTypesPresent?: readonly string[];
  /**
   * Whether any unit on either side is a missile.
   *
   * Contract: Omitted includes the hit-last sentence. False omits it.
   * When to use: Set from the roster. Unknown includes the sentence.
   * Expected outcome: The casualty rule does not say missiles are hit last when this is false.
   * Exceptions: None.
   */
  readonly includeMissileCasualty?: boolean;
  /**
   * Whether the fortification combat rule applies.
   *
   * Contract: Omitted keeps today's rule: strategic always, tactical only when `hasFortifiedCells`.
   * When to use: Tactical from the battle's fortified cells. Strategic when production is on or a hex is fortified. Unknown includes it.
   * Expected outcome: False omits the paragraph. True includes the paragraph for this mode.
   * Exceptions: None.
   */
  readonly includeFortificationRule?: boolean;
  /**
   * Whether the consulted side has an air unit the weather sentence should name.
   *
   * Contract: Omitted includes the air-strike weather sentence. False omits that sentence only.
   * When to use: The consulted side has air. Unknown includes the sentence.
   * Expected outcome: The air-strike penalty sentence is absent when this is false.
   * Exceptions: None.
   */
  readonly includeWeatherAirSentence?: boolean;
  /**
   * Extra clause inserted after `targetUnitId` in the attack-constraint sentence.
   *
   * Contract: Omitted means empty. The assembler passes the estimate-combat hint when that tool is the way to pick a target.
   * When to use: `buildSystemPromptForTools` when estimation tools are on and no briefing is attached.
   * Expected outcome: The hint, including its leading space, sits before the period. Empty leaves `targetUnitId.`
   * Exceptions: None.
   */
  readonly rangedTargetHint?: string;
  /**
   * Land-target plan_route hint for a naval side.
   *
   * Contract: Omitted or blank adds nothing. Printed after the naval clause.
   * When to use: Planning tools are on and the side has a naval unit.
   * Expected outcome: The hint is the second paragraph of Naval Units.
   * Exceptions: None.
   */
  readonly navalPlanRouteHint?: string;
  /**
   * Attack hint used when no briefing lists the shot.
   *
   * Contract: Omitted or blank adds nothing. It is not a combat-stats sentence.
   * When to use: Assessment tools are on, a ranged unit exists, and the briefing was not precomputed.
   * Expected outcome: The hint is the last paragraph of Combat.
   * Exceptions: None.
   */
  readonly extraCombatText?: string;
  /**
   * Turn-invariant production paragraphs.
   *
   * Contract: Omitted or empty omits the Production subsection.
   * When to use: Strategic consultations with production on. Pass `buildProductionRulesParagraphs`.
   * Expected outcome: Those paragraphs, in order, under Production.
   * Exceptions: None.
   */
  readonly productionRules?: readonly string[];
  /**
   * Pointer to the rules tool.
   *
   * Contract: Omitted or blank omits Rule Lookup.
   * When to use: The rules tool is in the enabled set.
   * Expected outcome: One paragraph under Rule Lookup.
   * Exceptions: None.
   */
  readonly rulesPointer?: string;
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
 * When to use: First clause of `buildRulesSections`.
 * Expected outcome: The "Combat: d20 per shot" sentence with the hit-number floor, the cap, and engine stats interpolated. Air is omitted when `hasAirUnits` is false. A non-empty tactical type list names only those types.
 * Exceptions: None.
 */
export function buildCombatStatsLine(
  mode: PromptCoordinateMode,
  hasAirUnits = true,
  tacticalTypesPresent: readonly string[] = []
): string {
  logDebug('promptSpec buildCombatStatsLine', { mode, hasAirUnits, tacticalTypeCount: tacticalTypesPresent.length });
  const unrestricted = hasAirUnits ? ALL_BUILD_UNIT_TYPES : ALL_BUILD_UNIT_TYPES.filter((unitType) => unitType !== 'air');
  const narrowed = mode === 'tactical' && tacticalTypesPresent.length > 0
    ? ALL_BUILD_UNIT_TYPES.filter((unitType) => tacticalTypesPresent.includes(unitType))
    : unrestricted;
  const types = (narrowed.length > 0 ? narrowed : unrestricted).filter((unitType) => !isMissileUnitType(unitType));
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
 * Expected outcome: Both theaters name air drops immediately after air strikes. Strategic names embark, missile launches, air strikes, air drops, ranged fire, movement, ferry, cargo sync, then melee. Tactical omits missile launches and notes that the beat has no production.
 * Exceptions: None.
 */
export function buildResolutionOrderRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildResolutionOrderRule', { mode });
  if (mode === 'tactical') {
    return `This beat resolves as embark, then air strikes, then air drops, then ranged fire, then movement, then ferry, then cargo sync, then melee, with no production step.`;
  }
  return 'This turn resolves as embark, then missile launches, then air strikes, then air drops, then ranged fire, then movement, then ferry, then cargo sync, then melee.';
}

/**
 * Hits land on the lowest-defense defender first, then the engine type order.
 *
 * Purpose: Firing into a stack removes its weakest unit. The type sequence is `CASUALTY_PRIORITY_ORDER`.
 * When to use: Combat paragraph after the stats line.
 * Expected outcome: Mentions lowest defence and lists the imported type order.
 * Exceptions: None.
 */
export function buildCasualtySortRule(
  /**
   * When false, the hit-last sentence is omitted.
   *
   * Contract: Omitted includes it.
   * When to use: Pass false when neither side has a missile.
   * Expected outcome: The type-order sentence, plus the missile sentence unless this is false.
   * Exceptions: None.
   */
  includeMissileCasualty = true
): string {
  logTrace('promptSpec buildCasualtySortRule', { includeMissileCasualty });
  const order = `Hits land on the lowest-defense unit in the target stack first, then in the fixed type order ${CASUALTY_PRIORITY_ORDER.join(', ')}.`;
  return includeMissileCasualty ? `${order} ${MISSILE_CASUALTY_ORDER_SENTENCE}` : order;
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
    const entry = gates.includeArmorTerrainEntry === false ? '' : ` ${TERRAIN_BONUS_MOVEMENT_PROMPT_SENTENCE}`;
    parts.push(
      `Terrain bonus is on: a unit on a cell whose terrain kind matches its birth terrain kind ${rollClause(terrainAmount)}; urban and rubble do not change a cell's terrain kind.${entry}`
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
 * Expected outcome: Strategic cell counts from `getMovementBudget` are clear-weather counts. A lower number applies only when the weather sentence states one for a unit that lacks that weather. An over-budget strategic explicit move becomes a standing march when `standingOrdersEnabled` is true, and is dropped when it is false. Tactical type numbers are the clear-weather point baselines from `MOVEMENT_RANGE_BY_UNIT_TYPE`; the weather sentence, when the bonus is on, states any lower budget. Origin urban/rubble collapse and enter costs for an intact line, a roadless urban cell, and rubble follow. The line-entry sentence refers to the road or rail cell. A tactical destination past the beat budget is clamped to the first reachable leg. That shortened step is dropped when the sub-unit can already shoot, unless it enters an enemy cell.
 * Exceptions: None.
 */
export function buildMovementBudgetRule(mode: PromptCoordinateMode, standingOrdersEnabled: boolean): string {
  logTrace('promptSpec buildMovementBudgetRule', { mode, standingOrdersEnabled });
  if (mode === 'tactical') {
    return (
      `Clear of weather, the point budget is ${MOVEMENT_RANGE_BY_UNIT_TYPE.infantry} points for infantry, ` +
      `${MOVEMENT_RANGE_BY_UNIT_TYPE.armor} for armor, ${MOVEMENT_RANGE_BY_UNIT_TYPE.naval} for naval, and air does not march. ` +
      'Infantry or armor whose current cell is urban or rubble has a 1-point budget this beat, not the type baseline. ' +
      'Armor in forest is penalised to the infantry baseline. ' +
      `${tacticalLandEnterCostRule()} ` +
      'A non-air unit always retains at least one point. ' +
      "A destination beyond this beat's budget is clamped to the first reachable leg rather than rejected; when the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step instead. " +
      'When that shortened step is not the ordered cell and the sub-unit can already shoot an enemy from its current cell, the move is dropped and the sub-unit stays there, unless the shortened step enters a cell that holds an enemy.'
    );
  }
  return (
    `Movement budgets in clear weather: ${getMovementBudget('infantry')} cell for infantry, ` +
    `${getMovementBudget('armor')} for armor and naval, and air never marches. ` +
    "When the weather sentence states a lower budget for a unit that lacks that weather, that lower number is this turn's budget. " +
    'Armor that enters a rugged, arctic, or city hex ends its move there. Armor already on that hex may leave. ' +
    'A longer route continues on the next turn, and the turn count includes that halt. ' +
    (standingOrdersEnabled
      ? "An explicit_move farther than this turn's budget becomes a standing march to that hex."
      : "An explicit_move farther than this turn's budget is dropped, not shortened to the first step.")
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
export function buildRangedReachRule(mode: PromptCoordinateMode, includeMountainLineOfSight = true): string {
  logTrace('promptSpec buildRangedReachRule', { mode, includeMountainLineOfSight });
  if (mode === 'tactical') {
    const mountain = includeMountainLineOfSight
      ? 'A mountain cell between the shooter and the target blocks armor and naval shots. The cell the shooter stands on and the target cell do not. Infantry is exempt. Air strikes and ferry are not blocked by mountains. '
      : '';
    return (
      `Infantry and armor fire at their tactical baselines (infantry ${RANGED_RANGE_BY_UNIT_TYPE.infantry}, armor ${RANGED_RANGE_BY_UNIT_TYPE.armor}); ` +
      'forest, urban, or rubble on the attacker\'s cell caps infantry and armor to range 1. ' +
      mountain +
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
    return 'An air unit strikes and drops anywhere in the battle footprint and ferries one hop between intact airport cells. An air sub-unit carries one infantry sub-unit. A drop onto a cell fortified by the other side is illegal. A drop onto an enemy cell is fought in melee if both remain.';
  }
  const snowHop = strategicFerryRangeHexes({ weatherAtDestination: 'snow', tags: [], enabled: true });
  return (
    `An air unit ferries any distance in one turn by hopping controlled intact airports. Each hop is at most ${AIR_FERRY_RANGE_HEXES} hexes, or ${snowHop} into snow when the unit lacks the snow tag. ` +
    `It strikes within ${AIR_STRIKE_RANGE_HEXES} hexes of its current airport. It does not strike from the end of a ferry on the same turn. ` +
    `It carries one infantry unit. embark with that air unit's id in navalUnitId loads infantry on the same hex. disembark clears the assignment and then marches the infantry by normal land movement. The destination does not have to be a port or a coast. A destination of the current hex unloads and stays. ferryOrders carries the infantry along. While aboard, the infantry cannot fight and is destroyed if the air unit is destroyed. ` +
    `airDrops lands that infantry on a land hex within ${AIR_STRIKE_RANGE_HEXES} of the current airport, including an enemy hex, and the air unit stays based where it is. Enemy units there may shoot the air unit down; if they do, the infantry is lost. A drop and a strike cannot both be ordered. A drop and a ferry cannot both be ordered. ` +
    'When infantry cannot reach the fight by land this turn, embark it on air and drop it, or ferry it through airports, when a chain exists. Use a ship when no airport chain reaches.'
  );
}

/**
 * What a fire-withholding standing order does, and what omitting an attack does not do.
 *
 * Purpose: `hold_fire` is listed as a legal order with no other explanation today.
 * When to use: The Holding Fire subsection when standing-order tools are enabled.
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
 * When to use: The Production subsection of Rules, after the caps line.
 * Expected outcome: One paragraph. Urban count becomes points each turn and spend is in queue order. A building queue keeps its remainder. A paused queue loses its points.
 * Exceptions: None.
 */
export function buildProductionIncomeRule(): string {
  logTrace('promptSpec buildProductionIncomeRule', {});
  return (
    'A controlled cell earns production points equal to its urban count each turn and spends them in queue order. ' +
    'A queue that is building keeps its unspent points toward the next item. A paused queue loses its points at the end of the turn.'
  );
}

/**
 * Unit costs and build prerequisites interpolated from the engine tables.
 *
 * Purpose: The production status block must not retype costs or urban minima as literals.
 * When to use: The first paragraph of the Production subsection of Rules.
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
  return `Rules: ${parts.join(', ')}. ${buildFortificationProductionRulePart()}. ${buildCreditsProductionRulePart()}.`;
}

/**
 * How long a last-known enemy position remains on the briefing after contact is lost.
 *
 * Purpose: Fog-on nearest-enemy cells show a last-seen turn with no window, so the model cannot tell current from expired.
 * When to use: The Distances and Intel Age subsection when fog is on. The briefing no longer prints it.
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
 * When to use: Combat paragraph when `hasNavalUnits` is true, and the `rules` tool's naval topic.
 * Expected outcome: Fire within engine range, water/coastal movement, route to the nearest water or coastal cell.
 * Exceptions: None.
 */
export function buildNavalClause(mode: PromptCoordinateMode): string {
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
 * When to use: Inside `buildRulesSections`.
 * Expected outcome: One target field, a sentence that a unit may fire at a cell and move into it, a tempo clause that copies listed Best Options rows, and the "does not prevent movement" fact.
 * Exceptions: None.
 */
function buildAttackConstraintsClause(gates: GameRuleTextGates): string {
  const period = periodNoun(gates.coordinateMode);
  const hint = gates.rangedTargetHint ?? '';
  const listedRows = gates.hasAirUnits ? 'ranged or air-strike row' : 'ranged row';
  const tempo =
    `Copy each ${listedRows} that Best Options This Turn lists for that unit, and choose among those listed rows. ` +
    `Do not invent a target the table does not list. Those attacks resolve from ${period}-start positions and do not prevent movement in the same ${period}.`;
  return (
    `At most one ranged_attack per unit from ${period}-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId${hint}. ` +
    `A unit may fire at a cell and move into that same cell in the same ${period}; the shot resolves first. ` +
    `${buildRangedReachRule(gates.coordinateMode, gates.includeMountainLineOfSight !== false)} ${tempo} Drop invalid attacks before submit.`
  );
}

/**
 * One rules subsection, or '' when it has no paragraph.
 *
 * Purpose: Empty topics must not leave a heading.
 * When to use: From `buildRulesSections` only.
 * Expected outcome: `## Title`, a blank line, and the paragraphs separated by blank lines.
 * Exceptions: None.
 */
function rulesSubsection(title: string, paragraphs: readonly string[]): string {
  const body = paragraphs.map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  if (body.length === 0) return '';
  return `${subHeading(title)}\n\n${body.join('\n\n')}`;
}

/**
 * Composes the rules subsections for this consultation.
 *
 * Purpose: Each topic has its own heading. The words are the same sentences the single rules block used to print.
 * When to use: Once per assembled system prompt, after roster and tool flags are known.
 * Expected outcome: Subsections in topic order. A topic with no paragraph is omitted. Hold-fire only when orders are on. Air, naval, and missiles only when those units exist.
 * Exceptions: None.
 */
export function buildRulesSections(gates: GameRuleTextGates): string {
  logDebug('promptSpec buildRulesSections', { ...gates });
  const originBonus = buildOriginBonusRule(gates);
  const techBonus = buildTechBonusRule(gates.originBonusSettings);
  const weatherRule = buildWeatherRule(gates);
  const resolutionParagraph = [
    buildResolutionOrderRule(gates.coordinateMode),
    'Ranged uses pre-move positions.',
    buildAttackConstraintsClause(gates),
  ].join(' ');
  const naval = gates.hasNavalUnits
    ? [buildNavalClause(gates.coordinateMode).trim(), gates.navalPlanRouteHint ?? '']
    : [];
  const air = buildAirEmploymentRule(gates);
  const missile = buildMissileEmploymentRule(gates);
  const fortification = buildFortificationRule(gates);
  const sections = [
    rulesSubsection(SECTION_TITLE_COMBAT, [
      buildCombatStatsLine(gates.coordinateMode, gates.hasAirUnits, gates.tacticalTypesPresent ?? []),
      buildCasualtySortRule(gates.includeMissileCasualty !== false),
      gates.extraCombatText ?? '',
    ]),
    rulesSubsection(SECTION_TITLE_BONUSES, [originBonus ?? '', techBonus ?? '']),
    rulesSubsection(SECTION_TITLE_WEATHER, weatherRule ? [weatherRule] : []),
    rulesSubsection(SECTION_TITLE_TERRAIN_COVER, [buildTerrainCoverRule(gates.coordinateMode)]),
    rulesSubsection(SECTION_TITLE_RESOLUTION_ORDER, [resolutionParagraph]),
    rulesSubsection(SECTION_TITLE_MOVEMENT, [
      buildMovementBudgetRule(gates.coordinateMode, gates.ordersEnabled),
      buildDestinationOccupancyRule(gates.coordinateMode),
    ]),
    rulesSubsection(SECTION_TITLE_NAVAL_UNITS, naval),
    rulesSubsection(SECTION_TITLE_AIR_UNITS, air ? [air] : []),
    rulesSubsection(SECTION_TITLE_MISSILES, missile ? [missile] : []),
    rulesSubsection(SECTION_TITLE_FORTIFICATIONS, fortification ? [fortification] : []),
    rulesSubsection(SECTION_TITLE_HOLDING_FIRE, gates.ordersEnabled ? [buildHoldFireRule()] : []),
    rulesSubsection(SECTION_TITLE_PRODUCTION, gates.productionRules ?? []),
    rulesSubsection(SECTION_TITLE_RULE_LOOKUP, gates.rulesPointer ? [gates.rulesPointer] : []),
  ];
  return sections.filter((section) => section.length > 0).join('\n\n');
}

/**
 * Turn-invariant production sentences for the rules section.
 *
 * Purpose: Cost, caps, income, buildability, and spawn timing do not change during a match.
 * When to use: Under Production when production is on for a strategic consultation.
 * Expected outcome: Five paragraphs, in that order. The caps line uses the supplied per-type limits.
 * Exceptions: None.
 */
export function buildProductionRulesParagraphs(caps: Readonly<Record<BuildUnitType, number>>): string[] {
  logDebug('promptSpec buildProductionRulesParagraphs', { caps });
  return [
    buildProductionCostRulesLine(),
    `Deployment caps (per side): ${ALL_BUILD_UNIT_TYPES.map((unitType) => `${unitType} ${caps[unitType]}`).join(', ')}.`,
    buildProductionIncomeRule(),
    buildBuildabilityRule(),
    'Production progress/spawn resolves after Ready, after combat and control resolution.',
  ];
}
