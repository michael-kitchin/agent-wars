/**
 * Approach Target Units stay short when several enemies share the nearest hex.
 *
 * Run: `npm run build:main` then `node dist/main/openRouter/possibleUnitActionsBestOptionsInterest.test.js`
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { formatApproachTargetUnitIds } from './possibleUnitActionsBestOptionsInterest';

test('approach Target Units lists at most three nearest enemy ids', () => {
  assert.equal(formatApproachTargetUnitIds([]), '—');
  assert.equal(formatApproachTargetUnitIds(['b', 'a']), 'a, b');
  assert.equal(
    formatApproachTargetUnitIds(['e5', 'e4', 'e1', 'e3', 'e2']),
    'e1, e2, e3 +2 more'
  );
});
