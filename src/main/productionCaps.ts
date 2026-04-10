import type { BuildUnitType } from './productionRules';
import { MAX_UNITS_PER_TYPE as SHARED_MAX_UNITS_PER_TYPE } from '../shared/productionConfig';

/**
 * Documents the module-scope binding `MAX_UNITS_PER_TYPE` (MAX_UNITS_PER_TYPE: Record<BuildUnitType, number>).

 * Purpose: Supports maintainability by documenting why `MAX_UNITS_PER_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MAX_UNITS_PER_TYPE: Record<BuildUnitType, number> = {
    /**
   * Documents the object literal property `infantry` (infantry: SHARED_MAX_UNITS_PER_TYPE.infantry).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: SHARED_MAX_UNITS_PER_TYPE.infantry,
    /**
   * Documents the object literal property `armor` (armor: SHARED_MAX_UNITS_PER_TYPE.armor).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: SHARED_MAX_UNITS_PER_TYPE.armor,
    /**
   * Documents the object literal property `naval` (naval: SHARED_MAX_UNITS_PER_TYPE.naval).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: SHARED_MAX_UNITS_PER_TYPE.naval,
    /**
   * Documents the object literal property `air` (air: SHARED_MAX_UNITS_PER_TYPE.air).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: SHARED_MAX_UNITS_PER_TYPE.air,
};

/**
 * Documents the module-scope binding `DEPLOYMENT_CAP_TYPE_ORDER` (DEPLOYMENT_CAP_TYPE_ORDER: BuildUnitType[]).

 * Purpose: Supports maintainability by documenting why `DEPLOYMENT_CAP_TYPE_ORDER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const DEPLOYMENT_CAP_TYPE_ORDER: BuildUnitType[] = ['infantry', 'armor', 'naval', 'air'];

/**
 * Defines the `getPlayerUnitCountsByType` function shape (export function getPlayerUnitCountsByType( units: Array<{ player: string; unitType: string }>, playerId: string ): Record<BuildUnitType, number> { con).

 * Purpose: Supports maintainability by documenting why `getPlayerUnitCountsByType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getPlayerUnitCountsByType(
  units: Array<{ player: string; unitType: string }>,
  playerId: string
): Record<BuildUnitType, number> {
  const counts: Record<BuildUnitType, number> = { infantry: 0, armor: 0, naval: 0, air: 0 };
  for (const unit of units) {
    if (unit.player !== playerId) continue;
    if (unit.unitType !== 'infantry' && unit.unitType !== 'armor' && unit.unitType !== 'naval' && unit.unitType !== 'air') continue;
    counts[unit.unitType] += 1;
  }
  return counts;
}

/**
 * Defines the `getMaxedUnitTypesForPlayer` function shape (export function getMaxedUnitTypesForPlayer().

 * Purpose: Supports maintainability by documenting why `getMaxedUnitTypesForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getMaxedUnitTypesForPlayer(
  units: Array<{ player: string; unitType: string }>,
  playerId: string
): BuildUnitType[] {
  const counts = getPlayerUnitCountsByType(units, playerId);
  return DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => counts[unitType] >= MAX_UNITS_PER_TYPE[unitType]);
}
