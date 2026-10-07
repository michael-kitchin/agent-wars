import type { GameMapId, GameRules } from './gameMapTypes';

/**
 * A regional folder id. The global map is not a catalog row.
 *
 * Purpose: Catalog keys and pack folder names use the same ids.
 * When to use: Indexing `REGIONAL_RULES_BY_ID`.
 * Expected outcome: Every `GameMapId` except `global`.
 * Exceptions: None.
 */
export type RegionalGameMapId = Exclude<GameMapId, 'global'>;

/**
 * Resolutions and economy numbers for one regional map.
 *
 * Purpose: A profile can be built from the catalog without reading a manifest for these fields.
 * When to use: Tests and the loader that installs a regional profile.
 * Expected outcome: Tactical resolution is three levels below strategic. `rules` holds the copied catalog integers.
 * Exceptions: None.
 */
export interface RegionalMapRules {
  /**
   * H3 resolution of strategic hexes.
   *
   * Contract: 2 or 3, matching the catalog table.
   * When to use: The profile's `strategicResolution`.
   * Expected outcome: A positive H3 resolution.
   * Exceptions: None.
   */
  readonly strategicResolution: number;
  /**
   * H3 resolution of tactical cells.
   *
   * Contract: `strategicResolution + 3`.
   * When to use: The profile's `tacticalResolution`.
   * Expected outcome: 5 when strategic is 2, and 6 when strategic is 3.
   * Exceptions: None.
   */
  readonly tacticalResolution: number;
  /**
   * Costs, build gates, Advanced threshold, and strategic strike size.
   *
   * Contract: The four costs and the strike count are the catalog integers, not a scale applied at runtime.
   * When to use: The profile's `rules`.
   * Expected outcome: Armor is twice infantry, naval is five times, and air is three times.
   * Exceptions: None.
   */
  readonly rules: GameRules;
}

/**
 * Packs a resolution pair and a rules object into one catalog row.
 *
 * Purpose: Keeps each map on one line of arguments without recomputing costs.
 * When to use: Only while building `REGIONAL_RULES_BY_ID`.
 * Expected outcome: The same numbers that were passed in.
 * Exceptions: None.
 */
function regionalMapRules(
  strategicResolution: number,
  tacticalResolution: number,
  rules: GameRules,
): RegionalMapRules {
  return { strategicResolution, tacticalResolution, rules };
}

/**
 * Economy and resolution numbers for every regional map.
 *
 * Purpose: The match reads this table. It does not recompute a scale and it does not parse the region summary.
 * When to use: Building a regional profile. Scalerank maxima stay on the manifest, not in this table.
 * Expected outcome: One row for each regional folder id.
 * Exceptions: None.
 */
