/**
 * Documents the module-scope binding `MOVEMENT_RANGE_BY_UNIT_TYPE` (MOVEMENT_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>>).

 * Purpose: Supports maintainability by documenting why `MOVEMENT_RANGE_BY_UNIT_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Per-turn tactical movement point budgets (combat rules §12.4, flat-terrain pacing).
 *
 * Contract: These are movement points consumed by §12.4 enter-hex costs, not raw H3 edge counts.
 * When to use: Tactical march validation, hover preview, and Ready first-leg truncation.
 * Expected outcome: Infantry 2, armor 4, naval 3, air 0 (air does not use the tactical march system).
 * Exceptions: None.
 */
export const MOVEMENT_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 2,
  armor: 4,
  naval: 3,
  air: 0,
});

/**
 * Documents the module-scope binding `RANGED_RANGE_BY_UNIT_TYPE` (RANGED_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>>).

 * Purpose: Supports maintainability by documenting why `RANGED_RANGE_BY_UNIT_TYPE` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Tactical ranged attack ranges in res4 grid steps (combat rules §12.5).
 *
 * Contract: Air uses a large within-footprint cap because strikes are allowed anywhere inside the parent res1 cell.
 * When to use: Tactical ranged targeting validation and UI gating.
 * Expected outcome: Infantry 2, armor 5, naval 10, air 99 (effectively unlimited within the tactical map).
 * Exceptions: None.
 */
export const RANGED_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 2,
  armor: 5,
  naval: 10,
  air: 99,
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
