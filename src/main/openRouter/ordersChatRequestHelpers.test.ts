/**
 * Tests for order-flow chat request options and the structured-output fallback.
 * Run with: node dist/main/openRouter/ordersChatRequestHelpers.test.js
 */

import assert from 'node:assert/strict';
import type { OpenRouterChatTransport, OpenRouterChatTransportResult } from './openRouterChatTransport';
import { resetOpenRouterModelCapabilitiesForTests } from './openRouterModelCapabilities';
import { postOrdersChatRequest, type OrdersChatRequestSettings } from './ordersChatRequestHelpers';
import { BASELINE_ORDERS_REQUEST_PROFILE } from './ordersRequestProfile';

/**
 * Minimal stand-in for a built envelope `response_format`.
 *
 * Purpose: The helper only forwards this object; its content is not under test.
 * When to use: Settings for structured-output cases.
 * Expected outcome: Appears unchanged in the posted body.
 * Exceptions: None.
 */
const RESPONSE_FORMAT: Readonly<Record<string, unknown>> = Object.freeze({ type: 'json_schema' });

/**
 * Successful transport result.
 *
 * Purpose: Queued wherever a request should succeed.
 * When to use: Fake transport queues.
 * Expected outcome: `ok: true`.
 * Exceptions: None.
 */
const OK_RESULT: OpenRouterChatTransportResult = { ok: true, status: 200, headers: {}, bodyText: '{}' };

/**
 * Failed transport result with HTTP 400.
 *
 * Purpose: Simulates a provider rejecting the schema.
 * When to use: Fallback cases.
 * Expected outcome: `ok: false` with `status: 400`.
 * Exceptions: None.
 */
const REJECTED_RESULT: OpenRouterChatTransportResult = { ok: false, error: 'bad request', status: 400 };

/**
 * Failed transport result naming a `tool_choice` refusal.
 *
 * Purpose: Simulates Amazon Bedrock's Claude endpoint rejecting OpenRouter's `required` translation.
 * When to use: Tool-choice fallback cases.
 * Expected outcome: `ok: false` with `status: 400` and the provider's `tool_choice` message.
 * Exceptions: None.
 */
const TOOL_CHOICE_REJECTED_RESULT: OpenRouterChatTransportResult = {
  ok: false,
  error: 'API error: Provider returned error: tool_choice: type "any" are not supported',
  status: 400,
};

/**
 * Builds a fake transport that records bodies and returns queued results in order.
 *
 * Purpose: Observes exactly what the helper posts without network access.
 * When to use: Every case in this file.
 * Expected outcome: `bodies` grows by one per post; results are consumed in order.
 * Exceptions: Throws when more posts happen than results were queued.
 */
function fakeTransport(results: readonly OpenRouterChatTransportResult[]): {
  readonly post: OpenRouterChatTransport;
  readonly bodies: Record<string, unknown>[];
} {
  const queue = [...results];
  const bodies: Record<string, unknown>[] = [];
  const post: OpenRouterChatTransport = async (payload) => {
    bodies.push(payload.body);
    const next = queue.shift();
    if (!next) throw new Error('fakeTransport: unexpected extra post');
    return next;
  };
  return { post, bodies };
}

/**
 * Builds structured-output settings with an optional reasoning override.
 *
 * Purpose: Keeps cases focused on the post sequence.
 * When to use: Every case in this file.
 * Expected outcome: Settings carrying `RESPONSE_FORMAT`.
 * Exceptions: None.
 */
function structuredSettings(reasoningEffort: string | null = null): OrdersChatRequestSettings {
  return {
    profile: { ...BASELINE_ORDERS_REQUEST_PROFILE, reasoningEffort, structuredOutputs: true },
    responseFormat: RESPONSE_FORMAT,
  };
}

/**
 * Posts one request for model `m` through the helper.
 *
 * Purpose: Shared call shape for every case.
 * When to use: Every case in this file.
 * Expected outcome: The helper's transport result.
 * Exceptions: None.
 */
function postFor(post: OpenRouterChatTransport, settings: OrdersChatRequestSettings): Promise<OpenRouterChatTransportResult> {
  return postOrdersChatRequest({
    post,
    key: 'k',
    modelId: 'm',
    baseBody: { model: 'm', messages: [], max_tokens: 100 },
    settings,
    attachResponseFormat: true,
    requestLabel: 'test',
  });
}

/**
 * Posts a forced-tool round for model `m`: `tool_choice: required` and no schema.
 *
 * Purpose: Matches the tool loop's request before the model's first tool call.
 * When to use: Tool-choice fallback cases.
 * Expected outcome: The helper's transport result.
 * Exceptions: None.
 */
function postRequiredToolRound(post: OpenRouterChatTransport): Promise<OpenRouterChatTransportResult> {
  return postOrdersChatRequest({
    post,
    key: 'k',
    modelId: 'm',
    baseBody: { model: 'm', messages: [], max_tokens: 100, tool_choice: 'required' },
    settings: structuredSettings(),
    attachResponseFormat: false,
    requestLabel: 'test',
  });
}

/**
 * Verifies a capable model gets the schema, the healing plugin, and the reasoning override in one post.
 *
 * Purpose: Happy path for every optional parameter.
 * When to use: After changing body assembly.
 * Expected outcome: One post carrying `response_format`, `plugins`, and `reasoning.effort`.
 * Exceptions: None.
 */
async function testCapableModelGetsAllOptions(): Promise<void> {
  resetOpenRouterModelCapabilitiesForTests();
  const { post, bodies } = fakeTransport([OK_RESULT]);
  await postFor(post, structuredSettings('high'));
  assert.equal(bodies.length, 1);
  assert.deepEqual(bodies[0].response_format, RESPONSE_FORMAT);
  assert.deepEqual(bodies[0].plugins, [{ id: 'response-healing' }]);
  assert.deepEqual(bodies[0].reasoning, { effort: 'high' });
}