export const REGIONAL_RULES_BY_ID: Readonly<Record<RegionalGameMapId, RegionalMapRules>> = {
  eastern_asia: regionalMapRules(2, 5, {
    infantryCost: 30, armorCost: 60, navalCost: 150, airCost: 90,
    armorMinUrbanCells: 3, airMinUrbanCells: 7, navalMinUrbanCells: 14,
    advancedMinUrbanCells: 27, strategicStrikeUrbanCells: 13,
  }),
  western_europe: regionalMapRules(3, 6, {
    infantryCost: 65, armorCost: 130, navalCost: 325, airCost: 195,
    armorMinUrbanCells: 9, airMinUrbanCells: 20, navalMinUrbanCells: 38,
    advancedMinUrbanCells: 60, strategicStrikeUrbanCells: 29,
  }),
  southern_europe: regionalMapRules(3, 6, {
    infantryCost: 45, armorCost: 90, navalCost: 225, airCost: 135,
    armorMinUrbanCells: 5, airMinUrbanCells: 12, navalMinUrbanCells: 21,
    advancedMinUrbanCells: 47, strategicStrikeUrbanCells: 20,
  }),
  western_asia_north: regionalMapRules(3, 6, {
    infantryCost: 25, armorCost: 50, navalCost: 125, airCost: 75,
    armorMinUrbanCells: 3, airMinUrbanCells: 10, navalMinUrbanCells: 13,
    advancedMinUrbanCells: 20, strategicStrikeUrbanCells: 11,
  }),
  southern_asia_west: regionalMapRules(3, 6, {
    infantryCost: 35, armorCost: 70, navalCost: 175, airCost: 105,
    armorMinUrbanCells: 5, airMinUrbanCells: 11, navalMinUrbanCells: 17,
    advancedMinUrbanCells: 32, strategicStrikeUrbanCells: 15,
  }),
  northern_america: regionalMapRules(2, 5, {
    infantryCost: 20, armorCost: 40, navalCost: 100, airCost: 60,
    armorMinUrbanCells: 3, airMinUrbanCells: 7, navalMinUrbanCells: 13,
    advancedMinUrbanCells: 22, strategicStrikeUrbanCells: 10,
  }),
  southern_asia_east: regionalMapRules(3, 6, {
    infantryCost: 20, armorCost: 40, navalCost: 100, airCost: 60,
    armorMinUrbanCells: 4, airMinUrbanCells: 9, navalMinUrbanCells: 12,
    advancedMinUrbanCells: 18, strategicStrikeUrbanCells: 10,
  }),
  central_asia: regionalMapRules(3, 6, {
    infantryCost: 20, armorCost: 40, navalCost: 100, airCost: 60,
    armorMinUrbanCells: 3, airMinUrbanCells: 8, navalMinUrbanCells: 11,
    advancedMinUrbanCells: 19, strategicStrikeUrbanCells: 9,
  }),
  central_america: regionalMapRules(3, 6, {
    infantryCost: 13, armorCost: 26, navalCost: 65, airCost: 39,
    armorMinUrbanCells: 2, airMinUrbanCells: 6, navalMinUrbanCells: 8,
    advancedMinUrbanCells: 12, strategicStrikeUrbanCells: 6,
  }),
  northern_europe: regionalMapRules(3, 6, {
    infantryCost: 40, armorCost: 80, navalCost: 200, airCost: 120,
    armorMinUrbanCells: 2, airMinUrbanCells: 13, navalMinUrbanCells: 24,
    advancedMinUrbanCells: 34, strategicStrikeUrbanCells: 17,
  }),
  southern_africa: regionalMapRules(3, 6, {
    infantryCost: 18, armorCost: 36, navalCost: 90, airCost: 54,
    armorMinUrbanCells: 4, airMinUrbanCells: 6, navalMinUrbanCells: 9,
    advancedMinUrbanCells: 16, strategicStrikeUrbanCells: 8,
  }),
  libya_egypt_sudan: regionalMapRules(3, 6, {
    infantryCost: 19, armorCost: 38, navalCost: 95, airCost: 57,
    armorMinUrbanCells: 3, airMinUrbanCells: 6, navalMinUrbanCells: 10,
    advancedMinUrbanCells: 23, strategicStrikeUrbanCells: 9,
  }),
  maghreb: regionalMapRules(3, 6, {
    infantryCost: 20, armorCost: 40, navalCost: 100, airCost: 60,
    armorMinUrbanCells: 5, airMinUrbanCells: 9, navalMinUrbanCells: 14,
    advancedMinUrbanCells: 18, strategicStrikeUrbanCells: 10,
  }),
  west_africa_coast: regionalMapRules(3, 6, {
    infantryCost: 20, armorCost: 40, navalCost: 100, airCost: 60,
    armorMinUrbanCells: 3, airMinUrbanCells: 7, navalMinUrbanCells: 12,
    advancedMinUrbanCells: 20, strategicStrikeUrbanCells: 10,
  }),
  eastern_europe: regionalMapRules(2, 5, {
    infantryCost: 19, armorCost: 38, navalCost: 95, airCost: 57,
    armorMinUrbanCells: 3, airMinUrbanCells: 6, navalMinUrbanCells: 11,
    advancedMinUrbanCells: 17, strategicStrikeUrbanCells: 8,
  }),
  south_america: regionalMapRules(2, 5, {
    infantryCost: 9, armorCost: 18, navalCost: 45, airCost: 27,
    armorMinUrbanCells: 2, airMinUrbanCells: 4, navalMinUrbanCells: 5,
    advancedMinUrbanCells: 8, strategicStrikeUrbanCells: 4,
  }),
  south_eastern_asia: regionalMapRules(2, 5, {
    infantryCost: 9, armorCost: 18, navalCost: 45, airCost: 27,
    armorMinUrbanCells: 2, airMinUrbanCells: 3, navalMinUrbanCells: 5,
    advancedMinUrbanCells: 8, strategicStrikeUrbanCells: 4,
  }),
  caribbean: regionalMapRules(3, 6, {
    infantryCost: 11, armorCost: 22, navalCost: 55, airCost: 33,
    armorMinUrbanCells: 3, airMinUrbanCells: 5, navalMinUrbanCells: 6,
    advancedMinUrbanCells: 8, strategicStrikeUrbanCells: 5,
  }),
  australia_new_zealand: regionalMapRules(2, 5, {
    infantryCost: 8, armorCost: 16, navalCost: 40, airCost: 24,
    armorMinUrbanCells: 2, airMinUrbanCells: 3, navalMinUrbanCells: 4,
    advancedMinUrbanCells: 9, strategicStrikeUrbanCells: 4,
  }),
  middle_africa_north: regionalMapRules(3, 6, {
    infantryCost: 10, armorCost: 20, navalCost: 50, airCost: 30,
    armorMinUrbanCells: 2, airMinUrbanCells: 4, navalMinUrbanCells: 6,
    advancedMinUrbanCells: 10, strategicStrikeUrbanCells: 5,
  }),
  middle_africa_south: regionalMapRules(3, 6, {
    infantryCost: 11, armorCost: 22, navalCost: 55, airCost: 33,
    armorMinUrbanCells: 2, airMinUrbanCells: 6, navalMinUrbanCells: 7,
    advancedMinUrbanCells: 9, strategicStrikeUrbanCells: 5,
  }),
  southern_east_africa: regionalMapRules(3, 6, {
    infantryCost: 11, armorCost: 22, navalCost: 55, airCost: 33,
    armorMinUrbanCells: 3, airMinUrbanCells: 6, navalMinUrbanCells: 8,
    advancedMinUrbanCells: 9, strategicStrikeUrbanCells: 5,
  }),
  horn_and_great_lakes: regionalMapRules(3, 6, {
    infantryCost: 11, armorCost: 22, navalCost: 55, airCost: 33,
    armorMinUrbanCells: 3, airMinUrbanCells: 6, navalMinUrbanCells: 8,
    advancedMinUrbanCells: 9, strategicStrikeUrbanCells: 5,
  }),
};
