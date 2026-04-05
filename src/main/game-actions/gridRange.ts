import { gridDistance, gridDisk, gridPathCells } from 'h3-js';
import { logError, logTrace } from '../logger';

/**
 * Why this exists:
 *     Centralizes resilient H3 range checks so gameplay validators share consistent fallback behavior.
 * When to use:
 *     Any rule check that depends on H3 grid range and must tolerate pentagon/edge-path exceptions.
 * What to expect:
 *     Returns exact `gridDistance` when available, falls back to path length, then disk-membership for range checks.
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
