import type { GameMapId } from './gameMapTypes';

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
 * Resolutions for one regional map.
 *
 * Purpose: The loader checks the manifest against this pair. Prices live on the manifest.
 * When to use: Tests and the loader that installs a regional profile.
 * Expected outcome: Tactical resolution is three levels below strategic.
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
}

/**
 * Share of generated enemy-home urban cells a regional control win requires.
 *
 * Purpose: A regional control win needs controlled enemy home hexes holding at least this share of the enemy home's generated urban cells.
 * When to use: Installing a regional profile.
 * Expected outcome: `0.75`.
 * Exceptions: None.
 */
export const REGIONAL_CONTROL_WIN_MIN_URBAN_SHARE = 0.75;

/**
 * Packs a resolution pair into one catalog row.
 *
 * Purpose: Keeps each map on one line.
 * When to use: Only while building `REGIONAL_RULES_BY_ID`.
 * Expected outcome: The same resolutions that were passed in.
 * Exceptions: None.
 */
function regionalMapRules(strategicResolution: number, tacticalResolution: number): RegionalMapRules {
  return { strategicResolution, tacticalResolution };
}

/**
 * Resolution pairs for every regional map.
 *
 * Purpose: The match checks a manifest against this table. Economy numbers stay in the manifest.
 * When to use: Building a regional profile. Scalerank maxima stay on the manifest.
 * Expected outcome: One row for each regional folder id.
 * Exceptions: None.
 */
export const REGIONAL_RULES_BY_ID: Readonly<Record<RegionalGameMapId, RegionalMapRules>> = {
  eastern_asia: regionalMapRules(2, 5),
  western_europe: regionalMapRules(3, 6),
  southern_europe: regionalMapRules(3, 6),
  western_asia_north: regionalMapRules(3, 6),
  southern_asia_west: regionalMapRules(3, 6),
  northern_america: regionalMapRules(2, 5),
  southern_asia_east: regionalMapRules(3, 6),
  central_asia: regionalMapRules(3, 6),
  central_america: regionalMapRules(3, 6),
  northern_europe: regionalMapRules(3, 6),
  southern_africa: regionalMapRules(3, 6),
  libya_egypt_sudan: regionalMapRules(3, 6),
  maghreb: regionalMapRules(3, 6),
  west_africa_coast: regionalMapRules(3, 6),
  eastern_europe: regionalMapRules(2, 5),
  south_america: regionalMapRules(2, 5),
  south_eastern_asia: regionalMapRules(2, 5),
  caribbean: regionalMapRules(3, 6),
  australia_new_zealand: regionalMapRules(2, 5),
  middle_africa_north: regionalMapRules(3, 6),
  middle_africa_south: regionalMapRules(3, 6),
  southern_east_africa: regionalMapRules(3, 6),
  horn_and_great_lakes: regionalMapRules(3, 6),
};
