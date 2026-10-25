/**
 * Hex sentences for the turn report.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSeatIdForIndex, HUMAN_SEAT_ID } from './seatIds';
import { buildTurnReportLines, sideNameMarksForLine, type TurnReportInput, type TurnReportSeat } from './turnReportLines';

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

test('sideNameMarksForLine marks an opponent name and skips Your, Neutral, and other lines', () => {
  const markSeats = [
    { seatId: 'opponent', seatOrder: 2, homeRegion: 'Eastern Turkey' },
    { seatId: 'opponent2', seatOrder: 4, homeRegion: '   ' },
  ];
  const from = 'You took 1 hex from E. Turkey.';
  const fromAt = from.indexOf('E. Turkey');
  assert.deepEqual(sideNameMarksForLine(from, markSeats), [
    { seatId: 'opponent', start: fromAt, end: fromAt + 'E. Turkey'.length },
  ]);
  const bulleted = `\u2022 ${from}`;
  assert.deepEqual(sideNameMarksForLine(bulleted, markSeats), [
    { seatId: 'opponent', start: fromAt + 2, end: fromAt + 2 + 'E. Turkey'.length },
  ]);
  const took = 'E. Turkey took 2 of your hexes.';
  assert.deepEqual(sideNameMarksForLine(took, markSeats), [
    { seatId: 'opponent', start: 0, end: 'E. Turkey'.length },
  ]);
  const tied = [
    { seatId: 'opponent', seatOrder: 4, homeRegion: 'Eastern Turkey' },
    { seatId: 'opponent3', seatOrder: 2, homeRegion: 'Eastern Turkey & Caucasus' },
  ];
  assert.deepEqual(sideNameMarksForLine(from, tied), [
    { seatId: 'opponent3', start: fromAt, end: fromAt + 'E. Turkey'.length },
  ]);
  const header = '## Eastern Turkey Losses';
  const headerAt = header.indexOf('Eastern Turkey');
  assert.equal(headerAt, 3);
  assert.deepEqual(sideNameMarksForLine(header, markSeats), [
    { seatId: 'opponent', start: headerAt, end: headerAt + 'Eastern Turkey'.length },
  ]);
  const blankHome = 'opponent2 Losses';
  assert.deepEqual(sideNameMarksForLine(blankHome, markSeats), [
    { seatId: 'opponent2', start: 0, end: 'opponent2'.length },
  ]);
  for (const plain of [
    'Your Losses',
    'Neutral Losses',
    'You took 1 hex from Neutral.',
    'Unknown battle observed in Europe.',
  ]) {
    assert.deepEqual(sideNameMarksForLine(plain, markSeats), []);
  }
});

test('a blank home is the seat id in a hex sentence and in its mark', () => {
  const blankSeats = [
    { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
    { seatId: 'opponent2', seatOrder: 4, homeRegion: '   ' },
  ];
  const tookFrom = buildTurnReportLines({
    viewerSeatId: HUMAN_SEAT_ID,
    seats: blankSeats,
    transitions: [{ h3Index: 'a', from: 'opponent2', to: HUMAN_SEAT_ID }],
    otherLines: [],
  });
  assert.deepEqual(tookFrom, ['You took 1 hex from opponent2.']);
  const fromAt = tookFrom[0]?.indexOf('opponent2') ?? -1;
  assert.deepEqual(sideNameMarksForLine(tookFrom[0] ?? '', blankSeats), [
    { seatId: 'opponent2', start: fromAt, end: fromAt + 'opponent2'.length },
  ]);
  const lost = buildTurnReportLines({
    viewerSeatId: HUMAN_SEAT_ID,
    seats: blankSeats,
    transitions: [{ h3Index: 'b', from: HUMAN_SEAT_ID, to: 'opponent2' }],
    otherLines: [],
  });
  assert.deepEqual(lost, ['opponent2 took 1 of your hexes.']);
  assert.deepEqual(sideNameMarksForLine(lost[0] ?? '', blankSeats), [
    { seatId: 'opponent2', start: 0, end: 'opponent2'.length },
  ]);
});

test('buildTurnReportLines with a null viewer writes no You line and no fight line', () => {
  const lines = buildTurnReportLines({ ...image, viewerSeatId: null });
  assert.equal(lines.some((line) => line.startsWith('You ')), false);
  assert.equal(lines.some((line) => line.includes('fought at')), false);
});
