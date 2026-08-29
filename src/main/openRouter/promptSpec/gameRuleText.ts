/**
 * Engine-fact sentences both consultation modes need: dice, stats, resolution order,
 * casualty sort, occupancy, movement budgets, ranged reach, air employment, hold-fire,
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
import { STALE_INTEL_TURNS } from '../../game-db/fogState';
import { logDebug, logTrace } from '../../logger';
import { ALL_BUILD_UNIT_TYPES } from '../../../shared/ipc/productionTypes';
import { BUILD_PREREQUISITES_BY_TYPE, UNIT_COST_BY_TYPE } from '../../productionRules';
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
} from '../../../shared/tacticalRes4TransportLink';
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
   * Whether standing-order tools are enabled for this consultation.
   *
   * Contract: Hold-fire can only be issued as a standing order, so a prompt without that group must not teach it.
   * When to use: Set from `getToolFlags().ordersEnabled`.
   * Expected outcome: False omits the hold-fire sentence from the combat paragraph.
   * Exceptions: None.
   */
  readonly ordersEnabled: boolean;
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
 * Purpose: Reach wording differs by mode: strategic uses `getRange`, tactical uses the res4 table,
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
 * Expected outcome: The existing "Combat: d6 per shot" sentence with engine stats interpolated; air is omitted when `hasAirUnits` is false.
 * Exceptions: None.
 */
export function buildCombatStatsLine(mode: PromptCoordinateMode, hasAirUnits = true): string {
  logDebug('promptSpec buildCombatStatsLine', { mode, hasAirUnits });
  const types = hasAirUnits ? ALL_BUILD_UNIT_TYPES : ALL_BUILD_UNIT_TYPES.filter((unitType) => unitType !== 'air');
  const summary = types.map(
    (unitType) =>
      `${unitType}: ${getAttack(unitType)} attack / ${getDefense(unitType)} defense${formatReachClause(unitType, mode)}`
  ).join('; ');
  return `Combat: d6 per shot — attack hits on roll ≤ attack stat; defense hits on roll ≤ defense. ${summary}.`;
}

/**
 * Names the resolution stages in engine order.
 *
 * Purpose: The model cannot reason about firing then closing, ferry arriving after ground movement,
 * or cargo remaining on the transport until sync, from "ranged uses pre-move positions" alone.
 * When to use: Combat paragraph after the casualty rule.
 * Expected outcome: Embark, air strikes, ranged fire, movement, cargo sync, ferry, melee (tactical swaps cargo sync after ferry); tactical notes the beat and no production.
 * Exceptions: None.
 */
export function buildResolutionOrderRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildResolutionOrderRule', { mode });
  if (mode === 'tactical') {
    return `This beat resolves as embark, then air strikes, then ranged fire, then movement, then ferry, then cargo sync, then melee, with no production step.`;
  }
  return 'This turn resolves as embark, then air strikes, then ranged fire, then movement, then cargo sync, then ferry, then melee.';
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
  return `Hits land on the lowest-defense unit in the target stack first, then in the fixed type order ${CASUALTY_PRIORITY_ORDER.join(', ')}.`;
}

/**
 * Friendly stacks are illegal destinations; enemy cells are move/melee contact.
 *
 * Purpose: Best Options lists enemy-occupied cells as move/melee dests the engine will accept; friendly stacks are not legal.
 * When to use: Combat paragraph after movement budgets.
 * Expected outcome: Friendly-occupied dests forbidden; copy move/melee onto an enemy cell to make contact.
 * Exceptions: None.
 */
export function buildDestinationOccupancyRule(): string {
  logTrace('promptSpec buildDestinationOccupancyRule', {});
  return 'A cell holding a friendly unit is not a legal destination. Copy a move/melee Target Hex even when it holds an enemy — that is how contact is made this period. Approach Target Hexes are empty of units.';
}

/**
 * Per-type movement budget for this consultation mode.
 *
 * Purpose: Multi-turn and intra-beat reach cannot be judged from the options table alone.
 * When to use: Combat paragraph after the infantry reach clause.
 * Expected outcome: Strategic cell counts from `getMovementBudget`; tactical point budgets from `MOVEMENT_RANGE_BY_UNIT_TYPE`, origin urban/rubble collapse, and road/rail multipliers.
 * Exceptions: None.
 */
