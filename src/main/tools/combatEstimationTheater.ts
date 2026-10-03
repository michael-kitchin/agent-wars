/**
 * Theater rules for `estimate_combat`: which units take part, where they stand, and who can fire at whom.
 *
 * Purpose: Lets one estimator serve strategic turns and tactical battles while each theater keeps the exact unit
 * filters and reach rules its own combat resolution uses.
 * When to use: Build one theater per `estimate_combat` call and pass it to the estimator.
 * Expected outcome: Pure lookups over the snapshot; only air return-fire checks read the game database.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import type { CombatUnit } from '../combatUnitTypes';
import { getRange } from '../combatConstants';
import { hasIntactAirportAtStrategicAirBase } from '../returnFireAirportLookup';
import type { ReturnFireEligibilityContext } from '../../shared/returnFireEligibility';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import type { TacticalBattleSnapshot, TacticalSubUnitSnapshot } from '../../shared/tacticalBattleTypes';
import {
  effectiveTacticalRangedMaxRangeForAttacker,
  tacticalMovementTerrainAnchorH3,
  tacticalRangedDirectFirePassesTerrainAndRange,
} from '../../shared/tacticalTerrainCombatModifiers';
import {
  buildTacticalReturnFireContext,
  tacticalEmbarkedLandExcludedFromRangedInput,
} from '../tacticalBattle/tacticalCombatInput';
import { gridHopDistanceBetween } from './assessUnitProximity';
import { logTrace } from '../logger';

/**
 * Engagement kinds `estimate_combat` predicts.
 *
 * Purpose: Shared vocabulary between the estimator and its theaters.
 * When to use: Theater lookups that depend on the engagement.
 * Expected outcome: `ranged` or `melee`.
 * Exceptions: None.
 */
export type CombatEstimationEngagementType = 'ranged' | 'melee';

/**
 * Outcome of looking up one unit by id for an engagement.
 *
 * Purpose: Distinguishes usable units from unknown or excluded ones without throwing.
 * When to use: Returned by `CombatEstimationTheater.findUnit`.
 * Expected outcome: `unit` positioned on its combat cell, or a model-facing `error`.
 * Exceptions: None.
 */
export type CombatEstimationUnitLookup =
  | { readonly unit: CombatUnit; readonly error?: undefined }
  | { readonly unit?: undefined; readonly error: string };

/**
 * Units on one cell split into engagement participants and excluded ids.
 *
 * Purpose: Lets the estimator warn about units that are present but sit out the engagement.
 * When to use: Returned by `CombatEstimationTheater.listUnitsAt`.
 * Expected outcome: Every unit on the cell appears in exactly one list.
 * Exceptions: None.
 */
export interface CombatEstimationCellUnits {
  /**
   * Units that take part in the engagement.
   *
   * Contract: Positioned on the queried cell.
   * When to use: Automatic defender lists.
   * Expected outcome: Snapshot order.
   * Exceptions: None.
   */
  readonly participants: readonly CombatUnit[];
  /**
   * Units on the cell that sit out this engagement, such as cargo embarked at sea.
   *
   * Contract: Disjoint from `participants`.
   * When to use: Warnings.
   * Expected outcome: Snapshot order.
   * Exceptions: None.
   */
  readonly excluded: readonly CombatUnit[];
}

/**
 * Theater rule set consumed by the `estimate_combat` estimator.
 *
 * Purpose: Keeps the estimator's math theater-neutral while unit filters and reach rules match combat resolution.
 * When to use: Build with `buildStrategicCombatEstimationTheater` or `buildTacticalCombatEstimationTheater`.
 * Expected outcome: All members are side-effect free except the airport lookup inside `returnFireContext`.
 * Exceptions: None.
 */
