/**
 * Pure H3 grid distance, cell path, and “within range” checks without process logging.
 *
 * Purpose: Shared semantics for `gameActions/gridRange` and tactical terrain ranged filters so validation
 * and apply-phase stripping never diverge on fallback paths (`gridPathCells`, `gridDisk`, neighbor BFS). H3's fast
 * APIs throw for pairs spanning an icosahedron face boundary, and callers that gave up on those pairs rejected legal
 * moves and shots; every fallback here exists to keep those pairs measurable. See
 * `.spec/h3-face-crossing-distances.md`.
 * When to use: Any module that must mirror `isWithinGridRangeSafe` behavior without importing the main-process logger.
 * Expected outcome: Same boolean / distance results as the logging wrappers for valid inputs.
 * Exceptions: Returns `null` / `false` only when every H3 API and the BFS fallback fail for the given pair.
 */

import { gridDistance, gridDisk, gridPathCells } from 'h3-js';
import { DEFAULT_BOUNDED_MEMO_CAPACITY, getBoundedMemo } from './boundedMemoCache';

/**
 * Memoizes immutable H3 grid distances for repeated origin/destination pairs within a session.
 *
 * Purpose: Avoids redundant `gridDistance` / `gridPathCells` work on AI-turn hot paths.
 * When to use: Only inside `computeGridDistancePure`; keys are `origin|destination`.
 * Expected outcome: Same numeric or null result as an uncached call; safe for process lifetime because H3 geometry is fixed.
 * Exceptions: None.
 */
const gridDistanceMemo = new Map<string, number | null>();

/**
 * Returns grid-step distance between two cells, or null when H3 APIs cannot derive a path or distance.
 *
 * Contract: Tries `gridDistance`, then path length from `gridPathCells` minus one.
 * When to use: `isWithinGridRangePure` and callers that need a numeric distance without logging.
 * Expected outcome: Non-negative integer when derivable.
 * Exceptions: None; failures return null.
 */
export function computeGridDistancePure(originH3Index: string, destinationH3Index: string): number | null {
  const key = `${originH3Index}|${destinationH3Index}`;
  return getBoundedMemo(gridDistanceMemo, key, DEFAULT_BOUNDED_MEMO_CAPACITY, () => {
    try {
      return gridDistance(originH3Index, destinationH3Index);
    } catch {
      /* distance unavailable */
    }
    try {
      const path = gridPathCells(originH3Index, destinationH3Index);
      if (path.length > 0) return Math.max(0, path.length - 1);
    } catch {
      /* path unavailable */
    }
    return null;
  });
}

/**
 * Memoizes only the BFS-reconstructed paths, so repeated traces of a face-crossing pair reuse one search.
 *
 * Purpose: Ranged validation re-traces the same attacker/target pairs across the validate and apply phases. Successful
 * `gridPathCells` results are deliberately **not** cached: they are the common case and each entry is a whole array, so
 * caching them would hold far more memory than the cheap H3 call costs.
 * When to use: Only inside `computeGridPathCellsPure`; keys are `origin|destination`.
 * Expected outcome: Same array or null as an uncached BFS; safe for process lifetime because H3 geometry is fixed.
 * Exceptions: None.
 */
const pathFallbackMemo = new Map<string, readonly string[] | null>();

/**
 * Entry cap for `pathFallbackMemo`, far below the shared default because each value is an array of cells.
 *
 * Purpose: Face crossings are a small, fixed slice of the grid, so a modest cap covers realistic replay while bounding
 * memory that the numeric distance caches do not have to worry about.
 * When to use: `computeGridPathCellsPure` only.
 * Expected outcome: Oldest entries evict once this many distinct crossing pairs have been traced.
 * Exceptions: None.
 */
const PATH_FALLBACK_MEMO_CAPACITY = 2_000;

