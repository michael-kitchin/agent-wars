import type { BuildUnitType } from './ipcTypes';

/**
 * Documents the module-scope binding `UNIT_COST_BY_TYPE` (UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>>).

 * Purpose: Supports maintainability by documenting why `UNIT_COST_BY_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const UNIT_COST_BY_TYPE: Readonly<Record<BuildUnitType, number>> = {
    /**
   * Documents the object literal property `infantry` (infantry: 10).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 10,
    /**
   * Documents the object literal property `armor` (armor: 20).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 20,
    /**
   * Documents the object literal property `naval` (naval: 50).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 50,
    /**
   * Documents the object literal property `air` (air: 30).

   * Purpose: Supports maintainability by documenting why `air` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
air: 30,
};

/**
 * Documents the module-scope binding `MAX_UNITS_PER_TYPE` (MAX_UNITS_PER_TYPE: Readonly<Record<BuildUnitType, number>>).

 * Purpose: Supports maintainability by documenting why `MAX_UNITS_PER_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MAX_UNITS_PER_TYPE: Readonly<Record<BuildUnitType, number>> = {
    /**
   * Documents the object literal property `infantry` (infantry: 6).

   * Purpose: Supports maintainability by documenting why `infantry` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infantry: 6,
    /**
   * Documents the object literal property `armor` (armor: 4).

   * Purpose: Supports maintainability by documenting why `armor` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
armor: 4,
    /**
   * Documents the object literal property `naval` (naval: 4).

   * Purpose: Supports maintainability by documenting why `naval` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
naval: 4,
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
 * Defines the `estimateTurnsToNextSpawn` function shape (export function estimateTurnsToNextSpawn( nextUnitType: BuildUnitType | null | undefined, storedPoints: number, capacityPerTurn: number ): number | nu).

 * Purpose: Supports maintainability by documenting why `estimateTurnsToNextSpawn` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function estimateTurnsToNextSpawn(
  nextUnitType: BuildUnitType | null | undefined,
  storedPoints: number,
  capacityPerTurn: number
): number | null {
  if (!nextUnitType) return null;
  const unitCost = UNIT_COST_BY_TYPE[nextUnitType];
  const safeCapacity = Math.max(0, Math.trunc(capacityPerTurn));
  if (safeCapacity <= 0) return null;
  const safeStoredPoints = Math.max(0, Math.trunc(storedPoints));
  const deficit = Math.max(0, unitCost - safeStoredPoints);
  return Math.max(1, Math.ceil(deficit / safeCapacity));
}
