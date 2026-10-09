/**
 * Identity of the loaded match map.
 *
 * Purpose: One id for the global world and each regional folder.
 * When to use: Profiles, snapshots, and the database key that records which map a match uses.
 * Expected outcome: `global` or a regional folder id such as `western_europe`.
 * Exceptions: None.
 */
export type GameMapId =
  | 'global'
  | 'eastern_asia'
  | 'western_europe'
  | 'southern_europe'
  | 'western_asia_north'
  | 'southern_asia_west'
  | 'northern_america'
  | 'southern_asia_east'
  | 'central_asia'
  | 'central_america'
  | 'northern_europe'
  | 'southern_africa'
  | 'libya_egypt_sudan'
  | 'maghreb'
  | 'west_africa_coast'
  | 'eastern_europe'
  | 'south_america'
  | 'south_eastern_asia'
  | 'caribbean'
  | 'australia_new_zealand'
  | 'middle_africa_north'
  | 'middle_africa_south'
  | 'southern_east_africa'
  | 'horn_and_great_lakes';

/**
 * Purchase costs and build gates for the active map.
 *
 * Purpose: Regional maps scale the global economy. The numbers live on the profile so prompts and production read one object.
 * When to use: Cost, minimum, Advanced, and strategic air-strike helpers.
 * Expected outcome: Positive integer costs. Armor, air, and naval minimums are urban-cell counts. Infantry stays at one urban cell and is not a field here.
 * Exceptions: None.
 */
export interface GameRules {
  /**
   * Purchase cost of one infantry unit.
   *
   * Contract: The global cost is 20. A regional map uses the number in its manifest economy.
   * When to use: Production spending and prompt cost sentences.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly infantryCost: number;
  /**
   * Purchase cost of one armor unit.
   *
   * Contract: Twice the infantry cost on every map.
   * When to use: Production spending and prompt cost sentences.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly armorCost: number;
  /**
   * Purchase cost of one naval unit.
   *
   * Contract: Five times the infantry cost on every map.
   * When to use: Production spending and prompt cost sentences.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly navalCost: number;
  /**
   * Purchase cost of one air unit.
   *
   * Contract: Three times the infantry cost on every map.
   * When to use: Production spending and prompt cost sentences.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly airCost: number;
  /**
   * Urban cells required before armor can be built.
   *
   * Contract: The global gate is 2. A regional map uses the minimum in its manifest economy.
   * When to use: `getAvailableBuildUnitTypes` and the build prompt.
   * Expected outcome: A positive integer. Infantry stays gated at 1 and is not stored here.
   * Exceptions: None.
   */
  readonly armorMinUrbanCells: number;
  /**
   * Urban cells required before air can be built.
   *
   * Contract: The global gate is 5. An airport is still required as well.
   * When to use: `getAvailableBuildUnitTypes` and the build prompt.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly airMinUrbanCells: number;
  /**
   * Urban cells required before naval can be built.
   *
   * Contract: The global gate is 10. A seaport is still required as well.
   * When to use: `getAvailableBuildUnitTypes` and the build prompt.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly navalMinUrbanCells: number;
  /**
   * Urban cells required before a side is Advanced.
   *
   * Contract: The global threshold is 21. A regional map uses the value in its manifest economy.
   * When to use: Tech bonus checks and the Advanced prompt sentence.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly advancedMinUrbanCells: number;
  /**
   * Urban cells removed by one strategic air strike.
   *
   * Contract: The global cap is 9. A regional map uses the strike size in its manifest economy.
   * When to use: The strategic branch of infrastructure destruction.
   * Expected outcome: A positive integer. A tactical strike still removes one named cell.
   * Exceptions: None.
   */
  readonly strategicStrikeUrbanCells: number;
}

/**
 * Scalerank cutoffs used while reading place and infrastructure metadata.
 *
 * Purpose: A regional map can show smaller cities than the global map without changing the global files.
 * When to use: Terrain classification and city-label filters.
 * Expected outcome: A feature at or below the maximum is eligible. The global urban, airport, and seaport maxima are 5. The global city-label maximum is 6.
 * Exceptions: None.
 */
