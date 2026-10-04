/**
 * World map: all H3 resolution 1 cells (842 hexes), deterministic order.
 * Terrain and units are seeded from CSV + gameDb; unit counts use the former "small" map totals.
 */

import { getRes0Cells, cellToChildren, cellToLatLng } from 'h3-js';
import { STRATEGIC_H3_RESOLUTION } from '../shared/h3Resolutions';

/**
 * H3 resolution of the ordered world hex list.
 *
 * Purpose: Names the strategic resolution used to enumerate every world cell and to fill prompt text.
 * When to use: `getOrderedHexList` and any prompt that prints the world resolution.
 * Expected outcome: Always equals `STRATEGIC_H3_RESOLUTION` (1).
 * Exceptions: None.
 */
export const H3_RESOLUTION = STRATEGIC_H3_RESOLUTION;

/**
 * Documents the module-scope binding `cachedWorldHexList` (cachedWorldHexList: string[] | null).

 * Purpose: Supports maintainability by documenting why `cachedWorldHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let cachedWorldHexList: string[] | null = null;

/**
 * Defines the `getOrderedHexList` function shape (export function getOrderedHexList(): string[]).

 * Purpose: Supports maintainability by documenting why `getOrderedHexList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getOrderedHexList(): string[] {
  if (cachedWorldHexList !== null) return cachedWorldHexList;
  const res0 = getRes0Cells();
  const out: string[] = [];
  for (const c of res0) {
    out.push(...cellToChildren(c, H3_RESOLUTION));
  }
  out.sort();
  cachedWorldHexList = out;
  return out;
}

/**
 * Defines the `getWorldUnitCounts` function shape (export function getWorldUnitCounts():).

 * Purpose: Supports maintainability by documenting why `getWorldUnitCounts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getWorldUnitCounts(): { infantry: number; armor: number; naval: number } {
  return { infantry: 2, armor: 2, naval: 1 };
}

/**
 * Defines the `getLatLngDecimalPlacesForResolution` function shape (export function getLatLngDecimalPlacesForResolution(resolution: number): number).

 * Purpose: Supports maintainability by documenting why `getLatLngDecimalPlacesForResolution` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getLatLngDecimalPlacesForResolution(resolution: number): number {
  if (resolution <= 1) return 2;
  if (resolution <= 3) return 3;
  if (resolution <= 5) return 4;
  return 5;
}

/**
 * Documents the module-scope binding `LATLNG_DECIMAL_PLACES` (LATLNG_DECIMAL_PLACES).

 * Purpose: Supports maintainability by documenting why `LATLNG_DECIMAL_PLACES` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export const LATLNG_DECIMAL_PLACES = getLatLngDecimalPlacesForResolution(H3_RESOLUTION);

/**
 * Defines the `roundLatLng` function shape (export function roundLatLng(lat: number, lng: number): [number, number]).

 * Purpose: Supports maintainability by documenting why `roundLatLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function roundLatLng(lat: number, lng: number): [number, number] {
  const f = 10 ** LATLNG_DECIMAL_PLACES;
  return [Math.round(lat * f) / f, Math.round(lng * f) / f];
}

/**
 * Defines the `buildLatLngCoordinateMap` function shape (export function buildLatLngCoordinateMap(hexList: string[]): { latLngByH3: Map<string, [number, number]>; resolveToH3: (lat: number, lng: number) => strin).

 * Purpose: Supports maintainability by documenting why `buildLatLngCoordinateMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildLatLngCoordinateMap(hexList: string[]): {
  latLngByH3: Map<string, [number, number]>;
  resolveToH3: (lat: number, lng: number) => string | undefined;
} {
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h3 of hexList) {
    const [lat, lng] = cellToLatLng(h3);
    latLngByH3.set(h3, roundLatLng(lat, lng));
  }

  function resolveToH3(lat: number, lng: number): string | undefined {
    if (hexList.length === 0) return undefined;
    let best: string = hexList[0]!;
    let bestD2 = Infinity;
    for (const h3 of hexList) {
      const [clat, clng] = latLngByH3.get(h3)!;
      const d2 = (lat - clat) ** 2 + (lng - clng) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = h3;
      }
    }
    return best;
  }

  return { latLngByH3, resolveToH3 };
}
