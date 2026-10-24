import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID, type SeatId } from './seatIds';
import { NEUTRAL_PALETTE, SEAT_PALETTES, paletteForOwner } from './seatPalette';

/**
 * Roster rows whose only job is to map an id to a seat order.
 *
 * Purpose: Palette lookup reads `seatId` and `seatOrder`.
 * When to use: The cases in this file.
 * Expected outcome: Orders 1 through 4.
 * Exceptions: None.
 */
function seats(): readonly { seatId: SeatId; seatOrder: number }[] {
  return [
    { seatId: HUMAN_SEAT_ID, seatOrder: 1 },
    { seatId: AI_SEAT_IDS[0], seatOrder: 2 },
    { seatId: AI_SEAT_IDS[1], seatOrder: 3 },
    { seatId: AI_SEAT_IDS[2], seatOrder: 4 },
  ];
}

test('seat orders 1 to 4 use the seat palette and Neutral is separate', () => {
  const roster = seats();
  assert.deepEqual(paletteForOwner(HUMAN_SEAT_ID, roster), SEAT_PALETTES[0]);
  assert.deepEqual(paletteForOwner(AI_SEAT_IDS[0], roster), SEAT_PALETTES[1]);
  assert.deepEqual(paletteForOwner(AI_SEAT_IDS[1], roster), SEAT_PALETTES[2]);
  assert.deepEqual(paletteForOwner(AI_SEAT_IDS[2], roster), SEAT_PALETTES[3]);
  assert.equal(SEAT_PALETTES[0]?.map, '#115E59');
  assert.equal(SEAT_PALETTES[1]?.map, '#9D174D');
  assert.equal(SEAT_PALETTES[2]?.map, '#C2410C');
  assert.equal(SEAT_PALETTES[3]?.map, '#2563EB');
  assert.equal(paletteForOwner(NEUTRAL_OWNER_ID, roster), NEUTRAL_PALETTE);
  assert.equal(NEUTRAL_PALETTE.map, '#141414');
  assert.equal(NEUTRAL_PALETTE.heldHexOutline, '#1F1F1F');
  assert.equal(NEUTRAL_PALETTE.text, '#D9D9D9');
  assert.equal(paletteForOwner(null, roster), null);
  assert.equal(paletteForOwner(AI_SEAT_IDS[3], roster), null);
});
