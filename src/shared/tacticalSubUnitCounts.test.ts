import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tacticalSubUnitCountForOwner } from './tacticalSubUnitCounts';

test('an owner sum is the weight of that owner only', () => {
  const units = [
    { player: 'alpha', unitType: 'infantry' },
    { player: 'alpha', unitType: 'unknown' },
    { player: 'beta', unitType: 'armor' },
  ];
  assert.equal(tacticalSubUnitCountForOwner(units, 'alpha'), 8);
  assert.equal(tacticalSubUnitCountForOwner(units, 'missing'), 0);
});
