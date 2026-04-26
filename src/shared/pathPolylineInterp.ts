/**
 * Planar polyline interpolation in latitude/longitude for short march segments (tactical res4 scale).
 *
 * Purpose: Shared math for resolution playback so unit markers follow multi-hex paths at uniform arc-length speed.
 * When to use: Renderer `drawMovingUnits` with `pathH3Indexes`; unit-tested without Leaflet.
 * Expected outcome: `frac` in [0,1] maps along vertex chain by cumulative segment length; endpoints match first/last vertex.
 * Exceptions: Degenerate zero-length polyline returns last vertex when `frac >= 1`, first when `frac <= 0`.
 */

function alignLngToRef(lng: number, refLng: number): number {
  let l = lng;
  while (l - refLng > 180) l -= 360;
  while (refLng - l > 180) l += 360;
  return l;
}

/**
 * Approximate geodesic step length in meters using local planar metric (adequate for sub-degree tactical legs).
 *
 * Purpose: Weights animation segments by physical distance so multi-hex legs do not spend most time on one short edge.
 * When to use: Only from `latLngAlongPolylineByArcFraction` while accumulating segment lengths.
 * Expected outcome: Non-negative finite distance for distinct points.
 * Exceptions: Returns 0 when endpoints coincide in projected plane.
 */
function segmentLengthMetersApprox(a: { lat: number; lng: number }, b: { lat: number; lng: number }, refLng: number): number {
  const dLatM = (b.lat - a.lat) * 111_320;
  const dLngRad = ((alignLngToRef(b.lng, refLng) - alignLngToRef(a.lng, refLng)) * Math.PI) / 180;
  const dLngM = dLngRad * 6371000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLatM, dLngM);
}

/**
 * Returns the lat/lng point at a fraction of total polyline arc length (0 = first vertex, 1 = last).
 *
 * Purpose: Drives tactical march playback without duplicating interpolation inside Leaflet-aware modules.
 * When to use: After expanding `pathH3Indexes` to vertex coordinates with `cellToLatLng`.
 * Expected outcome: Interior points lie on segment chords between consecutive vertices; clamps `frac` to [0,1].
 * Exceptions: Single-point input returns that point for any `frac`.
 */
export function latLngAlongPolylineByArcFraction(
  refLng: number,
  coords: ReadonlyArray<{ lat: number; lng: number }>,
  frac: number
): { lat: number; lng: number } {
  if (coords.length === 0) return { lat: 0, lng: 0 };
  if (coords.length === 1) return { lat: coords[0]!.lat, lng: coords[0]!.lng };
  const clamped = Math.max(0, Math.min(1, frac));
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = segmentLengthMetersApprox(coords[i - 1]!, coords[i]!, refLng);
    lens.push(d);
    total += d;
  }
  if (!Number.isFinite(total) || total <= 0) {
    return { lat: coords[coords.length - 1]!.lat, lng: coords[coords.length - 1]!.lng };
  }
  let target = total * clamped;
  for (let i = 1; i < coords.length; i++) {
    const len = lens[i - 1]!;
    if (target > len) {
      target -= len;
      continue;
    }
    const r = len <= 0 ? 1 : Math.min(1, target / len);
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const lngA = alignLngToRef(a.lng, refLng);
    const lngB = alignLngToRef(b.lng, refLng);
    const lat = a.lat + r * (b.lat - a.lat);
    const lngAligned = lngA + r * (lngB - lngA);
    let lng = lngAligned;
    while (lng > 180) lng -= 360;
    while (lng < -180) lng += 360;
    return { lat, lng };
  }
  return { lat: coords[coords.length - 1]!.lat, lng: coords[coords.length - 1]!.lng };
}
