/**
 * Per-side grouping of loss-toast flag values.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexLossFlagsByOwner } from './lossFlagIndex';

test('one owner keeps one name, and a null value is skipped', () => {
  const indexed = indexLossFlagsByOwner(
    [
      { ownerId: 'human', name: '1st Infantry', value: 'flag-a' },
      { ownerId: 'human', name: '1st Armor', value: null },
    ],
    (left, right) => left === right
  );
  assert.equal(indexed.get('human')?.get('1st Infantry'), 'flag-a');
  assert.equal(indexed.get('human')?.has('1st Armor'), false);
});

test('a disagreement drops that name for one owner and leaves the other owner alone', () => {
  const indexed = indexLossFlagsByOwner(
    [
      { ownerId: 'opponent', name: 'I Infantry', value: 'east' },
      { ownerId: 'opponent', name: 'I Infantry', value: 'other' },
      { ownerId: 'opponent2', name: 'I Infantry', value: 'north' },
    ],
    (left, right) => left === right
  );
  assert.equal(indexed.get('opponent')?.has('I Infantry'), false);
  assert.equal(indexed.get('opponent2')?.get('I Infantry'), 'north');
});
