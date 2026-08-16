import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterOrdersToLivingUnitIds } from './filterOrdersToLivingUnitIds';

describe('filterOrdersToLivingUnitIds', () => {
  it('keeps living-unit rows in original order and drops missing units', () => {
    const rows = [{ unitId: 'a' }, { unitId: 'dead' }, { unitId: 'b' }];
    assert.deepEqual(filterOrdersToLivingUnitIds(rows, new Set(['b', 'a'])), [{ unitId: 'a' }, { unitId: 'b' }]);
  });

  it('returns an empty list when every unit is gone', () => {
    assert.deepEqual(filterOrdersToLivingUnitIds([{ unitId: 'dead' }], new Set()), []);
  });
});
