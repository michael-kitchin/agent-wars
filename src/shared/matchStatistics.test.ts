/**
 * The pure helpers for match statistics.
 *
 * Purpose: Total and zero-filled unit counts are small rules that every chart depends on.
 * When to use: `npm run build:main`, then `node dist/shared/matchStatistics.test.js`.
 * Expected outcome: Totals add every type, and an empty record has each type at 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyUnitCounts, STATISTIC_MERCENARY_TYPES, totalUnits } from './matchStatistics';

test('totalUnits adds every type, and emptyUnitCounts has every type at zero', () => {
  assert.equal(totalUnits({ infantry: 3, armor: 2, air: 0 }), 5);
  assert.equal(totalUnits({}), 0);
  const empty = emptyUnitCounts(STATISTIC_MERCENARY_TYPES);
  assert.deepEqual(empty, { infantry: 0, armor: 0, naval: 0, air: 0 });
  assert.equal(totalUnits(empty), 0);
});