/**
 * Verifies a request whose caller does not ask for the schema goes out without it.
 *
 * Purpose: Rounds that force a tool call must not carry the schema, even for a model that supports it.
 * When to use: After changing how `attachResponseFormat` gates the schema.
 * Expected outcome: One post with the reasoning override and neither `response_format` nor `plugins`.
 * Exceptions: None.
 */
async function testSchemaWithheldWhenNotRequested(): Promise<void> {
  resetOpenRouterModelCapabilitiesForTests();
  const { post, bodies } = fakeTransport([OK_RESULT]);
  await postOrdersChatRequest({
    post,
    key: 'k',
    modelId: 'm',
    baseBody: { model: 'm', messages: [], max_tokens: 100 },
    settings: structuredSettings('high'),
    attachResponseFormat: false,
    requestLabel: 'test',
  });
  assert.equal(bodies.length, 1);
  assert.ok(!('response_format' in bodies[0]));
  assert.ok(!('plugins' in bodies[0]));
  assert.deepEqual(bodies[0].reasoning, { effort: 'high' });
}

/**
 * Verifies a rejected schema is retried without it and skipped afterward.
 *
 * Purpose: One rejection must not fail the consultation or repeat on every later request.
 * When to use: After changing the fallback.
 * Expected outcome: Two posts, the second without schema or plugins; the next call posts once without schema.
 * Exceptions: None.
 */
async function testRejectionRetriesAndMarksModel(): Promise<void> {
  resetOpenRouterModelCapabilitiesForTests();
  const first = fakeTransport([REJECTED_RESULT, OK_RESULT]);
  const result = await postFor(first.post, structuredSettings());
  assert.equal(result.ok, true);
  assert.equal(first.bodies.length, 2);
  assert.ok(!('response_format' in first.bodies[1]));
  assert.ok(!('plugins' in first.bodies[1]));
  const later = fakeTransport([OK_RESULT]);
  await postFor(later.post, structuredSettings());
  assert.equal(later.bodies.length, 1);
  assert.ok(!('response_format' in later.bodies[0]));
}

/**
 * Verifies a provider that rejects `tool_choice: required` is retried with `auto` and then stays there.
 *
 * Purpose: Some endpoints cannot force a tool call; the forced-tool round carries no schema, so `auto` is the only fix.
 * When to use: After changing the tool-choice fallback.
 * Expected outcome: Two posts, `required` then `auto`, neither with the schema. The next call sends `auto` once.
 * Exceptions: None.
 */
async function testRequiredToolChoiceRetriesWithAuto(): Promise<void> {
  resetOpenRouterModelCapabilitiesForTests();
  const first = fakeTransport([TOOL_CHOICE_REJECTED_RESULT, OK_RESULT]);
  const result = await postRequiredToolRound(first.post);
  assert.equal(result.ok, true);
  assert.deepEqual(
    first.bodies.map((body) => body.tool_choice),
    ['required', 'auto']
  );
  assert.ok(first.bodies.every((body) => !('response_format' in body)));
  const later = fakeTransport([OK_RESULT]);
  await postRequiredToolRound(later.post);
  assert.equal(later.bodies.length, 1);
  assert.equal(later.bodies[0].tool_choice, 'auto');
}

/**
 * Verifies a failed automatic-tool-choice retry does not mark the model.
 *
 * Purpose: The model is marked only after a retry succeeds, so a second failure must not stick.
 * When to use: After changing when the model is marked.
 * Expected outcome: The call fails, and the next call still sends `tool_choice: required`.
 * Exceptions: None.
 */
async function testFailedToolChoiceRetryDoesNotMarkModel(): Promise<void> {
  resetOpenRouterModelCapabilitiesForTests();
  const first = fakeTransport([TOOL_CHOICE_REJECTED_RESULT, TOOL_CHOICE_REJECTED_RESULT]);
  const result = await postRequiredToolRound(first.post);
  assert.equal(result.ok, false);
  const later = fakeTransport([OK_RESULT]);
  await postRequiredToolRound(later.post);
  assert.equal(later.bodies[0].tool_choice, 'required');
}

/**
 * Verifies a failed retry does not mark the model.
 *
 * Purpose: When the plain request also fails, the schema was not the cause.
 * When to use: After changing when the model is marked.
 * Expected outcome: The next call sends `response_format` again.
 * Exceptions: None.
 */
async function testFailedRetryDoesNotMarkModel(): Promise<void> {
  resetOpenRouterModelCapabilitiesForTests();
  const first = fakeTransport([REJECTED_RESULT, REJECTED_RESULT]);
  const result = await postFor(first.post, structuredSettings());
  assert.equal(result.ok, false);
  const later = fakeTransport([OK_RESULT]);
  await postFor(later.post, structuredSettings());
  assert.deepEqual(later.bodies[0].response_format, RESPONSE_FORMAT);
}

/**
 * Runs request helper tests.
 *
 * Purpose: Node entrypoint for test discovery.
 * When to use: `node dist/main/openRouter/ordersChatRequestHelpers.test.js`.
 * Expected outcome: Exits non-zero on failure; logs pass when all succeed.
 * Exceptions: None; failures set the exit code.
 */
async function run(): Promise<void> {
  await testCapableModelGetsAllOptions();
  await testSchemaWithheldWhenNotRequested();
  await testRejectionRetriesAndMarksModel();
  await testRequiredToolChoiceRetriesWithAuto();
  await testFailedToolChoiceRetryDoesNotMarkModel();
  await testFailedRetryDoesNotMarkModel();
  console.log('ordersChatRequestHelpers.test.ts passed');
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
