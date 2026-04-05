/**
 * Pure H3 geometry helpers (lat/lng cell boundary, local IJ → cube for sidebar/diagnostics).
 * World-map drawing uses Leaflet + H3 lat/lng in renderer.ts and worldLeafletMap.ts — not this file.
 */

import { cellToBoundary, cellToLatLng, cellToLocalIj } from 'h3-js';

/**
 * Northern/southern limit of EPSG:3857 (Web Mercator) in degrees. Poles are undefined; Leaflet and
 * standard raster tiles only cover this band. H3 uses full WGS84 to ±90°, so vertices poleward of this
 * must be clamped before `latLngToContainerPoint` or the overlay and basemap diverge near Antarctica.
 */
export const WEB_MERCATOR_MAX_ABS_LAT = 85.05112877980659;

/**
 * Why this exists:
 *     Match Leaflet/tile math so H3 geometry is projected into the same valid latitude band as the basemap.
 * When to use:
 *     Any H3-derived lat/lng passed to `L.latLng` / `latLngToContainerPoint` on the main map.
 * What to expect:
 *     Latitudes outside ±WEB_MERCATOR_MAX_ABS_LAT are clamped; longitude unchanged.
 */
export function clampLatForWebMercatorDisplay(lat: number): number {
  if (lat > WEB_MERCATOR_MAX_ABS_LAT) return WEB_MERCATOR_MAX_ABS_LAT;
  if (lat < -WEB_MERCATOR_MAX_ABS_LAT) return -WEB_MERCATOR_MAX_ABS_LAT;
  return lat;
}

/**
 * Why this exists:
 *     h3-js boundary vertices can sit on opposite sides of the antimeridian (e.g. +179° and −179°).
 * When to use:
 *     Before projecting each vertex with Leaflet’s `latLngToContainerPoint`, so every corner shares one
 *     longitudinal branch and the polygon does not “tear” across the map.
 * What to expect:
 *     Returns an equivalent longitude (±360°) within 180° of `refLng` on the number line.
 */
export function alignLngToReference(lng: number, refLng: number): number {
  let l = lng;
  while (l - refLng > 180) l -= 360;
  while (refLng - l > 180) l += 360;
  return l;
}

/**
 * Returns the cell boundary as [lat, lng] vertices in degrees (WGS84), closed loop per h3-js.
 * Use for any code that needs geographic hex outlines without a map projection.
 */
export function getHexBoundaryLatLng(h3Index: string): [number, number][] {
  return cellToBoundary(h3Index);
}

/**
 * Why this exists:
 *     Same ring as `getHexBoundaryLatLng`, with longitudes shifted so the ring is continuous around the
 *     cell center — required for Leaflet/canvas overlay drawing at the map seam.
 * When to use:
 *     World map terrain hex fill/stroke; not needed for pure geodesic math off the map.
 * What to expect:
 *     Same vertex count and order as `cellToBoundary`; longitudes aligned; latitudes clamped for Web Mercator.
 */
export function getHexBoundaryLatLngForLeafletOverlay(h3Index: string): [number, number][] {
  const boundary = cellToBoundary(h3Index);
  const [, refLng] = cellToLatLng(h3Index);
  return boundary.map(
    ([lat, lng]) =>
      [clampLatForWebMercatorDisplay(lat), alignLngToReference(lng, refLng)] as [number, number]
  );
}

/**
 * Converts an H3 cell to cube-style coordinates (x, y, z) with z = -x - y, relative to `originH3`.
 * Callers must supply an origin on the same H3 resolution as `h3Index` (e.g. a reference hex from game state).
 */
export function cellToCube(
  h3Index: string,
  originH3: string
): { x: number; y: number; z: number } {
  try {
    const [i, j] = cellToLocalIj(originH3, h3Index);
    return { x: i, y: j, z: -i - j };
  } catch {
    return { x: 0, y: 0, z: 0 };
  }
}
