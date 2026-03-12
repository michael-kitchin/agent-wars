/**
 * Map data for the game: ordered H3 hex list and terrain seeding.
 * Uses the same H3 resolution and center as the renderer hex grid (Milestone 0.1)
 * so that coordinate systems stay consistent. k-ring 3 yields 37 hexes (~50-hex map).
 */

import { latLngToCell, gridDiskDistances } from 'h3-js';

/** H3 resolution; must match renderer grid (resolution 2 = ~8700 km² per hex). */
export const H3_RESOLUTION = 2;

/** Grid center (lat, lng). (0, 0) = Gulf of Guinea. */
export const GRID_CENTER_LAT = 0;
export const GRID_CENTER_LNG = 0;

/** k-ring radius: 3 gives 1+6+12+18 = 37 hexes. */
const K_RING = 3;

/**
 * Returns the ordered list of H3 cell indices for the map (center first, then by ring).
 * Use this when initializing or seeding the database so hex order is deterministic.
 */
export function getOrderedHexList(): string[] {
  const center = latLngToCell(
    GRID_CENTER_LAT,
    GRID_CENTER_LNG,
    H3_RESOLUTION
  );
  const rings = gridDiskDistances(center, K_RING);
  return rings.flat();
}
