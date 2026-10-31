/**
 * A dismiss drops only the converted units' queued drafts.
 *
 * Purpose: `draftsWithoutUnits` is the filter the selection panel applies to five queues.
 * When to use: After changing that function.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { draftsWithoutUnits } from './draftsWithoutUnits';

test('draftsWithoutUnits drops the named unit and keeps the other', () => {
  const drafts = [
    { unitId: 'h1-a', targetH3Index: 'aa' },
    { unitId: 'h1-b', targetH3Index: 'bb' },
  ];
  assert.deepEqual(draftsWithoutUnits(drafts, ['h1-a']), [{ unitId: 'h1-b', targetH3Index: 'bb' }]);
});

test('draftsWithoutUnits keeps every draft when no unit is named', () => {
  const drafts = [
    { unitId: 'h1-a', targetH3Index: 'aa' },
    { unitId: 'h1-b', targetH3Index: 'bb' },
  ];
  const kept = draftsWithoutUnits(drafts, []);
  assert.deepEqual(kept, drafts);
  assert.notEqual(kept, drafts);
});
