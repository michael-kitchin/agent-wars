/**
 * Spent-missile tracking across a turn's statistics steps.
 *
 * Purpose: A turn that records twice (a battle, or the match ending) must leave the same launched missiles out both times.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/spentMissiles.test.js`.
 * Expected outcome: The cases below pass.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteSpentMissile, takeSpentMissileIds } from './spentMissiles';

test('a second step of the same turn gets the same launches, and the next turn gets only new ones', () => {
  noteSpentMissile('m1');
  assert.deepEqual([...takeSpentMissileIds(5)], ['m1']);
  assert.deepEqual([...takeSpentMissileIds(5)], ['m1']);
  noteSpentMissile('m2');
  assert.deepEqual([...takeSpentMissileIds(5)], ['m1']);
  assert.deepEqual([...takeSpentMissileIds(6)], ['m2']);
  assert.deepEqual([...takeSpentMissileIds(7)], []);
});
