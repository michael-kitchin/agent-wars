/**
 * Contract tests for popover placement.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeBelowAnchor } from './popoverPlacement';

test('a short anchor near the top-left places the popover just below', () => {
  const placed = placeBelowAnchor(
    { top: 20, bottom: 50, left: 16 },
    { width: 380, height: 200 },
    { width: 1200, height: 800 }
  );
  assert.equal(placed.top, 56);
  assert.equal(placed.left, 16);
});

test('a popover past the right edge shifts left to the margin', () => {
  const placed = placeBelowAnchor(
    { top: 20, bottom: 50, left: 1100 },
    { width: 380, height: 100 },
    { width: 1200, height: 800 }
  );
  assert.equal(placed.left, 1200 - 380 - 8);
});

test('a popover past the bottom flips above the anchor', () => {
  const placed = placeBelowAnchor(
    { top: 700, bottom: 730, left: 16 },
    { width: 380, height: 200 },
    { width: 1200, height: 800 }
  );
  assert.equal(placed.top, 700 - 200 - 6);
});
