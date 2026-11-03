/**
 * Contract tests for the tools-withheld call after the tool-round cap.
 * Run: `npm run build:main` then `node dist/main/openRouter/requestOrdersFinalOrdersRound.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OpenRouterChatTransport, OpenRouterChatTransportResult } from './openRouterChatTransport';
import { BASELINE_ORDERS_REQUEST_PROFILE } from './ordersRequestProfile';
import type { OrdersChatRequestSettings } from './ordersChatRequestHelpers';
import { buildFinalOrdersRequestMessage } from './promptSpec/consultationText';
import { REQUEST_ORDERS_MAX_TOOL_ROUNDS, REQUEST_ORDERS_MAX_WALL_CLOCK_MS } from './requestOrdersFlowSupport';
import type { RequestOrdersChatMessage } from './requestOrdersFlowTypes';
import type { RequestOrdersToolLoopArgs, RequestOrdersUsageTotals } from './requestOrdersToolLoop';
import { runFinalOrdersRound, type FinalOrdersRoundArgs } from './requestOrdersFinalOrdersRound';

const TOOLS = [{ type: 'function', function: { name: 'check_distance' } }] as RequestOrdersToolLoopArgs['tools'];

/**
 * Records each posted body and returns scripted results.
 *
 * Purpose: The cases assert the request shape without a network call.
 * When to use: Every case in this file.
 * Expected outcome: `bodies` grows by one per post.
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
 * Builds the final-call args around one scripted transport.
 *
 * Purpose: Keeps each case focused on the reply and the request shape.
 * When to use: Every case in this file.
 * Expected outcome: A transcript that ends with a tool result, plus the given profile.
 * Exceptions: None.
 */
function argsFor(
  post: OpenRouterChatTransport,
  profile: OrdersChatRequestSettings['profile'],
  wallClockStart: number
): { readonly args: FinalOrdersRoundArgs; readonly messages: RequestOrdersChatMessage[] } {
  const messages: RequestOrdersChatMessage[] = [
    { role: 'user', content: 'situation' },
    { role: 'tool', tool_call_id: 'c0', content: '{}' },
  ];
  const usage: RequestOrdersUsageTotals = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
  const settings: OrdersChatRequestSettings = { profile, responseFormat: null };
  return {
    messages,
    args: {
      messages,
      tools: TOOLS,
      key: 'k',
      modelId: 'm',
      signal: undefined,
      onLog: undefined,
      wallClockStart,
      usage,
      postOpenRouterChatWithTimeoutAndRetry: post,
      resolveOrderFlowMaxTokens: () => 100,
      requestSettings: settings,
      iteration: REQUEST_ORDERS_MAX_TOOL_ROUNDS,
      responseAiIndex: 1,
    },
  };
}

const TEXT_BODY =
  '{"choices":[{"message":{"content":"{\\"message\\":\\"m\\",\\"strategy\\":\\"s\\",\\"orders\\":[]}"}}]}';

test('final orders call keeps the tool list and refuses tool use', async () => {
  const transport = fakeTransport([{ ok: true, status: 200, headers: {}, bodyText: TEXT_BODY }]);
  const { args, messages } = argsFor(transport.post, BASELINE_ORDERS_REQUEST_PROFILE, Date.now());
  const result = await runFinalOrdersRound(args);
  assert.equal(result.kind, 'finalContent');
  if (result.kind !== 'finalContent') return;
  assert.equal(result.afterRoundCap, true);
  assert.equal(messages.length, 3);
  assert.equal(transport.bodies.length, 1);
  const body = transport.bodies[0] ?? {};
  assert.equal(body.tool_choice, 'none');
  assert.ok(Array.isArray(body.tools));
  const last = messages[messages.length - 1];
  assert.equal(last?.role, 'user');
  if (last?.role === 'user') {
    assert.equal(last.content, buildFinalOrdersRequestMessage(REQUEST_ORDERS_MAX_TOOL_ROUNDS));
  }
});

