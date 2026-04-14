/**
 * Pure H3 grid distance and “within range” checks without process logging.
 *
 * Purpose: Shared semantics for `game-actions/gridRange` and tactical terrain ranged filters so validation
 * and apply-phase stripping never diverge on fallback paths (`gridPathCells`, `gridDisk`).
 * When to use: Any module that must mirror `isWithinGridRangeSafe` behavior without importing the main-process logger.
 * Expected outcome: Same boolean / distance results as the logging wrappers for valid inputs.
 * Exceptions: Returns `null` / `false` when all H3 APIs fail for the given pair.
 */

import { gridDistance, gridDisk, gridPathCells } from 'h3-js';

/**
 * Returns grid-step distance between two cells, or null when H3 APIs cannot derive a path or distance.
 *
 * Contract: Tries `gridDistance`, then path length from `gridPathCells` minus one, matching `computeGridDistanceSafe` core.
 * When to use: `isWithinGridRangePure` and callers that need a numeric distance without logging.
 * Expected outcome: Non-negative integer when derivable.
 * Exceptions: None; failures return null.
 */
export function computeGridDistancePure(originH3Index: string, destinationH3Index: string): number | null {
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
