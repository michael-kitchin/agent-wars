/**
 * The dismiss button shows only for a human mercenary in strategic planning.
 *
 * Purpose: The panel and the action share `mercenaryDismissShown`.
 * When to use: After changing that function.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID } from './seatIds';
import { mercenaryDismissShown } from './mercenaryDismiss';

test('mercenaryDismissShown is true for a human mercenary during strategic planning', () => {
  assert.equal(
    mercenaryDismissShown({
      strategicPlanning: true,
      playbackRunning: false,
      player: HUMAN_SEAT_ID,
      isMercenary: true,
    }),
    true
  );
});

test('mercenaryDismissShown is false during playback, outside planning, for a regular unit, and for another seat', () => {
  const shown = {
    strategicPlanning: true,
    playbackRunning: false,
    player: HUMAN_SEAT_ID,
    isMercenary: true,
  };
  assert.equal(mercenaryDismissShown({ ...shown, playbackRunning: true }), false);
  assert.equal(mercenaryDismissShown({ ...shown, strategicPlanning: false }), false);
  assert.equal(mercenaryDismissShown({ ...shown, isMercenary: false }), false);
  assert.equal(mercenaryDismissShown({ ...shown, player: 'opponent' }), false);
});
