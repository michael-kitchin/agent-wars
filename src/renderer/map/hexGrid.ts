/**
 * Pure H3 geometry helpers (lat/lng cell boundary, local IJ → cube for sidebar/diagnostics).
 * World-map drawing uses Leaflet + H3 lat/lng in renderer.ts and worldLeafletMap.ts — not this file.
 */

import { cellToBoundary, cellToLatLng, cellToLocalIj } from 'h3-js';
import { mapExtentReferenceLng } from '../../shared/mapExtent';

/**
 * Documents the module-scope binding `WEB_MERCATOR_MAX_ABS_LAT` (WEB_MERCATOR_MAX_ABS_LAT).

 * Purpose: Supports maintainability by documenting why `WEB_MERCATOR_MAX_ABS_LAT` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const WEB_MERCATOR_MAX_ABS_LAT = 85.05112877980659;

/**
 * Defines the `clampLatForWebMercatorDisplay` function shape (export function clampLatForWebMercatorDisplay(lat: number): number).

 * Purpose: Supports maintainability by documenting why `clampLatForWebMercatorDisplay` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clampLatForWebMercatorDisplay(lat: number): number {
  if (lat > WEB_MERCATOR_MAX_ABS_LAT) return WEB_MERCATOR_MAX_ABS_LAT;
  if (lat < -WEB_MERCATOR_MAX_ABS_LAT) return -WEB_MERCATOR_MAX_ABS_LAT;
  return lat;
}

/**
 * Defines the `alignLngToReference` function shape (export function alignLngToReference(lng: number, refLng: number): number).

 * Purpose: Keeps hex edges in one unwrapped frame. A regional extent reference wins over the caller's local reference.
 * When to use: When converting H3 boundaries, paths, and labels to Leaflet longitudes.
 * Expected outcome: The returned longitude is within 180° of the active extent reference, or of `refLng` on the global map.
 * Exceptions: None.
 */
export function alignLngToReference(lng: number, refLng: number): number {
  const reference = mapExtentReferenceLng() ?? refLng;
  let l = lng;
  while (l - reference > 180) l -= 360;
  while (reference - l > 180) l += 360;
  return l;
}

/**
 * Defines the `getHexBoundaryLatLng` function shape (export function getHexBoundaryLatLng(h3Index: string): [number, number][]).

 * Purpose: Supports maintainability by documenting why `getHexBoundaryLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getHexBoundaryLatLng(h3Index: string): [number, number][] {
  return cellToBoundary(h3Index);
}

/**
 * Defines the `getHexBoundaryLatLngForLeafletOverlay` function shape (export function getHexBoundaryLatLngForLeafletOverlay(h3Index: string): [number, number][]).

 * Purpose: Supports maintainability by documenting why `getHexBoundaryLatLngForLeafletOverlay` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `cellToCube` function shape (export function cellToCube().

 * Purpose: Supports maintainability by documenting why `cellToCube` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
