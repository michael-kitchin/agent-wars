import { checkGridRangePure } from '../../shared/h3GridRangePure';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { logError, logTrace } from '../logger';

/**
 * Returns whether a destination hex is within range, logging an error when the disk fallback fails.
 *
 * Purpose: Main-process entry point for grid-range checks. It is `checkGridRangePure`, which `isWithinGridRangePure` also
 *   uses, plus `logError` on disk failure, so both share one distance memo and one fallback disk memo.
 * When to use: Use in main-process validation and AI order generation; prefer `isWithinGridRangePure` in shared modules.
 * Expected outcome: `true` when distance ≤ maxRange (via direct calc) or destination is in `gridDisk` (on null distance).
 * Exceptions: Returns false and logs an error, on every such check, when `gridDisk` threw for that origin and range; never propagates.
 */
export function isWithinGridRangeSafe(
  originH3Index: string,
  destinationH3Index: string,
  maxRange: number,
  context: string
): boolean {
  const result = checkGridRangePure({ originH3Index, destinationH3Index, maxRange });
  if ('diskError' in result) {
    logError(`${context}: gridDisk failed`, { originH3Index, destinationH3Index, maxRange, diskErr: result.diskError });
  }
  return result.within;
}

/**
 * Defines the `isWithinAirFerryGridRange` function shape (export function isWithinAirFerryGridRange(originH3: string, destH3: string, context: string): boolean).

 * Purpose: Single entry point for **air ferry** grid range checks so all call sites share `AIR_FERRY_RANGE_HEXES` and `isWithinGridRangeSafe` disk-fallback error handling. Logs each probe at TRACE.
 * When to use: Any main-process validation or preview that tests whether an air unit can ferry between two hexes within the configured ferry radius.
 * Expected outcome: Same boolean as `isWithinGridRangeSafe(..., AIR_FERRY_RANGE_HEXES, context)` before this wrapper existed.
 * Exceptions: None.
 */
export function isWithinAirFerryGridRange(originH3: string, destH3: string, context: string, rangeHexes: number = AIR_FERRY_RANGE_HEXES): boolean {
  logTrace('gridRange isWithinAirFerryGridRange', { originH3, destH3, context, rangeHexes });
  return isWithinGridRangeSafe(originH3, destH3, rangeHexes, context);
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
