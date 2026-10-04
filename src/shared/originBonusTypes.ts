/**
 * Shapes for the optional origin bonuses: a unit standing in its birth country, or (in battles) on its birth terrain kind,
 * adds 1 to the threshold of every hit roll it makes.
 *
 * Purpose: Shared by main-process dice, AI tools, and renderer tooltips so every surface speaks the same vocabulary.
 * When to use: Import with `import type`; the runtime rules live in `originBonusRules.ts`.
 * Expected outcome: Plain readonly data with no behavior.
 * Exceptions: None.
 */

/**
 * Amount an origin bonus adds to a hit threshold.
 *
 * Purpose: Keeps the bonus a closed set so it can never grow past +1 by stacking.
 * When to use: `CombatUnit.originHitBonus` and lookup results.
 * Expected outcome: `0` when the unit does not qualify, `1` when it does.
 * Exceptions: None.
 */
export type OriginHitBonus = 0 | 1;

/**
 * Why a unit qualifies for an origin bonus.
 *
 * Purpose: Lets tools, briefings, and tooltips name the reason without restating the rules.
 * When to use: Elements of `originBonusSources` results.
 * Expected outcome: `country` for the country bonus, `terrain` for the terrain bonus.
 * Exceptions: None.
 */
export type OriginBonusSource = 'country' | 'terrain';

/**
 * Where a roll happens, which decides which bonuses can apply.
 *
 * Purpose: The terrain bonus applies only in tactical battles.
 * When to use: Input to `originBonusSources`.
 * Expected outcome: `strategic` for the res1 map, `tactical` for res4 battles.
 * Exceptions: None.
 */
export type OriginBonusTheater = 'strategic' | 'tactical';

/**
 * The two origin bonus match flags.
 *
 * Purpose: One value object for the persisted new-game choices.
 * When to use: Read from a snapshot with `originBonusSettingsFromSnapshot` or from the database in main.
 * Expected outcome: Both `false` means every bonus check returns no bonus.
 * Exceptions: None.
 */
export interface OriginBonusSettings {
  /**
   * Whether the country bonus is on.
   *
   * Contract: Mirrors the `country_bonus_enabled` match setting.
   * When to use: Before the country test.
   * Expected outcome: `true` lets a unit in its birth country qualify.
   * Exceptions: None.
   */
  readonly countryBonusEnabled: boolean;
  /**
   * Whether the terrain bonus is on.
   *
   * Contract: Mirrors the `terrain_bonus_enabled` match setting.
   * When to use: Before the terrain test, which runs only in battles.
   * Expected outcome: `true` lets a sub-unit on its birth terrain kind qualify.
   * Exceptions: None.
   */
  readonly terrainBonusEnabled: boolean;
  /**
   * Whether the weather bonus is on.
   *
   * Contract: Optional so existing settings literals stay valid. Missing means off.
   * When to use: Before any weather penalty.
   * Expected outcome: `true` applies movement and attack penalties to units that lack the matching tag.
   * Exceptions: None.
   */
  readonly weatherBonusEnabled?: boolean;
  /**
   * Calendar month of turn 1, 1 for January through 12 for December.
   *
   * Contract: Optional. Missing or invalid means January.
   * When to use: With the strategic turn number to pick the current month.
   * Expected outcome: A value `parseStartMonth` accepts.
   * Exceptions: None.
   */
  readonly startMonth?: number;
}

/**
 * The country and terrain of the place where a roll happens.
 *
 * Purpose: Separates "where is the unit" from "does it qualify" so both theaters share one matcher.
 * When to use: Built by the place helpers in `originBonusRules.ts`.
 * Expected outcome: `null` fields never match anything.
 * Exceptions: None.
 */
export interface OriginBonusPlace {
  /**
   * Country name of the place.
   *
   * Contract: Majority country of a res1 hex, or the birth country of a res4 cell; `null` when unknown.
   * When to use: Compared with `UnitOrigin.birthCountryName`.
   * Expected outcome: Canonical country display name.
   * Exceptions: None.
   */
  readonly countryName: string | null;
  /**
   * Raw terrain kind of the place.
   *
   * Contract: `null` on the strategic map, where the terrain bonus does not apply.
   * When to use: Normalized and compared with `UnitOrigin.birthTerrainKind`.
   * Expected outcome: A pipeline terrain kind or a legacy alias.
   * Exceptions: None.
   */
  readonly terrainKind: string | null;
}
