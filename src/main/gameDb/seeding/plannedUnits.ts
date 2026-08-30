import { logDebug } from '../../logger';
import type { BuildUnitType } from '../../productionRules';
import { formatStrategicUnitId } from '../../../shared/unitIds';

/**
 * Planned spawn for one unit before a compact identifier is allocated at insert time.
 *
 * Purpose: Seeding chooses type and hex only; the identifier counter owns uniqueness.
 * When to use: Building a side's spawn list before `insertPlannedUnitsForPlayer`.
 * Expected outcome: Callers never invent ids.
 * Exceptions: None.
 */
export type PlannedUnitPlan = {
  readonly unitType: BuildUnitType;
  readonly h3Index: string;
};

/**
 * Owning side for seeded units.
 *
 * Purpose: Matches the `units.player` column and compact player codes `h1` / `a1`.
 * When to use: Insert deps and `insertPlannedUnitsForPlayer`.
 * Expected outcome: `'human'` or `'opponent'`.
 * Exceptions: None.
 */
export type PlannedUnitOwner = 'human' | 'opponent';

/**
 * Database operations required to persist a planned spawn list.
 *
 * Purpose: Keep seeding modules free of a direct `gameDb` import.
 * When to use: Passed from the `gameDb` façade into `insertPlannedUnitsForPlayer`.
 * Expected outcome: Each plan row becomes one `units` insert with a compact id and a display order.
 * Exceptions: Identifier allocation throws when the database is not open.
 */
interface PlannedUnitInsertDeps {
  /**
   * Runs a parameterized SQL statement against the open game database.
   *
   * Contract: Must target the same SQLite file as the identifier and display-order counters.
   * When to use: Inserting each planned unit.
   * Expected outcome: The statement is executed immediately (auto-commit).
   * Exceptions: Propagates SQLite errors, including primary-key collisions.
   */
  run: (sql: string, params?: unknown[]) => unknown;
  /**
   * Allocates the next formation ordinal for display names.
   *
   * Contract: Independent per player and unit type; starts at 1.
   * When to use: Alongside identifier allocation on each insert.
   * Expected outcome: Persisted `display_order` for `1st` / `I` labels.
   * Exceptions: None.
   */
  allocateNextUnitDisplayOrder: (unitType: BuildUnitType, player: PlannedUnitOwner) => number;
  /**
   * Allocates the next compact unit-id ordinal.
   *
   * Contract: Independent per player and unit type; never returns a fallback on a closed DB.
   * When to use: Immediately before `formatStrategicUnitId` on each insert.
   * Expected outcome: Positive integer unique for that player and type in this match.
   * Exceptions: Throws when the database is not open.
   */
  allocateNextUnitIdOrdinal: (unitType: BuildUnitType, player: PlannedUnitOwner) => number;
}

/**
 * Inserts planned units, minting compact identifiers at write time.
 *
 * Purpose: One allocation site so seeding loops cannot drift from the identifier counter.
 * When to use: After a side's spawn hexes are chosen.
 * Expected outcome: Each row is `h1-i1` / `a1-t3` style with matching `display_order`.
 * Exceptions: Propagates formatter and SQLite errors.
 */
export function insertPlannedUnitsForPlayer(
  deps: PlannedUnitInsertDeps,
  player: PlannedUnitOwner,
  units: readonly PlannedUnitPlan[]
): void {
  logDebug('plannedUnits insertPlannedUnitsForPlayer', { player, unitCount: units.length });
  for (const plan of units) {
    const ordinal = deps.allocateNextUnitIdOrdinal(plan.unitType, player);
    const id = formatStrategicUnitId({ player, unitType: plan.unitType, ordinal });
    deps.run('INSERT INTO units (id, player, unit_type, display_order, h3_index) VALUES (?, ?, ?, ?, ?)', [
      id,
      player,
      plan.unitType,
      deps.allocateNextUnitDisplayOrder(plan.unitType, player),
      plan.h3Index,
    ]);
  }
}
