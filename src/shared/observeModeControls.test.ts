import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID, aiSeatIdForIndex } from './seatIds';
import { observeModeControls, readoutViewerSeatId, resolveMatchView, staleIntelViewer, type ObserveSeat } from './observeModeControls';

const FIRST_AI = 'opponent' as const;
const SECOND_AI = aiSeatIdForIndex(2);

/**
 * An AI seat still in the match.
 *
 * Purpose: The watch cases share an active AI row.
 * When to use: Each roster below.
 * Expected outcome: One active AI `ObserveSeat`.
 * Exceptions: None.
 */
function ai(seatId: ObserveSeat['seatId'] = FIRST_AI): ObserveSeat {
  return { seatId, kind: 'ai', outTurn: null };
}

test('no human seat watches and disables play controls', () => {
  const controls = observeModeControls([ai(), ai(SECOND_AI)]);
  assert.equal(controls.observing, true);
  assert.equal(controls.ordersEnabled, false);
  assert.equal(controls.buildEnabled, false);
  assert.equal(controls.forcesEnabled, false);
  assert.equal(controls.unitSelectionEnabled, false);
  assert.equal(controls.magnifierEnabled, false);
  assert.equal(controls.hexOnlySelection, true);
});

test('a knocked-out human seat watches', () => {
  const controls = observeModeControls([
    { seatId: HUMAN_SEAT_ID, kind: 'human', outTurn: 6 },
    ai(),
  ]);
  assert.equal(controls.observing, true);
  assert.equal(controls.ordersEnabled, false);
  assert.equal(controls.unitSelectionEnabled, false);
  assert.equal(controls.magnifierEnabled, false);
});

test('an active human seat plays', () => {
  const controls = observeModeControls([
    { seatId: HUMAN_SEAT_ID, kind: 'human', outTurn: null },
    ai(),
  ]);
  assert.equal(controls.observing, false);
  assert.equal(controls.ordersEnabled, true);
  assert.equal(controls.buildEnabled, false);
  assert.equal(controls.forcesEnabled, false);
  assert.equal(controls.unitSelectionEnabled, true);
  assert.equal(controls.magnifierEnabled, true);
  assert.equal(controls.hexOnlySelection, false);
});

test('an empty roster is not a watch', () => {
  const controls = observeModeControls([]);
  assert.equal(controls.observing, false);
  assert.equal(controls.ordersEnabled, true);
});

test('an active human seat ignores a requested view', () => {
  const seats = [{ seatId: HUMAN_SEAT_ID, kind: 'human' as const, outTurn: null }, ai()];
  assert.deepEqual(resolveMatchView({ seats, requested: null }), {
    view: 'human',
    ignoredRequest: false,
    rejected: false,
  });
  assert.deepEqual(resolveMatchView({ seats, requested: 'all' }), {
    view: 'human',
    ignoredRequest: true,
    rejected: false,
  });
});

test('a watch with no request shows every side', () => {
  const seats = [ai(), ai(SECOND_AI)];
  assert.deepEqual(resolveMatchView({ seats, requested: '  ' }), {
    view: 'all',
    ignoredRequest: false,
    rejected: false,
  });
  assert.equal(readoutViewerSeatId(seats, 'all'), null);
});

test('a watch can request one seat and rejects an unknown seat', () => {
  const seats = [{ seatId: HUMAN_SEAT_ID, kind: 'human' as const, outTurn: 4 }, ai()];
  assert.equal(resolveMatchView({ seats, requested: FIRST_AI }).view, FIRST_AI);
  assert.equal(resolveMatchView({ seats, requested: 'not-a-seat' }).rejected, true);
  assert.equal(resolveMatchView({ seats, requested: 'not-a-seat' }).view, 'all');
  assert.equal(readoutViewerSeatId(seats, FIRST_AI), FIRST_AI);
  assert.equal(readoutViewerSeatId(seats, HUMAN_SEAT_ID), null);
});

test('stale intel follows the snapshot viewer', () => {
  assert.equal(staleIntelViewer(undefined), HUMAN_SEAT_ID);
  assert.equal(staleIntelViewer(HUMAN_SEAT_ID), HUMAN_SEAT_ID);
  assert.equal(staleIntelViewer('all'), null);
  assert.equal(staleIntelViewer(SECOND_AI), SECOND_AI);
  assert.equal(staleIntelViewer('not-a-seat'), HUMAN_SEAT_ID);
});
