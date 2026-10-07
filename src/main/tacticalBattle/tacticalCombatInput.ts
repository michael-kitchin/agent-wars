/**
 * Battle combat input rules shared by tactical resolution and the tactical AI tools.
 *
 * Purpose: One place for "which sub-units take part in ranged dice" and "which return-fire rules apply" so combat
 * estimates and assessments never drift from what Ready resolution actually rolls.
 * When to use: Building ranged combat input or return-fire checks for a tactical battle snapshot.
 * Expected outcome: Pure predicates plus a context whose airport callback reads the game database lazily.
 * Exceptions: None.
 */

import type { ReturnFireEligibilityContext } from '../../shared/returnFireEligibility';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import { hasIntactAirportAtTacticalAirBase } from '../returnFireAirportLookup';
import { tacticalLogQuery } from './tacticalLogging';

/**
 * Returns whether a land sub-unit should be excluded from ranged combat input like strategic embarked-at-sea infantry.
 *
 * Purpose: Mirrors `isEmbarkedLandUnitOnWater` using tactical terrain and sealift links instead of the strategic DB.
 * When to use: Building `CombatUnit[]` for `runRangedPhase` on a tactical snapshot, anti-air eligibility, and ranged
 * estimates or assessments in battle tools.
 * Expected outcome: True only for infantry/armor embarked on a naval unit whose cell resolves to water terrain.
 * Exceptions: None.
 */
export function tacticalEmbarkedLandExcludedFromRangedInput(
  battle: TacticalBattleSnapshot,
  subUnits: readonly TacticalSubUnitSnapshot[],
  u: TacticalSubUnitSnapshot
): boolean {
  if (u.unitType !== 'infantry' && u.unitType !== 'armor') return false;
  const emb = u.embarkedOnSubUnitId;
  if (!emb) return false;
  const naval = subUnits.find((x) => x.id === emb);
  if (!naval || naval.unitType !== 'naval') return false;
  const kind = battle.tacticalTerrainKindByH3?.[naval.h3Index] ?? battle.strategicHexTerrainKind ?? 'plains';
  tacticalLogQuery('tacticalCombatInput tacticalEmbarkedLandExcludedFromRangedInput', {
    battleId: battle.battleId,
    subUnitId: u.id,
    carrierId: naval.id,
    carrierTerrain: kind,
  });
  return kind === 'water';
}

/**
 * Builds the return-fire eligibility context used for ranged dice inside one battle.
 *
 * Purpose: Same theater, terrain, footprint, and airport rules for tactical ranged resolution and battle tools.
 * When to use: Passing return-fire rules to `runRangedPhase` or `canDefenderReturnFireAtAttackerHex` for a battle.
 * Expected outcome: A tactical context; the airport callback queries the game database only when an air defender
 * is checked, and returns false (with an error log) when that lookup fails.
 * Exceptions: None.
 */
export function buildTacticalReturnFireContext(battle: TacticalBattleSnapshot): ReturnFireEligibilityContext {
  tacticalLogQuery('tacticalCombatInput buildTacticalReturnFireContext', {
    battleId: battle.battleId,
    footprintCellCount: battle.tacticalChildH3Indexes.length,
  });
  return {
    theater: 'tactical',
    tacticalBattle: battle,
    tacticalFootprint: new Set(battle.tacticalChildH3Indexes),
    hasIntactAirportAtAirBase: hasIntactAirportAtTacticalAirBase,
  };
}