export interface GameMapScaleranks {
  /**
   * Highest scalerank that still counts as urban overlay.
   *
   * Contract: The global maximum is 5. A regional map can include smaller places.
   * When to use: Urban classification while reading metadata.
   * Expected outcome: A feature at or below this rank is eligible.
   * Exceptions: None.
   */
  readonly urbanOverlay: number;
  /**
   * Highest scalerank that still counts as an airport.
   *
   * Contract: The global maximum is 5.
   * When to use: Airport classification while reading metadata.
   * Expected outcome: A feature at or below this rank is eligible.
   * Exceptions: None.
   */
  readonly airport: number;
  /**
   * Highest scalerank that still counts as a seaport.
   *
   * Contract: The global maximum is 5.
   * When to use: Seaport classification while reading metadata.
   * Expected outcome: A feature at or below this rank is eligible.
   * Exceptions: None.
   */
  readonly seaport: number;
  /**
   * Highest scalerank that still receives a city label.
   *
   * Contract: The global maximum is 6. A regional map can include smaller places.
   * When to use: City-label drawing.
   * Expected outcome: A place at or below this rank can be labeled.
   * Exceptions: None.
   */
  readonly cityLabel: number;
}

/**
 * Resolutions, rules, and labels for the map that is loaded in this process.
 *
 * Purpose: Main and renderer each keep a copy. Helpers read it instead of hard-coding the global H3 resolutions.
 * When to use: After a map load, and in tests that need a non-global profile.
 * Expected outcome: Tactical resolution is three levels below strategic. Global is strategic 1 and tactical 4.
 * Exceptions: None.
 */
export interface GameMapProfile {
  /**
   * Folder id of the loaded map, or `global`.
   *
   * Contract: The database and the snapshot name the same map.
   * When to use: Loaders, the new-game dialog, and save data.
   * Expected outcome: `global` or a regional folder id.
   * Exceptions: None.
   */
  readonly id: GameMapId;
  /**
   * Name shown for the loaded map.
   *
   * Contract: The dialog and snapshot can show a title without opening the manifest again.
   * When to use: New-game copy and any surface that prints the map name.
   * Expected outcome: `Global` for the world map. A regional display name otherwise.
   * Exceptions: None.
   */
  readonly displayName: string;
  /**
   * H3 resolution of strategic hexes on this map.
   *
   * Contract: Global is 1. Regional maps are 2 or 3.
   * When to use: `strategicH3Resolution` and parent-cell checks.
   * Expected outcome: A positive H3 resolution.
   * Exceptions: None.
   */
  readonly strategicResolution: number;
  /**
   * H3 resolution of tactical cells on this map.
   *
   * Contract: Always three levels below `strategicResolution`, so a battle is still 343 cells.
   * When to use: `tacticalH3Resolution` and child-cell checks.
   * Expected outcome: `strategicResolution + 3`.
   * Exceptions: None.
   */
  readonly tacticalResolution: number;
  /**
   * Urban share required for a regional control win.
   *
   * Contract: `null` means a control win needs every enemy home hex. A number means the controlled enemy home hexes must hold at least that share of the enemy home's generated urban cells.
   * When to use: End-of-turn victory and the regional win sentence.
   * Expected outcome: `null` on the global map. `0.75` on a regional map.
   * Exceptions: None.
   */
  readonly controlWinMinUrbanShare: number | null;
  /**
   * Economy and strike numbers for this map.
   *
   * Contract: Costs and gates change with the map. Battle ranges do not.
   * When to use: Production, tech, and strategic air-strike damage.
   * Expected outcome: The global column, or the economy block of the loaded regional manifest.
   * Exceptions: None.
   */
  readonly rules: GameRules;
  /**
   * Place and infrastructure scalerank cutoffs for this map.
   *
   * Contract: Regional maps can show smaller cities from the same metadata fields.
   * When to use: Classification and city labels.
   * Expected outcome: The global maxima, or the scalerank maxima from the loaded regional manifest.
   * Exceptions: None.
   */
  readonly scaleranks: GameMapScaleranks;
}
