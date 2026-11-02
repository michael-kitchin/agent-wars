/**
 * Consult telemetry summary and provider parsing.
 *
 * Purpose: The info line has to name providers, timeouts, and fallbacks from the records.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/consultTelemetry.test.js`.
 * Expected outcome: Successful and failed attempts stay distinct. Bad JSON does not throw.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildConsultTelemetrySummary,
  cacheTokensFromChatUsage,
  providerFromChatBody,
  type ConsultAttemptRecord,
  type ConsultTelemetrySummary,
} from './consultTelemetry';

/**
 * One attempt with the fields a summary case overrides.
 *
 * Purpose: The cases only vary outcome, status, and provider.
 * When to use: Each summary test.
 * Expected outcome: A complete attempt record.
 * Exceptions: None.
 */
function attempt(row: Pick<ConsultAttemptRecord, 'attempt' | 'outcome' | 'httpStatus' | 'provider' | 'retried'>): ConsultAttemptRecord {
  return { requestLabel: 'requestOrders', durationMs: 1, ...row };
}

/**
 * A summary with the identity fields filled and the records the case supplies.
 *
 * Purpose: The pure summary is what the info line writes.
 * When to use: Each summary test.
 * Expected outcome: `buildConsultTelemetrySummary` of those attempts.
 * Exceptions: None.
 */
function summarize(attempts: readonly ConsultAttemptRecord[]): ConsultTelemetrySummary {
  return buildConsultTelemetrySummary({
    seatId: 'opponent',
    turnNumber: 1,
    theater: 'strategic',
    battleId: null,
    modelId: 'm',
    providerSort: 'throughput',
    wallClockMs: 10,
    error: null,
    cancelReason: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    attempts,
    fallbacks: [],
    toolRounds: 0,
    outcome: 'finished',
    wallClockExceeded: false,
  });
}

test('served providers stay distinct from a failed provider', () => {
  const summary = summarize([
    attempt({ attempt: 1, outcome: 'ok', httpStatus: 200, provider: 'DeepInfra', retried: false }),
    attempt({ attempt: 2, outcome: 'ok', httpStatus: 200, provider: 'Novita', retried: false }),
    attempt({ attempt: 3, outcome: 'http', httpStatus: 503, provider: 'DeepInfra', retried: false }),
  ]);
  assert.deepEqual(summary.servedBy, ['DeepInfra', 'Novita']);
  assert.deepEqual(summary.failedOn, ['DeepInfra']);
  assert.equal(summary.modelCalls, 3);
  assert.equal(summary.timeouts, 0);
});

test('a timeout with no provider counts as a timeout and not a failed host', () => {
  const summary = summarize([
    attempt({ attempt: 1, outcome: 'timeout', httpStatus: null, provider: null, retried: false }),
  ]);
  assert.equal(summary.timeouts, 1);
  assert.deepEqual(summary.failedOn, []);
});

test('cached tokens from a usage object add to the summary', () => {
  const reported = cacheTokensFromChatUsage({ prompt_tokens_details: { cached_tokens: 10, cache_write_tokens: 4 } });
  const summary = buildConsultTelemetrySummary({
    seatId: 'opponent',
    turnNumber: 1,
    theater: 'tactical',
    battleId: null,
    modelId: 'google/gemini',
    providerSort: 'throughput',
    wallClockMs: 10,
    error: null,
    cancelReason: null,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    cachedTokens: reported.cachedTokens,
    cacheWriteTokens: reported.cacheWriteTokens,
    attempts: [],
    fallbacks: [],
    toolRounds: 0,
    outcome: 'finished',
    wallClockExceeded: false,
  });
  assert.equal(summary.cachedTokens, 10);
  assert.equal(summary.cacheWriteTokens, 4);
  const missing = cacheTokensFromChatUsage(undefined);
  assert.equal(missing.cachedTokens, 0);
  assert.equal(missing.cacheWriteTokens, 0);
});

test('providerFromChatBody reads a success, an error, and bad JSON', () => {
  assert.equal(providerFromChatBody('{"provider":"DeepInfra"}', true), 'DeepInfra');
  assert.equal(providerFromChatBody('{"error":{"metadata":{"provider_name":"AtlasCloud"}}}', false), 'AtlasCloud');
  assert.equal(providerFromChatBody('not json', true), null);
  assert.equal(providerFromChatBody('{}', true), null);
});