/**
 * Caps neighbor-BFS depth when reconstructing a path that `gridPathCells` could not produce.
 *
 * Purpose: Bounds fallback work so one distant pair cannot enumerate a large slice of the grid during order validation;
 * line-of-sight traces run inside a battle footprint or a weapon range, both far shorter than this.
 * When to use: `computeGridPathCellsPure` and the per-origin distance search.
 * Expected outcome: A search that reaches this depth reports null for a cell it has not already recorded. A distance
 *   `computeGridDistancePure` can measure is returned as that number, including when it is above this cap.
 * Exceptions: None.
 */
const PATH_FALLBACK_MAX_DEPTH = 64;

/**
 * Returns the cells from `originH3Index` to `destinationH3Index` inclusive, or null when no path can be derived.
 *
 * Contract: Tries `gridPathCells`, then reconstructs a shortest path from a neighbor BFS capped at
 * `PATH_FALLBACK_MAX_DEPTH`. The fallback returns *a* shortest path, not necessarily H3's straight line, because H3
 * cannot express a line across the icosahedron face crossings that make `gridPathCells` throw.
 * When to use: Line-of-sight traces and any caller that must inspect intervening cells without importing a logger.
 * Expected outcome: Array beginning with the origin and ending with the destination; a single-element array when they match.
 * Exceptions: None; failures return null.
 */
export function computeGridPathCellsPure(
  originH3Index: string,
  destinationH3Index: string
): readonly string[] | null {
  try {
    const path = gridPathCells(originH3Index, destinationH3Index);
    if (path.length > 0) return path;
  } catch {
    /* straight-line path unavailable at a face crossing */
  }
  const key = `${originH3Index}|${destinationH3Index}`;
  return getBoundedMemo(pathFallbackMemo, key, PATH_FALLBACK_MEMO_CAPACITY, () =>
    breadthFirstPathCells(originH3Index, destinationH3Index)
  );
}

/**
 * Reconstructs a shortest cell path by expanding one-step neighbor rings from the origin.
 *
 * Purpose: `gridPathCells` throws for pairs whose local coordinates span an icosahedron face boundary, and callers that
 * fail closed on that throw reject legal shots over clear terrain.
 * When to use: Only as the `computeGridPathCellsPure` fallback; prefer the memoized wrapper.
 * Expected outcome: Origin-to-destination array, or null when the destination is unreachable within the depth cap.
 * Exceptions: Never throws; a failing `gridDisk` ends the expansion for that cell.
 */
function breadthFirstPathCells(originH3Index: string, destinationH3Index: string): readonly string[] | null {
  if (originH3Index === destinationH3Index) return [originH3Index];
  const parentByCell = new Map<string, string | null>([[originH3Index, null]]);
  const depthByCell = new Map<string, number>([[originH3Index, 0]]);
  const queue: string[] = [originH3Index];
  let found = false;
  for (let i = 0; i < queue.length && !found; i++) {
    const current = queue[i]!;
    const depth = depthByCell.get(current)!;
    // Array-queue BFS yields non-decreasing depth, so the first capped entry ends the search.
    if (depth >= PATH_FALLBACK_MAX_DEPTH) break;
    let ring: string[];
    try {
      ring = gridDisk(current, 1);
    } catch {
      continue;
    }
    for (const neighbor of ring) {
      if (parentByCell.has(neighbor)) continue;
      parentByCell.set(neighbor, current);
      depthByCell.set(neighbor, depth + 1);
      if (neighbor === destinationH3Index) {
        found = true;
        break;
      }
      queue.push(neighbor);
    }
  }
  if (!found) return null;
  const reversed: string[] = [];
  for (let cell: string | null = destinationH3Index; cell !== null; cell = parentByCell.get(cell) ?? null) {
    reversed.push(cell);
  }
  return reversed.reverse();
}

/**
 * One unfinished breadth-first distance search from a single origin.
 *
 * Purpose: Many callers measure several destinations from one origin. Keeping the search lets the next destination resume.
 * When to use: `fallbackSearchByOrigin` only.
 * Expected outcome: `depthByCell` holds the origin at 0 and every later first visit. `queue` grows. `nextIndex` is the next
 *   cell to expand. `exhausted` is true once the queue ends or a dequeued cell is already at the depth cap.
 * Exceptions: None.
 */
