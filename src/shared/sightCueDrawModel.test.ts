import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SightCueBeam } from './ipc/sightCueTypes';
import {
  SIGHT_CUE_DRAW_IN_MS,
  SIGHT_CUE_FADE_MS,
  SIGHT_CUE_HOLD_MS,
} from './resolutionPlaybackTiming';
import {
  insetBeamSegment,
  lerpNumber,
  sightCueBeamsForViewer,
  sightCueFrameAt,
  sightCueRingTargets,
} from './sightCueDrawModel';

/**
 * One beam for a draw-model test.
 *
 * Purpose: The cases only vary the fields they name.
 * When to use: Inside this file.
 * Expected outcome: A new-contact beam from `a` to `b` for `opponent`.
 * Exceptions: None.
 */
function beam(overrides: Partial<SightCueBeam> = {}): SightCueBeam {
  return {
    seatId: 'opponent',
    fromH3Index: 'a',
    toH3Index: 'b',
    isNewContact: true,
    ...overrides,
  };
}

test('all sides keeps every beam and a seat keeps only its own', () => {
  const beams = [beam(), beam({ seatId: 'opponent2' })];
  assert.deepEqual(sightCueBeamsForViewer(beams, null), beams);
  assert.deepEqual(sightCueBeamsForViewer(beams, 'opponent'), [beams[0]]);
});

test('a normal frame draws in, holds, then fades, and the ring waits for the hold', () => {
  const opening = sightCueFrameAt(0, false);
  assert.equal(opening.drawProgress, 0);
  assert.equal(opening.alpha, 1);
  assert.equal(opening.ringProgress, null);
  const midDraw = sightCueFrameAt(SIGHT_CUE_DRAW_IN_MS / 2, false);
  assert.equal(midDraw.drawProgress, 0.5);
  assert.equal(midDraw.ringProgress, null);
  const hold = sightCueFrameAt(SIGHT_CUE_DRAW_IN_MS + SIGHT_CUE_HOLD_MS / 2, false);
  assert.equal(hold.drawProgress, 1);
  assert.equal(hold.alpha, 1);
  assert.equal(hold.ringProgress, 0.5);
  const fade = sightCueFrameAt(SIGHT_CUE_DRAW_IN_MS + SIGHT_CUE_HOLD_MS + SIGHT_CUE_FADE_MS / 2, false);
  assert.equal(fade.alpha, 0.5);
  assert.equal(fade.ringProgress, 1);
});

test('reduced motion shows the finished lines only during the hold', () => {
  assert.equal(sightCueFrameAt(0, true).alpha, 0);
  const hold = sightCueFrameAt(SIGHT_CUE_DRAW_IN_MS, true);
  assert.equal(hold.drawProgress, 1);
  assert.equal(hold.alpha, 1);
  assert.equal(hold.ringProgress, 1);
  assert.equal(sightCueFrameAt(SIGHT_CUE_DRAW_IN_MS + SIGHT_CUE_HOLD_MS, true).alpha, 0);
});

test('inset keeps one radius until the centers are closer than twice that, then uses a quarter', () => {
  const long = insetBeamSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 18);
  assert.deepEqual(long, { start: { x: 18, y: 0 }, end: { x: 82, y: 0 } });
  const stillClear = insetBeamSegment({ x: 0, y: 0 }, { x: 40, y: 0 }, 18);
  assert.deepEqual(stillClear, { start: { x: 18, y: 0 }, end: { x: 22, y: 0 } });
  const short = insetBeamSegment({ x: 0, y: 0 }, { x: 30, y: 0 }, 18);
  assert.deepEqual(short, { start: { x: 7.5, y: 0 }, end: { x: 22.5, y: 0 } });
  assert.equal(insetBeamSegment({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 18), null);
});

test('rings keep the first new contact for each seat and target hex', () => {
  const first = beam({ fromH3Index: 'spotter' });
  const duplicate = beam({ fromH3Index: 'other' });
  const otherSeat = beam({ seatId: 'opponent2' });
  const ongoing = beam({ isNewContact: false, toH3Index: 'c' });
  assert.deepEqual(sightCueRingTargets([ongoing, first, duplicate, otherSeat]), [first, otherSeat]);
});

test('lerpNumber stays inside the two ends', () => {
  assert.equal(lerpNumber(10, 20, -1), 10);
  assert.equal(lerpNumber(10, 20, 0.5), 15);
  assert.equal(lerpNumber(10, 20, 2), 20);
});
