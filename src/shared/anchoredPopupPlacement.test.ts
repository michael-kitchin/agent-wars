/**
 * Contract tests for click-anchored popup placement.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeAnchoredPopup, type AnchoredPopupPlacementArgs } from './anchoredPopupPlacement';

const offsetPx = 12;

/**
 * Builds one placement case.
 *
 * Purpose: The tests share the offset and name only the values that change.
 * When to use: Each test below.
 * Expected outcome: Arguments for `placeAnchoredPopup`.
 * Exceptions: None.
 */
function placement(args: Omit<AnchoredPopupPlacementArgs, 'offsetPx'>): AnchoredPopupPlacementArgs {
  return { ...args, offsetPx };
}

test('a popup that fits stays one offset below and to the right of the click', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 100,
    anchorY: 80,
    popupWidth: 200,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 112);
  assert.equal(placed.top, 92);
});

test('a popup past the right edge shifts left', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 1100,
    anchorY: 80,
    popupWidth: 200,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 1000);
  assert.equal(placed.top, 92);
});

test('a popup past the bottom edge shifts up', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 100,
    anchorY: 700,
    popupWidth: 200,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 112);
  assert.equal(placed.top, 650);
});

test('a popup past the right and bottom edges shifts on both axes', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 1100,
    anchorY: 700,
    popupWidth: 200,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 1000);
  assert.equal(placed.top, 650);
});

test('a popup taller than the window stays at the top', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 100,
    anchorY: 80,
    popupWidth: 200,
    popupHeight: 900,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 112);
  assert.equal(placed.top, 0);
});

test('a popup wider than the window stays at the left', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 100,
    anchorY: 80,
    popupWidth: 1400,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 0);
  assert.equal(placed.top, 92);
});

test('a popup larger than the window on both axes stays at the top-left', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: 100,
    anchorY: 80,
    popupWidth: 1400,
    popupHeight: 900,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 0);
  assert.equal(placed.top, 0);
});

test('a click above and left of the window clamps to the top-left', () => {
  const placed = placeAnchoredPopup(placement({
    anchorX: -20,
    anchorY: -20,
    popupWidth: 200,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  }));
  assert.equal(placed.left, 0);
  assert.equal(placed.top, 0);
});

test('the same arguments return the same point', () => {
  const args = placement({
    anchorX: 1100,
    anchorY: 700,
    popupWidth: 200,
    popupHeight: 150,
    viewportWidth: 1200,
    viewportHeight: 800,
  });
  const first = placeAnchoredPopup(args);
  const second = placeAnchoredPopup(args);
  assert.deepEqual(first, second);
});
