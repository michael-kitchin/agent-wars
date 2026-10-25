/**
 * The Ready wait label's count.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readyAiWaitLabel } from './readyAiWaitLabel';

test('the wait label names the elapsed time and the planning count', () => {
  assert.equal(readyAiWaitLabel('00:05', 2), 'AI: 00:05 (x2)');
  assert.equal(readyAiWaitLabel('00:05', 1), 'AI: 00:05 (x1)');
  assert.equal(readyAiWaitLabel('00:05', 4), 'AI: 00:05 (x4)');
  assert.equal(readyAiWaitLabel('00:05', 0), 'AI: 00:05 (x1)');
});
