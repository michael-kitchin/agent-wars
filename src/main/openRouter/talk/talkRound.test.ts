/**
 * A talk round closes once, and a late result does not store again.
 *
 * Purpose: Orders must not start until every member has settled or the timeout has fired.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/talk/talkRound.test.js`.
 * Expected outcome: The cases below. No database is opened.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, type AiSeatId } from '../../../shared/seatIds';
import { strategicStep } from '../../../shared/matchRecording';
import type { TalkSeatResult } from './requestTalk';
import { abstainAndAwaitTalkRound, openTalkRound, speakAndAwaitTalkRound, type TalkRunner } from './talkRound';

const step = strategicStep(3);
const left = AI_SEAT_IDS[0];
const right = AI_SEAT_IDS[1];

/**
 * A scheduler the test fires itself.
 *
 * Purpose: The timeout must not run until the test says so.
 * When to use: Every round in this file.
 * Expected outcome: `fire` runs the scheduled function once, unless `cancel` cleared it.
 * Exceptions: None.
 */
function manualScheduler(): { schedule: (fn: () => void, delayMs: number) => { cancel: () => void }; fire: () => void } {
  let pending: (() => void) | null = null;
  return {
    schedule(fn) {
      pending = fn;
      return { cancel: () => { pending = null; } };
    },
    fire() {
      const fn = pending;
      pending = null;
      fn?.();
    },
  };
}

/**
 * Opens a round with the given runner.
 *
 * Purpose: The cases share one setup.
 * When to use: Each test.
 * Expected outcome: The round, the scheduler, and the list of persist calls.
 * Exceptions: None.
 */
function open(seatIds: readonly AiSeatId[], runner: TalkRunner | null) {
  const timer = manualScheduler();
  const persisted: Array<ReadonlyMap<AiSeatId, TalkSeatResult>> = [];
  const round = openTalkRound({
    seatIds,
    theater: 'strategic',
    battle: null,
    turnNumber: 3,
    step,
    runner,
    timeoutMs: 75_000,
    schedule: timer.schedule,
    persist: (_step, results) => {
      persisted.push(results);
      return new Map();
    },
  });
  return { round, timer, persisted };
}

function spoke(costUsd: number): TalkSeatResult {
  return { kind: 'spoke', reply: { messages: [], stances: [], droppedCount: 0 }, costUsd };
}

test('two speakers close once, after the second', async () => {
  let releaseRight: () => void = () => undefined;
  const rightGate = new Promise<void>((resolve) => { releaseRight = resolve; });
  const { round, persisted } = open([left, right], async (request) => {
    if (request.seatId === right) await rightGate;
    return spoke(request.seatId === left ? 0.1 : 0.2);
  });
  const waiting = round.whenClosed();
  let closed = false;
  void waiting.then(() => { closed = true; });
  await round.speak(left, new AbortController().signal);
  assert.equal(closed, false);
  assert.equal(persisted.length, 0);
  releaseRight();
  await round.speak(right, new AbortController().signal);
  await waiting;
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.size, 2);
});

test('one speaker and one abstention close without the timer', async () => {
  const { round, timer, persisted } = open([left, right], async () => spoke(0.1));
  await round.speak(left, new AbortController().signal);
  round.abstain(right);
  await round.whenClosed();
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0]?.get(right)?.kind, 'silent');
  timer.fire();
  assert.equal(persisted.length, 1);
});

test('the timer times out a member that never settles, and a late result is not stored again', async () => {
  let release: (result: TalkSeatResult) => void = () => undefined;
  const gate = new Promise<TalkSeatResult>((resolve) => { release = resolve; });
  const { round, timer, persisted } = open([left, right], async (request) => {
    if (request.seatId === right) return gate;
    return spoke(0.1);
  });
  await round.speak(left, new AbortController().signal);
  const slow = round.speak(right, new AbortController().signal);
  assert.equal(persisted.length, 0);
  timer.fire();
  await round.whenClosed();
  assert.equal(persisted.length, 1);
  const timedOut = persisted[0]?.get(right);
  assert.equal(timedOut?.kind, 'silent');
  if (timedOut?.kind === 'silent') assert.equal(timedOut.reason, 'timed_out');
  release(spoke(0.5));
  await slow;
  assert.equal(persisted.length, 1);
  assert.equal(round.costFor(right), 0.5);
});

test('a throwing runner, a null runner, and a second speak settle once', async () => {
  let calls = 0;
  const throwing = open([left], async () => {
    calls += 1;
    throw new Error('boom');
  });
  await throwing.round.speak(left, new AbortController().signal);
  await throwing.round.speak(left, new AbortController().signal);
  assert.equal(calls, 1);
  assert.equal(throwing.persisted[0]?.get(left)?.kind, 'silent');
  const missing = open([left], null);
  await missing.round.speak(left, new AbortController().signal);
  assert.equal(missing.persisted[0]?.get(left)?.kind, 'silent');
});

test('an empty round and a throwing persist still close, and a null round returns at once', async () => {
  const empty = open([], async () => spoke(1));
  await empty.round.whenClosed();
  assert.equal(empty.persisted.length, 1);
  const broken = openTalkRound({
    seatIds: [left],
    theater: 'strategic',
    battle: null,
    turnNumber: 3,
    step,
    runner: async () => spoke(0),
    timeoutMs: 1,
    schedule: () => ({ cancel() { /* unused */ } }),
    persist() { throw new Error('disk'); },
  });
  await broken.speak(left, new AbortController().signal);
  await broken.whenClosed();
  assert.deepEqual(broken.sentBy(left), []);
  await speakAndAwaitTalkRound(null, left, new AbortController().signal);
  await abstainAndAwaitTalkRound(undefined, left);
});