type FallbackDistanceSearch = {
  readonly depthByCell: Map<string, number>;
  readonly queue: string[];
  nextIndex: number;
  exhausted: boolean;
};

/**
 * Distance searches keyed by origin. Insertion order is the eviction order.
 *
 * Purpose: A scan from one origin should not start over for every destination, and a long session must not keep every origin.
 * When to use: `searchFor` only.
 * Expected outcome: At most `FALLBACK_SEARCH_ORIGIN_CAPACITY` origins, and about `FALLBACK_SEARCH_CELL_BUDGET` recorded cells.
 * Exceptions: None.
 */
const fallbackSearchByOrigin = new Map<string, FallbackDistanceSearch>();

/**
 * Recorded cells across every stored search, including each origin.
 *
 * Purpose: Eviction has to know the memory cost, and subtracting a removed search's map size only stays correct when every
 *   recorded cell was counted once.
 * When to use: `searchFor`, `fallbackDistanceFrom`, and `clearGridFallbackSearchesForTests`.
 * Expected outcome: Equals the sum of the stored maps' sizes.
 * Exceptions: None.
 */
let fallbackSearchCellCount = 0;

/**
 * How many origins the distance search keeps.
 *
 * Purpose: Bounds the map when a turn measures many different origins.
 * When to use: `searchFor` before inserting a new origin.
 * Expected outcome: The oldest origin is dropped once this many searches exist.
 * Exceptions: None.
 */
const FALLBACK_SEARCH_ORIGIN_CAPACITY = 256;

/**
 * How many recorded cells the distance searches may hold before the oldest origin is dropped.
 *
 * Purpose: One origin's disk at the depth cap is about 12,500 cells, so one search fits. A long turn must not keep all of them.
 * When to use: `searchFor` before inserting a new origin.
 * Expected outcome: Oldest origins are dropped until the count is inside the budget or the map is empty.
 * Exceptions: None.
 */
const FALLBACK_SEARCH_CELL_BUDGET = 200_000;

/**
 * Returns the origin's search, creating it after evicting oldest entries that no longer fit.
 *
 * Purpose: A dropped search is only a cache. The next query for that origin searches again and returns the same distances.
 * When to use: `fallbackDistanceFrom` only.
 * Expected outcome: A search whose origin is recorded at depth 0. The cell count includes that origin.
 * Exceptions: None. Eviction stops when the map is empty, so one search cannot loop.
 */
function searchFor(originH3Index: string): FallbackDistanceSearch {
  const existing = fallbackSearchByOrigin.get(originH3Index);
  if (existing) return existing;
  while (
    fallbackSearchByOrigin.size > 0 &&
    (fallbackSearchByOrigin.size >= FALLBACK_SEARCH_ORIGIN_CAPACITY ||
      fallbackSearchCellCount > FALLBACK_SEARCH_CELL_BUDGET)
  ) {
    const oldest = fallbackSearchByOrigin.keys().next().value;
    if (oldest === undefined) break;
    const evicted = fallbackSearchByOrigin.get(oldest);
    if (evicted) fallbackSearchCellCount -= evicted.depthByCell.size;
    fallbackSearchByOrigin.delete(oldest);
  }
  const depthByCell = new Map<string, number>([[originH3Index, 0]]);
  fallbackSearchCellCount += 1;
  const created: FallbackDistanceSearch = { depthByCell, queue: [originH3Index], nextIndex: 0, exhausted: false };
  fallbackSearchByOrigin.set(originH3Index, created);
  return created;
}

