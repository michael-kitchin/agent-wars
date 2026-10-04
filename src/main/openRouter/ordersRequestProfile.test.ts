/**
 * Tests for consultation request-profile resolution.
 * Run with: node dist/main/openRouter/ordersRequestProfile.test.js
 */

import assert from 'node:assert/strict';
import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import { BASELINE_ORDERS_REQUEST_PROFILE, resolveOrdersRequestProfile } from './ordersRequestProfile';

/**
 * Base order-flow budget used by every case.
 *
 * Purpose: Keeps expected budgets readable as multiples of one number.
 * When to use: As `baseCompletionMaxTokens` in this file.
 * Expected outcome: 8192, the production order-flow base.
 * Exceptions: None.
 */
const BASE = 8192;

/**
 * Builds a reasoning-capable model fixture.
 *
 * Purpose: Keeps cases focused on effort, default, and output limit.
 * When to use: Inside this file's assertions.
 * Expected outcome: A model offering every gateway effort plus the given overrides.
 * Exceptions: None.
 */
function reasoningModel(overrides: Partial<OpenRouterModel> = {}): OpenRouterModel {
  return { id: 'r', reasoning: { supported_efforts: null }, ...overrides };
}

/**
 * Verifies a model missing from the capability cache gets the baseline profile.
 *
 * Purpose: Unknown models must keep the request bodies they had before capability tuning.
 * When to use: After changing `resolveOrdersRequestProfile`.
 * Expected outcome: Deep-equals the baseline.
 * Exceptions: None.
 */
function testUnknownModelGetsBaseline(): void {
  assert.deepEqual(
    resolveOrdersRequestProfile({ modelId: 'x', model: undefined, persistedReasoningEffort: 'high', baseCompletionMaxTokens: BASE }),
    BASELINE_ORDERS_REQUEST_PROFILE
  );
}

/**
 * Verifies every reasoning level requests the model's advertised output limit.
 *
 * Purpose: A low effort must get the same ceiling as a high one, including a limit below the order-flow base.
 * When to use: After changing how the completion budget is chosen.
 * Expected outcome: `minimal` with a 4096 limit requests 4096; `high` with 128000 requests 128000; `max` with 20000 requests 20000.
 * Exceptions: None.
 */
function testEveryEffortUsesAdvertisedOutputLimit(): void {
  const minimal = resolveOrdersRequestProfile({
    modelId: 'r',
    model: reasoningModel({ top_provider: { max_completion_tokens: 4096 } }),
    persistedReasoningEffort: 'minimal',
    baseCompletionMaxTokens: BASE,
  });
  assert.equal(minimal.reasoningEffort, 'minimal');
  assert.equal(minimal.preferredCompletionMaxTokens, 4096);
  const high = resolveOrdersRequestProfile({
    modelId: 'r',
    model: reasoningModel({ top_provider: { max_completion_tokens: 128000 } }),
    persistedReasoningEffort: 'high',
    baseCompletionMaxTokens: BASE,
  });
  assert.equal(high.reasoningEffort, 'high');
  assert.equal(high.preferredCompletionMaxTokens, 128000);
  const max = resolveOrdersRequestProfile({
    modelId: 'r',
    model: reasoningModel({ top_provider: { max_completion_tokens: 20000 } }),
    persistedReasoningEffort: 'max',
    baseCompletionMaxTokens: BASE,
  });
  assert.equal(max.preferredCompletionMaxTokens, 20000);
}

/**
 * Verifies an unusable advertised limit leaves the order-flow base in place.
 *
 * Purpose: A zero, negative, or non-finite list value must not become `max_tokens`.
 * When to use: After changing `completionMaxTokensFromAdvertisedLimit`.
 * Expected outcome: `0`, `-1`, and `NaN` keep the base. A fractional limit is floored.
 * Exceptions: None.
 */
function testUnusableAdvertisedLimitKeepsBaseBudget(): void {
  const budgetFor = (maxCompletionTokens: number): number =>
    resolveOrdersRequestProfile({
      modelId: 'r',
      model: reasoningModel({ top_provider: { max_completion_tokens: maxCompletionTokens } }),
      persistedReasoningEffort: 'low',
      baseCompletionMaxTokens: BASE,
    }).preferredCompletionMaxTokens;
  assert.equal(budgetFor(0), BASE);
  assert.equal(budgetFor(-1), BASE);
  assert.equal(budgetFor(Number.NaN), BASE);
  assert.equal(budgetFor(20000.9), 20000);
}

/**
 * Verifies the model default is recorded without being sent, and does not change the budget.
 *
 * Purpose: Only an override is sent as `reasoning.effort`. The budget follows the advertised limit, or the base when that limit is missing.
 * When to use: After changing effective-effort handling or the completion budget.
 * Expected outcome: `xhigh` default is not sent. A known 128000 limit is requested as 128000; a missing limit stays at the base.
 * Exceptions: None.
 */
function testDefaultEffortIsNotSentAndBudgetFollowsAdvertisedLimit(): void {
  const withLimit = resolveOrdersRequestProfile({
    modelId: 'r',
    model: reasoningModel({
      reasoning: { default_effort: 'xhigh', supported_efforts: null },
      top_provider: { max_completion_tokens: 128000 },
    }),
    persistedReasoningEffort: '',
    baseCompletionMaxTokens: BASE,
  });
  assert.equal(withLimit.reasoningEffort, null);
  assert.equal(withLimit.effectiveReasoningEffort, 'xhigh');
  assert.equal(withLimit.preferredCompletionMaxTokens, 128000);
  const withoutLimit = resolveOrdersRequestProfile({
    modelId: 'r',
    model: reasoningModel({ reasoning: { default_effort: 'xhigh', supported_efforts: null } }),
    persistedReasoningEffort: '',
    baseCompletionMaxTokens: BASE,
  });
  assert.equal(withoutLimit.preferredCompletionMaxTokens, BASE);
}

