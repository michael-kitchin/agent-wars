/**
 * Birth metadata for units: where a unit was created and which country that place belongs to.
 *
 * Purpose: Shared shapes for origin selection (main), persistence, snapshots, renderer flags, and origin bonuses.
 * When to use: Import these types wherever unit origin flows. Rules use them only through origin bonuses, when the match has those flags on.
 * Expected outcome: Plain readonly data with no behavior.
 * Exceptions: None.
 */

/**
 * Where a unit was born and the country of that place.
 *
 * Purpose: Drives the flag before a unit's name and the origin tooltip.
 * When to use: Chosen once when a unit is inserted; read from snapshots afterwards.
 * Expected outcome: `birthH3Index` is always set; every other field may be `null`.
 * Exceptions: None.
 */
export interface UnitOrigin {
  /**
   * The strategic hex the unit was created in.
   *
   * Contract: Always a strategic H3 index.
   * When to use: Identifying the birth hex.
   * Expected outcome: Equals the unit's hex at creation time.
   * Exceptions: None.
   */
  readonly birthH3Index: string;
  /**
   * The tactical cell chosen inside the birth hex.
   *
   * Contract: A tactical child of `birthH3Index`, or `null` when the hex had no land child.
   * When to use: Looking up the birth country and terrain.
   * Expected outcome: Intact urban cells are preferred, then land cells.
   * Exceptions: None.
   */
  readonly birthTacticalH3Index: string | null;
  /**
   * Pipeline terrain kind of the birth cell, or of the strategic hex when there is no cell.
   *
   * Contract: A valid pipeline terrain kind, or `null` when unknown.
   * When to use: The origin tooltip's terrain line.
   * Expected outcome: For example `plains` or `forest`. Urban is not a terrain kind; see `birthIsUrban`.
   * Exceptions: None.
   */
  readonly birthTerrainKind: string | null;
  /**
   * Whether the birth cell was intact urban.
   *
   * Contract: `true` only when the chosen tactical cell was urban and not rubble. `false` when the cell is land, or when the hex had no birth cell.
   * When to use: Telling two origins apart when they share a country and terrain kind. The origin tooltip does not show this flag, and origin bonuses ignore it.
   * Expected outcome: Independent of `birthTerrainKind`, which stays the cell's base kind.
   * Exceptions: None.
   */
  readonly birthIsUrban: boolean;
  /**
   * Display name of the birth country.
   *
   * Contract: `null` when the birth cell has no country (for example open water or no cell).
   * When to use: The origin tooltip and toast flags.
   * Expected outcome: The canonical Natural Earth country name.
   * Exceptions: None.
   */
  readonly birthCountryName: string | null;
  /**
   * ISO 3166-1 alpha-2 code of the birth country.
   *
   * Contract: Two uppercase letters, or `null` when unknown.
   * When to use: Selecting the flag asset.
   * Expected outcome: `null` renders the placeholder flag.
   * Exceptions: None.
   */
  readonly birthCountryCode: string | null;
}

/**
 * The country that a tactical cell counts as for unit births.
 *
 * Purpose: Precomputed per tactical cell so birth selection needs no naming data at spawn time.
 * When to use: Values of the terrain cache's birth-country map.
 * Expected outcome: Shared, interned objects; equal countries are the same object.
 * Exceptions: None.
 */
export interface BirthCountry {
  /**
   * Canonical country display name.
   *
   * Contract: Non-empty.
   * When to use: `UnitOrigin.birthCountryName`.
   * Expected outcome: The same name for the same code everywhere.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * ISO 3166-1 alpha-2 code, when Natural Earth has one.
   *
   * Contract: Two uppercase letters or `null`.
   * When to use: `UnitOrigin.birthCountryCode`.
   * Expected outcome: Selects the flag asset.
   * Exceptions: None.
   */
  readonly code: string | null;
}