/**
 * Distance from an origin whose straight-line H3 distance was null, resumed from the last expansion.
 *
 * Purpose: First-visit depth on unit-weight edges equals `breadthFirstPathCells`'s path length minus one. Neighbors already
 *   recorded are skipped, a throwing `gridDisk` is skipped, and cells at the depth cap are recorded but not expanded.
 *   The search is keyed by the origin only, because a throwing `gridDisk` does not prove the two directions are equal.
 * When to use: `computeGridDistanceWithPathFallbackPure` after `computeGridDistancePure` returns null.
 * Expected outcome: The same number a fresh per-pair search would return, or null when the destination is outside the cap.
 *   The current neighbor ring is finished before returning, so a later destination from this origin is not skipped.
 * Exceptions: None.
 */
function fallbackDistanceFrom(originH3Index: string, destinationH3Index: string): number | null {
  const search = searchFor(originH3Index);
  const known = search.depthByCell.get(destinationH3Index);
  if (known !== undefined) return known;
  if (search.exhausted) return null;
  while (search.nextIndex < search.queue.length) {
    const current = search.queue[search.nextIndex]!;
    const depth = search.depthByCell.get(current)!;
    if (depth >= PATH_FALLBACK_MAX_DEPTH) {
      search.exhausted = true;
      return null;
    }
    search.nextIndex += 1;
    let ring: string[];
    try {
      ring = gridDisk(current, 1);
    } catch {
      continue;
    }
    for (const neighbor of ring) {
      if (search.depthByCell.has(neighbor)) continue;
      search.depthByCell.set(neighbor, depth + 1);
      search.queue.push(neighbor);
      fallbackSearchCellCount += 1;
    }
    const found = search.depthByCell.get(destinationH3Index);
    if (found !== undefined) return found;
  }
  search.exhausted = true;
  return null;
}

/**
 * Drops every stored distance search.
 *
 * Purpose: Query-order tests start from an empty search.
 * When to use: Tests only.
 * Expected outcome: The next distance fallback starts a new search. This module does not log.
 * Exceptions: None.
 */
export function clearGridFallbackSearchesForTests(): void {
  fallbackSearchByOrigin.clear();
  fallbackSearchCellCount = 0;
}

/**
 * Returns grid-step distance including pairs that H3's straight-line APIs cannot measure.
 *
 * Contract: `computeGridDistancePure` when that succeeds, including a distance above the search cap. Otherwise the
 *   per-origin search, whose first-visit depth matches `computeGridPathCellsPure`'s path length minus one. The same cell
 *   is 0 from `computeGridDistancePure` and never reaches the search.
 * When to use: Any caller that must not treat an icosahedron face crossing as "no distance" — move-range validation,
 * nearest-enemy scoring, and approach filters all hid legal actions when they gave up on those pairs.
 * Expected outcome: Non-negative integer; 0 for the same cell.
 * Exceptions: None; returns null only when no path can be derived within the depth cap.
 */
export function computeGridDistanceWithPathFallbackPure(
  originH3Index: string,
  destinationH3Index: string
): number | null {
  const direct = computeGridDistancePure(originH3Index, destinationH3Index);
  return direct !== null ? direct : fallbackDistanceFrom(originH3Index, destinationH3Index);
}

/**
 * Returns true when `destinationH3Index` lies within `maxRange` H3 grid steps of `originH3Index`.
 *
 * Contract: Uses `computeGridDistancePure` when it succeeds; otherwise `gridDisk(origin, maxRange)` membership.
 * When to use: Tactical ranged legality and any code that must stay aligned with `isWithinGridRangeSafe` without logging.
 * Expected outcome: Matches `isWithinGridRangeSafe` for the same triple when disk fallback is not needed, and matches
 * when disk fallback is needed except disk-throw logging is omitted here.
 * Exceptions: Returns false when disk enumeration throws.
 */
export function isWithinGridRangePure(originH3Index: string, destinationH3Index: string, maxRange: number): boolean {
  const distance = computeGridDistancePure(originH3Index, destinationH3Index);
  if (distance !== null) return distance <= maxRange;
  try {
    const disk = gridDisk(originH3Index, maxRange);
    return disk.includes(destinationH3Index);
  } catch {
    return false;
  }
}
