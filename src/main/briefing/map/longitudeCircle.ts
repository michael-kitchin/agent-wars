/**
 * Antimeridian-safe longitude helpers for the ASCII operational map.
 *
 * Purpose: One wrap and one circular mean so the bounding box and the grid projection cannot drift.
 * When to use: From `hexBoundingBox` and `hexGridProjection` only.
 * Expected outcome: The same principal deltas and vector means those modules used when the helpers were private.
 * Exceptions: None.
 */

import { logTrace } from '../../logger';

/**
 * Wraps a longitude delta to (-180, 180] degrees.
 *
 * Purpose: Supports shortest-arc reasoning around the antimeridian.
 * When to use: When comparing a candidate longitude to a reference center.
 * Expected outcome: Stable principal value for angular deltas.
 * Exceptions: None.
 */
export function wrapLongitudeDeltaDegrees(delta: number): number {
  logTrace('wrapLongitudeDeltaDegrees', { delta });
  let d = delta;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * Computes the mean longitude of input points on a circle (vector mean).
 *
 * Purpose: Picks a stable center for wrapping heuristics when forces span the map.
 * When to use: Before expanding a longitude window around units.
 * Expected outcome: Finite angle in [-180, 180] when inputs are non-empty.
 * Exceptions: Returns 0 for empty input.
 */
export function circularMeanLongitudeDegrees(longitudes: number[]): number {
  logTrace('circularMeanLongitudeDegrees', { count: longitudes.length });
  if (longitudes.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const lng of longitudes) {
    const rad = (lng * Math.PI) / 180;
    sx += Math.cos(rad);
    sy += Math.sin(rad);
  }
  const mean = Math.atan2(sy / longitudes.length, sx / longitudes.length);
  return (mean * 180) / Math.PI;
}
