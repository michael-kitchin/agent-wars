import type { GameMapId } from './gameMapTypes';

/**
 * One side a player can start on inside a regional map.
 *
 * Purpose: The Regional tab lists these instead of UN subregions.
 * When to use: Filling the human and AI side selectors.
 * Expected outcome: `id` matches the manifest. `displayName` is the label.
 * Exceptions: None.
 */
export interface GameMapListSideGroup {
  /**
   * Stable id of the side group.
   *
   * Contract: Matches `side_groups[].id` in the region manifest.
   * When to use: The value sent with `game:newGame`.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Label shown in the side selector.
   *
   * Contract: The manifest display name, sorted with the other groups.
   * When to use: The option text.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly displayName: string;
}

/**
 * Purchase costs for the four unit types on one map.
 *
 * Purpose: The start screen prints these under the unit names.
 * When to use: The tab and region that are currently selected.
 * Expected outcome: Positive integers. The global row is 20, 40, 100, and 60.
 * Exceptions: None.
 */
export interface GameMapListCosts {
  /**
   * Infantry cost.
   *
   * Contract: The map's infantry price.
   * When to use: The infantry cost label.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly infantry: number;
  /**
   * Armor cost.
   *
   * Contract: Twice the infantry cost.
   * When to use: The armor cost label.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly armor: number;
  /**
   * Naval cost.
   *
   * Contract: Five times the infantry cost.
   * When to use: The naval cost label.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly naval: number;
  /**
   * Air cost.
   *
   * Contract: Three times the infantry cost.
   * When to use: The air cost label.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly air: number;
}

/**
 * One row in the start screen's map list.
 *
 * Purpose: The dialog can show names, sides, and prices without loading tactical terrain.
 * When to use: The result of `game:listGameMaps`.
 * Expected outcome: Global has no side groups. Each regional row has its catalog costs.
 * Exceptions: None.
 */
export interface GameMapListEntry {
  /**
   * Map id.
   *
   * Contract: `global` or a regional folder id.
   * When to use: The region selector value and `game:newGame`.
   * Expected outcome: A `GameMapId`.
   * Exceptions: None.
   */
  readonly id: GameMapId;
  /**
   * Label shown for the map.
   *
   * Contract: `Global` or the manifest display name.
   * When to use: The region selector text. Maps are sorted by this name.
   * Expected outcome: A non-empty string.
   * Exceptions: None.
   */
  readonly displayName: string;
  /**
   * Sides on a regional map.
   *
   * Contract: Empty for the global map. Otherwise the manifest groups, sorted by display name.
   * When to use: The Regional tab's side selectors.
   * Expected outcome: At least two groups on every regional map that ships.
   * Exceptions: None.
   */
  readonly sideGroups: readonly GameMapListSideGroup[];
  /**
   * Unit prices for this map.
   *
   * Contract: Copied from the active rules column, not recomputed in the dialog.
   * When to use: The four cost labels.
   * Expected outcome: The global or catalog prices.
   * Exceptions: None.
   */
  readonly costs: GameMapListCosts;
  /**
   * Urban cells that make a birth hex Advanced.
   *
   * Contract: 21 on the global map. The catalog threshold on a regional map.
   * When to use: The Regional tab's Advanced line.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly advancedMinUrbanCells: number;
}

/**
 * Formats one unit price for the start screen.
 *
 * Purpose: Cost labels share one spelling.
 * When to use: After each unit type on the start menu, for the selected tab and region.
 * Expected outcome: The price in parentheses, such as `($20)`.
 * Exceptions: None.
 */
export function formatUnitCostLabel(cost: number): string {
  return `($${cost})`;
}

/**
 * Formats the Advanced threshold line.
 *
 * Purpose: The Regional tab states how many urban cells Advanced requires.
 * When to use: Under the side selectors for the selected region.
 * Expected outcome: `Advanced tech: $60+ hexes` when the threshold is 60.
 * Exceptions: None.
 */
export function formatAdvancedTechLine(advancedMinUrbanCells: number): string {
  return `Advanced tech: $${advancedMinUrbanCells}+ hexes`;
}

/**
 * Picks two different indexes into a side list.
 *
 * Purpose: The two regional sides are never the same group.
 * When to use: When the overlay opens, when the region changes, and when one side's randomize button is clicked.
 * Expected outcome: Null when fewer than two groups exist. Otherwise two indexes, and `second` is never `first`.
 * Exceptions: None.
 */
export function pickDistinctIndexes(length: number, random: () => number = Math.random): { first: number; second: number } | null {
  if (length < 2) return null;
  const first = Math.floor(random() * length);
  let second = Math.floor(random() * (length - 1));
  if (second >= first) second += 1;
  return { first, second };
}

/**
 * Picks a new index for one side, leaving the other side's index alone.
 *
 * Purpose: A single randomize button must not land on the other side's group.
 * When to use: The human or AI randomize button on the Regional tab.
 * Expected outcome: An index other than `otherIndex` when at least two groups exist. Otherwise null.
 * Exceptions: None.
 */
export function pickIndexExcept(length: number, otherIndex: number, random: () => number = Math.random): number | null {
  if (length < 2) return null;
  let next = Math.floor(random() * (length - 1));
  if (next >= otherIndex) next += 1;
  return next;
}