export function buildMovementBudgetRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildMovementBudgetRule', { mode });
  if (mode === 'tactical') {
    return (
      `Movement this beat is a terrain-weighted point budget: ${MOVEMENT_RANGE_BY_UNIT_TYPE.infantry} points for infantry, ` +
      `${MOVEMENT_RANGE_BY_UNIT_TYPE.armor} for armor, ${MOVEMENT_RANGE_BY_UNIT_TYPE.naval} for naval, and air does not march. ` +
      'Infantry or armor whose current cell is urban or rubble has a 1-point budget this beat, not the type baseline. ' +
      'Armor in forest is penalised to the infantry baseline. ' +
      `Road edges multiply remaining points by ${TACTICAL_TRANSPORT_ROAD_BUDGET_MULTIPLIER} and rail edges by ${TACTICAL_TRANSPORT_RAIL_BUDGET_MULTIPLIER}. ` +
      'A non-air unit always retains at least one point. ' +
      "A destination beyond this beat's budget is clamped to the first reachable leg rather than rejected; when the planner cannot use the destination at all but a neighbouring footprint cell still closes on it, the engine may take that single step instead, unless that cell holds a friendly unit."
    );
  }
  return (
    `Movement budgets: ${getMovementBudget('infantry')} cell for infantry, ` +
    `${getMovementBudget('armor')} for armor and naval, and air never marches.`
  );
}

/**
 * Infantry (and mode-specific) ranged reach, including tactical terrain caps and mountain LOS.
 *
 * Purpose: Strategic infantry is melee-only. Tactical infantry and armor have res4 baselines that forest/urban/rubble/transport cap to 1; mountain blocks armor/naval/air LOS.
 * When to use: Combat paragraph after the one-attack-per-unit clause.
 * Expected outcome: Strategic melee-only sentence, or tactical baselines plus the engine cap and LOS rules.
 * Exceptions: None.
 */
export function buildRangedReachRule(mode: PromptCoordinateMode): string {
  logTrace('promptSpec buildRangedReachRule', { mode });
  if (mode === 'tactical') {
    return (
      `Infantry and armor fire at their res4 baselines (infantry ${RANGED_RANGE_BY_UNIT_TYPE.infantry}, armor ${RANGED_RANGE_BY_UNIT_TYPE.armor}); ` +
      'forest, urban, rubble, or a road/rail corridor on the attacker\'s cell caps infantry and armor to range 1. ' +
      'Mountain along the line of sight blocks armor, naval, and air shots (infantry is exempt). ' +
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
    return 'An air unit may strike anywhere in the battle; the strategic strike radius does not apply. Striking still uses its one air action for the beat.';
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
 * Expected outcome: Each buildable type names `UNIT_COST_BY_TYPE` and `BUILD_PREREQUISITES_BY_TYPE`; air also requires an airport.
 * Exceptions: None.
 */
export function buildProductionCostRulesLine(): string {
  logTrace('promptSpec buildProductionCostRulesLine', {});
  const parts = ALL_BUILD_UNIT_TYPES.map((unitType) => {
    const cost = UNIT_COST_BY_TYPE[unitType];
    const req = BUILD_PREREQUISITES_BY_TYPE[unitType];
    const extras: string[] = [`min urban ${req.minUrbanHexes}`];
    if (req.minSeaports > 0) extras.push(`min seaports ${req.minSeaports}`);
    if (unitType === 'air') extras.push('requires airport');
    return `${unitType} cost ${cost} (${extras.join(' + ')})`;
  });
  return `Rules: ${parts.join(', ')}.`;
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
 * Purpose: strategic-prompt.md section 1.5 item 11. Reach is `getRange('naval')`, not a copied numeral.
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
 * Purpose: strategic-prompt.md section 1.5 items 5–6. Air strikes join the tempo sentence only when air is present.
 * When to use: Inside `buildCombatRulesParagraph`.
 * Expected outcome: Existing targetHexCode/targetUnitId wording and the "does not prevent movement" tempo clause.
 * Exceptions: None.
 */
function buildAttackConstraintsClause(gates: GameRuleTextGates): string {
  const period = periodNoun(gates.coordinateMode);
  const tempo = gates.hasAirUnits
    ? `If a legal ranged_attack or air strike is available this ${period}, take it — these attacks resolve from ${period}-start positions and do not prevent movement in the same ${period}.`
    : `If a legal ranged_attack is available this ${period}, take it — ranged attacks resolve from ${period}-start positions and do not prevent movement in the same ${period}.`;
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
 * Expected outcome: Hold-fire only when `ordersEnabled`; air and naval clauses only when those units exist.
 * Exceptions: None.
 */
export function buildCombatRulesParagraph(gates: GameRuleTextGates): string {
  logDebug('promptSpec buildCombatRulesParagraph', { ...gates });
  const parts: string[] = [
    buildCombatStatsLine(gates.coordinateMode, gates.hasAirUnits),
    buildCasualtySortRule(),
    buildResolutionOrderRule(gates.coordinateMode),
    'Ranged uses pre-move positions.',
    buildAttackConstraintsClause(gates),
    buildMovementBudgetRule(gates.coordinateMode),
    buildDestinationOccupancyRule(),
  ];
  if (gates.hasNavalUnits) {
    parts.push(buildNavalClause(gates.coordinateMode).trim());
  }
  const air = buildAirEmploymentRule(gates);
  if (air) parts.push(air);
  if (gates.ordersEnabled) parts.push(buildHoldFireRule());
  return parts.join(' ');
}
