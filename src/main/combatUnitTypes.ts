import type { OriginHitBonus } from '../shared/originBonusTypes';
import type { TerrainCover } from '../shared/terrainCoverRules';
import type { WeatherAttackPenalty } from '../shared/weatherBonusTypes';

/**
 * Documents the `CombatUnit` interface as a named contract surface (export interface CombatUnit).

 * Purpose: Supports maintainability by documenting why `CombatUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface CombatUnit {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `player` member (player: string;).

   * Contract: Describes stable behavior for callers of `player` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
player: string;
    /**
   * Specifies the contract for the `unitType` member (unitType: string;).

   * Contract: Describes stable behavior for callers of `unitType` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
unitType: string;
    /**
   * Specifies the contract for the `h3Index` member (h3Index: string;).

   * Contract: Describes stable behavior for callers of `h3Index` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
h3Index: string;
    /**
   * Specifies the contract for the `displayOrder` member (displayOrder?: number;).

   * Contract: Describes stable behavior for callers of `displayOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
displayOrder?: number;
    /**
   * Origin bonus added to this unit's hit thresholds in the current combat phase.
   *
   * Contract: Set when the unit array is built for a phase, from the unit's position in that phase; present only when it is 2 (Low) or 4 (High), and absent means 0.
   * When to use: Read through `attackHitThreshold` / `defenseHitThreshold`; set through `withOriginHitBonus`.
   * Expected outcome: Each roll this unit makes hits on that many more faces; casualty order ignores it.
   * Exceptions: None.
   */
readonly originHitBonus?: OriginHitBonus;
  /**
   * Points removed from this unit's printed attack before the origin bonus.
   *
   * Contract: Armor ranged fire and air strikes lose 3 (Low) or 5 (High) in weather the unit lacks.
   * When to use: Set only on ranged and air-strike rows. Melee rows leave it unset.
   * Expected outcome: `attackHitThreshold` floors the penalized attack at 2, then adds the origin bonus.
   * Exceptions: None.
   */
  readonly weatherAttackPenalty?: WeatherAttackPenalty;
  /**
   * Cover the target's terrain gives against this unit's shot in the current phase.
   *
   * Contract: Set only on ranged attackers and air strikes on units; return fire, anti-air, and melee rows leave it unset.
   * When to use: Read through `attackHitThreshold`; set through `withTargetCover`.
   * Expected outcome: Lowers the attack hit number by that many points before the floor of 2.
   * Exceptions: None.
   */
  readonly targetCover?: TerrainCover;
  /**
   * Acclimation tags carried into a roll.
   *
   * Contract: A tag cancels the weather penalty for that state.
   * When to use: Estimates and any combat row built from a snapshot unit.
   * Expected outcome: Empty or omitted means the unit has no tag.
   * Exceptions: None.
   */
  readonly weatherTags?: readonly import('../shared/weatherBonusTypes').WeatherState[];
}
