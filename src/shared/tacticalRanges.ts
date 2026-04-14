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
 * Contract: These are **baseline** movement points consumed by §12.4 enter-hex costs, not raw H3 edge counts.
 * Tactical terrain may **reduce** budgets (urban/rubble, forest for armor) via `src/shared/tacticalTerrainCombatModifiers.ts`.
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
 * Contract: **Baseline** max range per unit type; `src/shared/tacticalTerrainCombatModifiers.ts` may cap range to 1
 * from forest/urban/rubble cells and block air/armor/naval shots whose implicit LOS crosses mountain.
 * Air uses a large within-footprint cap because strikes are allowed anywhere inside the parent res1 cell.
 * When to use: Tactical ranged targeting validation and UI gating.
 * Expected outcome: Infantry 2, armor 5, naval 10, air 99 (effectively unlimited within the tactical map) before terrain modifiers.
 * Exceptions: None.
 *
 * **Strategic vs tactical:** For **res1 strategic** ranged distance (smaller standoff values), use `getRange` in `src/main/combatConstants.ts` (`RANGE`). Do not substitute this table into strategic `validateRangedAttack` without an explicit tactical-active branch.
 */
export const RANGED_RANGE_BY_UNIT_TYPE: Readonly<Record<string, number>> = Object.freeze({
  infantry: 2,
  armor: 5,
  naval: 10,
  air: 99,
});

/**
 * Returns whether `unitType` has a **positive tactical ranged baseline** before terrain caps (`RANGED_RANGE_BY_UNIT_TYPE`).
 *
 * Contract: Equivalent to `(RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0) >= 1` as used in tactical renderer selection gates.
 * When to use: Renderer and any caller that needs the same “can this type use tactical ranged at all?” predicate without duplicating the table lookup.
 * Expected outcome: `true` for infantry, armor, naval, and air with current constants; `false` for unknown or missing types.
 * Exceptions: None. **Logging:** this module does not import `src/main/logger`; do not add `logTrace` here (shared layer). Callers that introduce new behavior may log at their boundary.
 */
export function unitHasTacticalRangedBaseline(unitType: string): boolean {
  return (RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0) >= 1;
}

/**
 * Documents the module-scope binding `AIR_STRIKE_RANGE_HEXES` (AIR_STRIKE_RANGE_HEXES).

 * Purpose: Strategic air strike distance from the unit’s home res1 hex; tactical human/opponent strikes ignore this cap and allow any target in the tactical res4 footprint.
 * When to use: Strategic `validateAirStrikeOrder`, AI strike envelopes, and briefing text — not tactical battle validation.
 * Expected outcome: Three res4 grid steps from base for strategic strikes.
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
