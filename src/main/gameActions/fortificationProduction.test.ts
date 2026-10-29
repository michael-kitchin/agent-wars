/**
 * Fortification placement and spend decisions.
 *
 * Purpose: Cell choice is seeded, and a row pauses only when no city cell remains.
 * When to use: After changing placement or the spend step.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fortificationPlacementSeed, fortificationSpendStep, pickCellsToFortify } from './fortificationProduction';

test('the same seed picks the same cells, and never more than exist', () => {
  const cells = ['a', 'b', 'c', 'd'];
  const first = pickCellsToFortify({ fortifiableCells: cells, count: 3, seed: 7 });
  const second = pickCellsToFortify({ fortifiableCells: cells, count: 3, seed: 7 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  for (const cell of first) assert.ok(cells.includes(cell));
  assert.equal(pickCellsToFortify({ fortifiableCells: cells, count: 9, seed: 7 }).length, 4);
});

test('placement seeds differ for two hexes', () => {
  assert.notEqual(fortificationPlacementSeed(11, 2, 'aa'), fortificationPlacementSeed(11, 2, 'bb'));
});

test('a fortification row pauses at no cells left and otherwise builds what it can afford', () => {
  assert.deepEqual(fortificationSpendStep({ remainingCount: 4, points: 100, fortifiableLeft: 0, cost: 20 }), {
    paused: true,
    built: 0,
  });
  assert.deepEqual(fortificationSpendStep({ remainingCount: 4, points: 50, fortifiableLeft: 3, cost: 20 }), {
    paused: false,
    built: 2,
  });
  assert.deepEqual(fortificationSpendStep({ remainingCount: 4, points: 50, fortifiableLeft: 3, cost: 0 }), {
    paused: false,
    built: 0,
  });
});
