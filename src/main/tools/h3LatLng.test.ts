/**
 * Tests for shared H3 lat/lng resolution. Run with: node dist/main/tools/h3LatLng.test.js
 */

import assert from 'node:assert/strict';
import { cellToLatLng } from 'h3-js';
import { h3ToLatLng, type LatLng } from './h3LatLng';

/**
 * Verifies a map hit returns the stored coordinates for either fallback.
 *
 * Purpose: Happy-path contract for session cache lookups.
 * When to use: After changing `h3ToLatLng` hit handling.
 * Expected outcome: Exact stored pair regardless of fallback mode.
 * Exceptions: None.
 */
function testMapHitReturnsStoredPair(): void {
  const stored: LatLng = [12.5, -34.25];
  const map = new Map<string, LatLng>([['89283082807ffff', stored]]);
  assert.deepStrictEqual(h3ToLatLng('89283082807ffff', map, 'cellCenter'), [12.5, -34.25]);
  assert.deepStrictEqual(h3ToLatLng('89283082807ffff', map, 'origin'), [12.5, -34.25]);
}

/**
 * Verifies a miss with cellCenter fallback matches h3-js cell center.
 *
 * Purpose: Preserves strategic tool behavior when the session map lacks a hex.
 * When to use: After changing the `'cellCenter'` branch.
 * Expected outcome: Same tuple as `cellToLatLng`.
 * Exceptions: None.
 */
function testMissCellCenterUsesCellToLatLng(): void {
  const h3 = '89283082807ffff';
  const map = new Map<string, LatLng>();
  const [lat, lng] = cellToLatLng(h3);
  assert.deepStrictEqual(h3ToLatLng(h3, map, 'cellCenter'), [lat, lng]);
}

/**
 * Verifies a miss with origin fallback returns [0, 0].
 *
 * Purpose: Preserves tactical Tool1 miss behavior.
 * When to use: After changing the `'origin'` branch.
 * Expected outcome: `[0, 0]`.
 * Exceptions: None.
 */
function testMissOriginReturnsZeroPair(): void {
  assert.deepStrictEqual(h3ToLatLng('89283082807ffff', new Map(), 'origin'), [0, 0]);
}

/**
 * Runs all h3LatLng tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/tools/h3LatLng.test.js`.
 * Expected outcome: Throws on first failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testMapHitReturnsStoredPair();
  testMissCellCenterUsesCellToLatLng();
  testMissOriginReturnsZeroPair();
  console.log('h3LatLng.test.ts passed');
}

run();
