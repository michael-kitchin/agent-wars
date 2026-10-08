import { cellToBoundary, cellToLatLng } from 'h3-js';

/**
 * Unwrapped longitude window for the loaded map.
 *
 * Purpose: Gives pan limits a single west-to-east span, including maps that cross 180°.
 * When to use: After measuring strategic-hex centers, and before expanding for hex vertices.
 * Expected outcome: `west` and `east` are unwrapped degrees with `east >= west`. `referenceLng` is the midpoint.
 * Exceptions: None. Callers pass at least one finite longitude.
 */
export interface LongitudeInterval {
  /**
   * Western edge of the occupied span, in unwrapped degrees.
   *
   * Contract: Finite. It may be below -180 when the span was shifted.
   * When to use: As the west side of a regional bounds box.
   * Expected outcome: Less than or equal to `east`.
   * Exceptions: None.
   */
  readonly west: number;
  /**
   * Eastern edge of the occupied span, in unwrapped degrees.
   *
   * Contract: Finite. It may be above 180 when the span crosses the antimeridian.
   * When to use: As the east side of a regional bounds box. Do not wrap it back into ±180.
   * Expected outcome: Greater than or equal to `west`.
   * Exceptions: None.
   */
  readonly east: number;
  /**
   * Midpoint of the unwrapped span.
   *
   * Contract: The average of `west` and `east`.
   * When to use: As the longitude that hex drawing stays near.
   * Expected outcome: A finite degree value, which may lie outside ±180.
   * Exceptions: None.
   */
  readonly referenceLng: number;
  /**
   * Whether the occupied span leaves the ±180 window.
   *
   * Contract: True when `east` is above 180 or `west` is below -180.
   * When to use: When a caller needs to know the map crosses the antimeridian.
   * Expected outcome: False for a span that sits entirely inside ±180.
   * Exceptions: None.
   */
  readonly crossesAntimeridian: boolean;
}

/**
 * Lat/lng box in the same unwrapped frame as `LongitudeInterval`.
 *
 * Purpose: Leaflet maxBounds for a regional map, with longitude allowed past ±180°.
 * When to use: Pass to the map applier. Do not wrap `east` back into ±180 when it crosses the antimeridian.
 * Expected outcome: South and north are clamped to Web Mercator. West and east include hex vertices.
 * Exceptions: None.
 */
export interface MapExtentBox {
  /**
   * Southern latitude of the box.
   *
   * Contract: Clamped to the Web Mercator limit.
   * When to use: As the south edge passed to Leaflet.
   * Expected outcome: A finite latitude no lower than about -85°.
   * Exceptions: None.
   */
  readonly south: number;
  /**
   * Western longitude of the box, in the unwrapped frame.
   *
   * Contract: Includes hex vertices, not only centers.
   * When to use: As the west edge passed to Leaflet with `noWrap`.
   * Expected outcome: A finite longitude. It may be below -180.
   * Exceptions: None.
   */
  readonly west: number;
  /**
   * Northern latitude of the box.
   *
   * Contract: Clamped to the Web Mercator limit.
   * When to use: As the north edge passed to Leaflet.
   * Expected outcome: A finite latitude no higher than about 85°, and at least `south`.
   * Exceptions: None.
   */
  readonly north: number;
  /**
   * Eastern longitude of the box, in the unwrapped frame.
   *
   * Contract: Includes hex vertices. It is not wrapped back into ±180.
   * When to use: As the east edge passed to Leaflet with `noWrap`.
   * Expected outcome: A finite longitude at least `west`. It may be above 180.
   * Exceptions: None.
   */
  readonly east: number;
  /**
   * Longitude that drawing of this box should stay near.
   *
   * Contract: The midpoint of the center interval, before vertex expansion.
   * When to use: `setMapExtentReferenceLng` when this box is applied.
   * Expected outcome: A finite degree value.
   * Exceptions: None.
   */
  readonly referenceLng: number;
}

/** Web Mercator latitude limit used when clamping extent vertices. */
const MERCATOR_LAT = 85.05112877980659;

/**
 * Active draw reference, or null while the global map is showing.
 *
 * Purpose: Regional hex drawing must share one unwrapped longitude frame.
 * When to use: Read from `alignLngToReference` only.
 * Expected outcome: Null keeps each caller's own reference.
 * Exceptions: None.
 */
let extentReferenceLng: number | null = null;

/**
 * Records the longitude that regional drawing should stay near.
 *
 * Purpose: Antimeridian maps would split if each hex aligned only to itself.
 * When to use: When applying a regional extent, and with null when restoring the global map.
 * Expected outcome: Later `alignLngToReference` calls use this value until it is cleared.
 * Exceptions: None.
 */
export function setMapExtentReferenceLng(lng: number | null): void {
  extentReferenceLng = lng;
}

