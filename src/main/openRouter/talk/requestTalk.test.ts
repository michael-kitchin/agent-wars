/**
 * One talk call against a fake chat transport.
 *
 * Purpose: The call sends two messages and no tools, keeps other sides' private messages out, and records a talk consult only on the match it started on.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/requestTalk.test.js`.
 * Expected outcome: The cases below. The generation case is last because it moves the process-wide match generation.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, type AiSeatId } from '../../../shared/seatIds';
import { strategicStep } from '../../../shared/matchRecording';
import { getScenarioHomeRegionHexes, listScenarioHomeRegions } from '../../gameDb';
import { gameDbOps } from '../../gameDb/dbConnection';
import { upsertGameConfigValue } from '../../gameDb/gameConfigRows';
import { insertSentSideMessage } from '../../gameDb/sideMessageStore';
import { advanceMatchGeneration } from '../../matchGeneration';
import { decodeRecordPayload } from '../../recorder/matchRecordCodec';
import { withSeatedTempGameDbAsync } from '../../testSupport/withSeatedTempGameDb';
import type { OpenRouterChatTransport, OpenRouterChatTransportPayload } from '../openRouterChatTransport';
import { beginModelCall } from '../modelCallControl';
import { requestTalk, sentMessagesLogLine, type RequestTalkDeps } from './requestTalk';

test('one sent message is singular', () => {
  assert.equal(sentMessagesLogLine(0), 'Sent no messages.');
  assert.equal(sentMessagesLogLine(1), 'Sent 1 message.');
  assert.equal(sentMessagesLogLine(2), 'Sent 2 messages.');
});

/**
 * The largest listed home regions.
 *
 * Purpose: A global start needs regions that can hold opening units.
 * When to use: Before a three-seat start in this file.
 * Expected outcome: Up to `count` names.
 * Exceptions: None.
 */
function largestHomeRegions(count: number): string[] {
  return listScenarioHomeRegions()
    .map((name) => ({ name, hexes: getScenarioHomeRegionHexes(name).length }))
    .filter((region) => region.hexes > 0)
    .sort((a, b) => b.hexes - a.hexes || a.name.localeCompare(b.name))
    .slice(0, count)
    .map((region) => region.name);
}

/**
 * Opens a global match with three AI seats.
 *
 * Purpose: Talk tests need more than one commander.
 * When to use: Each case in this file.
 * Expected outcome: `runCase` sees seats `opponent`, `opponent2`, and `opponent3`.
 * Exceptions: Propagates a reset or case error.
 */
async function withThreeAi(runCase: () => Promise<void>): Promise<void> {
  const regions = largestHomeRegions(3);
  assert.equal(regions.length, 3);
  await withSeatedTempGameDbAsync('aw-talk-call-', {
    gameMapId: 'global',
    seats: regions.map((homeRegion) => ({ kind: 'ai' as const, homeRegion })),
  }, runCase);
}

/**
 * A transport that returns one assistant message.
 *
 * Purpose: The test inspects the body and controls the reply.
 * When to use: Every case that should reach the model.
 * Expected outcome: `{ ok: true }` with the given content and cost.
 * Exceptions: None.
 */
function replyingPost(content: string, cost: number, onPost?: (payload: OpenRouterChatTransportPayload) => void): OpenRouterChatTransport {
  return async (payload) => {
    onPost?.(payload);
    return {
      ok: true,
      status: 200,
      headers: {},
      bodyText: JSON.stringify({ choices: [{ message: { content } }], usage: { cost } }),
    };
  };
}

/**
 * Dependencies with a fixed key and profile.
 *
 * Purpose: The call does not read a real key.
 * When to use: Every case.
 * Expected outcome: `readSeatApiKey` receives `test-key` when no seat map is stored.
 * Exceptions: None.
 */
function deps(post: OpenRouterChatTransport): RequestTalkDeps {
  return { loadKey: () => 'test-key', postOpenRouterChatWithTimeoutAndRetry: post, resolveOrdersRequestProfile: undefined };
}

/**
 * Stages of stored consultation events.
 *
 * Purpose: A talk call records `stage: talk` only when it reached the model on the open match.
 * When to use: After `requestTalk`.
 * Expected outcome: One object per consultation row.
 * Exceptions: None.
 */
function consultationPayloads(): unknown[] {
  return gameDbOps.getAll<{ payload: Buffer }>(
    `SELECT payload FROM match_records WHERE record_type = 'consultation' ORDER BY record_id`
  ).map((row) => decodeRecordPayload(row.payload));
}

test('a deadline during the call is a timeout and a stop is a cancel', async () => {
  await withThreeAi(async () => {
    const deadline = beginModelCall('deadline', 'strategic', AI_SEAT_IDS[0]);
    const timedOut = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null, signal: deadline.signal },
      deps(async () => {
        deadline.abortForDeadline();
        return { ok: false, error: 'aborted' };
      })
    );
    assert.deepEqual(timedOut, { kind: 'silent', reason: 'timed_out', costUsd: 0 });
    deadline.end();
    const stopped = beginModelCall('stopped', 'strategic', AI_SEAT_IDS[0]);
    const cancelled = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null, signal: stopped.signal },
      deps(async () => {
        stopped.abort();
        return { ok: false, error: 'aborted' };
      })
    );
    assert.deepEqual(cancelled, { kind: 'silent', reason: 'cancelled', costUsd: 0 });
    stopped.end();
    const stored = consultationPayloads() as Array<{ outcome?: string }>;
    assert.deepEqual(stored.map((row) => row.outcome), ['wallClock', 'cancelled']);
  });
});

