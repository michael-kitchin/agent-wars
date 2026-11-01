import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { afterEach, describe, it } from 'node:test';
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
  it('logs a timeout and retries a simulated hang, then stops', async () => {
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'all';
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      return { status: 200, headers: {}, bodyText: '{}' };
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()(body);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'Model call timed out after 2 attempts.');
    assert.equal(posts, 0);
    assert.ok(body.lines.some((line) => line.startsWith('Simulating a hung model call')));
    assert.ok(body.lines.some((line) => line.includes('timed out after 0s (attempt 1 of 2). Retrying...')));
    assert.ok(body.lines.some((line) => line.includes('No retries left.')));
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

  it('hangs only the first attempt when the simulator is set to first', async () => {
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG = 'first';
    process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS = '100';
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()(body);
    assert.equal(result.ok, true);
    assert.equal(posts, 1);
    assert.equal(body.lines.filter((line) => line.startsWith('Simulating a hung model call')).length, 1);
  });

  it('logs an HTTP retry and then succeeds', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    let posts = 0;
    setOpenRouterPostChatForTests(async () => {
      posts += 1;
      if (posts === 1) return { status: 503, headers: {}, bodyText: 'unavailable' };
      return { status: 200, headers: {}, bodyText: '{"ok":true}' };
    });
    const body = payload();
    const result = await resolveOpenRouterChatTransport()(body);
    assert.equal(result.ok, true);
    assert.equal(posts, 2);
    assert.ok(body.lines.some((line) => line.includes('HTTP 503 (attempt 1 of 2). Retrying...')));
  });

  it('returns Cancelled when the player aborts during the retry delay', async () => {
    delete process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
    const controller = new AbortController();
    setOpenRouterPostChatForTests(async () => {
      setTimeout(() => controller.abort(), 20);
      return { status: 503, headers: {}, bodyText: 'unavailable' };
    });
    const result = await resolveOpenRouterChatTransport()(payload(controller.signal));
    assert.deepEqual(result, { ok: false, error: 'Cancelled' });
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
});
