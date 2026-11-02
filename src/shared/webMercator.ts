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
