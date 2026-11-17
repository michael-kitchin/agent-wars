import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INITIAL_VISIBLE_TURNS, initialTurnWindow, sameTurnRange, zoomExtentTurnRange } from './chartTurnWindow';

/**
 * Builds the turns `first` through `last`.
 *
 * Purpose: Tests state a series by its ends.
 * When to use: Every case below.
 * Expected outcome: Consecutive whole turns.
 * Exceptions: None.
 */
function turnsFrom(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_unused, index) => first + index);
}

test('the opening window holds 12 turns', () => {
  assert.equal(INITIAL_VISIBLE_TURNS, 12);
});

test('a short series fills in from its first turn and keeps blank space on the right', () => {
  assert.deepEqual(initialTurnWindow([]), { min: 1, max: 12 });
  assert.deepEqual(initialTurnWindow([1]), { min: 1, max: 12 });
  assert.deepEqual(initialTurnWindow(turnsFrom(1, 5)), { min: 1, max: 12 });
  assert.deepEqual(initialTurnWindow(turnsFrom(1, 12)), { min: 1, max: 12 });
});

test('the blank space shrinks as the series grows, and the window slides after turn 12', () => {
  assert.deepEqual(initialTurnWindow(turnsFrom(1, 11)), { min: 1, max: 12 });
  assert.deepEqual(initialTurnWindow(turnsFrom(1, 13)), { min: 2, max: 13 });
  assert.deepEqual(initialTurnWindow(turnsFrom(1, 40)), { min: 29, max: 40 });
});

test('a series that starts after turn 1 fills in from its own first turn', () => {
  assert.deepEqual(initialTurnWindow(turnsFrom(3, 6)), { min: 3, max: 14 });
  assert.deepEqual(initialTurnWindow(turnsFrom(3, 20)), { min: 9, max: 20 });
});

test('the zoom extent is every turn, widened to the opening window for a short series', () => {
  assert.deepEqual(zoomExtentTurnRange([]), { min: 1, max: 12 });
  assert.deepEqual(zoomExtentTurnRange(turnsFrom(1, 5)), { min: 1, max: 12 });
  assert.deepEqual(zoomExtentTurnRange(turnsFrom(1, 12)), { min: 1, max: 12 });
  assert.deepEqual(zoomExtentTurnRange(turnsFrom(1, 40)), { min: 1, max: 40 });
});

test('sameTurnRange compares both ends', () => {
  assert.equal(sameTurnRange({ min: 1, max: 12 }, { min: 1, max: 12 }), true);
  assert.equal(sameTurnRange({ min: 1, max: 12 }, { min: 2, max: 12 }), false);
  assert.equal(sameTurnRange({ min: 1, max: 12 }, { min: 1, max: 13 }), false);
});
