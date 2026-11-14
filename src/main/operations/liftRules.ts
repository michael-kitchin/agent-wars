/**
 * Pure limits for how many ground units a lift may take and how a ship is filled.
 *
 * Purpose: Later callers share one cap, one city order, and one load, without reading the database or the map.
 * When to use: When choosing how many units to commit, which cities to try first, and which units board one ship.
 * Expected outcome: Deterministic numbers and id lists. The input arrays are not changed.
 * Exceptions: None. Callers pass already counted units.
 */

import { logTrace } from '../logger';

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
 * Orders two hex or unit ids by their raw string order.
 *
 * Purpose: `localeCompare` follows the machine locale and can reorder ids between runs.
 * When to use: City hexes and unit ids in this file.
 * Expected outcome: Negative when `left` is first, positive when `right` is first, zero when equal.
 * Exceptions: None.
 */
function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
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
    return compareIds(left.h3Index, right.h3Index);
  });
  logTrace('liftRules rankLiftCities', { cityCount: cities.length });
  return ranked;
}

/**
 * One ship load from the candidates still waiting.
 *
 * Purpose: A ship takes two infantry when it can, and otherwise one unit, with infantry ahead of armor.
 * When to use: Once per ship, over the units not yet assigned.
 * Expected outcome: Two lowest infantry ids, or one id. Other unit types are ignored. Empty when no infantry or armor remains.
 * Exceptions: None.
 */
export function fillShip(candidates: readonly { readonly id: string; readonly unitType: string }[]): string[] {
  const infantry = candidates
    .filter((unit) => unit.unitType === 'infantry')
    .map((unit) => unit.id)
    .sort(compareIds);
  const armor = candidates
    .filter((unit) => unit.unitType === 'armor')
    .map((unit) => unit.id)
    .sort(compareIds);
  const chosen = infantry.length >= 2 ? [infantry[0]!, infantry[1]!] : infantry.length === 1 ? [infantry[0]!] : armor.length > 0 ? [armor[0]!] : [];
  logTrace('liftRules fillShip', { candidateCount: candidates.length, chosen });
  return chosen;
}

/**
 * Ships required for a list of unit types.
 *
 * Purpose: Two infantry share a ship. Each armor unit needs its own. Other types do not add a ship.
 * When to use: Before keeping a force that the available ships can carry.
 * Expected outcome: Armor count plus the infantry count rounded up by twos. An empty list returns 0.
 * Exceptions: None.
 */
export function shipsNeeded(unitTypes: readonly string[]): number {
  let infantryCount = 0;
  let armorCount = 0;
  for (const unitType of unitTypes) {
    if (unitType === 'infantry') infantryCount += 1;
    else if (unitType === 'armor') armorCount += 1;
  }
  const needed = armorCount + Math.ceil(infantryCount / 2);
  logTrace('liftRules shipsNeeded', { typeCount: unitTypes.length, needed });
  return needed;
}
