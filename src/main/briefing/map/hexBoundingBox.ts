/**
 * Selects which strategic cells appear on the ASCII operational map for a turn.
 *
 * Purpose: Implements the plan's unit-centered viewport with buffer and antimeridian-safe longitude handling.
 * When to use: After strategic registry initialization and before grid projection.
 * Expected outcome: A bounded subset of global strategic cells around observed forces.
 * Exceptions: None for empty inputs beyond returning an empty list.
 */

import { cellToLatLng } from 'h3-js';
import { logDebug, logTrace } from '../../logger';
import { listStrategicH3Indexes } from './hexCoordinates';
import { circularMeanLongitudeDegrees, wrapLongitudeDeltaDegrees } from './longitudeCircle';

/**
 * Returns all strategic H3 indices whose centers fall inside the buffered unit bounding window.
 *
 * Purpose: Bounding box selection feeding the ASCII renderer.
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

  const all = listStrategicH3Indexes();
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
