/**
 * Documents the module-scope binding `MOVEMENT_RANGE_BY_UNIT_TYPE` (MOVEMENT_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>>).

 * Purpose: Supports maintainability by documenting why `MOVEMENT_RANGE_BY_UNIT_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const MOVEMENT_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 1,
  armor: 2,
  naval: 2,
  air: 0,
});

/**
 * Documents the module-scope binding `RANGED_RANGE_BY_UNIT_TYPE` (RANGED_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>>).

 * Purpose: Supports maintainability by documenting why `RANGED_RANGE_BY_UNIT_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const RANGED_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 0,
  armor: 1,
  naval: 2,
  air: 0,
});

/**
 * Documents the module-scope binding `AIR_STRIKE_RANGE_HEXES` (AIR_STRIKE_RANGE_HEXES).

 * Purpose: Supports maintainability by documenting why `AIR_STRIKE_RANGE_HEXES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const AIR_STRIKE_RANGE_HEXES = 3;

/**
 * Documents the module-scope binding `AIR_FERRY_RANGE_HEXES` (AIR_FERRY_RANGE_HEXES).

 * Purpose: Supports maintainability by documenting why `AIR_FERRY_RANGE_HEXES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const AIR_FERRY_RANGE_HEXES = 4;

/**
 * Defines the `formatTargetOutOfRangeReason` function shape (export function formatTargetOutOfRangeReason(unitType: string, range: number): string).

 * Purpose: Supports maintainability by documenting why `formatTargetOutOfRangeReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatTargetOutOfRangeReason(unitType: string, range: number): string {
  return `Target out of range (${unitType} range ${range})`;
}

/**
 * Defines the `formatFerryOutOfRangeReason` function shape (export function formatFerryOutOfRangeReason(range: number): string).

 * Purpose: Supports maintainability by documenting why `formatFerryOutOfRangeReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatFerryOutOfRangeReason(range: number): string {
  return `Destination out of ferry range (${range})`;
}
