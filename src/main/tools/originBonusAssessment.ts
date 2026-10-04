/**
 * Origin bonus fields for `assess_unit` and `assess_hex` results.
 *
 * Purpose: Tells the AI whether a unit's rolls get the origin bonus where it stands, using the same matcher as live dice.
 * When to use: Spread the returned objects into tool results; each is empty when its flags are off, so results are unchanged.
 * Expected outcome: Plain JSON-ready fields.
 * Exceptions: None.
 */
import type { GameStateSnapshot } from '../gameDb';
import { logTrace } from '../logger';
import {
  normalizeOriginTerrainKind,
  originBonusSettingsFromSnapshot,
  originBonusSources,
  originHitBonusFromSources,
  strategicHexCountryNameAt,
  strategicOriginBonusPlace,
  tacticalOriginBonusPlace,
} from '../../shared/originBonusRules';
import type { OriginBonusSettings, OriginBonusSource, OriginHitBonus } from '../../shared/originBonusTypes';
import type { PipelineTerrainKind } from '../../shared/pipelineTerrain';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';

/**
 * Origin bonus fields a unit block may carry.
 *
 * Purpose: Shared shape of the strategic and tactical unit fields.
 * When to use: Return type of the unit field builders below.
 * Expected outcome: Every field is optional; absent fields mean the flag that drives them is off.
 * Exceptions: None.
 */
export interface OriginBonusUnitFields {
  /**
   * Reasons the unit's rolls get a bonus where it stands now.
   *
   * Contract: Present when a flag that applies to the mode is on; empty when the unit does not qualify.
   * When to use: Deciding whether to fight from the current position.
   * Expected outcome: Subset of `['country', 'terrain']`.
   * Exceptions: None.
   */
  readonly originBonusHere?: OriginBonusSource[];
  /**
   * Amount the unit's rolls add where it stands now.
   *
   * Contract: Present exactly when `originBonusHere` is present: 0 when that list is empty, otherwise the larger amount among its reasons.
   * When to use: Stating the bonus, such as the Unit Status Bonus cell.
   * Expected outcome: 0, 1, or 2.
   * Exceptions: None.
   */
  readonly originBonusAmount?: OriginHitBonus;
  /**
   * Birth country name of the unit.
   *
   * Contract: Present when the country bonus is on; `null` for units without a country.
   * When to use: Finding places where the unit would qualify.
   * Expected outcome: Canonical country name.
   * Exceptions: None.
   */
  readonly birthCountry?: string | null;
  /**
   * Normalized birth terrain kind of the unit.
   *
   * Contract: Present in battles when the terrain bonus is on; `null` when unknown.
   * When to use: Finding cells where the unit would qualify.
   * Expected outcome: A pipeline terrain kind.
   * Exceptions: None.
   */
  readonly birthTerrain?: PipelineTerrainKind | null;
}

/**
 * Builds the strategic `assess_unit` origin bonus fields.
 *
 * Purpose: The strategic map uses the country test only.
 * When to use: At the end of the strategic `unit` block.
 * Expected outcome: `originBonusHere`, `originBonusAmount`, and `birthCountry` when the country bonus is on, otherwise `{}`.
 * Exceptions: None.
 */
export function strategicOriginBonusUnitFields(
  state: GameStateSnapshot,
  unit: GameStateSnapshot['units'][number]
): OriginBonusUnitFields {
  const settings = originBonusSettingsFromSnapshot(state);
  logTrace('originBonusAssessment strategicOriginBonusUnitFields', { unitId: unit.id, ...settings });
  if (!settings.countryBonusEnabled) return {};
  const sources = originBonusSources({
    settings,
    theater: 'strategic',
    origin: unit.origin,
    place: strategicOriginBonusPlace(state, unit.h3Index),
  });
  return {
    originBonusHere: sources,
    originBonusAmount: originHitBonusFromSources(sources, settings),
    birthCountry: unit.origin?.birthCountryName ?? null,
  };
}

/**
 * Builds the tactical `assess_unit` origin bonus fields.
 *
 * Purpose: Battles use both tests, judged at the sub-unit's own cell so the answer matches the dice.
 * When to use: At the end of the tactical `unit` block.
 * Expected outcome: `originBonusHere` and `originBonusAmount` when either flag is on, plus `birthCountry` and/or `birthTerrain` per flag; `{}` when both are off.
 * Exceptions: None.
 */
export function tacticalOriginBonusUnitFields(
  settings: OriginBonusSettings,
  battle: TacticalBattleSnapshot,
  subUnit: TacticalSubUnitSnapshot
): OriginBonusUnitFields {
  logTrace('originBonusAssessment tacticalOriginBonusUnitFields', { subUnitId: subUnit.id, ...settings });
  if (!settings.countryBonusEnabled && !settings.terrainBonusEnabled) return {};
  const sources = originBonusSources({
    settings,
    theater: 'tactical',
    origin: subUnit.origin,
    place: tacticalOriginBonusPlace(battle, subUnit.h3Index),
  });
  return {
    originBonusHere: sources,
    originBonusAmount: originHitBonusFromSources(sources, settings),
    ...(settings.countryBonusEnabled ? { birthCountry: subUnit.origin?.birthCountryName ?? null } : {}),
    ...(settings.terrainBonusEnabled ? { birthTerrain: normalizeOriginTerrainKind(subUnit.origin?.birthTerrainKind) } : {}),
  };
}

/**
 * Builds the `assess_hex` origin bonus fields.
 *
 * Purpose: Lets the AI see which country a hex counts as.
 * When to use: In the `assess_hex` result, after `terrain`.
 * Expected outcome: `{ country }` when the country bonus is on (`null` for hexes without one), otherwise `{}`.
 * Exceptions: None.
 */
export function strategicOriginBonusHexFields(
  state: GameStateSnapshot,
  res1H3Index: string
): { readonly country?: string | null } {
  const settings = originBonusSettingsFromSnapshot(state);
  logTrace('originBonusAssessment strategicOriginBonusHexFields', { res1H3Index, ...settings });
  return settings.countryBonusEnabled ? { country: strategicHexCountryNameAt(state, res1H3Index) } : {};
}
