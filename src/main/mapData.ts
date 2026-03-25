/**
 * World map: all H3 resolution 1 cells (842 hexes), deterministic order.
 * Terrain and units are seeded from CSV + gameDb; unit counts use the former "small" map totals.
 */

import { getRes0Cells, cellToChildren, cellToLatLng } from 'h3-js';

/** Global world map uses H3 resolution 1; must match terrain_res1_base.csv and renderer. */
export const H3_RESOLUTION = 1;

let cachedWorldHexList: string[] | null = null;

/**
 * Returns every H3 cell at resolution 1 covering Earth, sorted lexicographically for stable DB order.
 * Use for seeding, snapshots, and any feature that needs the full playable hex set.
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
 * Unit counts per side for the fixed world map (same totals as the legacy small k-ring map).
 */
export function getWorldUnitCounts(): { infantry: number; armor: number; naval: number } {
  return { infantry: 2, armor: 2, naval: 1 };
}

/**
 * Returns decimal places for lat/lng exchanged with the LLM, scaled by H3 resolution.
 * Lower resolutions (larger hexes) use fewer decimals to avoid fake precision and token bloat.
 */
export function getLatLngDecimalPlacesForResolution(resolution: number): number {
  if (resolution <= 1) return 2;
  if (resolution <= 3) return 3;
  if (resolution <= 5) return 4;
  return 5;
}

/** Decimal places for the active world-map resolution. */
export const LATLNG_DECIMAL_PLACES = getLatLngDecimalPlacesForResolution(H3_RESOLUTION);

/**
 * Rounds lat and lng so echoed coordinates resolve reliably to the same H3 cell.
 */
export function roundLatLng(lat: number, lng: number): [number, number] {
  const f = 10 ** LATLNG_DECIMAL_PLACES;
  return [Math.round(lat * f) / f, Math.round(lng * f) / f];
}

/**
 * Builds a lat/lng coordinate map for the given hex list and a nearest-hex resolver.
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