test('the talk body has two messages, no tools, and the other side code', async () => {
  await withThreeAi(async () => {
    const seen: { body: Record<string, unknown> | null } = { body: null };
    const result = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null },
      deps(replyingPost('{"messages":[],"stances":[]}', 0.02, (payload) => { seen.body = payload.body; }))
    );
    assert.equal(result.kind, 'spoke');
    const messages = (seen.body?.messages ?? []) as readonly { role: string; content: string }[];
    assert.equal(messages.length, 2);
    assert.equal(seen.body !== null && !('tools' in seen.body), true);
    assert.match(messages[1]?.content ?? '', /a2/);
    const stored = consultationPayloads() as Array<{ stage?: string }>;
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.stage, 'talk');
  });
});

test('a commander sees only messages it sent or received, with fog on or off', async () => {
  await withThreeAi(async () => {
    const step = strategicStep(1);
    insertSentSideMessage(gameDbOps, { fromSeatId: AI_SEAT_IDS[0], toSeatId: AI_SEAT_IDS[1], body: 'alpha-to-bravo', step });
    insertSentSideMessage(gameDbOps, { fromSeatId: AI_SEAT_IDS[1], toSeatId: AI_SEAT_IDS[0], body: 'bravo-to-alpha', step });
    insertSentSideMessage(gameDbOps, { fromSeatId: AI_SEAT_IDS[1], toSeatId: AI_SEAT_IDS[2], body: 'bravo-to-charlie', step });
    const texts: string[] = [];
    const post = replyingPost('{"messages":[],"stances":[]}', 0, (payload) => {
      const messages = payload.body.messages as readonly { content: string }[];
      texts.push(messages[1]?.content ?? '');
    });
    await requestTalk({ seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 2, battle: null }, deps(post));
    upsertGameConfigValue(gameDbOps, 'fog_of_war_enabled', '0');
    await requestTalk({ seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 2, battle: null }, deps(post));
    for (const text of texts) {
      assert.match(text, /alpha-to-bravo/);
      assert.match(text, /bravo-to-alpha/);
      assert.equal(text.includes('bravo-to-charlie'), false);
    }
  });
});

test('a valid reply is spoke, an unparsed reply is silent, and a rejection is failed', async () => {
  await withThreeAi(async () => {
    const spoke = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null },
      deps(replyingPost('{"messages":[{"to":"a2","text":"Hold."}],"stances":[]}', 0.4))
    );
    assert.equal(spoke.kind, 'spoke');
    if (spoke.kind === 'spoke') {
      assert.equal(spoke.reply.messages[0]?.text, 'Hold.');
      assert.ok(spoke.costUsd > 0);
    }
    const unparsed = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null },
      deps(replyingPost('not json', 0))
    );
    assert.deepEqual(unparsed, { kind: 'silent', reason: 'unparsed', costUsd: 0 });
    const failed = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null },
      deps(async () => ({ ok: false, error: 'provider down' }))
    );
    assert.equal(failed.kind, 'silent');
    if (failed.kind === 'silent') assert.equal(failed.reason, 'failed');
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const cancelled = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null, signal: controller.signal },
      deps(async () => { called = true; return { ok: false, error: 'should not post' }; })
    );
    assert.equal(called, false);
    assert.equal(cancelled.kind, 'silent');
    if (cancelled.kind === 'silent') assert.equal(cancelled.reason, 'cancelled');
  });
});

test('a match with no other active seat does not call the model', async () => {
  await withThreeAi(async () => {
    gameDbOps.run(`UPDATE seats SET out_turn = 1 WHERE seat_id != ?`, [AI_SEAT_IDS[0]]);
    let called = false;
    const result = await requestTalk(
      { seatId: AI_SEAT_IDS[0], modelId: 'test-model', turnNumber: 1, battle: null },
      deps(async () => { called = true; return { ok: false, error: 'should not post' }; })
    );
    assert.equal(called, false);
    assert.deepEqual(result, { kind: 'silent', reason: 'no_recipients', costUsd: 0 });
    assert.equal(consultationPayloads().length, 0);
  });
});

test('a talk call that finishes after the match generation moves writes no consultation', async () => {
  await withThreeAi(async () => {
    const before = consultationPayloads().length;
    await requestTalk(
      { seatId: AI_SEAT_IDS[0] as AiSeatId, modelId: 'test-model', turnNumber: 1, battle: null },
      deps(replyingPost('{"messages":[],"stances":[]}', 0, () => { advanceMatchGeneration('new_game'); }))
    );
    assert.equal(consultationPayloads().length, before);
  });
});
