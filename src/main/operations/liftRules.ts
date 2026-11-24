/**
 * Pure limits for a lift: how many ground units it may take, which cities come first, how a ship is filled, and how many enemy land units can reach a city first.
 *
 * Purpose: Later callers share one cap, one city order, one load, and one reinforcer count, without reading the database or the map.
 * When to use: When choosing how many units to commit, which cities to try first, which units board one ship, and whether a city is contested.
 * Expected outcome: Deterministic numbers and id lists. The input arrays and the snapshot are not changed.
 * Exceptions: None. Callers pass already counted units.
 */

import { compareCodeUnits } from '../../shared/codeUnitOrder';
import { NAVAL_CARGO_SLOTS, cargoSlotsUsed, carrierAcceptsLandUnit } from '../../shared/carrierCargoRules';
import { isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { isLandUnitType } from '../../shared/landUnitType';
import type { GameStateSnapshot } from '../gameDb';
import { logTrace } from '../logger';
import { CAMPAIGN_CONTACT_RADIUS } from '../openRouter/campaignRules';
import type { LiftTerrain } from './liftTerrain';

/**
 * Hexes around a city that must be empty of other sides before that city is a clear objective.
 *
 * Purpose: One radius for every caller that asks whether a city is clear.
 * When to use: Compare with `enemyUnitsWithin` for the city hex.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const LIFT_OBJECTIVE_CLEAR_RADIUS = 2;

/**
 * Largest share of a seat's ground units that may be committed while a campaign plan exists.
 *
 * Purpose: A campaign already has a claim on the army, so a lift takes a smaller share.
 * When to use: `liftGroundCap` when `hasCampaignPlan` is true.
 * Expected outcome: 0.25. The unit caps make the share grow with the game size.
 * Exceptions: None.
 */
export const LIFT_MAX_GROUND_SHARE = 0.25;

/**
 * Largest share of a seat's ground units that may be committed when no campaign plan exists.
 *
 * Purpose: Without a campaign, a lift may take a larger share of the same army.
 * When to use: `liftGroundCap` when `hasCampaignPlan` is false.
 * Expected outcome: 0.5.
 * Exceptions: None.
 */
export const LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN = 0.5;

/**
 * A city a lift may rank.
 *
 * Purpose: Callers pass the facts they already know. Ranking uses only the size and the hex id.
 * When to use: `rankLiftCities`.
 * Expected outcome: One row per known city.
 * Exceptions: None.
 */
export interface LiftCity {
  /**
   * Hex id of the city.
   *
   * Contract: Compared with `<` when two cities have the same urban count.
   * When to use: The sort key and the identity of the city.
   * Expected outcome: A stable hex id.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Urban hexes counted for this city.
   *
   * Contract: Higher counts sort first. Negative values are not expected.
   * When to use: The primary sort key.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  readonly urbanHexCount: number;
  /**
   * Whether the city sits in an enemy home region.
   *
   * Contract: Stored for the caller. Ranking ignores it.
   * When to use: When a later choice needs the flag without looking the city up again.
   * Expected outcome: True only when the caller decided the city is in an enemy home.
   * Exceptions: None.
   */
  readonly inEnemyHome: boolean;
  /**
   * Fortified hexes the caller already knows at this city.
   *
   * Contract: Stored for the caller. Ranking ignores it.
   * When to use: When a later filter rejects a fortified city.
   * Expected outcome: A non-negative count.
   * Exceptions: None.
   */
  readonly knownFortifiedCount: number;
}

/**
 * How many more ground units may be committed.
 *
 * Purpose: The share is of the whole ground force. Units already committed are subtracted by the caller.
 * When to use: Pass every infantry and armor unit of the seat, aboard or not, as `groundUnitCount`.
 * Expected outcome: `floor(groundUnitCount * share) - committedCount`, and never below zero. `committedCount` is a count of distinct units the caller already committed. This function does not merge those sets. Absent `campaignShare` keeps the two constants.
 * Exceptions: None.
 */
export function liftGroundCap(args: {
  readonly groundUnitCount: number;
  readonly committedCount: number;
  readonly hasCampaignPlan: boolean;
  /**
   * Share to use while a campaign plan exists.
   *
   * Contract: Absent means `LIFT_MAX_GROUND_SHARE`. Without a campaign, the share is at least `LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN`.
   * When to use: A posture passes `liftGroundShare`. Other callers omit it.
   * Expected outcome: A campaign uses this share. A match with no campaign stays on the no-campaign cap unless this share is larger.
   * Exceptions: None.
   */
  readonly campaignShare?: number;
}): number {
  const withCampaign = args.campaignShare ?? LIFT_MAX_GROUND_SHARE;
  const withoutCampaign = Math.max(LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN, args.campaignShare ?? LIFT_MAX_GROUND_SHARE_NO_CAMPAIGN);
  const share = args.hasCampaignPlan ? withCampaign : withoutCampaign;
  const remaining = Math.max(0, Math.floor(args.groundUnitCount * share) - args.committedCount);
  logTrace('liftRules liftGroundCap', {
    groundUnitCount: args.groundUnitCount,
    committedCount: args.committedCount,
    hasCampaignPlan: args.hasCampaignPlan,
    remaining,
  });
  return remaining;
}

/**
 * Returns cities largest first, then by hex id.
 *
 * Purpose: Two callers must try the same city before another of equal size.
 * When to use: After the caller has built the city list.
 * Expected outcome: A new array. `inEnemyHome` and `knownFortifiedCount` do not change the order. The input array is unchanged.
 * Exceptions: None.
 */
export function rankLiftCities(cities: readonly LiftCity[]): LiftCity[] {
  const ranked = [...cities].sort((left, right) => {
    if (left.urbanHexCount !== right.urbanHexCount) return right.urbanHexCount - left.urbanHexCount;
    return compareCodeUnits(left.h3Index, right.h3Index);
  });
  logTrace('liftRules rankLiftCities', { cityCount: cities.length });
  return ranked;
}

/**
 * One ship load from the candidates still waiting.
 *
 * Purpose: A ship has `NAVAL_CARGO_SLOTS` slots; armor takes 2 and infantry 1. Armor goes aboard first so repeated calls use exactly `shipsNeeded` ships.
 * When to use: Once per ship, over the units not yet assigned.
 * Expected outcome: Armor ids in id order, then infantry ids in id order, each added while the ship has room. Other unit types are ignored. Empty when no infantry or armor remains.
 * Exceptions: None.
 */
export function fillShip(candidates: readonly { readonly id: string; readonly unitType: string }[]): string[] {
  const byType = (unitType: string): string[] => candidates
    .filter((unit) => unit.unitType === unitType)
    .map((unit) => unit.id)
    .sort(compareCodeUnits);
  const typeById = new Map(candidates.map((unit) => [unit.id, unit.unitType] as const));
  const chosen: string[] = [];
  const aboardUnitTypes: string[] = [];
  for (const id of [...byType('armor'), ...byType('infantry')]) {
    const landUnitType = typeById.get(id) ?? '';
    if (!carrierAcceptsLandUnit({ carrierUnitType: 'naval', landUnitType, aboardUnitTypes })) continue;
    chosen.push(id);
    aboardUnitTypes.push(landUnitType);
  }
  logTrace('liftRules fillShip', { candidateCount: candidates.length, chosen });
  return chosen;
}

/**
 * Ships required for a list of unit types.
 *
 * Purpose: A ship has `NAVAL_CARGO_SLOTS` slots; infantry takes 1 and armor 2. Other types do not add a ship.
 * When to use: Before keeping a force that the available ships can carry.
 * Expected outcome: The slots the units take, divided by `NAVAL_CARGO_SLOTS` and rounded up. An empty list returns 0.
 * Exceptions: None.
 */
export function shipsNeeded(unitTypes: readonly string[]): number {
  const needed = Math.ceil(cargoSlotsUsed(unitTypes) / NAVAL_CARGO_SLOTS);
  logTrace('liftRules shipsNeeded', { typeCount: unitTypes.length, needed });
  return needed;
}

/**
 * Counts enemy land units that can reach a lift city before the lift does.
 *
 * Purpose: An objective counts as contested when enemy land units can arrive before the lift does.
 * When to use: Once per candidate city. Pass the lift's arrival time as `etaTurns`.
 * Expected outcome: The number of other seats' infantry and armor inside `etaTurns` and outside `LIFT_OBJECTIVE_CLEAR_RADIUS`.
 * Exceptions: None.
 */
export function countObjectiveReinforcers(args: {
  readonly state: GameStateSnapshot;
  readonly seatId: string;
  readonly cityH3: string;
  readonly etaTurns: number;
}): number {
  let count = 0;
  for (const unit of args.state.units) {
    if (unit.player === args.seatId) continue;
    if (!isLandUnitType(unit.unitType)) continue;
    if (!isWithinGridRangePure(args.cityH3, unit.h3Index, args.etaTurns)) continue;
    if (isWithinGridRangePure(args.cityH3, unit.h3Index, LIFT_OBJECTIVE_CLEAR_RADIUS)) continue;
    count += 1;
  }
  logTrace('liftRules countObjectiveReinforcers', {
    seatId: args.seatId,
    cityH3: args.cityH3,
    etaTurns: args.etaTurns,
    count,
  });
  return count;
}

/**
 * Inputs for the units a sea force must leave alone.
 *
 * Purpose: Raids and campaign lifts protect the same units, so both pass the same inputs.
 * When to use: As the argument of `liftProtectedUnitIds`.
 * Expected outcome: Plain values and read-only collections.
 * Exceptions: None.
 */
export interface LiftProtectedUnitArgs {
  /**
   * The snapshot with the full unit list.
   *
   * Contract: Includes units the seat has not seen, so a hidden enemy still counts as contact.
   * When to use: Reading the seat's own ground units.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly state: GameStateSnapshot;
  /**
   * The seat whose units are checked.
   *
   * Contract: An AI seat id.
   * When to use: Selecting the seat's own infantry and armor.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Terrain checks for enemy units nearby.
   *
   * Contract: Only `enemyUnitsWithin` is used.
   * When to use: Finding units in contact with an enemy.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly terrain: Pick<LiftTerrain, 'enemyUnitsWithin'>;
  /**
   * Ground units that guard the campaign's home.
   *
   * Contract: Ids from the campaign plan, or an empty list.
   * When to use: Always protected.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly defenderUnitIds: readonly string[];
  /**
   * Units already released or taken out earlier in this tick.
   *
   * Contract: Ids the commander has just taken, or an empty set.
   * When to use: Always protected.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly withheldIds: ReadonlySet<string>;
}

/**
 * The ids of units a sea force must not take.
 *
 * Purpose: Home defenders, withheld units, and ground units in contact with an enemy stay where they are, for raids and campaign lifts alike.
 * When to use: Before building a sea force.
 * Expected outcome: A new set of the defenders, the withheld ids, and each of the seat's infantry and armor with another side's unit within `CAMPAIGN_CONTACT_RADIUS`.
 * Exceptions: None.
 */
export function liftProtectedUnitIds(args: LiftProtectedUnitArgs): Set<string> {
  const protectedIds = new Set<string>([...args.defenderUnitIds, ...args.withheldIds]);
  for (const unit of args.state.units) {
    if (unit.player !== args.seatId) continue;
    if (!isLandUnitType(unit.unitType)) continue;
    if (args.terrain.enemyUnitsWithin(unit.h3Index, CAMPAIGN_CONTACT_RADIUS) > 0) protectedIds.add(unit.id);
  }
  logTrace('liftRules liftProtectedUnitIds', { seatId: args.seatId, protectedCount: protectedIds.size });
  return protectedIds;
}
