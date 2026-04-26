/**
 * Unit tests for `latLngAlongPolylineByArcFraction` (resolution march arc-length interpolation).
 *
 * Purpose: Pure math coverage without Leaflet; run via `npm test` after `build:main`.
 * When to use: After edits to `src/shared/pathPolylineInterp.ts` or renderer playback that consumes it.
 * Expected outcome: Midpoint on second segment, correct endpoints, degenerate single-vertex handling.
 * Exceptions: None; assertion failures indicate regression.
 */

import assert from 'node:assert/strict';
import { latLngAlongPolylineByArcFraction } from '../shared/pathPolylineInterp.js';

/**
 * Documents the function binding `testMidpointSecondSegment` (testMidpointSecondSegment).
 *
 * Purpose: Asserts uniform arc-length at 0.5 lands on the middle of a symmetric two-segment east-west path.
 * When to use: Regression guard for segment boundary math.
 * Expected outcome: Midpoint longitude near 1 at latitude 0.
 * Exceptions: None.
 */
function testMidpointSecondSegment(): void {
  const refLng = 0;
  const coords = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 0, lng: 2 },
  ];
  const mid = latLngAlongPolylineByArcFraction(refLng, coords, 0.5);
  assert.ok(Math.abs(mid.lat - 0) < 1e-9);
  assert.ok(Math.abs(mid.lng - 1) < 1e-6);
}

/**
 * Documents the function binding `testEndpoints` (testEndpoints).
 *
 * Purpose: Locks `frac` 0 and 1 to first and last vertices with non-trivial reference longitude.
 * When to use: Same suite as other polyline interpolation tests.
 * Expected outcome: Start matches first coordinate; end matches last.
 * Exceptions: None.
 */
function testEndpoints(): void {
  const refLng = 10;
  const coords = [
    { lat: 1, lng: 10 },
    { lat: 2, lng: 11 },
    { lat: 3, lng: 12 },
  ];
  const start = latLngAlongPolylineByArcFraction(refLng, coords, 0);
  assert.ok(Math.abs(start.lat - 1) < 1e-9);
  assert.ok(Math.abs(start.lng - 10) < 1e-6);
  const end = latLngAlongPolylineByArcFraction(refLng, coords, 1);
  assert.ok(Math.abs(end.lat - 3) < 1e-9);
  assert.ok(Math.abs(end.lng - 12) < 1e-6);
}

/**
 * Documents the function binding `testSingleVertex` (testSingleVertex).
 *
 * Purpose: Degenerate polyline (one vertex) should return that vertex for any fraction.
 * When to use: Edge-case coverage for tactical paths reduced to a single cell.
 * Expected outcome: Output equals the sole input coordinate.
 * Exceptions: None.
 */
function testSingleVertex(): void {
  const p = latLngAlongPolylineByArcFraction(0, [{ lat: 5, lng: -170 }], 0.7);
  assert.equal(p.lat, 5);
  assert.equal(p.lng, -170);
}

/**
 * Documents the function binding `main` (main).
 *
 * Purpose: Runs this file's tests when executed as a Node script.
 * When to use: `node dist/main/pathPolylineInterp.test.js`.
 * Expected outcome: All assertions pass; prints success line.
 * Exceptions: Propagates assertion errors.
 */
function main(): void {
  testMidpointSecondSegment();
  testEndpoints();
  testSingleVertex();
  console.log('pathPolylineInterp tests passed');
}

main();
