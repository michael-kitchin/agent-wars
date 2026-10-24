/**
 * Turn-report sentences for several sides.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSeatIdForIndex, HUMAN_SEAT_ID } from './seatIds';
import { buildTurnReportLines, type TurnReportInput, type TurnReportSeat } from './turnReportLines';

const western = 'opponent';
const eastern = aiSeatIdForIndex(2);
const seats: TurnReportSeat[] = [
  { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
  { seatId: western, seatOrder: 2, homeRegion: 'Western Turkey' },
  { seatId: eastern, seatOrder: 3, homeRegion: 'Eastern Turkey' },
];

const image: TurnReportInput = {
  viewerSeatId: HUMAN_SEAT_ID,
  seats,
  transitions: [
    { h3Index: 'a', from: eastern, to: HUMAN_SEAT_ID },
    { h3Index: 'b', from: eastern, to: HUMAN_SEAT_ID },
  ],
  losses: [
    { victimOwnerId: HUMAN_SEAT_ID, killerOwnerId: western, hexLabel: 'H7', unitType: 'infantry' },
    { victimOwnerId: western, killerOwnerId: eastern, hexLabel: 'C6', unitType: 'armor' },
    { victimOwnerId: eastern, killerOwnerId: western, hexLabel: 'C6', unitType: 'armor' },
  ],
  otherLines: [],
};

test('buildTurnReportLines writes the turn sentences and a three-party fight', () => {
  const lines = buildTurnReportLines(image);
  assert.equal(lines[0], 'You took 2 hexes from E. Turkey.');
  assert.equal(lines[1], 'You lost 1 infantry to W. Turkey at (H7).');
  assert.equal(lines[2], 'Seen: W. Turkey and E. Turkey fought at (C6). Each lost 1 armored unit.');
  const third = aiSeatIdForIndex(3);
  const three = buildTurnReportLines({
    viewerSeatId: null,
    seats: [...seats, { seatId: third, seatOrder: 4, homeRegion: 'Southern Asia' }],
    transitions: [],
    losses: [
      { victimOwnerId: western, killerOwnerId: eastern, hexLabel: 'C6', unitType: 'infantry' },
      { victimOwnerId: eastern, killerOwnerId: third, hexLabel: 'C6', unitType: 'armor' },
      { victimOwnerId: third, killerOwnerId: western, hexLabel: 'C6', unitType: 'naval' },
    ],
    otherLines: ['1 infantry unit deployed'],
  });
  assert.equal(
    three[0],
    'Seen: W. Turkey, E. Turkey, and S. Asia fought at (C6). W. Turkey lost 1 infantry; E. Turkey lost 1 armored unit; S. Asia lost 1 naval unit.'
  );
  assert.equal(three[1], '1 infantry unit deployed');
});

test('buildTurnReportLines with a null viewer writes only seen lines', () => {
  const lines = buildTurnReportLines({ ...image, viewerSeatId: null });
  assert.equal(lines.some((line) => line.startsWith('You ')), false);
  assert.equal(lines.some((line) => line.includes('fought at (C6)')), true);
  assert.equal(lines.some((line) => line.includes('fought at (H7)')), true);
});
