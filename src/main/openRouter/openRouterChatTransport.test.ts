import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { createConsultTelemetry } from './consultTelemetry';
import { resetOpenRouterSessionAffordableMaxTokensForTests } from './openRouterCreditLimits';
import {
  resolveOpenRouterChatTransport,
  setOpenRouterPostChatForTests,
  type OpenRouterChatTransportPayload,
} from './openRouterChatTransport';
import {
  setOpenRouterHttpsRequestForTests,
  type OpenRouterHttpsRequest,
} from './openRouterHttpsRequest';

const savedHang = process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
const savedHangMs = process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS;

afterEach(() => {
  setOpenRouterPostChatForTests(null);
  setOpenRouterHttpsRequestForTests(null);
  resetOpenRouterSessionAffordableMaxTokensForTests();
  if (savedHang === undefined) delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
  else process.env.AGENT_WARS_SIMULATE_MODEL_HANG = savedHang;
  if (savedHangMs === undefined) delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS;
  else process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = savedHangMs;
});

/**
 * Builds one chat-completion payload and records activity-log lines.
 *
 * Purpose: Transport tests need a key, a body, and the lines the player would see.
 * When to use: Each test in this file.
 * Expected outcome: `onLog` appends to `lines`. An optional signal is the player's cancel.
 * Exceptions: None.
 */
function payload(signal?: AbortSignal): OpenRouterChatTransportPayload & { lines: string[] } {
  const lines: string[] = [];
  return {
    key: 'test-key',
    body: { max_tokens: 128 },
    signal,
    requestLabel: 'test',
    lines,
    onLog: (line) => lines.push(line),
  };
}

