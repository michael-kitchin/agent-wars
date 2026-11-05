/**
 * Pure H3 geometry helpers (lat/lng cell boundary, local IJ → cube for sidebar/diagnostics).
 * World-map drawing uses Leaflet + H3 lat/lng in renderer.ts and worldLeafletMap.ts — not this file.
 */

import { cellToBoundary, cellToLatLng, cellToLocalIj } from 'h3-js';
import { drawReferenceLng } from '../../shared/mapExtent';
import {
  alignLatLngRun,
  alignLongitudeToReference,
  alignRingToReference,
  WEB_MERCATOR_MAX_ABS_LAT,
} from '../../shared/webMercator';

/**
 * The Web Mercator latitude cutoff, re-exported for renderer map code.
 *
 * Purpose: Camera bounds, the tactical view, and the world map clamp to the same latitude.
 * When to use: Import from here in renderer map modules. The value is defined in `src/shared/webMercator.ts`.
 * Expected outcome: The same number as `WEB_MERCATOR_MAX_ABS_LAT` in that module.
 * Exceptions: None.
 */
export { WEB_MERCATOR_MAX_ABS_LAT };

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
 * Moves one longitude into the active draw frame, or next to `refLng` when no frame is active.
 *
 * Purpose: Keeps points in one unwrapped frame. The battle or regional draw reference wins over the caller's local reference.
 * When to use: When converting H3 centers, perimeter loops, and labels to Leaflet longitudes. For an offset between two
 *   nearby points, use `alignLongitudeToReference` instead: this result can be a whole turn away from `refLng`.
 * Expected outcome: The returned longitude is within 180° of the active draw reference, or of `refLng` when none is active.
 * Exceptions: None.
 */
export function alignLngToReference(lng: number, refLng: number): number {
  const reference = drawReferenceLng() ?? refLng;
  return alignLongitudeToReference(lng, reference);
}

/**
 * Moves one longitude into the active draw frame.
 *
 * Purpose: Hex centers and markers must land on the same copy of the world as the hex outlines.
 * When to use: Projecting a single point, such as a hex center, with no neighbor to align against.
 * Expected outcome: `lng` unchanged when no draw reference is active. Otherwise the copy within 180° of that reference.
 * Exceptions: None.
 */
export function alignLngToDrawReference(lng: number): number {
  const reference = drawReferenceLng();
  return reference == null ? lng : alignLongitudeToReference(lng, reference);
}

/**
 * Aligns a `[lat, lng]` polyline as one connected run in the active draw frame.
 *
 * Purpose: Routes, playback paths, roads, and rails stay connected across 180° and on the battle's copy of the world.
 * When to use: Before projecting a run of points. Pass `anchorLng` to continue from an earlier run's last point.
 * Expected outcome: The first point aligns to `anchorLng`, else to the draw reference, else stays where it is. Each
 *   later point aligns to the one before it. Latitudes are unchanged.
 * Exceptions: None.
 */
export function alignLatLngRunToDrawReference(
  points: readonly (readonly [number, number])[],
  anchorLng?: number
): [number, number][] {
  return alignLatLngRun(points, anchorLng ?? drawReferenceLng());
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
 * Returns one cell's boundary ready for projection on the main map.
 *
 * Purpose: Hex outlines must be intact and on the same copy of the world as everything else drawn with them.
 * When to use: Before projecting a hex outline to container pixels.
 * Expected outcome: Latitudes clamped to Web Mercator. The ring is intact around the cell center and, when a draw
 *   reference is active, moved as a whole so its center is within 180° of that reference.
 * Exceptions: Throws the H3 library's error when `h3Index` is not a cell.
 */
export function getHexBoundaryLatLngForLeafletOverlay(h3Index: string): [number, number][] {
  const [, centerLng] = cellToLatLng(h3Index);
  return alignRingToReference(cellToBoundary(h3Index), centerLng, drawReferenceLng()).map(
    ([lat, lng]) => [clampLatForWebMercatorDisplay(lat), lng] as [number, number]
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
