/**
 * Shared Web Mercator limits and longitude framing.
 *
 * Purpose: Map extent, unit framing, path playback, and hex drawing shift longitudes the same way.
 * When to use: When a longitude must sit within 180° of a reference, or a latitude must stay on the Web Mercator map.
 * Expected outcome: Callers share one latitude limit and one shift.
 * Exceptions: None. This module does not import the renderer.
 */

/**
 * Absolute latitude of the Web Mercator cutoff, in degrees.
 *
 * Purpose: Vertices and camera bounds must not pass the latitude Leaflet can project.
 * When to use: Clamping a latitude before it becomes a map bound or a projected point.
 * Expected outcome: 85.05112877980659.
 * Exceptions: None.
 */
export const WEB_MERCATOR_MAX_ABS_LAT = 85.05112877980659;

/**
 * Shifts a longitude by whole turns of 360° until it is within 180° of a reference.
 *
 * Purpose: A point across the antimeridian stays next to the reference instead of a world away.
 * When to use: Expanding hex vertices, framing a unit, and interpolating a path.
 * Expected outcome: The returned longitude differs from `lng` by a multiple of 360, and the gap to `refLng` is at most 180°. A gap of exactly 180° is left unchanged.
 * Exceptions: None.
 */
export function alignLongitudeToReference(lng: number, refLng: number): number {
  let shifted = lng;
  while (shifted - refLng > 180) shifted -= 360;
  while (refLng - shifted > 180) shifted += 360;
  return shifted;
}

/**
 * Moves one cell's boundary as a whole so its center sits within 180° of a reference.
 *
 * Purpose: Aligning each vertex on its own splits a cell near the reference's antipode into a band across the map.
 *   Moving the whole ring by one shift keeps that cell intact.
 * When to use: Hex outlines drawn in a shared longitude frame. Pass null to keep the cell around its own center.
 * Expected outcome: Every vertex is first brought within 180° of `centerLng`, then all vertices move by the same
 *   multiple of 360. Latitudes are returned unchanged.
 * Exceptions: None.
 */
export function alignRingToReference(
  ring: readonly (readonly [number, number])[],
  centerLng: number,
  referenceLng: number | null
): [number, number][] {
  const shift = referenceLng == null ? 0 : alignLongitudeToReference(centerLng, referenceLng) - centerLng;
  return ring.map(([lat, lng]) => [lat, alignLongitudeToReference(lng, centerLng) + shift]);
}

/**
 * Aligns a polyline so each point sits next to the one before it.
 *
 * Purpose: A route that crosses 180° must stay one connected line instead of jumping across the world.
 * When to use: Route, path, road, and rail points in `[lat, lng]` order. Pass the frame's reference as `anchorLng`, or
 *   null to keep the first point where it is.
 * Expected outcome: The first point lies within 180° of `anchorLng` when one is given. Each later point lies within
 *   180° of the previous aligned point. Latitudes are returned unchanged.
 * Exceptions: None.
 */
export function alignLatLngRun(
  points: readonly (readonly [number, number])[],
  anchorLng: number | null
): [number, number][] {
  const aligned: [number, number][] = [];
  let previousLng = anchorLng;
  for (const [lat, lng] of points) {
    const alignedLng = previousLng == null ? lng : alignLongitudeToReference(lng, previousLng);
    aligned.push([lat, alignedLng]);
    previousLng = alignedLng;
  }
  return aligned;
}
