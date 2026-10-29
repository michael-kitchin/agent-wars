import { isMissileUnitType } from '../shared/missileRules';
import { strategicRangedRangeHexesForUnitType } from '../shared/rangePerimeterModel';
import { strategicMovementHexes } from '../shared/weatherBonusRules';
import { logTrace } from './logger';

/**
 * Documents the `UnitType` type alias (export type UnitType).

 * Purpose: Supports maintainability by documenting why `UnitType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type UnitType = 'infantry' | 'armor' | 'naval' | 'air' | 'missile';

/**
 * Printed attack per unit type: the hit number on the combat die before bonuses, penalties, and cover.
 *
 * Purpose: Attack, ranged fire, return fire, anti-air, and air-strike rolls start from this value.
 * When to use: Only through `getAttack`; hit tests go through `attackHitThreshold`.
 * Expected outcome: On the d20, infantry hits 15% of the time, naval 35%, and armor and air 50%.
 * Exceptions: None.
 */
const ATTACK: Readonly<Record<UnitType, number>> = Object.freeze({
  infantry: 3,
  armor: 10,
  naval: 7,
  air: 10,
  missile: 0,
});

/**
 * Printed defense per unit type: the melee defense hit number before bonuses, and the casualty-order key.
 *
 * Purpose: The side defending in melee rolls this value. Casualty order does not use this table alone.
 * When to use: Only through `getDefense`; hit tests go through `defenseHitThreshold`.
 * Expected outcome: On the d20, air hits 15% of the time and infantry, armor, and naval hit 35%. A missile is 0 and never rolls. `compareCasualtyOrder` removes it last, after every other type, even though 0 is the lowest printed defense.
 * Exceptions: None.
 */
const DEFENSE: Readonly<Record<UnitType, number>> = Object.freeze({
  infantry: 7,
  armor: 7,
  naval: 7,
  air: 3,
  missile: 0,
});

/**
 * Returns the printed attack for a unit type.
 *
 * Purpose: The base of every attack hit number and the value prompts and tools quote.
 * When to use: Rule text and `attackHitThreshold`; roll sites use the threshold, not this value.
 * Expected outcome: The `ATTACK` value; an unknown type reads as infantry.
 * Exceptions: None.
 */
export function getAttack(unitType: string): number {
  return ATTACK[unitType as UnitType] ?? ATTACK.infantry;
}

/**
 * Returns the printed defense for a unit type.
 *
 * Purpose: The base of every melee defense hit number and the casualty-order key.
 * When to use: Casualty sorts, rule text, and `defenseHitThreshold`.
 * Expected outcome: The `DEFENSE` value; an unknown type reads as infantry.
 * Exceptions: None.
 */
export function getDefense(unitType: string): number {
  return DEFENSE[unitType as UnitType] ?? DEFENSE.infantry;
}

/**
 * Defines the `getRange` function shape (export function getRange(unitType: string): number).

 * Purpose: Strategic combat max ranged distance in H3 hex steps for dice resolution, pre-computation, and strategic order validation (`validateRangedAttack`, tool assessments, etc.).
 * When to use: Any **strategic** path that must stay aligned with `strategicRangedRangeHexesForUnitType`—not tactical battles.
 * Expected outcome: Delegates to the shared strategic range table (infantry 0 / melee only). Tactical ranged legality uses `RANGED_RANGE_BY_UNIT_TYPE` and `effectiveTacticalRangedMaxRangeForAttacker`.
 * Exceptions: None.
 */
export function getRange(unitType: string): number {
  return strategicRangedRangeHexesForUnitType(unitType);
}

/**
 * Defines the `getMovementBudget` function shape (export function getMovementBudget(unitType: string): number).

 * Purpose: Printed strategic march length, shared by validators and prompts.
 * When to use: When weather is off, or the caller only needs the printed hex count.
 * Expected outcome: Infantry 1, armor 2, naval 2, air 0, missile 0. Weather reductions go through `strategicMovementHexesFor`. A missile is never slowed.
 * Exceptions: None.
 */
export function getMovementBudget(unitType: string): number {
  logTrace('combatConstants getMovementBudget', { unitType });
  return strategicMovementHexes(unitType);
}

/**
 * Documents the module-scope binding `CASUALTY_PRIORITY_ORDER` (CASUALTY_PRIORITY_ORDER: UnitType[]).

 * Purpose: Tie-break after printed defense, among types that roll. A missile is absent on purpose.
 * When to use: Only from `casualtyPriorityIndex`, which `compareCasualtyOrder` calls after the missile check.
 * Expected outcome: Infantry, then armor, then naval, then air. A missile stays out of this list so a defense-only sort cannot be "fixed" by appending it here. `compareCasualtyOrder` already removes missiles last.
 * Exceptions: None.
 */
export const CASUALTY_PRIORITY_ORDER: UnitType[] = ['infantry', 'armor', 'naval', 'air'];

/**
 * Defines the `casualtyPriorityIndex` function shape (export function casualtyPriorityIndex(unitType: string): number).

 * Purpose: Supports maintainability by documenting why `casualtyPriorityIndex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function casualtyPriorityIndex(unitType: string): number {
  const i = CASUALTY_PRIORITY_ORDER.indexOf(unitType as UnitType);
  return i >= 0 ? i : CASUALTY_PRIORITY_ORDER.length;
}

/**
 * Reports whether a unit type rolls a combat die.
 *
 * Purpose: A missile never attacks, returns fire, or rolls melee. Other types roll as they do today.
 * When to use: Before drawing a die for a unit in melee. Casualty order still includes missiles.
 * Expected outcome: False only for missiles.
 * Exceptions: None.
 */
export function unitTypeRollsInCombat(unitType: string): boolean {
  return !isMissileUnitType(unitType);
}

/**
 * Orders two unit types for casualty removal.
 *
 * Purpose: A missile is hit last in its hex or cell, after every other unit, whatever their defense.
 * When to use: As the comparator for `Array.prototype.sort` at each casualty-order site. The sort is stable.
 * Expected outcome: Every missile sorts after every non-missile. Otherwise lowest printed defense, then `casualtyPriorityIndex`.
 * Exceptions: None.
 */
export function compareCasualtyOrder(leftUnitType: string, rightUnitType: string): number {
  const missileOrder = Number(isMissileUnitType(leftUnitType)) - Number(isMissileUnitType(rightUnitType));
  if (missileOrder !== 0) return missileOrder;
  return (
    getDefense(leftUnitType) - getDefense(rightUnitType)
    || casualtyPriorityIndex(leftUnitType) - casualtyPriorityIndex(rightUnitType)
  );
}
