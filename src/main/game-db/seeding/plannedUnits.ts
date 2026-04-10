import { logDebug, logTrace } from '../../logger';
import type { BuildUnitType } from '../../productionRules';

/**
 * Documents the `PlannedUnitTuple` type alias (export type PlannedUnitTuple).

 * Purpose: Supports maintainability by documenting why `PlannedUnitTuple` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PlannedUnitTuple = [id: string, unitType: BuildUnitType, h3Index: string];
/**
 * Documents the `PlannedUnitOwner` type alias (export type PlannedUnitOwner).

 * Purpose: Supports maintainability by documenting why `PlannedUnitOwner` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export type PlannedUnitOwner = 'human' | 'opponent';

/**
 * Documents the `PlannedUnitInsertDeps` interface as a named contract surface (interface PlannedUnitInsertDeps).

 * Purpose: Supports maintainability by documenting why `PlannedUnitInsertDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface PlannedUnitInsertDeps {
    /**
   * Specifies the contract for the `run` member (run: (sql: string, params?: unknown[]) => unknown;).

   * Contract: Describes stable behavior for callers of `run` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
run: (sql: string, params?: unknown[]) => unknown;
    /**
   * Specifies the contract for the `allocateNextUnitDisplayOrder` member (allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;).

   * Contract: Describes stable behavior for callers of `allocateNextUnitDisplayOrder` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;
}

/**
 * Defines the `countPlannedUnitsOfType` function shape (export function countPlannedUnitsOfType(units: PlannedUnitTuple[], unitType: BuildUnitType): number).

 * Purpose: Supports maintainability by documenting why `countPlannedUnitsOfType` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function countPlannedUnitsOfType(units: PlannedUnitTuple[], unitType: BuildUnitType): number {
  logTrace('plannedUnits countPlannedUnitsOfType', { unitType, rowCount: units.length });
  return units.filter((u) => u[1] === unitType).length;
}

/**
 * Defines the `insertPlannedUnitsForPlayer` function shape (export function insertPlannedUnitsForPlayer().

 * Purpose: Supports maintainability by documenting why `insertPlannedUnitsForPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function insertPlannedUnitsForPlayer(
  deps: PlannedUnitInsertDeps,
  player: PlannedUnitOwner,
  units: PlannedUnitTuple[]
): void {
  logDebug('plannedUnits insertPlannedUnitsForPlayer', { player, unitCount: units.length });
  for (const [id, unitType, h3Index] of units) {
    deps.run('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
      id,
      player,
      unitType,
      deps.allocateNextUnitDisplayOrder(unitType),
      h3Index,
    ]);
  }
}

