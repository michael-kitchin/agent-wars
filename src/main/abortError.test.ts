/**
 * Contract tests for shared abort-error classification. Run:
 * `node dist/main/abortError.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLikelyAbortError } from '../shared/abortError';

test('isLikelyAbortError is true for AbortError name', () => {
  assert.equal(isLikelyAbortError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  if (typeof globalThis.DOMException === 'function') {
    assert.equal(isLikelyAbortError(new globalThis.DOMException('aborted', 'AbortError')), true);
  }
});

test('isLikelyAbortError is true when message contains AbortError or abort', () => {
  assert.equal(isLikelyAbortError(new Error('AbortError: user cancelled')), true);
  assert.equal(isLikelyAbortError(new Error('The request was aborted')), true);
});

test('isLikelyAbortError is false for unrelated planning failures', () => {
  assert.equal(isLikelyAbortError(new Error('Invalid JSON from model')), false);
  assert.equal(isLikelyAbortError(new Error('ECONNRESET')), false);
  assert.equal(isLikelyAbortError(null), false);
  assert.equal(isLikelyAbortError(undefined), false);
});
