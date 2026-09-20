/**
 * Shared H3 → lat/lng resolution for AI tool payloads.
 *
 * Purpose: One implementation for tool modules that resolve hex centers from a session coordinate map.
 * When to use: Tool1/2/3 pathfinding and assessment lat/lng fields; choose fallback to match prior per-tool behavior.
 * Expected outcome: Map hits return the stored pair; misses use `cellToLatLng` or `[0, 0]` per `fallback`.
 * Exceptions: None; invalid H3 strings may yield NaN from `cellToLatLng` the same as before.
 */

import { cellToLatLng } from 'h3-js';
import { logTrace } from '../logger';

/**
 * Lat/lng pair used in tool geometry and briefing encoding.
 *
 * Purpose: Stable tuple type shared across tools without each module redeclaring it.
 * When to use: Pathfinding session maps, assessment positions, and re-exports from tool entry modules.
 * Expected outcome: `[lat, lng]` in degrees.
 * Exceptions: None.
 */
export type LatLng = [number, number];

/**
 * Map from H3 index to lat/lng for a planning session.
 *
 * Purpose: Names the coordinate lookup shape passed into `h3ToLatLng`.
 * When to use: When building or threading tool session coordinate caches.
 * Expected outcome: `Map` keyed by H3 string.
 * Exceptions: None.
 */
export type LatLngMap = Map<string, LatLng>;

/**
 * Behavior when `h3` is missing from the session map.
 *
 * Purpose: Preserves the historical strategic (`cellCenter`) vs tactical (`origin`) miss paths without silent unification.
 * When to use: Pass `'cellCenter'` from strategic tools; `'origin'` from tactical Tool1.
 * Expected outcome: Discriminated fallback only; no other values.
 * Exceptions: None.
 */
export type H3LatLngFallback = 'cellCenter' | 'origin';

/**
 * Resolves lat/lng for an H3 index from a session map, with an explicit miss policy.
 *
 * Purpose: Centralizes the former per-tool `h3ToLatLng` copies so fallback policy cannot drift unnoticed.
 * When to use: Any tool that needs coordinates for a hex that may or may not be in `latLngByH3`.
 * Expected outcome: Stored pair on hit; `cellToLatLng(h3)` when `fallback` is `'cellCenter'`; `[0, 0]` when `'origin'`. Logs each lookup at TRACE.
 * Exceptions: None.
 */
export function h3ToLatLng(
  h3: string,
  latLngByH3: ReadonlyMap<string, LatLng>,
  fallback: H3LatLngFallback
): LatLng {
  const ll = latLngByH3.get(h3);
  logTrace('h3LatLng h3ToLatLng', { h3, fallback, hit: ll != null });
  if (ll) return [ll[0], ll[1]];
  if (fallback === 'origin') return [0, 0];
  const [lat, lng] = cellToLatLng(h3);
  return [lat, lng];
}
