import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  resolveOpenRouterChatTransport,
  setOpenRouterPostChatForTests,
  type OpenRouterChatTransportPayload,
} from './openRouterChatTransport';

const savedHang = process.env.AGENT_WARS_SIMULATE_MODEL_HANG;
const savedHangMs = process.env.AGENT_WARS_SIMULATE_MODEL_HANG_MS;

afterEach(() => {
  setOpenRouterPostChatForTests(null);
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
});