/**
 * Runs one assertion with `AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS` forced to a value, then restores it.
 *
 * Purpose: These cases must not depend on the developer's shell, which may have the flag set.
 * When to use: The structured-output cases in this file.
 * Expected outcome: `value` of `undefined` unsets the flag for the callback; any other value is assigned.
 * Exceptions: Restores the previous value even when the callback throws.
 */
function withStructuredOutputsFlag(value: string | undefined, assertWhileSet: () => void): void {
  const flagName = 'AGENT_WARS_DISABLE_STRUCTURED_OUTPUTS';
  const previous = process.env[flagName];
  if (value === undefined) delete process.env[flagName];
  else process.env[flagName] = value;
  try {
    assertWhileSet();
  } finally {
    if (previous === undefined) delete process.env[flagName];
    else process.env[flagName] = previous;
  }
}

/**
 * Verifies structured outputs follow the model's advertised parameters for every provider.
 *
 * Purpose: The schema goes to every model that advertises both parameters, Anthropic included; rejections are left
 * to the request fallback.
 * When to use: After changing structured-output gating.
 * Expected outcome: Gemini and Anthropic models advertising both parameters get `true`; a model advertising only
 * `response_format` gets `false`. The developer flag is unset for this case, whatever the shell has.
 * Exceptions: None.
 */
function testStructuredOutputsFollowAdvertisedParameters(): void {
  withStructuredOutputsFlag(undefined, () => {
    const structuredOutputsFor = (modelId: string, supportedParameters: string[]): boolean =>
      resolveOrdersRequestProfile({
        modelId,
        model: { id: modelId, supported_parameters: supportedParameters },
        persistedReasoningEffort: '',
        baseCompletionMaxTokens: BASE,
      }).structuredOutputs;
    const both = ['response_format', 'structured_outputs'];
    assert.equal(structuredOutputsFor('google/gemini-3.5-flash-lite', both), true);
    assert.equal(structuredOutputsFor('anthropic/claude-sonnet-5.5', both), true);
    assert.equal(structuredOutputsFor('openai/gpt-5.5', ['response_format']), false);
  });
}

/**
 * Verifies the developer environment flag withholds the schema from a model that would otherwise get it.
 *
 * Purpose: The flag exists to compare runs with and without the schema, so it must override model capabilities.
 * When to use: After changing structured-output gating.
 * Expected outcome: `false` while the flag is `1`, and `true` while it is `0`. The previous value is restored either way.
 * Exceptions: None.
 */
function testEnvironmentFlagDisablesStructuredOutputs(): void {
  const model = { id: 'google/gemini-3.5-flash-lite', supported_parameters: ['response_format', 'structured_outputs'] };
  const structuredOutputs = (): boolean =>
    resolveOrdersRequestProfile({
      modelId: model.id,
      model,
      persistedReasoningEffort: '',
      baseCompletionMaxTokens: BASE,
    }).structuredOutputs;
  withStructuredOutputsFlag('1', () => assert.equal(structuredOutputs(), false));
  withStructuredOutputsFlag('0', () => assert.equal(structuredOutputs(), true));
}

/**
 * Verifies tool support follows the model's advertised parameters.
 *
 * Purpose: A model without `tools` must be consulted without tools, and one without `tool_choice` must not receive it.
 * When to use: After changing tool-support gating.
 * Expected outcome: Each flag is `true` only when its parameter is listed.
 * Exceptions: None.
 */
function testToolSupportFollowsAdvertisedParameters(): void {
  const toolSupportFor = (supportedParameters: string[]): { toolCalling: boolean; toolChoice: boolean } => {
    const profile = resolveOrdersRequestProfile({
      modelId: 'm',
      model: { id: 'm', supported_parameters: supportedParameters },
      persistedReasoningEffort: '',
      baseCompletionMaxTokens: BASE,
    });
    return { toolCalling: profile.toolCalling, toolChoice: profile.toolChoice };
  };
  assert.deepEqual(toolSupportFor(['tools', 'tool_choice']), { toolCalling: true, toolChoice: true });
  assert.deepEqual(toolSupportFor(['tools']), { toolCalling: true, toolChoice: false });
  assert.deepEqual(toolSupportFor(['response_format']), { toolCalling: false, toolChoice: false });
}

/**
 * Runs request-profile tests.
 *
 * Purpose: Node entrypoint for test discovery.
 * When to use: `node dist/main/openRouter/ordersRequestProfile.test.js`.
 * Expected outcome: Throws on failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testUnknownModelGetsBaseline();
  testEveryEffortUsesAdvertisedOutputLimit();
  testUnusableAdvertisedLimitKeepsBaseBudget();
  testDefaultEffortIsNotSentAndBudgetFollowsAdvertisedLimit();
  testStructuredOutputsFollowAdvertisedParameters();
  testEnvironmentFlagDisablesStructuredOutputs();
  testToolSupportFollowsAdvertisedParameters();
  console.log('ordersRequestProfile.test.ts passed');
}

run();
