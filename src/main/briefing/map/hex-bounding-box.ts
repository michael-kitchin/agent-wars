/**
 * Selects which strategic res1 cells appear on the ASCII operational map for a turn.
 *
 * Purpose: Implements the plan's unit-centered viewport with buffer and antimeridian-safe longitude handling.
 * When to use: After strategic registry initialization and before grid projection.
 * Expected outcome: A bounded subset of global res1 cells around observed forces.
 * Exceptions: None for empty inputs beyond returning an empty list.
 */

import { cellToLatLng } from 'h3-js';
import { logDebug, logTrace } from '../../logger';
import { listStrategicRes1H3Indexes } from './hex-coordinates';

/**
 * Wraps a longitude delta to (-180, 180] degrees.
 *
 * Purpose: Supports shortest-arc reasoning around the antimeridian.
 * When to use: When comparing a candidate longitude to a reference center.
 * Expected outcome: Stable principal value for angular deltas.
 * Exceptions: None.
 */
function wrapLongitudeDeltaDegrees(delta: number): number {
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
function circularMeanLongitudeDegrees(longitudes: number[]): number {
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

/**
 * Returns all res1 H3 indices whose centers fall inside the buffered unit bounding window.
 *
 * Purpose: Phase 2 bounding box selection feeding the ASCII renderer.
 * When to use: Callers that need a unit-centered strategic window (not the full-world AI operational map).
 * Expected outcome: Includes water and land cells in the window; excludes far-away cells.
 * Exceptions: None.
 */
export function computeMapHexes(
  aiUnits: Array<{ lat: number; lng: number }>,
  enemyUnits: Array<{ lat: number; lng: number }>,
  bufferHexes = 5
): string[] {
  logDebug('hex-bounding-box computeMapHexes', {
    aiCount: aiUnits.length,
    enemyCount: enemyUnits.length,
    bufferHexes,
  });
  const points = [...aiUnits, ...enemyUnits];
  if (points.length === 0) return [];

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const centerLng = circularMeanLongitudeDegrees(lngs);
  const wrapped = lngs.map((lng) => wrapLongitudeDeltaDegrees(lng - centerLng));
  const minLngDelta = Math.min(...wrapped);
  const maxLngDelta = Math.max(...wrapped);

  const approxDegPerHex = 7.5;
  const latBuffer = bufferHexes * approxDegPerHex;
  const lngBuffer = bufferHexes * approxDegPerHex;

  const latMin = minLat - latBuffer;
  const latMax = maxLat + latBuffer;
  const lngDeltaMin = minLngDelta - lngBuffer;
  const lngDeltaMax = maxLngDelta + lngBuffer;

  const all = listStrategicRes1H3Indexes();
  const out: string[] = [];
  for (const h3 of all) {
    const [lat, lng] = cellToLatLng(h3);
    if (lat < latMin || lat > latMax) continue;
    const delta = wrapLongitudeDeltaDegrees(lng - centerLng);
    if (delta < lngDeltaMin || delta > lngDeltaMax) continue;
    out.push(h3);
  }
  logTrace('hex-bounding-box computeMapHexes: result', { selected: out.length, universe: all.length });
  return out;
}
