/**
 * Decides which combat-rule clauses this consultation needs.
 *
 * Purpose: The rules paragraph stays short when the roster and the map make a clause useless.
 * When to use: `buildSystemPromptForTools`, and the briefing builders that hide the Weather column.
 * Expected outcome: A complete `GameRuleTextGates`. A missing fact includes the clause.
 * Exceptions: None.
 */

import { logDebug, logTrace } from '../../logger';
import type { CoordinateContext } from '../../briefing/map/coordinateContext';
import { isMissileUnitType } from '../../../shared/missileRules';
import { ALL_BUILD_UNIT_TYPES } from '../../../shared/ipc/productionTypes';
import { normalizeOriginTerrainKind } from '../../../shared/originBonusRules';
import { terrainBonusMarchCategoryFor } from '../../../shared/terrainBonusMarch';
import type { OriginBonusSettings } from '../../../shared/originBonusTypes';
import type { GameRuleTextGates } from './gameRuleText';

/**
 * One unit the gate can see.
 *
 * Contract: `player` and `unitType` match the snapshot. `id` matches a tactical sub-unit when the consult is a battle.
 * When to use: Rows from `state.units`.
 * Expected outcome: Armor, naval, air, and missile checks read these fields.
 * Exceptions: None.
 */
interface SituationGateUnit {
  /**
   * Unit or sub-unit id.
   *
   * Contract: Present on live rows. Absent only in a hand-built fixture.
   * When to use: Matching a naval row to its battle origin.
   * Expected outcome: The battle sub-unit with this id supplies birth terrain.
   * Exceptions: None.
   */
  readonly id?: string;
  /**
   * Seat that controls the unit.
   *
   * Contract: Compared with the consulted seat.
   * When to use: Armor, naval, and air gates that look at the consulted side only.
   * Expected outcome: Other seats are ignored for those gates.
   * Exceptions: None.
   */
  readonly player?: string;
  /**
   * Engine unit type.
   *
   * Contract: A build type such as `infantry` or `armor`.
   * When to use: Every roster gate.
   * Expected outcome: Unknown strings do not count as a known type.
   * Exceptions: None.
   */
  readonly unitType?: string;
}

/**
 * Birth terrain the battle still has after the plan state drops it.
 *
 * Contract: `id` matches `SituationGateUnit.id`.
 * When to use: Naval terrain-entry only.
 * Expected outcome: A missing origin includes the entry sentence.
 * Exceptions: None.
 */
interface SituationGateSubUnit {
  /**
   * Sub-unit id.
   *
   * Contract: Same id the plan-state unit carries.
   * When to use: Finding the naval row's birth terrain.
   * Expected outcome: A match or a miss. A miss includes the sentence.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Birth record copied onto the sub-unit.
   *
   * Contract: Absent when the parent had none.
   * When to use: `birthTerrainKind` for the naval entry check.
   * Expected outcome: Missing or unrecognized terrain includes the sentence.
   * Exceptions: None.
   */
  readonly origin?: { readonly birthTerrainKind?: string | null };
}

/**
 * Facts the combat-rule gates read.
 *
 * Purpose: One object so the assembler does not grow a second copy of these checks.
 * When to use: `combatRuleGatesForPrompt`.
 * Expected outcome: Missing units, hexes, or birth terrain include the clause.
 * Exceptions: None.
 */
