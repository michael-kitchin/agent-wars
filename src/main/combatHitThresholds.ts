/**
 * Effective hit thresholds for one combat roll.
 *
 * Purpose: Adds a unit's origin bonus to its printed attack or defense value in one place, so every roll site agrees.
 * When to use: At every `roll <= threshold` hit test on a `CombatUnit`. Casualty sorts keep `getDefense`.
 * Expected outcome: The printed value, plus 1 when the unit carries `originHitBonus`.
 * Exceptions: None.
 */
import type { OriginHitBonus } from '../shared/originBonusTypes';
import { getAttack, getDefense } from './combatConstants';

/**
 * The fields a hit threshold depends on.
 *
 * Purpose: Lets callers pass a `CombatUnit` or any lighter shape with the same two fields.
 * When to use: As the argument type of the threshold helpers below.
 * Expected outcome: Plain readonly data.
 * Exceptions: None.
 */
export interface HitThresholdUnit {
  /**
   * Unit type whose printed value is the base threshold.
   *
   * Contract: Unknown types fall back like `getAttack` / `getDefense`.
   * When to use: Always.
   * Expected outcome: Selects the base value.
   * Exceptions: None.
   */
  readonly unitType: string;
  /**
   * Origin bonus for this roll.
   *
   * Contract: Absent means 0.
   * When to use: Set through `withOriginHitBonus` when the unit qualifies where it rolls.
   * Expected outcome: Added to the base value.
   * Exceptions: None.
   */
  readonly originHitBonus?: OriginHitBonus;
}

/**
 * Returns the highest die face that scores an attack hit for this unit.
 *
 * Purpose: Attack, ranged fire, and return-fire hit tests.
 * When to use: As `rollD6() <= attackHitThreshold(unit)`.
 * Expected outcome: `getAttack(unitType)` plus the origin bonus.
 * Exceptions: None.
 */
export function attackHitThreshold(unit: HitThresholdUnit): number {
  return getAttack(unit.unitType) + (unit.originHitBonus ?? 0);
}

/**
 * Returns the highest die face that scores a defense hit for this unit.
 *
 * Purpose: Melee defense hit tests.
 * When to use: As `rollD6() <= defenseHitThreshold(unit)`; never for casualty order.
 * Expected outcome: `getDefense(unitType)` plus the origin bonus.
 * Exceptions: None.
 */
export function defenseHitThreshold(unit: HitThresholdUnit): number {
  return getDefense(unit.unitType) + (unit.originHitBonus ?? 0);
}
