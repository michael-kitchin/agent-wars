/**
 * How many tactical sub-units one strategic parent becomes.
 *
 * Purpose: Battle placement and AI-only battle choice share one weight table.
 * When to use: Counting a parent, or summing the parents one owner has on a hex.
 * Expected outcome: Infantry 8, armor 4, air 3, naval 4, missile 1, and anything else 0.
 * Exceptions: None. This module does not import the main-process logger.
 */

/**
 * One strategic parent that can contribute sub-units.
 *
 * Purpose: The owner sum only needs the owner and the type.
 * When to use: `tacticalSubUnitCountForOwner`.
 * Expected outcome: `player` is the seat or Neutral. `unitType` is the strategic type.
 * Exceptions: None.
 */
export interface TacticalSubUnitCountParent {
  /**
   * Who owns the parent.
   *
   * Contract: Compared with the owner id passed to the sum.
   * When to use: Filtering the parents on one hex.
   * Expected outcome: A seat id or Neutral.
   * Exceptions: None.
   */
  readonly player: string;
  /**
   * The strategic unit type.
   *
   * Contract: One of the five types, or anything else, which counts as 0.
   * When to use: Looking up the weight.
   * Expected outcome: The type string stored on the parent.
   * Exceptions: None.
   */
  readonly unitType: string;
}

/**
 * The tactical sub-unit weight of one strategic type.
 *
 * Purpose: Infantry, armor, air, naval, and missile each become a fixed number of sub-units.
 * When to use: Placement and the owner sum.
 * Expected outcome: 8, 4, 3, 4, 1, or 0 for an unknown type.
 * Exceptions: None.
 */
export function tacticalSubUnitCountForStrategicUnitType(unitType: string): number {
  switch (unitType) {
    case 'infantry':
      return 8;
    case 'armor':
      return 4;
    case 'air':
      return 3;
    case 'naval':
      return 4;
    case 'missile':
      return 1;
    default:
      return 0;
  }
}

/**
 * The tactical sub-unit weight of one owner's parents.
 *
 * Purpose: AI-only battle choice compares sides by these counts, not by parent count.
 * When to use: Once per owner on a contested hex, with the parents already on that hex.
 * Expected outcome: The sum of each matching parent's weight. A parent of another owner adds nothing.
 * Exceptions: None.
 */
export function tacticalSubUnitCountForOwner(
  units: readonly TacticalSubUnitCountParent[],
  ownerId: string
): number {
  return units.reduce(
    (sum, unit) => (unit.player === ownerId ? sum + tacticalSubUnitCountForStrategicUnitType(unit.unitType) : sum),
    0
  );
}
