import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REPLAY_BUSY_REASON,
  REPLAY_IN_BATTLE_REASON,
  canPlay,
  canStepBack,
  canStepForward,
  parseTurnEntry,
  replayLabel,
  replayMayEnter,
  replayViewFor,
  type ReplayEntryState,
} from './replayNavigation';
import type { ReplayStepRef } from './replayTypes';

const OPEN: ReplayEntryState = {
  matchLoaded: true,
  inBattle: false,
  readyInFlight: false,
  playbackRunning: false,
  otherModalOpen: false,
  newGameOpenMidMatch: false,
};

/**
 * Builds strategic steps for the listed turns.
 *
 * Purpose: The parsing and label cases share one timeline.
 * When to use: A test that needs steps.
 * Expected outcome: One step per turn, with record ids counting from 10.
 * Exceptions: None.
 */
function stepsFor(turns: readonly number[]): ReplayStepRef[] {
  return turns.map((turnNumber, i) => ({ recordId: 10 + i, scope: 'strategic', turnNumber, beatNumber: 0 }));
}

test('replayViewFor shows the player view only for an active human before game over', () => {
  assert.equal(replayViewFor({ humanSeatActive: true, gameOver: false }), 'player');
  assert.equal(replayViewFor({ humanSeatActive: true, gameOver: true }), 'all');
  assert.equal(replayViewFor({ humanSeatActive: false, gameOver: false }), 'all');
  assert.equal(replayViewFor({ humanSeatActive: false, gameOver: true }), 'all');
});

test('replayMayEnter allows an idle match', () => {
  assert.deepEqual(replayMayEnter(OPEN), { ok: true });
});

test('replayMayEnter refuses in the documented order', () => {
  assert.deepEqual(replayMayEnter({ ...OPEN, matchLoaded: false, inBattle: true }), { ok: false, reason: null });
  assert.deepEqual(replayMayEnter({ ...OPEN, otherModalOpen: true, readyInFlight: true }), { ok: false, reason: null });
  assert.deepEqual(replayMayEnter({ ...OPEN, newGameOpenMidMatch: true, readyInFlight: true }), { ok: false, reason: null });
  assert.deepEqual(replayMayEnter({ ...OPEN, readyInFlight: true, inBattle: true }), { ok: false, reason: REPLAY_BUSY_REASON });
  assert.deepEqual(replayMayEnter({ ...OPEN, playbackRunning: true }), { ok: false, reason: REPLAY_BUSY_REASON });
  assert.deepEqual(replayMayEnter({ ...OPEN, inBattle: true }), { ok: false, reason: REPLAY_IN_BATTLE_REASON });
});

test('step buttons follow the position and the busy flag', () => {
  const first = { stepCount: 5, index: 0, busy: false };
  const middle = { stepCount: 5, index: 2, busy: false };
  const last = { stepCount: 5, index: 4, busy: false };
  assert.deepEqual([canStepBack(first), canStepForward(first)], [false, true]);
  assert.deepEqual([canStepBack(middle), canStepForward(middle)], [true, true]);
  assert.deepEqual([canStepBack(last), canStepForward(last)], [true, false]);
  assert.deepEqual([canStepBack({ ...middle, busy: true }), canStepForward({ ...middle, busy: true })], [false, false]);
  assert.equal(canPlay(middle), false);
});

test('parseTurnEntry accepts a recorded whole turn and rejects everything else', () => {
  const steps = stepsFor([10, 11, 12, 13]);
  assert.deepEqual(parseTurnEntry('12', steps), { index: 2 });
  assert.deepEqual(parseTurnEntry(' 12 ', steps), { index: 2 });
  for (const bad of ['', '0', '-3', '1.5', '1 2', 'abc', '99', '9']) {
    assert.deepEqual(parseTurnEntry(bad, steps), { error: true }, bad);
  }
});

test('replayLabel names the shown turn and the last turn', () => {
  const steps = stepsFor([1, 2, 12, 30]);
  assert.equal(replayLabel(steps, 2), 'Replay · Turn 12 of 30');
});
