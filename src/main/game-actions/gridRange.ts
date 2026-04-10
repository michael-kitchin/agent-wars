import { gridDistance, gridDisk, gridPathCells } from 'h3-js';
import { logError, logTrace } from '../logger';

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
  try {
    return gridDistance(originH3Index, destinationH3Index);
  } catch (distanceErr) {
    logTrace(`${context}: gridDistance failed (falling back)`, { originH3Index, destinationH3Index, distanceErr });
  }
  try {
    const path = gridPathCells(originH3Index, destinationH3Index);
    if (path.length > 0) return Math.max(0, path.length - 1);
  } catch (pathErr) {
    logTrace(`${context}: gridPathCells failed (falling back)`, { originH3Index, destinationH3Index, pathErr });
  }
  return null;
}

/**
 * Defines the `isWithinGridRangeSafe` function shape (export function isWithinGridRangeSafe().

 * Purpose: Supports maintainability by documenting why `isWithinGridRangeSafe` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isWithinGridRangeSafe(
  originH3Index: string,
  destinationH3Index: string,
  maxRange: number,
  context: string
): boolean {
  const distance = computeGridDistanceSafe(originH3Index, destinationH3Index, context);
  if (distance !== null) return distance <= maxRange;
  try {
    const disk = gridDisk(originH3Index, maxRange);
    return disk.includes(destinationH3Index);
  } catch (diskErr) {
    // Terminal failure: exact-distance and path fallbacks both failed.
    logError(`${context}: gridDisk failed`, { originH3Index, destinationH3Index, maxRange, diskErr });
  }
  return false;
}
