/**
 * Map data for the game: ordered H3 hex list and terrain seeding.
 * Uses the same H3 resolution and center as the renderer hex grid.
 * k-ring 6 yields 127 hexes (triple the previous ~37).
 * If you had an existing game DB with 37 hexes, delete the DB file (see gameDb userData path) to get the new 127-hex map.
 */

import { latLngToCell, gridDiskDistances, gridDistance, gridDisk } from 'h3-js';

/** H3 resolution; must match renderer grid (resolution 2 = ~8700 km² per hex). */
export const H3_RESOLUTION = 2;

/** Grid center (lat, lng). (0, 0) = Gulf of Guinea. */
export const GRID_CENTER_LAT = 0;
export const GRID_CENTER_LNG = 0;

/** k-ring radius: 9 gives ~271 hexes (about double the previous 127). Existing DBs may need to be reset to see the new map. */
export const K_RING = 9;

/** Axial deltas for hex neighbors: (x,y) + delta gives one of 6 adjacent hexes. Order is fixed for deterministic assignment. */
const AXIAL_DELTAS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function xyKey(x: number, y: number): string {
  return `${x},${y}`;
}

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

/**
 * Builds axial (x, y) coordinates for every hex in the map. Origin (0, 0) is the map center.
 * Used so prompts can use LLM-friendly (x, y) instead of H3 indices. Neighbors differ by one axial delta;
 * hex distance between (x1,y1) and (x2,y2) is max(|x2-x1|, |y2-y1|).
 */
export function buildAxialCoordinateMap(): {
  xyByH3: Map<string, [number, number]>;
  h3ByXY: Map<string, string>;
} {
  const center = latLngToCell(GRID_CENTER_LAT, GRID_CENTER_LNG, H3_RESOLUTION);
  const rings = gridDiskDistances(center, K_RING);
  const xyByH3 = new Map<string, [number, number]>();
  const h3ByXY = new Map<string, string>();

  xyByH3.set(center, [0, 0]);
  h3ByXY.set(xyKey(0, 0), center);

  if (rings[1]) {
    const ring1 = [...rings[1]].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (let i = 0; i < AXIAL_DELTAS.length && i < ring1.length; i++) {
      const [dx, dy] = AXIAL_DELTAS[i]!;
      const h3 = ring1[i]!;
      xyByH3.set(h3, [dx, dy]);
      h3ByXY.set(xyKey(dx, dy), h3);
    }
  }

  const distanceFromCenter = (cell: string): number | null => {
    try {
      return gridDistance(center, cell);
    } catch {
      return null;
    }
  };

  for (let k = 2; k <= K_RING; k++) {
    const ringK = rings[k];
    if (!ringK) continue;
    const ringKSorted = [...ringK].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const h3 of ringKSorted) {
      if (xyByH3.has(h3)) continue;
      const neighbors = gridDisk(h3, 1).filter((n) => n !== h3);
      for (const n of neighbors) {
        const xy = xyByH3.get(n);
        const dist = distanceFromCenter(n);
        if (!xy || dist !== k - 1) continue;
        const candidates: [number, number][] = [];
        for (const [dx, dy] of AXIAL_DELTAS) {
          const key = xyKey(xy[0] + dx, xy[1] + dy);
          if (!h3ByXY.has(key)) candidates.push([xy[0] + dx, xy[1] + dy]);
        }
        if (candidates.length >= 1) {
          candidates.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const [x, y] = candidates[0]!;
          xyByH3.set(h3, [x, y]);
          h3ByXY.set(xyKey(x, y), h3);
        }
        break;
      }
    }
  }

  const flatHexes = rings.flat();
  const fallbackOffset = 5000;
  for (let i = 0; i < flatHexes.length; i++) {
    const h3 = flatHexes[i]!;
    if (xyByH3.has(h3)) continue;
    const x = fallbackOffset + i;
    const y = 0;
    xyByH3.set(h3, [x, y]);
    h3ByXY.set(xyKey(x, y), h3);
  }

  return { xyByH3, h3ByXY };
}
