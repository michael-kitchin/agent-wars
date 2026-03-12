/**
 * Map data for the game: ordered H3 hex list and terrain seeding.
 * Uses the same H3 resolution and center as the renderer hex grid.
 * k-ring 6 yields 127 hexes (triple the previous ~37).
 * If you had an existing game DB with 37 hexes, delete the DB file (see gameDb userData path) to get the new 127-hex map.
 */

import { latLngToCell, gridDiskDistances } from 'h3-js';

/** H3 resolution; must match renderer grid (resolution 2 = ~8700 km² per hex). */
export const H3_RESOLUTION = 2;

/** Grid center (lat, lng). (0, 0) = Gulf of Guinea. */
export const GRID_CENTER_LAT = 0;
export const GRID_CENTER_LNG = 0;

/** k-ring radius: 9 gives ~271 hexes (about double the previous 127). Existing DBs may need to be reset to see the new map. */
const K_RING = 9;

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

/**
 * Returns the ring index (0 = center, 1 = first ring, ...) for a flat index into getOrderedHexList().
 * Used for terrain seeding so contiguous rings can form large land or water bodies.
 */
export function getRingForFlatIndex(flatIndex: number): number {
  let offset = 0;
  for (let ring = 0; ring <= K_RING; ring++) {
    const size = ring === 0 ? 1 : 6 * ring;
    if (flatIndex < offset + size) return ring;
    offset += size;
  }
  return K_RING;
}
