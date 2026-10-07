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
import { originPlaceLabelFor } from '../../shared/originArea';
import type { OriginBonusSettings, OriginBonusSource, OriginHitBonus } from '../../shared/originBonusTypes';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
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
   * Expected outcome: Subset of `['origin', 'terrain']`.
   * Exceptions: None.
   */
  readonly originBonusHere?: OriginBonusSource[];
  /**
   * Amount the unit's rolls add where it stands now.
   *
   * Contract: Present exactly when `originBonusHere` is present: 0 when that list is empty, otherwise the larger amount among its reasons.
   * When to use: Stating the bonus, such as the Unit Status Bonus cell.
   * Expected outcome: 0, 2, or 4.
   * Exceptions: None.
   */
  readonly originBonusAmount?: OriginHitBonus;
  /**
   * Birth place label of the unit.
   *
   * Contract: Present when the origin bonus is on; `null` when the unit has no name to show. This is the display label, not the hex place id.
   * When to use: Showing the model the same place text as the bonus tooltip.
   * Expected outcome: The origin place label, or `null` when the unit has no area name and no looked-up country.
   * Exceptions: None.
   */
  readonly birthOrigin?: string | null;
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
 * The birth place text sent with a unit assessment.
 *
 * Purpose: The model sees the same place label as the bonus tooltip.
 * When to use: The `birthOrigin` field while the origin bonus is on.
 * Expected outcome: The origin place label, or `null` when the unit has no name to show.
 * Exceptions: None.
 */
function birthPlaceLabel(origin: UnitOrigin | null | undefined): string | null {
  if (!origin) return null;
  const label = originPlaceLabelFor(origin);
  return label.length > 0 ? label : null;
}

/**
 * Builds the strategic `assess_unit` origin bonus fields.
 *
 * Purpose: The strategic map uses the origin bonus only.
 * When to use: At the end of the strategic `unit` block.
 * Expected outcome: `originBonusHere`, `originBonusAmount`, and `birthOrigin` when the origin bonus is on, otherwise `{}`.
 * Exceptions: None.
 */
export function strategicOriginBonusUnitFields(
  state: GameStateSnapshot,
  unit: GameStateSnapshot['units'][number]
): OriginBonusUnitFields {
  const settings = originBonusSettingsFromSnapshot(state);
  logTrace('originBonusAssessment strategicOriginBonusUnitFields', { unitId: unit.id, ...settings });
  if (!settings.originBonusEnabled) return {};
  const sources = originBonusSources({
    settings,
    theater: 'strategic',
    origin: unit.origin,
    place: strategicOriginBonusPlace(state, unit.h3Index),
  });
  return {
    originBonusHere: sources,
    originBonusAmount: originHitBonusFromSources(sources, settings),
    birthOrigin: birthPlaceLabel(unit.origin),
  };
}

/**
 * Builds the tactical `assess_unit` origin bonus fields.
 *
 * Purpose: Battles use both tests, judged at the sub-unit's own cell so the answer matches the dice.
 * When to use: At the end of the tactical `unit` block.
 * Expected outcome: `originBonusHere` and `originBonusAmount` when either flag is on, plus `birthOrigin` and/or `birthTerrain` per flag; `{}` when both are off.
 * Exceptions: None.
 */
export function tacticalOriginBonusUnitFields(
  settings: OriginBonusSettings,
  battle: TacticalBattleSnapshot,
  subUnit: TacticalSubUnitSnapshot
): OriginBonusUnitFields {
  logTrace('originBonusAssessment tacticalOriginBonusUnitFields', { subUnitId: subUnit.id, ...settings });
  if (!settings.originBonusEnabled && !settings.terrainBonusEnabled) return {};
  const sources = originBonusSources({
    settings,
    theater: 'tactical',
    origin: subUnit.origin,
    place: tacticalOriginBonusPlace(battle, subUnit.h3Index),
  });
  return {
    originBonusHere: sources,
    originBonusAmount: originHitBonusFromSources(sources, settings),
    ...(settings.originBonusEnabled
      ? { birthOrigin: birthPlaceLabel(subUnit.origin) }
      : {}),
    ...(settings.terrainBonusEnabled ? { birthTerrain: normalizeOriginTerrainKind(subUnit.origin?.birthTerrainKind) } : {}),
  };
}

/**
 * Builds the `assess_hex` origin bonus fields.
 *
 * Purpose: Lets the AI see which country a hex counts as.
 * When to use: In the `assess_hex` result, after `terrain`.
 * Expected outcome: `{ origin }` when the origin bonus is on (`null` for hexes without one), otherwise `{}`.
 * Exceptions: None.
 */
export function strategicOriginBonusHexFields(
  state: GameStateSnapshot,
  strategicH3Index: string
): { readonly origin?: string | null } {
  const settings = originBonusSettingsFromSnapshot(state);
  logTrace('originBonusAssessment strategicOriginBonusHexFields', { strategicH3Index, ...settings });
  return settings.originBonusEnabled ? { origin: strategicHexCountryNameAt(state, strategicH3Index) } : {};
}
