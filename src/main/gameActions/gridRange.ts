import { gridDisk } from 'h3-js';
import { DEFAULT_BOUNDED_MEMO_CAPACITY, getBoundedMemo } from '../../shared/boundedMemoCache';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { logError, logTrace } from '../logger';

/**
 * Memoizes `gridDisk(origin, maxRange)` sets for the null-distance fallback in `isWithinGridRangeSafe`.
 *
 * Purpose: Avoids rebuilding identical disks when many destinations share one origin and range cap.
 * When to use: Only from `isWithinGridRangeSafe` when `computeGridDistancePure` returns null.
 * Expected outcome: Membership tests match a fresh `gridDisk` call for the same origin/range pair.
 * Exceptions: None.
 */
const gridDiskFallbackMemo = new Map<string, Set<string>>();

/**
 * Returns H3 grid-step distance with main-process trace logging on fallback failure.
 *
 * Purpose: Logging wrapper around `computeGridDistancePure` for code paths that have access to the main logger.
 * When to use: Anywhere in the main process that needs a numeric distance and wants trace-level fallback diagnostics.
 * Expected outcome: Non-negative integer when derivable; null when both `gridDistance` and `gridPathCells` fail.
 * Exceptions: None; all H3 errors are swallowed inside `computeGridDistancePure`.
 */
export function computeGridDistanceSafe(
  originH3Index: string,
  destinationH3Index: string,
  context: string
): number | null {
  const d = computeGridDistancePure(originH3Index, destinationH3Index);
  if (d !== null) return d;
  logTrace(`${context}: gridDistance and gridPathCells unavailable`, { originH3Index, destinationH3Index });
  return null;
}

/**
 * Returns whether a destination hex is within range, using a memoized disk-fallback with main-process error logging.
 *
 * Purpose: Main-process entry point for grid-range checks; extends `isWithinGridRangePure` with `logError` on disk failure.
 * When to use: Use in main-process validation and AI order generation; prefer `isWithinGridRangePure` in shared modules.
 * Expected outcome: `true` when distance ≤ maxRange (via direct calc) or destination is in `gridDisk` (on null distance).
 * Exceptions: Returns false and logs error when `gridDisk` itself throws; never propagates.
 */
export function isWithinGridRangeSafe(
  originH3Index: string,
  destinationH3Index: string,
  maxRange: number,
  context: string
): boolean {
  const distance = computeGridDistancePure(originH3Index, destinationH3Index);
  if (distance !== null) return distance <= maxRange;
  try {
    const diskKey = `${originH3Index}|${maxRange}`;
    const disk = getBoundedMemo(gridDiskFallbackMemo, diskKey, DEFAULT_BOUNDED_MEMO_CAPACITY, () => {
      return new Set(gridDisk(originH3Index, maxRange));
    });
    return disk.has(destinationH3Index);
  } catch (diskErr) {
    logError(`${context}: gridDisk failed`, { originH3Index, destinationH3Index, maxRange, diskErr });
  }
  return false;
}

/**
 * Defines the `isWithinAirFerryGridRange` function shape (export function isWithinAirFerryGridRange(originH3: string, destH3: string, context: string): boolean).

 * Purpose: Single entry point for **air ferry** grid range checks so all call sites share `AIR_FERRY_RANGE_HEXES` and `isWithinGridRangeSafe` disk-fallback error handling. Logs each probe at TRACE.
 * When to use: Any main-process validation or preview that tests whether an air unit can ferry between two hexes within the configured ferry radius.
 * Expected outcome: Same boolean as `isWithinGridRangeSafe(..., AIR_FERRY_RANGE_HEXES, context)` before this wrapper existed.
 * Exceptions: None.
 */
export function isWithinAirFerryGridRange(originH3: string, destH3: string, context: string): boolean {
  logTrace('gridRange isWithinAirFerryGridRange', { originH3, destH3, context });
  return isWithinGridRangeSafe(originH3, destH3, AIR_FERRY_RANGE_HEXES, context);
}

/**
 * Defines the `isWithinAirStrikeGridRange` function shape (export function isWithinAirStrikeGridRange(originH3: string, destH3: string, context: string): boolean).

 * Purpose: Single entry point for **air strike** grid range checks so all call sites share `AIR_STRIKE_RANGE_HEXES` and `isWithinGridRangeSafe` disk-fallback error handling. Logs each probe at TRACE.
 * When to use: Any main-process validation or briefing scan that tests whether a strike target lies within strike range from a base hex.
 * Expected outcome: Same boolean as `isWithinGridRangeSafe(..., AIR_STRIKE_RANGE_HEXES, context)` before this wrapper existed.
 * Exceptions: None.
 */
export function isWithinAirStrikeGridRange(originH3: string, destH3: string, context: string): boolean {
  logTrace('gridRange isWithinAirStrikeGridRange', { originH3, destH3, context });
  return isWithinGridRangeSafe(originH3, destH3, AIR_STRIKE_RANGE_HEXES, context);
}