export interface CombatEstimationTheater {
  /**
   * Which theater the rules describe.
   *
   * Contract: `tactical` only for an active battle snapshot.
   * When to use: Logging and theater-specific wording.
   * Expected outcome: `strategic` or `tactical`.
   * Exceptions: None.
   */
  readonly theater: 'strategic' | 'tactical';
  /**
   * Return-fire rules for ranged estimates.
   *
   * Contract: Same context the theater's ranged resolution uses.
   * When to use: `canDefenderReturnFireAtAnyAttackerHex`.
   * Expected outcome: Complete context for the theater.
   * Exceptions: None.
   */
  readonly returnFireContext: ReturnFireEligibilityContext;
  /**
   * Phrase appended to "cannot reach target" errors explaining which rules blocked the shot.
   *
   * Contract: Empty or starts with a space.
   * When to use: Out-of-range attacker errors.
   * Expected outcome: Short model-facing text.
   * Exceptions: None.
   */
  readonly blockedShotRules: string;
  /**
   * Looks up one unit by id for an engagement.
   *
   * Contract: Returns an error for unknown ids and for units that sit out this engagement type in the theater's
   * resolution; otherwise the unit with `h3Index` set to its combat cell.
   * When to use: Attacker and defender id lists.
   * Expected outcome: A `CombatEstimationUnitLookup`.
   * Exceptions: None.
   */
  findUnit(unitId: string, engagementType: CombatEstimationEngagementType): CombatEstimationUnitLookup;
  /**
   * Lists units standing on one cell for an engagement.
   *
   * Contract: Includes every player; callers filter by side.
   * When to use: Automatic defenders at the target cell.
   * Expected outcome: A `CombatEstimationCellUnits` split.
   * Exceptions: None.
   */
  listUnitsAt(h3Index: string, engagementType: CombatEstimationEngagementType): CombatEstimationCellUnits;
  /**
   * Explains why an attacker type cannot be estimated in this theater.
   *
   * Contract: Null when the type is supported.
   * When to use: Before building attackers, for both real and assumed attackers.
   * Expected outcome: Model-facing error text or null.
   * Exceptions: None.
   */
  rejectAttackerType(unitType: string): string | null;
  /**
   * Whether a ranged shot from one cell can hit another under theater rules.
   *
   * Contract: Same legality the theater's ranged order validation uses.
   * When to use: Ranged attacker range checks.
   * Expected outcome: True only for legal shots.
   * Exceptions: None.
   */
  canFireAt(unitType: string, fromH3: string, targetH3: string): boolean;
  /**
   * Short description of a unit type's fire reach from one cell, such as `range 2`.
   *
   * Contract: Air mentions the airport requirement.
   * When to use: Return-fire details and range errors.
   * Expected outcome: Model-facing text without surrounding punctuation.
   * Exceptions: None.
   */
  describeFireReach(unitType: string, fromH3: string): string;
}

/**
 * Model-facing error for land units that ride a naval unit at sea.
 *
 * Purpose: Shared wording for both theaters.
 * When to use: `findUnit` exclusions.
 * Expected outcome: Names the unit and the engagement it sits out.
 * Exceptions: None.
 */
function embarkedAtSeaError(unitId: string, engagementType: CombatEstimationEngagementType): string {
  return `${unitId} is embarked on a naval unit at sea and does not take part in ${engagementType} combat`;
}

/**
 * Builds strategic-turn rules for `estimate_combat`.
 *
 * Purpose: Strategic reach tables, airport-gated air return fire, and the strategic resolution rule that land units
 * embarked at sea take part in neither ranged nor melee combat.
 * When to use: Every `estimate_combat` call outside a tactical battle.
 * Expected outcome: A theater over `state.units`; embarked-at-sea means `embarkedOnNavalUnitId` is set, the unit is
 * infantry or armor, and its hex terrain is `water`.
 * Exceptions: None.
 */