export interface CombatRuleGateInput {
  /**
   * Units visible on this consultation's snapshot.
   *
   * Contract: In a battle these are both sides' sub-units.
   * When to use: Type, mountain, missile, armor, and air gates.
   * Expected outcome: An empty list includes every roster clause.
   * Exceptions: None.
   */
  readonly units?: readonly SituationGateUnit[];
  /**
   * Strategic hexes, including weather when the bonus recorded it.
   *
   * Contract: Ignored in tactical mode.
   * When to use: The strategic weather gate.
   * Expected outcome: A hex with no weather includes the weather rules.
   * Exceptions: None.
   */
  readonly hexes?: readonly { readonly weather?: string }[];
  /**
   * Fortification counts by strategic hex.
   *
   * Contract: Absent means the count is unknown.
   * When to use: The strategic fortification gate.
   * Expected outcome: Unknown includes the rule. A present list with no positive count omits it unless production is on.
   * Exceptions: None.
   */
  readonly strategicInfrastructure?: readonly { readonly fortifiedCount?: number }[];
  /**
   * Active coordinate context.
   *
   * Contract: Tactical mode reads `battleWeather` and `hasFortifiedCells`.
   * When to use: Every consult.
   * Expected outcome: Mode selects the tactical or strategic reading of each gate.
   * Exceptions: None.
   */
  readonly coordinateContext: CoordinateContext;
  /**
   * Seat being consulted.
   *
   * Contract: Matches `units[].player`.
   * When to use: Armor, naval, and air gates.
   * Expected outcome: Only that seat's units count for those three.
   * Exceptions: None.
   */
  readonly ownSeat: string;
  /**
   * Consulted side has an air unit, as the assembler already computed.
   *
   * Contract: This stays the own-seat flag the air employment sentence already uses.
   * When to use: Copied onto the returned gates.
   * Expected outcome: Air employment text stays off when the consulted side has no air.
   * Exceptions: None.
   */
  readonly hasAirUnits: boolean;
  /**
   * Consulted side has a naval unit, as the assembler already computed.
   *
   * Contract: This stays the own-seat flag the naval clause already uses.
   * When to use: Copied onto the returned gates.
   * Expected outcome: The naval clause stays off when the consulted side has no naval unit.
   * Exceptions: None.
   */
  readonly hasNavalUnits: boolean;
  /**
   * Consulted side has a missile, as the assembler already computed.
   *
   * Contract: This stays the own-seat flag the missile employment sentence already uses.
   * When to use: Copied onto the returned gates.
   * Expected outcome: Missile employment stays off when the consulted side has no missile.
   * Exceptions: None.
   */
  readonly hasMissileUnits: boolean;
  /**
   * Whether a controlled hex can still queue a naval unit.
   *
   * Contract: Omitted means false. The assembler sets this only on a strategic production consult.
   * When to use: Copied onto the returned gates.
   * Expected outcome: Strategic naval text can print before the seat owns a ship.
   * Exceptions: None.
   */
  readonly canBuildNaval?: boolean;
  /**
   * Whether a controlled hex can still queue a missile.
   *
   * Contract: Omitted means false. The assembler sets this only on a strategic production consult.
   * When to use: Copied onto the returned gates.
   * Expected outcome: The missile build sentence can print before the seat owns a missile.
   * Exceptions: None.
   */
  readonly canBuildMissile?: boolean;
  /**
   * Standing orders can be issued this consult.
   *
   * Contract: False in battle.
   * When to use: The hold-fire sentence.
   * Expected outcome: Passed through as `ordersEnabled`.
   * Exceptions: None.
   */
  readonly standingOrdersIssuable: boolean;
  /**
   * Bonus flags from the snapshot.
   *
   * Contract: Same object `originBonusSettingsFromSnapshot` returned.
   * When to use: Origin, terrain, and weather sentences.
   * Expected outcome: Passed through unchanged.
   * Exceptions: None.
   */
  readonly originBonusSettings: OriginBonusSettings;
  /**
   * Estimate-combat hint for a briefing-absent consult.
   *
   * Contract: Omitted means empty.
   * When to use: The attack-constraint sentence.
   * Expected outcome: Passed through.
   * Exceptions: None.
   */
  readonly rangedTargetHint?: string;
  /**
   * Production tools are on for this strategic consult.
   *
   * Contract: False in battle.
   * When to use: The strategic fortification gate.
   * Expected outcome: True includes the fortification rule.
   * Exceptions: None.
   */
  readonly productionEnabled: boolean;
  /**
   * Battle sub-units, which still carry birth terrain.
   *
   * Contract: Omitted on a strategic consult and when the caller has no snapshot.
   * When to use: Naval terrain-entry.
   * Expected outcome: Missing birth terrain includes the entry sentence.
   * Exceptions: None.
   */
  readonly tacticalSubUnits?: readonly SituationGateSubUnit[];
}

/**
 * True when a tactical battle's weather is not mild, or was not recorded.
 *
 * Purpose: Mild battles do not need the weather rules. A missing value must not hide them.
 * When to use: The combat paragraph and the tactical Unit Status column.
 * Expected outcome: False only for `mild`.
 * Exceptions: None.
 */
export function tacticalWeatherApplies(weather: string | undefined): boolean {
  const applies = weather == null || weather.length === 0 || weather !== 'mild';
  logTrace('promptSpec tacticalWeatherApplies', { weather: weather ?? null, applies });
  return applies;
}

/**
 * True when some strategic hex is not mild, or some hex has no recorded weather.
 *
 * Purpose: A unit can march into weather it is not standing in, so mild occupied hexes are not enough to hide the rules.
 * When to use: The combat paragraph and the strategic Unit Status column.
 * Expected outcome: False only when every hex records `mild`.
 * Exceptions: None.
 */
export function strategicWeatherApplies(hexes: readonly { readonly weather?: string }[] | undefined): boolean {
  const applies = !hexes || hexes.length === 0 || hexes.some((hex) => hex.weather == null || hex.weather !== 'mild');
  logTrace('promptSpec strategicWeatherApplies', { hexCount: hexes?.length ?? 0, applies });
  return applies;
}

/**
 * Builds the combat-rule gates for one consultation.
 *
 * Purpose: One place reads the roster, the map, and the battle so the assembler stays a caller.
 * When to use: `buildSystemPromptForTools` immediately before `buildRulesSections`.
 * Expected outcome: Clauses that cannot apply are off. An empty roster or a missing weather value leaves them on.
 * Exceptions: None.
 */
