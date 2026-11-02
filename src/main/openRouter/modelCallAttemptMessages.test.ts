/**
 * Activity-log wording for one failed model-call attempt.
 *
 * Purpose: A timeout is never described as something that will be sent again.
 * When to use: `node dist/main/openRouter/modelCallAttemptMessages.test.js`.
 * Expected outcome: Throws on failure.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatModelCallFailureLine } from './modelCallAttemptMessages';

test('a timeout is not described as a retry even when the caller asks for one', () => {
  const line = formatModelCallFailureLine({
    cause: 'timeout',
    attempt: 1,
    maxAttempts: 2,
    willRetry: true,
    timeoutMs: 180_000,
  });
  assert.match(line, /Not retried\.$/);
  assert.equal(line.includes('Retrying'), false);
});

test('a network error that will be sent again says so', () => {
  const line = formatModelCallFailureLine({
    cause: 'network',
    attempt: 1,
    maxAttempts: 2,
    willRetry: true,
  });
  assert.match(line, /Retrying\.\.\.$/);
});
