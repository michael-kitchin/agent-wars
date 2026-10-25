/**
 * Hex sentences for the turn report.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSeatIdForIndex, HUMAN_SEAT_ID } from './seatIds';
import { buildTurnReportLines, type TurnReportInput, type TurnReportSeat } from './turnReportLines';

const eastern = aiSeatIdForIndex(2);
const seats: TurnReportSeat[] = [
  { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
  { seatId: 'opponent', seatOrder: 2, homeRegion: 'Western Turkey' },
  { seatId: eastern, seatOrder: 3, homeRegion: 'Eastern Turkey' },
];

const image: TurnReportInput = {
  viewerSeatId: HUMAN_SEAT_ID,
  seats,
  transitions: [
    { h3Index: 'a', from: eastern, to: HUMAN_SEAT_ID },
    { h3Index: 'b', from: eastern, to: HUMAN_SEAT_ID },
  ],
  otherLines: [],
};

test('buildTurnReportLines writes the hex sentence', () => {
  const lines = buildTurnReportLines(image);
  assert.equal(lines[0], 'You took 2 hexes from E. Turkey.');
  const withDeployment = buildTurnReportLines({ ...image, otherLines: ['1 infantry unit deployed'] });
  assert.equal(withDeployment.at(-1), '1 infantry unit deployed');
});

test('buildTurnReportLines with a null viewer writes no You line and no fight line', () => {
  const lines = buildTurnReportLines({ ...image, viewerSeatId: null });
  assert.equal(lines.some((line) => line.startsWith('You ')), false);
  assert.equal(lines.some((line) => line.includes('fought at')), false);
});
