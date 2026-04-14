import { gridDisk } from 'h3-js';
import { computeGridDistancePure } from '../../shared/h3GridRangePure';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { logDebug, logError, logTrace } from '../logger';

/**
 * Defines the `computeGridDistanceSafe` function shape (export function computeGridDistanceSafe().

 * Purpose: Supports maintainability by documenting why `computeGridDistanceSafe` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `isWithinGridRangeSafe` function shape (export function isWithinGridRangeSafe().

 * Purpose: Supports maintainability by documenting why `isWithinGridRangeSafe` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Uses `computeGridDistancePure` first; on `null` distance falls back to `gridDisk(origin, maxRange)` membership (aligned with `isWithinGridRangePure` semantics); logs disk failures only.
 * Exceptions: None.
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
    const disk = gridDisk(originH3Index, maxRange);
    return disk.includes(destinationH3Index);
  } catch (diskErr) {
    logError(`${context}: gridDisk failed`, { originH3Index, destinationH3Index, maxRange, diskErr });
  }
  return false;
}

/**
 * Defines the `isWithinAirFerryGridRange` function shape (export function isWithinAirFerryGridRange(originH3: string, destH3: string, context: string): boolean).

 * Purpose: Single entry point for **air ferry** grid range checks so all call sites share `AIR_FERRY_RANGE_HEXES` and the same `isWithinGridRangeSafe` logging semantics.
 * When to use: Any main-process validation or preview that tests whether an air unit can ferry between two hexes within the configured ferry radius.
 * Expected outcome: Same boolean as `isWithinGridRangeSafe(..., AIR_FERRY_RANGE_HEXES, context)` before this wrapper existed.
 * Exceptions: None.
 */
export function isWithinAirFerryGridRange(originH3: string, destH3: string, context: string): boolean {
  logDebug('gridRange isWithinAirFerryGridRange', { originH3, destH3, context });
  return isWithinGridRangeSafe(originH3, destH3, AIR_FERRY_RANGE_HEXES, context);
}

/**
 * Defines the `isWithinAirStrikeGridRange` function shape (export function isWithinAirStrikeGridRange(originH3: string, destH3: string, context: string): boolean).

 * Purpose: Single entry point for **air strike** grid range checks so all call sites share `AIR_STRIKE_RANGE_HEXES` and the same `isWithinGridRangeSafe` logging semantics.
 * When to use: Any main-process validation or briefing scan that tests whether a strike target lies within strike range from a base hex.
 * Expected outcome: Same boolean as `isWithinGridRangeSafe(..., AIR_STRIKE_RANGE_HEXES, context)` before this wrapper existed.
 * Exceptions: None.
 */
export function isWithinAirStrikeGridRange(originH3: string, destH3: string, context: string): boolean {
  logDebug('gridRange isWithinAirStrikeGridRange', { originH3, destH3, context });
  return isWithinGridRangeSafe(originH3, destH3, AIR_STRIKE_RANGE_HEXES, context);
}
