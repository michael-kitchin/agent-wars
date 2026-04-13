/**
 * Tactical rules adapter seed: res4 spatial checks that future tactical combat/movement will share with strategic parity layers.
 */

import { gridPathCells } from 'h3-js';
import { tacticalLogQuery } from './tacticalLogging';
import { tacticalRes4GridDistance } from './tacticalSpatialAdapter';

/**
 * Returns whether two res4 cells are within a maximum inclusive grid-step distance for tactical march-style checks.
 *
 * Contract: Uses `tacticalRes4GridDistance`; both cells must be valid resolution-4 indexes or the distance helper throws.
 * When to use: Tactical order validation before delegating into shared strategic march rules with res4 geometry.
 * Expected outcome: True when distance is less than or equal to `maxSteps` (including same-cell distance zero).
 * Exceptions: Propagates errors from `tacticalRes4GridDistance` for invalid indexes.
 */
export function tacticalMarchWithinRes4GridSteps(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  maxSteps: number
): boolean {
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps', { fromRes4H3Index, toRes4H3Index, maxSteps });
  const d = tacticalRes4GridDistance(fromRes4H3Index, toRes4H3Index);
  const ok = d <= maxSteps;
  tacticalLogQuery('tacticalMarchWithinRes4GridSteps result', { d, ok });
  return ok;
}

/**
 * Returns true when a destination is reachable along an H3 grid path that stays entirely inside the tactical res4 footprint.
 *
 * Purpose: Allows multi-turn tactical march orders to the same destinations shown by hover preview (path within footprint), not only single-turn `maxSteps` disks.
 * When to use: Human/opponent march validation after single-step range check fails.
 * Expected outcome: True when `gridPathCells` exists and every cell is in `res4Set`; same-cell is true; false on path failure or any step leaving the footprint.
 * Exceptions: Returns false if H3 path APIs throw (invalid indexes).
 */
export function tacticalMarchReachableAlongRes4Footprint(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  res4Set: ReadonlySet<string>
): boolean {
  tacticalLogQuery('tacticalMarchReachableAlongRes4Footprint', { fromRes4H3Index, toRes4H3Index });
  if (fromRes4H3Index === toRes4H3Index) return true;
  if (!res4Set.has(fromRes4H3Index) || !res4Set.has(toRes4H3Index)) return false;
  let pathCells: string[];
  try {
    pathCells = gridPathCells(fromRes4H3Index, toRes4H3Index);
  } catch {
    tacticalLogQuery('tacticalMarchReachableAlongRes4Footprint noPath');
    return false;
  }
  const ok = pathCells.every((h) => res4Set.has(h));
  tacticalLogQuery('tacticalMarchReachableAlongRes4Footprint result', { ok, stepCount: pathCells.length });
  return ok;
}

/**
 * Returns the res4 cell reached after at most `maxEdges` H3 grid steps toward `toRes4H3Index` along the shortest path.
 *
 * Purpose: Lets tactical Ready apply and animate only the first leg of a multi-hex planned march (matching per-turn movement range).
 * When to use: `commitHumanTacticalDraftOrders` before `applyHumanTacticalMarchOrders`, using the same footprint as validation.
 * Expected outcome: `stopH3` is an element of the path from origin (inclusive) to destination; `consumedFullPath` is true when the stop equals the ordered destination.
 * Exceptions: On path failure or a cell outside `res4Set`, returns the ordered destination and `consumedFullPath: true` so commit does not truncate incorrectly.
 */
export function tacticalMarchFirstStopAlongPath(
  fromRes4H3Index: string,
  toRes4H3Index: string,
  maxEdges: number,
  res4Set: ReadonlySet<string>
): { stopH3: string; consumedFullPath: boolean } {
  tacticalLogQuery('tacticalMarchFirstStopAlongPath', { fromRes4H3Index, toRes4H3Index, maxEdges });
  if (fromRes4H3Index === toRes4H3Index) {
    return { stopH3: toRes4H3Index, consumedFullPath: true };
  }
  if (maxEdges <= 0) {
    return { stopH3: fromRes4H3Index, consumedFullPath: false };
  }
  let pathCells: string[];
  try {
    pathCells = gridPathCells(fromRes4H3Index, toRes4H3Index);
  } catch {
    tacticalLogQuery('tacticalMarchFirstStopAlongPath noPath');
    return { stopH3: toRes4H3Index, consumedFullPath: true };
  }
  if (!pathCells.every((h) => res4Set.has(h))) {
    tacticalLogQuery('tacticalMarchFirstStopAlongPath pathLeavesFootprint');
    return { stopH3: toRes4H3Index, consumedFullPath: true };
  }
  const idx = Math.min(pathCells.length - 1, maxEdges);
  const stopH3 = pathCells[idx]!;
  const consumedFullPath = idx >= pathCells.length - 1;
  tacticalLogQuery('tacticalMarchFirstStopAlongPath result', { idx, consumedFullPath });
  return { stopH3, consumedFullPath };
}
