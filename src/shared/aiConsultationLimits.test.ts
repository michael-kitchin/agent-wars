/**
 * Contract tests for the shared AI consultation time budgets.
 *
 * Purpose: Keeps the outer wait from being set shorter than the work `requestOrders` is allowed to do.
 * When to use: `npm test` discovers this file from `dist/shared`.
 * Expected outcome: The wait budget equals the wall clock plus two retried model calls.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AI_CONSULTATION_WAIT_TIMEOUT_MS,
  AI_CONSULTATION_WALL_CLOCK_MS,
  AI_MODEL_REQUEST_RETRY_COUNT,
  AI_MODEL_REQUEST_TIMEOUT_MS,
} from './aiConsultationLimits';

test('consultation wait covers the wall clock, the in-flight round, and the repair call', () => {
  const attemptsPerCall = 1 + AI_MODEL_REQUEST_RETRY_COUNT;
  assert.equal(AI_MODEL_REQUEST_TIMEOUT_MS, 90_000);
  assert.equal(AI_CONSULTATION_WALL_CLOCK_MS, 300_000);
  assert.equal(
    AI_CONSULTATION_WAIT_TIMEOUT_MS,
    AI_CONSULTATION_WALL_CLOCK_MS + 2 * attemptsPerCall * AI_MODEL_REQUEST_TIMEOUT_MS
  );
});
