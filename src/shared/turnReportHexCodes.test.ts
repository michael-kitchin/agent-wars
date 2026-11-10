/**
 * Hex-code lists for turn-report strike sentences.
 *
 * Purpose: The list stays sorted, de-duplicated, and names a missing code once.
 * When to use: After changing `formatTurnReportHexList`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatTurnReportHexList } from './turnReportHexCodes';

test('one code is that code', () => {
  assert.equal(formatTurnReportHexList(['AA']), 'AA');
});

test('two codes sort and join with and', () => {
  assert.equal(formatTurnReportHexList(['C2', 'AA']), 'AA and C2');
});

test('codes are trimmed, sorted, de-duplicated, and a missing code is last', () => {
  assert.equal(
    formatTurnReportHexList(['C2', 'AA', null, 'AA', 'AA.B9', '  ']),
    'AA, AA.B9, C2, and an unidentified hex'
  );
});
