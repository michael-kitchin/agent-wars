/**
 * Straight lines and detours of res-4 cells for battle march tests.
 *
 * Purpose: Terrain-bonus movement tests need routes with a known shape, such as plains, then a mountain, then plains,
 * with no other way around. These helpers find that geometry without hard-coded H3 strings.
 * When to use: Shared-module tests of the march planner, the beat search, reachability lists, and tooltips.
 * Expected outcome: Deterministic cells for a given h3-js version.
 * Exceptions: The finders throw when the geometry cannot be found, which would mean the H3 library changed.
 */

import { cellToCenterChild, cellToParent, gridDisk, gridDistance, gridPathCells, latLngToCell } from 'h3-js';
import { tacticalGridDiskNeighborsOrdered } from '../tacticalTransportLink';

/**
 * Returns a straight line of `length` adjacent res-4 cells inside one res-1 parent.
 *
 * Purpose: A footprint made only of these cells leaves a march exactly one route. Straight means every cell and the
 * cell two steps along share only the cell between them, so a footprint that adds cells beside the line has no
 * two-step way around any cell.
 * When to use: Tests that need cells at known step distances from a start cell.
 * Expected outcome: `length` distinct cells; consecutive cells are neighbors; the first cell is the parent's center child.
 * Exceptions: Throws when no such line fits inside the parent.
 */
export function tacticalLine(length: number, lat = 12, lng = 34): string[] {
  const parent = latLngToCell(lat, lng, 1);
  const start = cellToCenterChild(parent, 4);
  for (const end of gridDisk(start, length - 1)) {
    if (gridDistance(start, end) !== length - 1) continue;
    const line = gridPathCells(start, end);
    if (line.length === length && line.every((h) => cellToParent(h, 1) === parent) && isStraight(line)) return line;
  }
  throw new Error(`tacticalLine: no straight line of ${length} cells inside one res1 parent`);
}

/**
 * Returns true when no cell of `line` shares more than one neighbor with the cell two steps along.
 *
 * Purpose: A bent line's two-steps-apart cells share two neighbors, which would give a march a way around the middle.
 * When to use: Only from `tacticalLine`.
 * Expected outcome: True for straight lines and for lines shorter than three cells.
 * Exceptions: None.
 */
function isStraight(line: readonly string[]): boolean {
  return line.slice(2).every((h, i) => {
    const before = new Set(gridDisk(line[i]!, 1));
    return gridDisk(h, 1).filter((n) => before.has(n)).length === 1;
  });
}

/**
 * Finds a two-cell detour from the first to the last cell of a three-cell line that avoids its middle cell.
 *
 * Purpose: Lets a test compare a route through the middle cell with a three-step route around it.
 * When to use: With `tacticalLine(3)`; put the detour cells in the footprint beside the line.
 * Expected outcome: `[a, b]` with `start`–`a`, `a`–`b`, and `b`–`end` adjacent, `a` not adjacent to `end`, and `b` not
 * adjacent to `start`, so the shortest way around takes exactly three steps.
 * Exceptions: Throws when no such detour exists.
 */
export function detourAroundMiddle(line: readonly string[]): [string, string] {
  const [start, middle, end] = line as [string, string, string];
  for (const a of tacticalGridDiskNeighborsOrdered(start)) {
    if (a === middle || gridDistance(a, end) !== 2) continue;
    for (const b of tacticalGridDiskNeighborsOrdered(a)) {
      if (b === middle || b === start || gridDistance(b, end) !== 1 || gridDistance(b, start) !== 2) continue;
      return [a, b];
    }
  }
  throw new Error('detourAroundMiddle: no three-step detour around the middle cell');
}

/**
 * Builds road side masks that mark every given cell as an intact road cell.
 *
 * Purpose: March pricing reads the destination cell's mask only, so one road side per cell is enough.
 * When to use: The `tacticalRoadSidesByH3` and `tacticalRailSidesByH3` snapshot fields of a road test.
 * Expected outcome: Each cell has one road side and no rail sides.
 * Exceptions: None.
 */
export function roadOnCells(cells: readonly string[]): {
  tacticalRoadSidesByH3: Record<string, boolean[]>;
  tacticalRailSidesByH3: Record<string, boolean[]>;
} {
  const road: Record<string, boolean[]> = {};
  const rail: Record<string, boolean[]> = {};
  for (const h of cells) {
    const n = tacticalGridDiskNeighborsOrdered(h).length;
    road[h] = Array.from({ length: n }, (_, i) => i === 0);
    rail[h] = Array.from({ length: n }, () => false);
  }
  return { tacticalRoadSidesByH3: road, tacticalRailSidesByH3: rail };
}
