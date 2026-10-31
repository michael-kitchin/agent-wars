import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiOnlyBattlesForRequest, aiOnlyBattlesFromStored, selectAiOnlyBattle, type AiOnlyBattleRow } from './aiOnlyBattles';

/**
 * One contested hex for a choice test.
 *
 * Purpose: The tests name counts without repeating the row shape.
 * When to use: `selectAiOnlyBattle` cases.
 * Expected outcome: One side entry per count, with owner ids `a`, `b`, and `c` in that order.
 * Exceptions: None.
 */
function row(h3Index: string, counts: readonly number[]): AiOnlyBattleRow {
  const ownerIds = ['a', 'b', 'c'];
  return {
    h3Index,
    sides: counts.map((subUnitCount, index) => ({ ownerId: ownerIds[index] ?? `s${index}`, subUnitCount })),
  };
}

test('a start request with no value, or an unknown value, stores balanced', () => {
  assert.equal(aiOnlyBattlesForRequest(undefined), 'balanced');
  assert.equal(aiOnlyBattlesForRequest('closest'), 'balanced');
  assert.equal(aiOnlyBattlesForRequest('random'), 'random');
});

test('a missing stored row, or an unknown stored string, is none', () => {
  assert.equal(aiOnlyBattlesFromStored(undefined), 'none');
  assert.equal(aiOnlyBattlesFromStored(null), 'none');
  assert.equal(aiOnlyBattlesFromStored('closest'), 'none');
  assert.equal(aiOnlyBattlesFromStored('unbalanced'), 'unbalanced');
});

test('balanced picks the ratio closest to equal, then the smaller gap, then the hex id', () => {
  const args = { seed: 1, turnNumber: 4, rows: [row('hex-far', [8, 16]), row('hex-near', [8, 8])] };
  assert.equal(selectAiOnlyBattle({ ...args, mode: 'balanced' }), 'hex-near');
  assert.equal(
    selectAiOnlyBattle({
      mode: 'balanced',
      seed: 1,
      turnNumber: 4,
      rows: [row('hex-wide', [100, 102]), row('hex-skew', [3, 5])],
    }),
    'hex-wide'
  );
  assert.equal(
    selectAiOnlyBattle({
      mode: 'balanced',
      seed: 1,
      turnNumber: 4,
      rows: [row('hex-b', [10, 20]), row('hex-a', [6, 12])],
    }),
    'hex-a'
  );
  assert.equal(
    selectAiOnlyBattle({
      mode: 'balanced',
      seed: 1,
      turnNumber: 4,
      rows: [row('hex-b', [8, 8]), row('hex-a', [8, 8])],
    }),
    'hex-a'
  );
});

test('unbalanced picks the least equal pair, including only that pair when a hex has three sides', () => {
  assert.equal(
    selectAiOnlyBattle({
      mode: 'unbalanced',
      seed: 1,
      turnNumber: 4,
      rows: [row('hex-wide', [100, 102]), row('hex-skew', [3, 5])],
    }),
    'hex-skew'
  );
  assert.equal(
    selectAiOnlyBattle({
      mode: 'balanced',
      seed: 1,
      turnNumber: 4,
      rows: [row('hex-three', [100, 100, 1]), row('hex-skew', [3, 5])],
    }),
    'hex-three'
  );
  assert.equal(
    selectAiOnlyBattle({
      mode: 'unbalanced',
      seed: 1,
      turnNumber: 4,
      rows: [row('hex-three', [100, 100, 1]), row('hex-skew', [3, 5])],
    }),
    'hex-three'
  );
});

test('none and an empty list offer no battle, and random stays on the seed', () => {
  const rows = [row('hex-a', [8, 8]), row('hex-b', [3, 5]), row('hex-c', [1, 9])];
  assert.equal(selectAiOnlyBattle({ mode: 'none', seed: 1, turnNumber: 4, rows }), null);
  assert.equal(selectAiOnlyBattle({ mode: 'balanced', seed: 1, turnNumber: 4, rows: [] }), null);
  const first = selectAiOnlyBattle({ mode: 'random', seed: 7, turnNumber: 4, rows });
  assert.equal(selectAiOnlyBattle({ mode: 'random', seed: 7, turnNumber: 4, rows }), first);
  const changed = [1, 2, 3, 4, 5, 6, 8, 9].some(
    (seed) => selectAiOnlyBattle({ mode: 'random', seed, turnNumber: 4, rows }) !== first
  );
  assert.equal(changed, true);
});
