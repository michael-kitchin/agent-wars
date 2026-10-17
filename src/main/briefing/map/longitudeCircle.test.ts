/**
 * Locks the antimeridian wrap and circular mean used by the ASCII map.
 *
 * Purpose: The two briefing-map callers must keep the same principal values after sharing one implementation.
 * When to use: Run via `npm test` after `build:main`.
 * Expected outcome: The historical wrap boundaries and the short-arc mean of a dateline pair.
 * Exceptions: Assertion failures name the drifted input.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { circularMeanLongitudeDegrees, wrapLongitudeDeltaDegrees } from './longitudeCircle';

test('wrapLongitudeDeltaDegrees keeps the historical boundaries', () => {
  assert.equal(wrapLongitudeDeltaDegrees(190), -170);
  assert.equal(wrapLongitudeDeltaDegrees(-190), 170);
  assert.equal(wrapLongitudeDeltaDegrees(180), 180);
  assert.equal(wrapLongitudeDeltaDegrees(-180), 180);
});

test('circularMeanLongitudeDegrees uses the vector mean', () => {
  assert.equal(circularMeanLongitudeDegrees([]), 0);
  assert.equal(circularMeanLongitudeDegrees([10, -10]), 0);
  assert.ok(Math.abs(circularMeanLongitudeDegrees([170, -170]) - 180) < 1e-6);
});