/**
 * Returns the regional draw reference when one is active.
 *
 * Purpose: Lets the renderer align vertices without threading the extent through every draw call.
 * When to use: From `alignLngToReference`.
 * Expected outcome: The stored midpoint, or null on the global map.
 * Exceptions: None.
 */
export function mapExtentReferenceLng(): number | null {
  return extentReferenceLng;
}

/**
 * Builds the identity of one loaded footprint.
 *
 * Purpose: Later snapshots of the same match must not fit the camera again.
 * When to use: When extent sync decides whether a snapshot should fit. Pass `gameMap.id`, or `'global'` when that id is missing.
 * Expected outcome: An empty hex list returns `${mapId}:empty`. Any other list returns map id, length, first index, and last index, in that order.
 * Exceptions: None.
 */
export function loadedMapExtentKey(mapId: string, h3Indexes: readonly string[]): string {
  if (h3Indexes.length === 0) return `${mapId}:empty`;
  return `${mapId}:${h3Indexes.length}:${h3Indexes[0]}:${h3Indexes[h3Indexes.length - 1]}`;
}

/**
 * Reports whether this footprint should move the map.
 *
 * Purpose: A new match frames its map even when the hex list matches the previous match. A later snapshot of that match does not.
 * When to use: From extent sync, after the map is known to exist. This function only compares keys.
 * Expected outcome: True when `refit` is true or the keys differ. False when the keys match and `refit` is false.
 * Exceptions: None.
 */
export function shouldApplyLoadedMapExtent(appliedKey: string, nextKey: string, refit: boolean): boolean {
  return refit || appliedKey !== nextKey;
}

/**
 * Picks the occupied longitude span as the complement of the largest gap.
 *
 * Purpose: A map that crosses 180° must span the short way around, not the long empty ocean.
 * When to use: With the center longitude of every strategic hex on the loaded map.
 * Expected outcome: 170 and -170 span about 20°. 10 and 30 span 20° without crossing. -175, 30, and 170 run east from 30 past 180.
 * Exceptions: Returns null when `longitudes` is empty or contains no finite value.
 */
export function longitudeIntervalFromCenters(longitudes: readonly number[]): LongitudeInterval | null {
  const sorted = longitudes.filter((lng) => Number.isFinite(lng)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  let largestGap = sorted[0]! + 360 - sorted[sorted.length - 1]!;
  let west = sorted[0]!;
  let east = sorted[sorted.length - 1]!;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const gap = sorted[i + 1]! - sorted[i]!;
    if (gap > largestGap) {
      largestGap = gap;
      west = sorted[i + 1]!;
      east = sorted[i]! + 360;
    }
  }
  const crossesAntimeridian = east > 180 || west < -180;
  return {
    west,
    east,
    referenceLng: (west + east) / 2,
    crossesAntimeridian,
  };
}

/**
 * Expands a center interval so every hex vertex is inside the box.
 *
 * Purpose: Pan limits must include hex corners, not only centers.
 * When to use: After `longitudeIntervalFromCenters` for a regional footprint.
 * Expected outcome: Latitudes are clamped to Web Mercator. Longitudes stay in the unwrapped frame.
 * Exceptions: Returns null when `interval` is null.
 */
export function mapExtentBoxForHexes(
  interval: LongitudeInterval | null,
  h3Indexes: readonly string[]
): MapExtentBox | null {
  if (!interval) return null;
  let south = 90;
  let north = -90;
  let west = interval.west;
  let east = interval.east;
  for (const h3 of h3Indexes) {
    const [, centerLng] = cellToLatLng(h3);
    for (const [lat, lng] of cellToBoundary(h3)) {
      const alignedToCell = alignTo(lng, centerLng);
      const aligned = alignTo(alignedToCell, interval.referenceLng);
      const clampedLat = Math.max(-MERCATOR_LAT, Math.min(MERCATOR_LAT, lat));
      south = Math.min(south, clampedLat);
      north = Math.max(north, clampedLat);
      west = Math.min(west, aligned);
      east = Math.max(east, aligned);
    }
  }
  if (south > north) {
    south = -MERCATOR_LAT;
    north = MERCATOR_LAT;
  }
  return { south, west, north, east, referenceLng: interval.referenceLng };
}

/**
 * Shifts `lng` by 360° until it is within 180° of `refLng`.
 *
 * Purpose: Local copy of the renderer helper so this module stays free of DOM imports.
 * When to use: Only while expanding hex vertices into the extent frame.
 * Expected outcome: The returned longitude differs from `lng` by a multiple of 360.
 * Exceptions: None.
 */
function alignTo(lng: number, refLng: number): number {
  let shifted = lng;
  while (shifted - refLng > 180) shifted -= 360;
  while (refLng - shifted > 180) shifted += 360;
  return shifted;
}
