/**
 * Contract tests for malformed-completion detection and the bounded retry budget.
 * Run: `node dist/main/openrouter/malformedCompletionRetry.test.js`
 */

import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  MALFORMED_COMPLETION_FAILURE_REASON,
  MALFORMED_COMPLETION_RETRY_LIMIT,
  isMalformedModelCompletion,
  resolveMalformedCompletionRetry,
  setMalformedCompletionRetryDelayOverrideForTests,
} from './malformedCompletionRetry';

setMalformedCompletionRetryDelayOverrideForTests(0);

afterEach(() => {
  setMalformedCompletionRetryDelayOverrideForTests(0);
});

/**
 * Builds the arguments for one malformed round so each test only states what it varies.
 *
 * Purpose: Keeps the retry-budget tests focused on the count transitions rather than context plumbing.
 * When to use: Every `resolveMalformedCompletionRetry` call in this file.
 * Expected outcome: A round whose completion has neither tool calls nor content.
 * Exceptions: None.
 */
function malformedRound(retryCount: number, onLog?: (line: string, isError?: boolean) => void) {
  return {
    completion: {
      toolCalls: [],
      content: null,
      finishReason: 'error',
      nativeFinishReason: 'MALFORMED_FUNCTION_CALL',
    },
    retryCount,
    iteration: retryCount + 1,
    turnNumber: 8,
    tacticalBattleId: null,
    onLog,
  };
}

test('a completion with tool calls or with text content is usable', () => {
  assert.equal(isMalformedModelCompletion({ toolCalls: [{ id: 'a' }], content: null }), false);
  assert.equal(isMalformedModelCompletion({ toolCalls: [], content: '{"strategy":"hold"}' }), false);
});

test('a completion with neither tool calls nor usable text is malformed', () => {
  assert.equal(isMalformedModelCompletion({ toolCalls: [], content: null }), true);
  assert.equal(isMalformedModelCompletion({ toolCalls: null, content: '   ' }), true);
  assert.equal(isMalformedModelCompletion({}), true);
});

test('usable rounds pass through without spending retry budget', async () => {
  const outcome = await resolveMalformedCompletionRetry({
    completion: { toolCalls: [], content: '{"strategy":"advance","orders":[]}' },
    retryCount: 0,
    iteration: 1,
    turnNumber: 3,
    tacticalBattleId: null,
  });
  assert.equal(outcome.status, 'usable');
});

test('the first malformed round retries without altering the conversation', async () => {
  const outcome = await resolveMalformedCompletionRetry(malformedRound(0));
  assert.equal(outcome.status, 'retry');
  assert.equal(outcome.status === 'retry' && outcome.retryCount, 1);
  assert.equal(
    outcome.status === 'retry' && outcome.correctiveMessage,
    null,
    'first retry must re-send the identical request'
  );
});

test('the final malformed retry appends a corrective instruction', async () => {
  const outcome = await resolveMalformedCompletionRetry(malformedRound(1));
  assert.equal(outcome.status, 'retry');
  assert.equal(outcome.status === 'retry' && outcome.retryCount, MALFORMED_COMPLETION_RETRY_LIMIT);
  const corrective = outcome.status === 'retry' ? outcome.correctiveMessage : null;
  assert.ok(corrective, 'last retry must nudge the model');
  assert.match(String(corrective), /tool call/i);
});

test('the consultation fails once the retry budget is exhausted', async () => {
  const logged: string[] = [];
  const outcome = await resolveMalformedCompletionRetry(
    malformedRound(MALFORMED_COMPLETION_RETRY_LIMIT, (line) => logged.push(line))
  );
  assert.equal(outcome.status, 'fail');
  assert.equal(outcome.status === 'fail' && outcome.error, MALFORMED_COMPLETION_FAILURE_REASON);
  assert.equal(logged.length, 1, 'exhaustion must surface once in the in-game AI log');
});

test('a tactical battle round follows the same budget as a strategic round', async () => {
  const first = await resolveMalformedCompletionRetry({
    ...malformedRound(0),
    tacticalBattleId: 'tb-81963ffffffffff-1786250838725',
  });
  const exhausted = await resolveMalformedCompletionRetry({
    ...malformedRound(MALFORMED_COMPLETION_RETRY_LIMIT),
    tacticalBattleId: 'tb-81963ffffffffff-1786250838725',
  });
  assert.equal(first.status, 'retry');
  assert.equal(exhausted.status, 'fail');
});
