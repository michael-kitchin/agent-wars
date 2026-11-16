import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REPLAY_BUSY_REASON,
  REPLAY_PLAYBACK_DWELL_MS,
  canPlay,
  canSeek,
  canStepBack,
  canStepForward,
  nextPlaybackIndex,
  parseTurnEntry,
  replayLabel,
  replayMayEnter,
  replayViewFor,
  type ReplayEntryState,
} from './replayNavigation';
import type { ReplayStepRef } from './replayTypes';

const OPEN: ReplayEntryState = {
  matchLoaded: true,
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

test('replayMayEnter allows an idle match, in a battle too', () => {
  assert.deepEqual(replayMayEnter(OPEN), { ok: true });
});

test('replayMayEnter refuses in the documented order', () => {
  assert.deepEqual(replayMayEnter({ ...OPEN, matchLoaded: false }), { ok: false, reason: null });
  assert.deepEqual(replayMayEnter({ ...OPEN, otherModalOpen: true, readyInFlight: true }), { ok: false, reason: null });
  assert.deepEqual(replayMayEnter({ ...OPEN, newGameOpenMidMatch: true, readyInFlight: true }), { ok: false, reason: null });
  assert.deepEqual(replayMayEnter({ ...OPEN, readyInFlight: true }), { ok: false, reason: REPLAY_BUSY_REASON });
  assert.deepEqual(replayMayEnter({ ...OPEN, playbackRunning: true }), { ok: false, reason: REPLAY_BUSY_REASON });
});

test('step buttons follow the position and the busy flag', () => {
  const first = { stepCount: 5, index: 0, busy: false, playing: false };
  const middle = { stepCount: 5, index: 2, busy: false, playing: false };
  const last = { stepCount: 5, index: 4, busy: false, playing: false };
  assert.deepEqual([canStepBack(first), canStepForward(first)], [false, true]);
  assert.deepEqual([canStepBack(middle), canStepForward(middle)], [true, true]);
  assert.deepEqual([canStepBack(last), canStepForward(last)], [true, false]);
  assert.deepEqual([canStepBack({ ...middle, busy: true }), canStepForward({ ...middle, busy: true })], [false, false]);
});

test('Play is possible only when a later step exists, or while it runs as Pause', () => {
  const middle = { stepCount: 5, index: 2, busy: false, playing: false };
  assert.equal(canPlay({ ...middle, index: 4 }), false);
  assert.equal(canPlay(middle), true);
  assert.equal(canPlay({ ...middle, playing: true }), true);
  assert.equal(canPlay({ ...middle, playing: true, index: 4 }), true);
  assert.equal(canPlay({ ...middle, busy: true }), false);
});

test('stepping and seeking are off while playing or loading', () => {
  const playing = { stepCount: 5, index: 2, busy: false, playing: true };
  assert.deepEqual([canStepBack(playing), canStepForward(playing), canSeek(playing)], [false, false, false]);
  assert.equal(canSeek({ ...playing, playing: false }), true);
  assert.equal(canSeek({ ...playing, playing: false, busy: true }), false);
});

test('nextPlaybackIndex moves forward, and ends at the last step or on a stop request', () => {
  const middle = { stepCount: 5, index: 2, busy: false, playing: true };
  assert.equal(nextPlaybackIndex(middle, false), 3);
  assert.equal(nextPlaybackIndex({ ...middle, index: 4 }, false), null);
  assert.equal(nextPlaybackIndex(middle, true), null);
});

test('Play holds each step for one second', () => {
  assert.equal(REPLAY_PLAYBACK_DWELL_MS, 1000);
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

test('a tactical timeline is labeled and typed by beat number', () => {
  const beats: ReplayStepRef[] = [1, 2, 3, 4].map((beatNumber, i) => ({ recordId: 30 + i, scope: 'tactical', turnNumber: 9, beatNumber }));
  assert.equal(replayLabel(beats, 2, 'tactical'), 'Replay · Beat 3 of 4');
  assert.deepEqual(parseTurnEntry('4', beats, 'tactical'), { index: 3 });
  assert.deepEqual(parseTurnEntry('9', beats, 'tactical'), { error: true });
  assert.deepEqual(parseTurnEntry('9', beats), { index: 0 });
});