describe('openRouterChatTransport', { concurrency: 1 }, () => {
  it('a simulated hang times out once and is not retried', async () => {
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'all';
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      return { status: 200, headers: {}, bodyText: '{}' };
    });
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()({ ...body, telemetry });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'Model call timed out after 0s.');
    assert.equal(posts, 0);
    assert.equal(telemetry.summary().attempts.length, 1);
    assert.equal(telemetry.summary().attempts[0]?.outcome, 'timeout');
    assert.equal(telemetry.summary().attempts[0]?.provider, null);
    assert.deepEqual(telemetry.summary().fallbacks, []);
    assert.ok(body.lines.some((line) => line.startsWith('Simulating a hung model call')));
    assert.ok(body.lines.some((line) => line.includes('timed out after 0s (attempt 1 of 2). Not retried.')));
    assert.equal(body.lines.some((line) => line.includes('Retrying')), false);
  });

  it('a first-attempt hang is a timeout and does not reach the poster', async () => {
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'first';
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      return { status: 200, headers: {}, bodyText: '{}' };
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()(body);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'Model call timed out after 0s.');
    assert.equal(posts, 0);
    assert.ok(body.lines.some((line) => line.includes('timed out after 0s (attempt 1 of 2). Not retried.')));
    assert.equal(body.lines.some((line) => line.includes('Retrying')), false);
  });

  it('cancels a simulated hang without retrying', async () => {
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'all';
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '5000';
    const controller = new AbortController();
    const body = payload(controller.signal);
    const pending = resolveOpenRouterChatTransport()(body);
    setTimeout(() => controller.abort(), 30);
    const result = await pending;
    assert.deepEqual(result, { ok: false, error: 'Cancelled' });
    assert.equal(body.lines.some((line) => line.includes('timed out')), false);
  });

  it('retries HTTP 408 once and then succeeds', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      if (posts === 1) return { status: 408, headers: {}, bodyText: 'timeout' };
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()(body);
    assert.equal(result.ok, true);
    assert.equal(posts, 2);
    assert.ok(body.lines.some((line) => line.includes('HTTP 408 (attempt 1 of 2). Retrying...')));
  });

  it('a socket deadline is a timeout and is not retried', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      throw new Error('HTTPS_TIMEOUT_180000');
    });
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()({ ...body, telemetry });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'Model call timed out after 180s.');
    assert.equal(posts, 1);
    assert.equal(telemetry.summary().attempts.length, 1);
    assert.equal(telemetry.summary().attempts[0]?.outcome, 'timeout');
    assert.equal(telemetry.summary().attempts[0]?.provider, null);
    assert.equal(telemetry.summary().attempts[0]?.retried, false);
    assert.deepEqual(telemetry.summary().fallbacks, []);
    assert.ok(body.lines.some((line) => line.includes('timed out after 180s (attempt 1 of 2). Not retried.')));
  });

  it('a credit-cap resend that hits the socket deadline is the second attempt', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      if (posts === 1) {
        return {
          status: 402,
          headers: {},
          bodyText: JSON.stringify({
            error: { message: 'You requested up to 8192 tokens, but can only afford 7896.' },
          }),
        };
      }
      throw new Error('HTTPS_TIMEOUT_180000');
    });
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()({ ...body, body: { max_tokens: 8192 }, telemetry });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'Model call timed out after 180s.');
    assert.equal(posts, 2);
    assert.equal(telemetry.summary().attempts[0]?.retried, true);
    assert.equal(telemetry.summary().attempts[1]?.outcome, 'timeout');
    assert.equal(telemetry.summary().attempts[1]?.attempt, 2);
    assert.deepEqual(telemetry.summary().fallbacks, ['creditClamp']);
    assert.ok(body.lines.some((line) => line.includes('retrying with max_tokens=7896')));
    assert.ok(body.lines.some((line) => line.includes('timed out after 180s (attempt 2 of 2). Not retried.')));
  });

  it('does not retry HTTP 500', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      return { status: 500, headers: {}, bodyText: 'error' };
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()(body);
    assert.equal(result.ok, false);
    assert.equal(posts, 1);
    assert.ok(body.lines.some((line) => line.includes('HTTP 500 (attempt 1 of 2). Not retried.')));
  });

  it('the all hang mode hangs a retried attempt', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      if (posts === 1) {
        process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'all';
        process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
        throw new Error('socket reset');
      }
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const result = await resolveOpenRouterChatTransport()(payload());
    assert.equal(posts, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'Model call timed out after 0s.');
  });

  it('the first hang mode does not hang a retried attempt', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      if (posts === 1) {
        process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'first';
        process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
        throw new Error('socket reset');
      }
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const result = await resolveOpenRouterChatTransport()(payload());
    assert.equal(posts, 2);
    assert.equal(result.ok, true);
  });

  it('logs an HTTP retry and then succeeds', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      if (posts === 1) return { status: 503, headers: {}, bodyText: 'unavailable' };
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()({ ...body, telemetry });
    assert.equal(result.ok, true);
    assert.equal(posts, 2);
    assert.equal(telemetry.summary().attempts[0]?.outcome, 'http');
    assert.equal(telemetry.summary().attempts[0]?.httpStatus, 503);
    assert.equal(telemetry.summary().attempts[0]?.retried, true);
    assert.equal(telemetry.summary().attempts[1]?.outcome, 'ok');
    assert.deepEqual(telemetry.summary().fallbacks, ['httpStatusRetry']);
    assert.ok(body.lines.some((line) => line.includes('HTTP 503 (attempt 1 of 2). Retrying...')));
  });

  it('an already aborted call records no attempt', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    const controller = new AbortController();
    controller.abort();
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    const result = await resolveOpenRouterChatTransport()({ ...payload(controller.signal), telemetry });
    assert.deepEqual(result, { ok: false, error: 'Cancelled' });
    assert.equal(posts, 0);
    assert.deepEqual(telemetry.summary().attempts, []);
    assert.deepEqual(telemetry.summary().fallbacks, []);
  });

  it('returns Cancelled when the player aborts during the retry delay', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    const controller = new AbortController();
    setOpenRouterPostChatForTests(async () => {
      setTimeout(() => controller.abort(), 20);
      return { status: 503, headers: {}, bodyText: 'unavailable' };
    });
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    const result = await resolveOpenRouterChatTransport()({ ...payload(controller.signal), telemetry });
    assert.deepEqual(result, { ok: false, error: 'Cancelled' });
    assert.equal(telemetry.summary().attempts.length, 1);
    assert.equal(telemetry.summary().attempts[0]?.retried, false);
    assert.deepEqual(telemetry.summary().fallbacks, []);
  });

  /**
   * The keys `test-openrouter-key` and `test-openrouter-key-b` are for testing.
   */
  it('sends attribution headers on the chat POST', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    const seen: Array<{
      hostname?: string | null;
      path?: string | null;
      method?: string;
      headers?: unknown;
    }> = [];
    const fake: OpenRouterHttpsRequest = (options, callback) => {
      seen.push({
        hostname: options.hostname,
        path: typeof options.path === 'string' ? options.path : null,
        method: options.method,
        headers: options.headers,
      });
      const req = new EventEmitter();
      const end = (): void => {
        const res = new EventEmitter();
        queueMicrotask(() => {
          callback(
            Object.assign(res, {
              statusCode: 200,
              headers: {},
              setTimeout: () => res,
            }) as unknown as IncomingMessage
          );
          res.emit('end');
        });
      };
      return Object.assign(req, {
        destroy: () => req,
        setTimeout: () => req,
        write: () => true,
        end,
      }) as unknown as ClientRequest;
    };
    setOpenRouterHttpsRequestForTests(fake);
    const first = await resolveOpenRouterChatTransport()({
      key: 'test-openrouter-key',
      body: { max_tokens: 128 },
      requestLabel: 'test',
    });
    const second = await resolveOpenRouterChatTransport()({
      key: 'test-openrouter-key-b',
      body: { max_tokens: 128 },
      requestLabel: 'test',
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].hostname, 'openrouter.ai');
    assert.equal(seen[0].path, '/api/v1/chat/completions');
    assert.equal(seen[0].method, 'POST');
    assert.deepEqual(seen[1].hostname, seen[0].hostname);
    assert.deepEqual(seen[1].path, seen[0].path);
    assert.deepEqual(seen[1].method, seen[0].method);
    assert.deepEqual(seen[0].headers, {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-openrouter-key',
      'Accept-Encoding': 'gzip, deflate, br, identity',
      'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
      'X-OpenRouter-Title': 'Agent Wars',
      'X-OpenRouter-Categories': 'game',
    });
    assert.deepEqual(seen[1].headers, {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-openrouter-key-b',
      'Accept-Encoding': 'gzip, deflate, br, identity',
      'HTTP-Referer': 'https://github.com/michael-kitchin/agent-wars',
      'X-OpenRouter-Title': 'Agent Wars',
      'X-OpenRouter-Categories': 'game',
    });
  });

  it('records the provider on success and null on a timeout', async () => {
    const usage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const telemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage,
    });
    setOpenRouterPostChatForTests(async () => ({
      status: 200,
      headers: {},
      bodyText: '{"provider":"Novita"}',
    }));
    const ok = await resolveOpenRouterChatTransport()({ ...payload(), telemetry });
    assert.equal(ok.ok, true);
    assert.equal(telemetry.summary().attempts[0]?.provider, 'Novita');
    assert.deepEqual(telemetry.summary().servedBy, ['Novita']);

    process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'all';
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
    const hungUsage = { requestCost: 0, totalInputTokens: 0, totalOutputTokens: 0 };
    const hungTelemetry = createConsultTelemetry({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'model',
      providerSort: 'throughput',
      usage: hungUsage,
    });
    const hung = await resolveOpenRouterChatTransport()({ ...payload(), telemetry: hungTelemetry });
    assert.equal(hung.ok, false);
    assert.equal(hungTelemetry.summary().attempts.length, 1);
    assert.equal(hungTelemetry.summary().attempts[0]?.outcome, 'timeout');
    assert.equal(hungTelemetry.summary().attempts[0]?.provider, null);
    assert.equal(hungTelemetry.summary().attempts[0]?.retried, false);
    assert.equal(hungTelemetry.summary().timeouts, 1);
  });
});
