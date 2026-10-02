/**
 * Contract tests for session-scoped model capability state.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  recordNoToolCallingNoticeForModel,
  resetOpenRouterModelCapabilitiesForTests,
} from './openRouterModelCapabilities';

/**
 * Verifies the missing-tool-support notice is granted once per model per session.
 *
 * Purpose: The player sees the notice the first time a model without tool support is consulted, not every turn.
 * When to use: After changing `recordNoToolCallingNoticeForModel` or the test reset.
 * Expected outcome: `true` on the first call per model id, `false` afterward, and `true` again after a reset.
 * Exceptions: Assertion failure on contract drift.
 */
test('no-tool-calling notice is granted once per model per session', () => {
  resetOpenRouterModelCapabilitiesForTests();
  assert.equal(recordNoToolCallingNoticeForModel('m'), true);
  assert.equal(recordNoToolCallingNoticeForModel('m'), false);
  assert.equal(recordNoToolCallingNoticeForModel('n'), true);
  resetOpenRouterModelCapabilitiesForTests();
  assert.equal(recordNoToolCallingNoticeForModel('m'), true);
});
