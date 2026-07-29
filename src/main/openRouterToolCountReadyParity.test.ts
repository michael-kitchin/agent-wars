/**
 * Tests for Ready tool-count restore parity. Run with: node dist/main/openRouterToolCountReadyParity.test.js
 */

import assert from 'node:assert/strict';
import { resolveToolInvocationCountsAfterReady } from '../shared/openRouterToolInvocationCounts';

/**
 * Verifies result counts win over cached precomputed counts.
 *
 * Purpose: Matches strategic Ready when post-resolution consult returns toolInvocationCounts.
 * When to use: After changing Ready count application order.
 * Expected outcome: Returns the result object, not the cache.
 * Exceptions: None.
 */
function testResultCountsWin(): void {
  assert.deepStrictEqual(
    resolveToolInvocationCountsAfterReady({
      fromResult: { planning: 3 },
      cachedPrecomputed: { planning: 9 },
      allowPrecomputedFallback: true,
    }),
    { planning: 3 }
  );
}

/**
 * Verifies precomputed fallback when the Ready/commit result omitted counts.
 *
 * Purpose: Matches strategic Ready event-driven path and tactical deferred/skip-consult beats.
 * When to use: After changing allowPrecomputedFallback gating.
 * Expected outcome: Returns the cached precomputed map when fallback is allowed.
 * Exceptions: None.
 */
function testPrecomputedFallbackWhenResultOmitsCounts(): void {
  assert.deepStrictEqual(
    resolveToolInvocationCountsAfterReady({
      cachedPrecomputed: { planning: 5, assessment: 1 },
      allowPrecomputedFallback: true,
    }),
    { planning: 5, assessment: 1 }
  );
}

/**
 * Verifies zeros stay when fallback is disallowed and the result omitted counts.
 *
 * Purpose: Avoid inventing telemetry when Run/precompute was not active.
 * When to use: After changing fallback gates for strategic vs tactical Ready.
 * Expected outcome: Returns null (caller leaves the post-zero UI state).
 * Exceptions: None.
 */
function testNoFallbackWhenDisallowed(): void {
  assert.strictEqual(
    resolveToolInvocationCountsAfterReady({
      cachedPrecomputed: { planning: 5 },
      allowPrecomputedFallback: false,
    }),
    null
  );
}

/**
 * Runs tool-count Ready parity decision tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/openRouterToolCountReadyParity.test.js`.
 * Expected outcome: Throws on first failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testResultCountsWin();
  testPrecomputedFallbackWhenResultOmitsCounts();
  testNoFallbackWhenDisallowed();
  console.log('openRouterToolCountReadyParity.test.ts passed');
}

run();
