/**
 * Map data for the game: ordered H3 hex list and terrain seeding.
 * Uses the same H3 resolution and center as the renderer hex grid.
 * Hex count is fixed by k-ring (1 + 3*k*(k+1)); resolution only changes hex size. We use a higher
 * resolution (4) so the same number of hexes covers less area, reducing visible edge distortion when
 * rendered (more like a cartesian plane). k-ring 9 yields 271 hexes (small map). Changing H3 resolution
 * or k-ring requires removing the baseline DB file (`game-baseline-v1.sqlite` under Electron userData) to get the new map.
 */

import { latLngToCell, gridDiskDistances, cellToLatLng } from 'h3-js';

/** H3 resolution; must match renderer grid. Resolution 3 = ~1230 km² per hex; same hex count. */
export const H3_RESOLUTION = 3;

/**
 * Grid center (lat, lng). Uses H3 icosahedron face 8 center (~4.53°S, 42.02°W, Atlantic) so the
 * map is centered on a face (all hexagons, no pentagon), minimizing distortion. Must match renderer.
 */
export const GRID_CENTER_LAT = -4.5302;
export const GRID_CENTER_LNG = -42.0224;

/** k-ring for "small" map (~271 hexes). Kept for backward compatibility when no size is passed. */
export const K_RING = 9;

/** Map size: small = current defaults; medium/large scale hexes and unit counts per spec. */
export type MapSize = 'small' | 'medium' | 'large';

/** Small map hex count (1 + 3*k*(k+1) for k=9). Used to scale medium/large. */
const SMALL_HEX_COUNT = 271;

/**
 * Returns the k-ring radius that yields at least the target hex count.
 * Hex count = 1 + 3*k*(k+1). Solves for smallest k such that count >= target.
 */
function kRingForHexCount(target: number): number {
  if (target <= 1) return 0;
  let k = 0;
  let count = 1;
  while (count < target) {
    k += 1;
    count = 1 + 3 * k * (k + 1);
  }
  return k;
}

/**
 * Returns k-ring radius for the given map size. Small = 9 (~271 hexes);
 * medium = 3× hexes; large = 7× hexes (rounded up).
 */
export function getKRingForSize(size: MapSize): number {
  if (size === 'small') return K_RING;
  const target = size === 'medium' ? Math.ceil(3 * SMALL_HEX_COUNT) : Math.ceil(7 * SMALL_HEX_COUNT);
  return kRingForHexCount(target);
}

/**
 * Returns the ordered list of H3 cell indices for the map (center first, then by ring).
 * Use this when initializing or seeding the database so hex order is deterministic.
 * When size is omitted, uses 'small' (backward compatibility).
 */
export function getOrderedHexList(size: MapSize = 'small'): string[] {
  const center = latLngToCell(
    GRID_CENTER_LAT,
    GRID_CENTER_LNG,
    H3_RESOLUTION
  );
  const k = getKRingForSize(size);
  const rings = gridDiskDistances(center, k);
  return rings.flat();
}

/**
 * Unit counts per side for a map size. Small = current defaults (2 infantry, 2 armor, 1 naval);
 * medium = 2× inf, 1.5× armor, 1.5× naval; large = 3.5× inf, 2.5× armor, 2.5× naval (rounded up).
 */
export function getUnitCountsForSize(size: MapSize): { infantry: number; armor: number; naval: number } {
  const small = { infantry: 2, armor: 2, naval: 1 };
  if (size === 'small') return small;
  if (size === 'medium') {
    return {
      infantry: 2 * small.infantry,
      armor: Math.ceil(1.5 * small.armor),
      naval: Math.ceil(1.5 * small.naval),
    };
  }
  return {
    infantry: Math.ceil(3.5 * small.infantry),
    armor: Math.ceil(2.5 * small.armor),
    naval: Math.ceil(2.5 * small.naval),
  };
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
 * Decimal places for lat/lng sent to the LLM. Chosen so rounded coordinates still resolve back to the
 * correct H3 cell via nearest-hex lookup (resolveToH3). At H3 resolution 3, hex edge ~22 km; 3 decimals
 * (~111 m) keeps each rounded point within the correct hex's Voronoi cell. Single source for formatting.
 */
export const LATLNG_DECIMAL_PLACES = 3;

/**
 * Rounds lat and lng to LATLNG_DECIMAL_PLACES so that coordinates are minimal for tokens and still
 * resolve reliably to the same H3 index when the LLM echoes them back.
 */
export function roundLatLng(lat: number, lng: number): [number, number] {
  const f = 10 ** LATLNG_DECIMAL_PLACES;
  return [Math.round(lat * f) / f, Math.round(lng * f) / f];
}

/**
 * Builds a lat/lng coordinate map for the given hex list (e.g. game map hexes).
 * Every hex gets [lat, lng] from cellToLatLng, rounded to LATLNG_DECIMAL_PLACES so the LLM sees
 * minimal-precision coordinates; resolveToH3 maps a returned [lat, lng] back to the nearest hex.
 * Rounding is chosen so that echoed coordinates resolve to the correct H3 cell.
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
