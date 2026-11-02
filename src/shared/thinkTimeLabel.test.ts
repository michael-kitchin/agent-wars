/**
 * Think-time labels on the result row.
 *
 * Purpose: The clock stays m:ss under an hour and gains hours at one hour.
 * When to use: `npm run build:main`, then `node dist/shared/thinkTimeLabel.test.js`.
 * Expected outcome: The three clock shapes and the empty cases.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatThinkTimeLabel } from './thinkTimeLabel';

test('formatThinkTimeLabel uses m:ss under an hour and h:mm:ss from an hour', () => {
  assert.equal(formatThinkTimeLabel(0), '0:00 thinking');
  assert.equal(formatThinkTimeLabel(90_000), '1:30 thinking');
  assert.equal(formatThinkTimeLabel(3_660_000), '1:01:00 thinking');
  assert.equal(formatThinkTimeLabel(-5), '0:00 thinking');
  assert.equal(formatThinkTimeLabel(Number.NaN), '0:00 thinking');
});
