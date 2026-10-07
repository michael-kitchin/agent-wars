/**
 * Shapes for the optional origin bonus and terrain bonus: a unit standing in its birth country, or (in battles) on its birth terrain kind,
 * adds 2 (Low) or 4 (High) to the threshold of every hit roll it makes.
 *
 * Purpose: Shared by main-process dice, AI tools, and renderer tooltips so every surface speaks the same vocabulary.
 * When to use: Import with `import type`; the runtime rules live in `originBonusRules.ts`.
 * Expected outcome: Plain readonly data with no behavior.
 * Exceptions: None.
 */

import type { ActiveBonusLevel } from './bonusLevel';

/**
 * Amount an origin bonus adds to a hit threshold.
 *
 * Purpose: Keeps the bonus a closed set so stacking can never grow it past the larger level's amount.
 * When to use: `CombatUnit.originHitBonus` and lookup results.
 * Expected outcome: `0` when the unit does not qualify, `2` at Low, `4` at High.
 * Exceptions: None.
 */
export type OriginHitBonus = 0 | 2 | 4;

/**
 * Why a unit qualifies for an origin bonus.
 *
 * Purpose: Lets tools, briefings, and tooltips name the reason without restating the rules.
 * When to use: Elements of `originBonusSources` results.
 * Expected outcome: `origin` for the origin bonus, `terrain` for the terrain bonus.
 * Exceptions: None.
 */
export type OriginBonusSource = 'origin' | 'terrain';

/**
 * Where a roll happens, which decides which bonuses can apply.
 *
 * Purpose: The terrain bonus applies only in tactical battles.
 * When to use: Input to `originBonusSources`.
 * Expected outcome: `strategic` for the strategic map, `tactical` for tactical battles.
 * Exceptions: None.
 */
export type OriginBonusTheater = 'strategic' | 'tactical';

/**
 * The optional bonus match flags, their levels, and the start month.
 *
 * Purpose: One value object for the persisted new-game choices.
 * When to use: Read from a snapshot with `originBonusSettingsFromSnapshot` or from the database in main.
 * Expected outcome: Both `false` means every bonus check returns no bonus.
 * Exceptions: None.
 */
export interface OriginBonusSettings {
  /**
   * Whether the origin bonus is on.
   *
   * Contract: Mirrors the `origin_bonus_enabled` match setting.
   * When to use: Before the origin bonus comparison.
   * Expected outcome: `true` lets a unit in its birth country qualify.
   * Exceptions: None.
   */
  readonly originBonusEnabled: boolean;
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
   * How strong the origin bonus is.
   *
   * Contract: Read only when `originBonusEnabled` is true. Missing means low.
   * When to use: Through `originBonusLevelFor`, never directly.
   * Expected outcome: Picks the amount a qualifying unit adds.
   * Exceptions: None.
   */
  readonly originBonusLevel?: ActiveBonusLevel;
  /**
   * How strong the terrain bonus is.
   *
   * Contract: Read only when `terrainBonusEnabled` is true. Missing means low.
   * When to use: Through `originBonusLevelFor`, never directly.
   * Expected outcome: Picks the amount a qualifying unit adds.
   * Exceptions: None.
   */
  readonly terrainBonusLevel?: ActiveBonusLevel;
  /**
   * How strong the weather bonus is.
   *
   * Contract: Read only when `weatherBonusEnabled` is true. Missing means low.
   * When to use: Through `weatherBonusLevelOf`, never directly.
   * Expected outcome: Picks which weather slows a unit and how much attack it loses.
   * Exceptions: None.
   */
  readonly weatherBonusLevel?: ActiveBonusLevel;
  /**
   * Calendar month of turn 1, 1 for January through 12 for December.
   *
   * Contract: Optional. Missing or invalid means January.
   * When to use: With the strategic turn number to pick the current month.
   * Expected outcome: A value `parseStartMonth` accepts.
   * Exceptions: None.
   */
  readonly startMonth?: number;
  /**
   * Whether the tech bonus is on.
   *
   * Contract: Optional so existing settings literals stay valid. Missing means off.
   * When to use: Before adding tech points. A missing row in a saved match is off.
   * Expected outcome: `true` lets an Advanced unit add attack, and defense when the level is high.
   * Exceptions: None.
   */
  readonly techBonusEnabled?: boolean;
  /**
   * How strong the tech bonus is.
   *
   * Contract: Read only when `techBonusEnabled` is true. Missing next to a true flag means low.
   * When to use: Through `techBonusLevelOf`, never directly.
   * Expected outcome: Low adds attack only. High adds attack and defense.
   * Exceptions: None.
   */
  readonly techBonusLevel?: ActiveBonusLevel;
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
   * Contract: Majority country of a strategic hex, or the birth country of a tactical cell; `null` when unknown.
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