export function buildStrategicCombatEstimationTheater(state: GameStateSnapshot): CombatEstimationTheater {
  logTrace('combatEstimationTheater buildStrategicCombatEstimationTheater', {
    turnNumber: state.turnNumber,
    unitCount: state.units.length,
  });
  const terrainByH3 = new Map(state.hexes.map((h) => [h.h3Index, h.terrain] as const));
  const isEmbarkedAtSea = (u: GameStateSnapshot['units'][number]): boolean =>
    !!u.embarkedOnNavalUnitId &&
    (u.unitType === 'infantry' || u.unitType === 'armor') &&
    terrainByH3.get(u.h3Index) === 'water';
  const toCombatUnit = (u: GameStateSnapshot['units'][number]): CombatUnit => ({
    id: u.id,
    player: u.player,
    unitType: u.unitType,
    h3Index: u.h3Index,
  });
  return {
    theater: 'strategic',
    returnFireContext: { theater: 'strategic', hasIntactAirportAtAirBase: hasIntactAirportAtStrategicAirBase },
    blockedShotRules: '',
    findUnit(unitId, engagementType) {
      const u = state.units.find((x) => x.id === unitId);
      if (!u) return { error: `Unit not found: ${unitId}` };
      if (isEmbarkedAtSea(u)) return { error: embarkedAtSeaError(unitId, engagementType) };
      return { unit: toCombatUnit(u) };
    },
    listUnitsAt(h3Index) {
      const here = state.units.filter((u) => u.h3Index === h3Index);
      return {
        participants: here.filter((u) => !isEmbarkedAtSea(u)).map(toCombatUnit),
        excluded: here.filter(isEmbarkedAtSea).map(toCombatUnit),
      };
    },
    rejectAttackerType: () => null,
    canFireAt(unitType, fromH3, targetH3) {
      const dist = gridHopDistanceBetween(fromH3, targetH3);
      return dist !== null && getRange(unitType) >= dist;
    },
    describeFireReach(unitType) {
      return unitType === 'air'
        ? `strike range ${AIR_STRIKE_RANGE_HEXES}, airport intact`
        : `range ${getRange(unitType)}`;
    },
  };
}

/**
 * Builds tactical-battle rules for `estimate_combat`.
 *
 * Purpose: Battle range, terrain, and line-of-sight rules; sub-units placed on their combat cell (cargo shares its
 * carrier's cell); and the battle resolution rule that land cargo embarked at sea sits out ranged combat but not melee.
 * When to use: Every `estimate_combat` call during a tactical battle.
 * Expected outcome: A theater over `battle.subUnits`. Air attackers are rejected because battle air strikes use
 * different dice than ranged fire.
 * Exceptions: None.
 */
export function buildTacticalCombatEstimationTheater(battle: TacticalBattleSnapshot): CombatEstimationTheater {
  logTrace('combatEstimationTheater buildTacticalCombatEstimationTheater', {
    battleId: battle.battleId,
    subUnitCount: battle.subUnits.length,
  });
  const footprint = new Set(battle.res4ChildH3Indexes);
  const isExcluded = (u: TacticalSubUnitSnapshot, engagementType: CombatEstimationEngagementType): boolean =>
    engagementType === 'ranged' && tacticalEmbarkedLandExcludedFromRangedInput(battle, battle.subUnits, u);
  const toCombatUnit = (u: TacticalSubUnitSnapshot): CombatUnit => ({
    id: u.id,
    player: u.player,
    unitType: u.unitType,
    h3Index: tacticalMovementTerrainAnchorH3(u, battle.subUnits),
  });
  return {
    theater: 'tactical',
    returnFireContext: buildTacticalReturnFireContext(battle),
    blockedShotRules: ' under battle range, terrain, and line-of-sight rules',
    findUnit(unitId, engagementType) {
      const u = battle.subUnits.find((x) => x.id === unitId);
      if (!u) return { error: `Unit not found: ${unitId}` };
      if (isExcluded(u, engagementType)) return { error: embarkedAtSeaError(unitId, engagementType) };
      return { unit: toCombatUnit(u) };
    },
    listUnitsAt(h3Index, engagementType) {
      const here = battle.subUnits.filter((u) => toCombatUnit(u).h3Index === h3Index);
      return {
        participants: here.filter((u) => !isExcluded(u, engagementType)).map(toCombatUnit),
        excluded: here.filter((u) => isExcluded(u, engagementType)).map(toCombatUnit),
      };
    },
    rejectAttackerType(unitType) {
      return unitType === 'air'
        ? 'estimate_combat does not cover air strikes in battle; it predicts ranged and melee attacks by ground and naval units only.'
        : null;
    },
    canFireAt(unitType, fromH3, targetH3) {
      return tacticalRangedDirectFirePassesTerrainAndRange(battle, footprint, unitType, fromH3, targetH3);
    },
    describeFireReach(unitType, fromH3) {
      return unitType === 'air'
        ? 'anywhere in the battle, airport intact'
        : `battle range ${effectiveTacticalRangedMaxRangeForAttacker(battle, unitType, fromH3)}`;
    },
  };
}