export function combatRuleGatesForPrompt(input: CombatRuleGateInput): GameRuleTextGates {
  const units = input.units ?? [];
  const tactical = input.coordinateContext.mode === 'tactical';
  const weatherApplies = tactical
    ? tacticalWeatherApplies(input.coordinateContext.battleWeather)
    : strategicWeatherApplies(input.hexes);
  const knownTypes = ALL_BUILD_UNIT_TYPES.filter((unitType) => units.some((unit) => unit.unitType === unitType));
  const rosterKnown = units.length > 0 && knownTypes.length > 0;
  const own = units.filter((unit) => unit.player === input.ownSeat);
  const gates: GameRuleTextGates = {
    coordinateMode: input.coordinateContext.mode,
    hasAirUnits: input.hasAirUnits,
    hasNavalUnits: input.hasNavalUnits,
    hasMissileUnits: input.hasMissileUnits,
    canBuildNaval: input.canBuildNaval === true,
    canBuildMissile: input.canBuildMissile === true,
    hasFortifiedCells: input.coordinateContext.hasFortifiedCells === true,
    ordersEnabled: input.standingOrdersIssuable,
    originBonusSettings: input.originBonusSettings,
    rangedTargetHint: input.rangedTargetHint,
    weatherApplies,
    includeArmorTerrainEntry: includeArmorTerrainEntry(own, units.length > 0, input.tacticalSubUnits),
    includeMountainLineOfSight: !rosterKnown || units.some((unit) => unit.unitType === 'armor' || unit.unitType === 'naval'),
    tacticalTypesPresent: rosterKnown && tactical ? knownTypes : undefined,
    includeMissileCasualty: !rosterKnown || units.some((unit) => isMissileUnitType(unit.unitType ?? '')),
    includeFortificationRule: includeFortificationRule(input, tactical),
    includeWeatherAirSentence: units.length === 0 || own.some((unit) => unit.unitType === 'air'),
  };
  logDebug('promptSpec combatRuleGatesForPrompt', {
    mode: gates.coordinateMode,
    weatherApplies: gates.weatherApplies,
    includeArmorTerrainEntry: gates.includeArmorTerrainEntry,
    includeMountainLineOfSight: gates.includeMountainLineOfSight,
    tacticalTypeCount: gates.tacticalTypesPresent?.length ?? 0,
    includeMissileCasualty: gates.includeMissileCasualty,
    includeFortificationRule: gates.includeFortificationRule,
    includeWeatherAirSentence: gates.includeWeatherAirSentence,
  });
  return gates;
}

/**
 * True when the consulted side can use the terrain-bonus entry, or the birth terrain is unknown.
 *
 * Purpose: Infantry does not use that entry, and a naval unit uses it only from a wetlands birth.
 * When to use: `combatRuleGatesForPrompt` only.
 * Expected outcome: False only when the consulted side is known to have neither armor nor a qualifying naval unit.
 * Exceptions: None.
 */
function includeArmorTerrainEntry(
  own: readonly SituationGateUnit[],
  rosterPresent: boolean,
  tacticalSubUnits: readonly SituationGateSubUnit[] | undefined
): boolean {
  if (!rosterPresent || own.length === 0) return true;
  if (own.some((unit) => unit.unitType === 'armor')) return true;
  const naval = own.filter((unit) => unit.unitType === 'naval');
  if (naval.length === 0) return false;
  if (!tacticalSubUnits) return true;
  return naval.some((unit) => navalBirthIncludesEntry(unit.id, tacticalSubUnits));
}

/**
 * True when this naval unit's birth terrain grants the entry, or the birth terrain is unknown.
 *
 * Purpose: A known non-wetlands birth must not keep the sentence, and a missing origin must.
 * When to use: `includeArmorTerrainEntry` for each own naval unit.
 * Expected outcome: False only when the birth kind is known and `terrainBonusMarchCategoryFor` returns null.
 * Exceptions: None.
 */
function navalBirthIncludesEntry(
  unitId: string | undefined,
  tacticalSubUnits: readonly SituationGateSubUnit[]
): boolean {
  const sub = unitId == null ? undefined : tacticalSubUnits.find((row) => row.id === unitId);
  if (!sub) return true;
  const birth = sub.origin?.birthTerrainKind;
  if (normalizeOriginTerrainKind(birth) === null) return true;
  return terrainBonusMarchCategoryFor({
    enabled: true,
    unitType: 'naval',
    birthTerrainKind: birth,
  }) !== null;
}

/**
 * True when this consultation should hear the fortification rule.
 *
 * Purpose: A battle without fortified cells, and a strategic map that cannot fortify, do not need the paragraph.
 * When to use: `combatRuleGatesForPrompt` only.
 * Expected outcome: Tactical follows the fortified-cell flag. Strategic is on when production is on, a hex is fortified, or the infrastructure list is missing.
 * Exceptions: None.
 */
function includeFortificationRule(input: CombatRuleGateInput, tactical: boolean): boolean {
  if (tactical) return input.coordinateContext.hasFortifiedCells === true;
  if (input.productionEnabled) return true;
  const infrastructure = input.strategicInfrastructure;
  if (!infrastructure) return true;
  return infrastructure.some((row) => (row.fortifiedCount ?? 0) > 0);
}