test('a trailing user message is replaced so the final call does not send two user messages', async () => {
  const transport = fakeTransport([{ ok: true, status: 200, headers: {}, bodyText: TEXT_BODY }]);
  const { args, messages } = argsFor(transport.post, BASELINE_ORDERS_REQUEST_PROFILE, Date.now());
  messages.push({ role: 'user', content: 'corrective note' });
  const before = messages.length;
  const result = await runFinalOrdersRound(args);
  assert.equal(result.kind, 'finalContent');
  assert.equal(messages.length, before);
  const last = messages[messages.length - 1];
  assert.equal(last?.role, 'user');
  if (last?.role === 'user') {
    assert.equal(last.content, buildFinalOrdersRequestMessage(REQUEST_ORDERS_MAX_TOOL_ROUNDS));
  }
  const posted = transport.bodies[0]?.messages as Array<{ role: string }>;
  const roles = posted.map((message) => message.role).join(',');
  assert.equal(roles.endsWith('user,user'), false);
});

test('final orders call omits tools when the model does not accept tool_choice', async () => {
  const transport = fakeTransport([{ ok: true, status: 200, headers: {}, bodyText: TEXT_BODY }]);
  const profile = { ...BASELINE_ORDERS_REQUEST_PROFILE, toolChoice: false };
  const { args } = argsFor(transport.post, profile, Date.now());
  const result = await runFinalOrdersRound(args);
  assert.equal(result.kind, 'finalContent');
  const body = transport.bodies[0] ?? {};
  assert.equal('tools' in body, false);
  assert.equal('tool_choice' in body, false);
});

test('a tool call after the cap submits no orders and is not followed by another call', async () => {
  const toolBody =
    '{"choices":[{"message":{"content":null,"tool_calls":[{"id":"c1","type":"function","function":{"name":"check_distance","arguments":"{}"}}]}}]}';
  const transport = fakeTransport([{ ok: true, status: 200, headers: {}, bodyText: toolBody }]);
  const { args } = argsFor(transport.post, BASELINE_ORDERS_REQUEST_PROFILE, Date.now());
  const result = await runFinalOrdersRound(args);
  assert.deepEqual(result, { kind: 'budgetExceeded', iteration: REQUEST_ORDERS_MAX_TOOL_ROUNDS });
  assert.equal(transport.bodies.length, 1);
});

test('a cancelled consultation does not send the final orders call', async () => {
  const transport = fakeTransport([{ ok: true, status: 200, headers: {}, bodyText: TEXT_BODY }]);
  const { args, messages } = argsFor(transport.post, BASELINE_ORDERS_REQUEST_PROFILE, Date.now());
  const before = messages.length;
  const result = await runFinalOrdersRound({ ...args, signal: AbortSignal.abort() });
  assert.deepEqual(result, { kind: 'fail', error: 'Cancelled' });
  assert.equal(transport.bodies.length, 0);
  assert.equal(messages.length, before);
});

test('a failed final orders request submits no orders and is not retried', async () => {
  const transport = fakeTransport([{ ok: false, error: 'HTTP 500', status: 500 }]);
  const { args } = argsFor(transport.post, BASELINE_ORDERS_REQUEST_PROFILE, Date.now());
  const result = await runFinalOrdersRound(args);
  assert.deepEqual(result, { kind: 'budgetExceeded', iteration: REQUEST_ORDERS_MAX_TOOL_ROUNDS });
  assert.equal(transport.bodies.length, 1);
});

test('a wall clock that has already passed skips the final orders call', async () => {
  const transport = fakeTransport([{ ok: true, status: 200, headers: {}, bodyText: TEXT_BODY }]);
  const { args, messages } = argsFor(
    transport.post,
    BASELINE_ORDERS_REQUEST_PROFILE,
    Date.now() - REQUEST_ORDERS_MAX_WALL_CLOCK_MS - 1
  );
  const before = messages.length;
  const result = await runFinalOrdersRound(args);
  assert.deepEqual(result, { kind: 'budgetExceeded', iteration: REQUEST_ORDERS_MAX_TOOL_ROUNDS });
  assert.equal(transport.bodies.length, 0);
  assert.equal(messages.length, before);
  assert.equal(messages[0]?.role === 'user' ? messages[0].content : '', 'situation');
});
