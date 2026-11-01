import { ALL_BUILD_UNIT_TYPES, isBuildUnitType, type BuildUnitType } from './ipc/productionTypes';
import { UNIT_GROUP_LABEL_BY_TYPE } from './lossSummary';

/**
 * One line of a side's unit counts.
 *
 * Purpose: The top-bar side tooltip draws one line per unit type the side has.
 * When to use: Returned inside `SideUnitCounts`.
 * Expected outcome: A type with at least one unit, its label, and its count.
 * Exceptions: None.
 */
export interface SideUnitCountRow {
  /**
   * The unit type.
   *
   * Contract: A build type. The tooltip picks the icon from it.
   * When to use: The mini token beside the line.
   * Expected outcome: One of `ALL_BUILD_UNIT_TYPES`.
   * Exceptions: None.
   */
  readonly unitType: BuildUnitType;
  /**
   * The type's label.
   *
   * Contract: `UNIT_GROUP_LABEL_BY_TYPE`, so the spelling matches the loss lines.
   * When to use: After the count.
   * Expected outcome: Such as `Armored`.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Units of this type.
   *
   * Contract: Always at least 1. A type the side has none of has no row.
   * When to use: Before the label.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly count: number;
}

/**
 * One side's units, by type, with a total.
 *
 * Purpose: The tooltip and its plain-text fallback read one result.
 * When to use: Returned by `countSideUnitsByType`.
 * Expected outcome: `total` is the sum of the row counts.
 * Exceptions: None.
 */
export interface SideUnitCounts {
  /**
   * One row per type the side has, cheapest first.
   *
   * Contract: Ordered by `costFor`, then by `ALL_BUILD_UNIT_TYPES` when two costs match.
   * When to use: The tooltip lines.
   * Expected outcome: Empty when the side has no units.
   * Exceptions: None.
   */
  readonly rows: readonly SideUnitCountRow[];
  /**
   * Every unit in the rows.
   *
   * Contract: The sum of `rows[].count`.
   * When to use: The bold Total line.
   * Expected outcome: 0 when the side has no units.
   * Exceptions: None.
   */
  readonly total: number;
}

/**
 * Counts one side's units by type, cheapest type first.
 *
 * Purpose: The top-bar side tooltip lists a side's units in the order the match prices them.
 * When to use: Pass the units in the snapshot being drawn, so a fogged view counts only the units it shows.
 *   `costFor` is the match's purchase cost, normally `unitCostFor`.
 * Expected outcome: One row per type with at least one unit. Mercenaries count under their type. A unit type that is
 *   not a build type is left out of the rows and the total.
 * Exceptions: Whatever `costFor` throws. It is called only with build types.
 */
export function countSideUnitsByType(
  units: readonly { readonly player: string; readonly unitType: string }[],
  seatId: string,
  costFor: (unitType: BuildUnitType) => number
): SideUnitCounts {
  const counts = new Map<BuildUnitType, number>();
  units
    .flatMap((unit) => (unit.player === seatId && isBuildUnitType(unit.unitType) ? [unit.unitType] : []))
    .forEach((unitType) => counts.set(unitType, (counts.get(unitType) ?? 0) + 1));
  const rows = [...counts.entries()]
    .map(([unitType, count]) => ({ unitType, label: UNIT_GROUP_LABEL_BY_TYPE[unitType], count }))
    .sort((left, right) => costFor(left.unitType) - costFor(right.unitType) || typeIndex(left.unitType) - typeIndex(right.unitType));
  return { rows, total: rows.reduce((sum, row) => sum + row.count, 0) };
}

/**
 * The counts as one plain line.
 *
 * Purpose: The tooltip host needs a non-empty sentence, and a reader that cannot show the icons still gets the counts.
 * When to use: The host's `data-control-tooltip` value.
 * Expected outcome: Such as `10 Infantry, 4 Armored, Total: 14`, or `Total: 0` with no rows.
 * Exceptions: None.
 */
export function formatSideUnitCountsText(counts: SideUnitCounts): string {
  return [...counts.rows.map((row) => `${row.count} ${row.label}`), `Total: ${counts.total}`].join(', ');
}

/**
 * A type's place in the build list.
 *
 * Purpose: Two types with the same cost keep a fixed order.
 * When to use: The tie-break in `countSideUnitsByType`.
 * Expected outcome: The index in `ALL_BUILD_UNIT_TYPES`.
 * Exceptions: None.
 */
function typeIndex(unitType: BuildUnitType): number {
  return ALL_BUILD_UNIT_TYPES.indexOf(unitType);
}
