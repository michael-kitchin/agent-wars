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
export type UnitType = 'infantry' | 'armor' | 'naval' | 'air';

/**
 * Documents the module-scope binding `ATTACK` (ATTACK: Record<UnitType, number>).

 * Purpose: Supports maintainability by documenting why `ATTACK` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const ATTACK: Record<UnitType, number> = {
    /**
   * Documents the object literal property `infantry` (infantry: 1).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 1,
    /**
   * Documents the object literal property `armor` (armor: 3).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 3,
    /**
   * Documents the object literal property `naval` (naval: 2).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 2,
    /**
   * Documents the object literal property `air` (air: 3).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 3,
};

/**
 * Documents the module-scope binding `DEFENSE` (DEFENSE: Record<UnitType, number>).

 * Purpose: Supports maintainability by documenting why `DEFENSE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const DEFENSE: Record<UnitType, number> = {
    /**
   * Documents the object literal property `infantry` (infantry: 2).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 2,
    /**
   * Documents the object literal property `armor` (armor: 2).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 2,
    /**
   * Documents the object literal property `naval` (naval: 2).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 2,
    /**
   * Documents the object literal property `air` (air: 1).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 1,
};

/**
 * Defines the `getAttack` function shape (export function getAttack(unitType: string): number).

 * Purpose: Supports maintainability by documenting why `getAttack` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getAttack(unitType: string): number {
  return ATTACK[unitType as UnitType] ?? 1;
}

/**
 * Defines the `getDefense` function shape (export function getDefense(unitType: string): number).

 * Purpose: Supports maintainability by documenting why `getDefense` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getDefense(unitType: string): number {
  return DEFENSE[unitType as UnitType] ?? 2;
}

/**
 * Defines the `getRange` function shape (export function getRange(unitType: string): number).

 * Purpose: **Strategic (res1) combat** max ranged distance in H3 hex steps for dice resolution, pre-computation, and strategic order validation (`validateRangedAttack`, tool assessments, etc.).
 * When to use: Any **strategic** path that must stay aligned with `strategicRangedRangeHexesForUnitType`—not res4 tactical battles.
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
 * Expected outcome: Infantry 1, armor 2, naval 2, air 0. Weather reductions go through `strategicMovementHexesFor`.
 * Exceptions: None.
 */
export function getMovementBudget(unitType: string): number {
  logTrace('combatConstants getMovementBudget', { unitType });
  return strategicMovementHexes(unitType);
}

/**
 * Documents the module-scope binding `CASUALTY_PRIORITY_ORDER` (CASUALTY_PRIORITY_ORDER: UnitType[]).

 * Purpose: Supports maintainability by documenting why `CASUALTY_PRIORITY_ORDER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
