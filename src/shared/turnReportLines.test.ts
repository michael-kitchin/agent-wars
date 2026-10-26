/**
 * Hex sentences for the turn report.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiSeatIdForIndex, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';
import { hexChangeLinesByOwner, sideNameMarksForLine, type TurnReportSeat } from './turnReportLines';

const western = 'opponent';
const eastern = aiSeatIdForIndex(2);
const seats: TurnReportSeat[] = [
  { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
  { seatId: western, seatOrder: 2, homeRegion: 'Western Turkey' },
  { seatId: eastern, seatOrder: 3, homeRegion: 'Eastern Turkey' },
];

test('hex sentences total the turn and name the other sides once, in name order', () => {
  const lines = hexChangeLinesByOwner({
    viewerSeatId: HUMAN_SEAT_ID,
    seats,
    transitions: [
      { h3Index: 'a', from: HUMAN_SEAT_ID, to: western },
      { h3Index: 'b', from: HUMAN_SEAT_ID, to: eastern },
      { h3Index: 'c', from: HUMAN_SEAT_ID, to: western },
      { h3Index: 'd', from: eastern, to: HUMAN_SEAT_ID },
      { h3Index: 'e', from: NEUTRAL_OWNER_ID, to: HUMAN_SEAT_ID },
    ],
  });
  assert.deepEqual(lines.get(HUMAN_SEAT_ID), [
    'You lost 3 hexes to E. Turkey and W. Turkey.',
  ]);
  assert.deepEqual(lines.get(eastern), ['E. Turkey lost 1 hex to you.']);
  assert.equal(lines.has(western), false);
  assert.deepEqual(lines.get(NEUTRAL_OWNER_ID), ['Neutral lost 1 hex to you.']);
});

test('the viewer is named first in a list, ahead of alphabetical order', () => {
  const lines = hexChangeLinesByOwner({
    viewerSeatId: HUMAN_SEAT_ID,
    seats,
    transitions: [
      { h3Index: 'a', from: eastern, to: HUMAN_SEAT_ID },
      { h3Index: 'b', from: eastern, to: western },
      { h3Index: 'c', from: eastern, to: NEUTRAL_OWNER_ID },
    ],
  });
  assert.deepEqual(lines.get(eastern), ['E. Turkey lost 3 hexes to you, Neutral, and W. Turkey.']);
});

test('a null side and a flip back to the same side are skipped', () => {
  const lines = hexChangeLinesByOwner({
    viewerSeatId: HUMAN_SEAT_ID,
    seats,
    transitions: [
      { h3Index: 'a', from: null, to: HUMAN_SEAT_ID },
      { h3Index: 'b', from: HUMAN_SEAT_ID, to: null },
      { h3Index: 'c', from: eastern, to: eastern },
    ],
  });
  assert.equal(lines.size, 0);
});

test('a null viewer names every seat and writes no You', () => {
  const lines = hexChangeLinesByOwner({
    viewerSeatId: null,
    seats,
    transitions: [{ h3Index: 'a', from: eastern, to: western }],
  });
  assert.deepEqual(lines.get(eastern), ['E. Turkey lost 1 hex to W. Turkey.']);
  assert.equal(lines.has(western), false);
  for (const row of lines.values()) {
    assert.equal(row.some((line) => line.includes('You') || line.includes('you')), false);
  }
});

test('a blank home is the seat id in a hex sentence and in its mark', () => {
  const blankSeats = [
    { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
    { seatId: 'opponent2', seatOrder: 4, homeRegion: '   ' },
  ];
  const lines = hexChangeLinesByOwner({
    viewerSeatId: HUMAN_SEAT_ID,
    seats: blankSeats,
    transitions: [{ h3Index: 'a', from: 'opponent2', to: HUMAN_SEAT_ID }],
  });
  assert.equal(lines.has(HUMAN_SEAT_ID), false);
  assert.deepEqual(lines.get('opponent2'), ['opponent2 lost 1 hex to you.']);
  const lost = lines.get('opponent2')?.[0] ?? '';
  const nameAt = lost.indexOf('opponent2');
  assert.deepEqual(sideNameMarksForLine(lost, blankSeats, 'opponent2'), [
    { seatId: 'opponent2', start: nameAt, end: nameAt + 'opponent2'.length },
  ]);
});

test('sideNameMarksForLine marks every opponent and skips You, you, and Neutral', () => {
  const markSeats = [
    { seatId: western, seatOrder: 2, homeRegion: 'Western Turkey' },
    { seatId: eastern, seatOrder: 3, homeRegion: 'Eastern Turkey' },
  ];
  const sentence = 'E. Turkey lost 3 hexes to you, Neutral, and W. Turkey.';
  const easternAt = sentence.indexOf('E. Turkey');
  const westernAt = sentence.indexOf('W. Turkey');
  assert.deepEqual(sideNameMarksForLine(sentence, markSeats, eastern), [
    { seatId: eastern, start: easternAt, end: easternAt + 'E. Turkey'.length },
    { seatId: western, start: westernAt, end: westernAt + 'W. Turkey'.length },
  ]);
  const bulleted = `\u2022 ${sentence}`;
  assert.deepEqual(sideNameMarksForLine(bulleted, markSeats, eastern), [
    { seatId: eastern, start: easternAt + 2, end: easternAt + 2 + 'E. Turkey'.length },
    { seatId: western, start: westernAt + 2, end: westernAt + 2 + 'W. Turkey'.length },
  ]);
  for (const plain of ['Your Losses', 'Neutral Losses', 'You took 1 hex from Neutral.', 'Unknown battle observed in Europe.']) {
    assert.deepEqual(sideNameMarksForLine(plain, markSeats), []);
  }
});

test('a short name that contains to or from still receives its flag', () => {
  const rome = 'opponent2';
  const home = 'opponent3';
  const named = [
    { seatId: rome, seatOrder: 2, homeRegion: 'Road to Rome' },
    { seatId: home, seatOrder: 3, homeRegion: 'Far from Home' },
  ];
  const lost = 'You lost 1 hex to Road to Rome.';
  const lostAt = lost.indexOf('Road to Rome');
  assert.deepEqual(sideNameMarksForLine(lost, named, HUMAN_SEAT_ID), [
    { seatId: rome, start: lostAt, end: lostAt + 'Road to Rome'.length },
  ]);
  const took = 'Road to Rome took 1 hex from Far from Home.';
  const subjectAt = took.indexOf('Road to Rome');
  const homeAt = took.indexOf('Far from Home');
  assert.deepEqual(sideNameMarksForLine(took, named, rome), [
    { seatId: rome, start: subjectAt, end: subjectAt + 'Road to Rome'.length },
    { seatId: home, start: homeAt, end: homeAt + 'Far from Home'.length },
  ]);
});

test('a shared short name flags the section owner as the subject', () => {
  const early = 'opponent';
  const late = 'opponent3';
  const shared = [
    { seatId: early, seatOrder: 2, homeRegion: 'Eastern Turkey' },
    { seatId: late, seatOrder: 4, homeRegion: 'Eastern Turkey & Caucasus' },
  ];
  const sentence = 'E. Turkey lost 1 hex to E. Turkey.';
  assert.deepEqual(sideNameMarksForLine(sentence, shared, late), [
    { seatId: late, start: 0, end: 'E. Turkey'.length },
    { seatId: early, start: sentence.lastIndexOf('E. Turkey'), end: sentence.lastIndexOf('E. Turkey') + 'E. Turkey'.length },
  ]);
  const headerSeats = [
    { seatId: late, seatOrder: 4, homeRegion: 'Eastern Turkey' },
    { seatId: early, seatOrder: 2, homeRegion: 'Eastern Turkey' },
  ];
  const header = '## Eastern Turkey Losses';
  assert.deepEqual(sideNameMarksForLine(header, headerSeats), [
    { seatId: early, start: 3, end: 3 + 'Eastern Turkey'.length },
  ]);
});
