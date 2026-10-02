/**
 * Tests for the shared OpenRouter reasoning-effort rules.
 * Run with: node dist/shared/openRouterReasoningEffort.test.js
 */

import assert from 'node:assert/strict';
import type { OpenRouterModel } from './ipc/openRouterTypes';
import {
  OPENROUTER_GATEWAY_REASONING_EFFORTS,
  isReasoningEffortSelectable,
  listSelectableReasoningEfforts,
  resolveDefaultReasoningEffort,
  resolveEffectiveReasoningEffort,
  resolveRequestedReasoningEffort,
} from './openRouterReasoningEffort';

/**
 * Builds a minimal model fixture for effort tests.
 *
 * Purpose: Keeps cases focused on the reasoning fields under test.
 * When to use: Inside this file's assertions.
 * Expected outcome: An `OpenRouterModel` with id `m` plus optional overrides.
 * Exceptions: None.
 */
function model(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return { id: 'm', ...overrides };
}

/**
 * Verifies the three sources of the selectable list.
 *
 * Purpose: Omitted, `null`, and explicit `supported_efforts` mean different things.
 * When to use: After changing `listSelectableReasoningEfforts`.
 * Expected outcome: `[]`, the gateway list, and the gateway list without `none` when mandatory.
 * Exceptions: None.
 */
function testSelectableListSources(): void {
  assert.deepEqual(listSelectableReasoningEfforts(model({ reasoning: { default_effort: 'high' } })), []);
  assert.deepEqual(listSelectableReasoningEfforts(undefined), []);
  assert.deepEqual(
    listSelectableReasoningEfforts(model({ reasoning: { supported_efforts: null } })),
    [...OPENROUTER_GATEWAY_REASONING_EFFORTS]
  );
  assert.deepEqual(
    listSelectableReasoningEfforts(model({ reasoning: { mandatory: true, supported_efforts: ['high', 'none'] } })),
    ['high']
  );
}

/**
 * Verifies an override the model does not offer is ignored in favor of the default.
 *
 * Purpose: A stale persisted effort must never reach the request body.
 * When to use: After changing override validation.
 * Expected outcome: Requested is `null`; effective falls back to the default.
 * Exceptions: None.
 */
function testInvalidOverrideFallsBackToDefault(): void {
  const m = model({ reasoning: { default_effort: 'medium', supported_efforts: ['high', 'medium', 'low'] } });
  assert.equal(resolveRequestedReasoningEffort(m, 'xhigh'), null);
  assert.equal(resolveEffectiveReasoningEffort(m, 'xhigh'), 'medium');
  assert.equal(resolveEffectiveReasoningEffort(m, ' high '), 'high');
}

/**
 * Verifies a default outside the selectable list is not reported.
 *
 * Purpose: The dropdown must not mark an option that is not offered.
 * When to use: After changing default resolution.
 * Expected outcome: `null`.
 * Exceptions: None.
 */
function testUnselectableDefaultIsNull(): void {
  const m = model({ reasoning: { default_effort: 'none', mandatory: true, supported_efforts: ['high', 'none'] } });
  assert.equal(resolveDefaultReasoningEffort(m), null);
}

/**
 * Verifies the two-level threshold for enabling the dropdown.
 *
 * Purpose: One level is not a choice.
 * When to use: After changing `isReasoningEffortSelectable`.
 * Expected outcome: One effort is `false`; two are `true`.
 * Exceptions: None.
 */
function testSelectableThreshold(): void {
  assert.equal(isReasoningEffortSelectable(model({ reasoning: { supported_efforts: ['high'] } })), false);
  assert.equal(isReasoningEffortSelectable(model({ reasoning: { supported_efforts: ['high', 'low'] } })), true);
}

/**
 * Runs reasoning-effort rule tests.
 *
 * Purpose: Node entrypoint for test discovery.
 * When to use: `node dist/shared/openRouterReasoningEffort.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testSelectableListSources();
  testInvalidOverrideFallsBackToDefault();
  testUnselectableDefaultIsNull();
  testSelectableThreshold();
  console.log('openRouterReasoningEffort.test.ts passed');
}

run();
