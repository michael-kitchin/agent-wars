/**
 * Spent-missile tracking across a turn's statistics steps.
 *
 * Purpose: A turn that records twice (a battle, or the match ending) must leave the same launched missiles out both times, and must name the same launching seats.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/spentMissiles.test.js`.
 * Expected outcome: The cases below pass.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { noteSpentMissile, spentMissileSeatIds, takeSpentMissileIds } from './spentMissiles';

test('a second step of the same turn gets the same launches, and the next turn gets only new ones', () => {
  noteSpentMissile('m1', 'ai-1');
  assert.deepEqual([...takeSpentMissileIds(5)], ['m1']);
  assert.deepEqual([...takeSpentMissileIds(5)], ['m1']);
  noteSpentMissile('m2', 'ai-1');
  assert.deepEqual([...takeSpentMissileIds(5)], ['m1']);
  assert.deepEqual([...takeSpentMissileIds(6)], ['m2']);
  assert.deepEqual([...takeSpentMissileIds(7)], []);
});

test('two missiles of two seats give both ids and both seats', () => {
  noteSpentMissile('m3', 'ai-1');
  noteSpentMissile('m4', 'ai-2');
  assert.deepEqual([...takeSpentMissileIds(10)].sort(), ['m3', 'm4']);
  assert.deepEqual([...spentMissileSeatIds(10)].sort(), ['ai-1', 'ai-2']);
});

test('asking for the seats first gives the same turn the same launches', () => {
  noteSpentMissile('m5', 'ai-1');
  noteSpentMissile('m6', 'ai-2');
  assert.deepEqual([...spentMissileSeatIds(20)].sort(), ['ai-1', 'ai-2']);
  assert.deepEqual([...takeSpentMissileIds(20)].sort(), ['m5', 'm6']);
});

test('a missile noted after the take belongs to the next turn', () => {
  noteSpentMissile('m7', 'ai-1');
  assert.deepEqual([...takeSpentMissileIds(30)], ['m7']);
  noteSpentMissile('m8', 'ai-2');
  assert.deepEqual([...spentMissileSeatIds(30)], ['ai-1']);
  assert.deepEqual([...spentMissileSeatIds(31)], ['ai-2']);
});

test('a null owner is left out of the seats but its missile id still counts', () => {
  noteSpentMissile('m9', null);
  assert.deepEqual([...takeSpentMissileIds(40)], ['m9']);
  assert.deepEqual([...spentMissileSeatIds(40)], []);
});
