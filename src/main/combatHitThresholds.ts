/**
 * Effective hit thresholds for one combat roll.
 *
 * Purpose: Adds a unit's origin bonus to its printed attack or defense value in one place, so every roll site agrees.
 * When to use: At every `roll <= threshold` hit test on a `CombatUnit`. Casualty sorts keep `getDefense`.
 * Expected outcome: The printed value, less any weather penalty and target cover on attack, plus the unit's `originHitBonus`, kept within `MIN_ATTACK_HIT_THRESHOLD` and `MAX_HIT_THRESHOLD`.
 * Exceptions: None.
 */
import type { OriginHitBonus } from '../shared/originBonusTypes';
import type { TerrainCover } from '../shared/terrainCoverRules';
import type { WeatherAttackPenalty } from '../shared/weatherBonusTypes';
import { getAttack, getDefense, unitTypeRollsInCombat } from './combatConstants';
import { MAX_HIT_THRESHOLD, MIN_ATTACK_HIT_THRESHOLD } from './combatDice';
import { logTrace } from './logger';

/**
 * The fields a hit threshold depends on.
 *
 * Purpose: Lets callers pass a `CombatUnit` or any lighter shape with the same fields.
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
  /**
   * Points removed from the printed attack before the origin bonus.
   *
   * Contract: Absent and `0` leave the printed attack; the Low and High amounts lower it.
   * When to use: Ranged and air-strike rows. Defense ignores it.
   * Expected outcome: The printed attack is at least `MIN_ATTACK_HIT_THRESHOLD` after the penalty and cover, then the origin bonus is added.
   * Exceptions: None.
   */
  readonly weatherAttackPenalty?: WeatherAttackPenalty;
  /**
   * Cover the target's terrain gives against this shot.
   *
   * Contract: Absent and `0` leave the attack unchanged; set through `withTargetCover`.
   * When to use: Ranged fire and air strikes at units. Return fire, anti-air, melee, and defense ignore it.
   * Expected outcome: Subtracted from the printed attack together with the weather penalty, before the floor.
   * Exceptions: None.
   */
  readonly targetCover?: TerrainCover;
  /**
   * Tech points added after the attack floor.
   *
   * Contract: Absent means 0. Set through `withTechHitBonus` or passed inline from a tech lookup.
   * When to use: Attack, ranged fire, air strikes, and return fire.
   * Expected outcome: Added after the floor of 2 and the origin bonus, then capped at 17.
   * Exceptions: None.
   */
  readonly techAttackBonus?: number;
  /**
   * Tech points added to defense.
   *
   * Contract: Absent means 0. Casualty sorts do not read this field.
   * When to use: Melee defense rolls.
   * Expected outcome: Added to the printed defense with the origin bonus, then capped at 17.
   * Exceptions: None.
   */
  readonly techDefenseBonus?: number;
}

/**
 * Returns the highest die face that scores an attack hit for this unit.
 *
 * Purpose: Attack, ranged fire, and return-fire hit tests.
 * When to use: As `rollDie() <= attackHitThreshold(unit)`.
 * Expected outcome: Printed attack, minus a weather penalty and target cover, floored at `MIN_ATTACK_HIT_THRESHOLD`, plus the origin bonus and the tech attack bonus, capped at `MAX_HIT_THRESHOLD`.
 * Exceptions: None.
 */
export function attackHitThreshold(unit: HitThresholdUnit): number {
  if (!unitTypeRollsInCombat(unit.unitType)) {
    logTrace('combatHitThresholds attackHitThreshold', { unitType: unit.unitType, threshold: 0 });
    return 0;
  }
  const printed = getAttack(unit.unitType);
  const penalty = unit.weatherAttackPenalty ?? 0;
  const cover = unit.targetCover ?? 0;
  const tech = unit.techAttackBonus ?? 0;
  const threshold = Math.min(
    MAX_HIT_THRESHOLD,
    Math.max(MIN_ATTACK_HIT_THRESHOLD, printed - penalty - cover) + (unit.originHitBonus ?? 0) + tech
  );
  logTrace('combatHitThresholds attackHitThreshold', { unitType: unit.unitType, penalty, cover, tech, threshold });
  return threshold;
}

/**
 * Returns the highest die face that scores a defense hit for this unit.
 *
 * Purpose: Melee defense hit tests.
 * When to use: As `rollDie() <= defenseHitThreshold(unit)`; never for casualty order.
 * Expected outcome: A missile is 0. Otherwise `getDefense(unitType)` plus the origin bonus and the tech defense bonus, capped at `MAX_HIT_THRESHOLD`.
 * Exceptions: None.
 */
export function defenseHitThreshold(unit: HitThresholdUnit): number {
  if (!unitTypeRollsInCombat(unit.unitType)) {
    logTrace('combatHitThresholds defenseHitThreshold', { unitType: unit.unitType, threshold: 0 });
    return 0;
  }
  const tech = unit.techDefenseBonus ?? 0;
  const threshold = Math.min(MAX_HIT_THRESHOLD, getDefense(unit.unitType) + (unit.originHitBonus ?? 0) + tech);
  logTrace('combatHitThresholds defenseHitThreshold', { unitType: unit.unitType, tech, threshold });
  return threshold;
}
