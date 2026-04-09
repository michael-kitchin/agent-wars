import { logDebug, logTrace } from '../../logger';
import type { BuildUnitType } from '../../productionRules';

export type PlannedUnitTuple = [id: string, unitType: BuildUnitType, h3Index: string];
export type PlannedUnitOwner = 'human' | 'opponent';

interface PlannedUnitInsertDeps {
  run: (sql: string, params?: unknown[]) => unknown;
  allocateNextUnitDisplayOrder: (unitType: BuildUnitType) => number;
}

/**
 * Why this exists:
 *     Counts how many planned seed rows already exist for one unit type so callers can assign stable next ordinals.
 * When to use:
 *     During pre-insert unit planning before appending flex/substitutive rows.
 * What to expect:
 *     Returns zero when no rows match; never mutates the input list.
 */
export function countPlannedUnitsOfType(units: PlannedUnitTuple[], unitType: BuildUnitType): number {
  logTrace('plannedUnits countPlannedUnitsOfType', { unitType, rowCount: units.length });
  return units.filter((u) => u[1] === unitType).length;
}

/**
 * Why this exists:
 *     Centralizes DB insertion for planned seed units so scenario and non-scenario seeding paths share one persistence implementation.
 * When to use:
 *     After deterministic unit planning is complete and rows are ready for insertion.
 * What to expect:
 *     Inserts every tuple with allocated display order for the given player; does not mutate input rows.
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

