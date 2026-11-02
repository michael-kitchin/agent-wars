import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';
import {
  formatHexControlLabel,
  formatHomeChip,
  formatUnitNameForViewer,
  homeSeatIdsAtHex,
  viewerSeatIdForRoster,
  type SideLabelSeat,
} from './sideLabels';

/**
 * A seat row for label tests.
 *
 * Purpose: Only the fields the label functions read.
 * When to use: The cases in this file.
 * Expected outcome: An active seat unless `outTurn` is set.
 * Exceptions: None.
 */
function seat(
  seatId: SideLabelSeat['seatId'],
  seatOrder: number,
  homeRegion: string,
  outTurn: number | null = null,
  nickname: string | null = null
): SideLabelSeat {
  return { seatId, seatOrder, homeRegion, outTurn, nickname, kind: seatId === HUMAN_SEAT_ID ? 'human' : 'ai' };
}

const twoSeats = [
  seat(HUMAN_SEAT_ID, 1, 'Iraq & Kuwait'),
  seat(AI_SEAT_IDS[0], 2, 'Western Turkey'),
];

const threeSeats = [
  ...twoSeats,
  seat(AI_SEAT_IDS[1], 3, 'Southern Asia', 4),
];

test('control labels use short names, and a home suffix only when the hex is a home', () => {
  assert.equal(
    formatHexControlLabel({
      controllerId: HUMAN_SEAT_ID,
      homeSeatIds: [HUMAN_SEAT_ID],
      seats: twoSeats,
    }),
    'Human (home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: AI_SEAT_IDS[0],
      homeSeatIds: [AI_SEAT_IDS[0]],
      seats: twoSeats,
    }),
    'W. Turkey (home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: HUMAN_SEAT_ID,
      homeSeatIds: [AI_SEAT_IDS[0]],
      seats: twoSeats,
    }),
    'Human (W. Turkey home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: AI_SEAT_IDS[0],
      homeSeatIds: [],
      seats: twoSeats,
    }),
    'W. Turkey'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: null,
      homeSeatIds: [],
      seats: twoSeats,
    }),
    'Neutral'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: NEUTRAL_OWNER_ID,
      homeSeatIds: [AI_SEAT_IDS[1]],
      seats: threeSeats,
    }),
    'Neutral (S. Asia home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: AI_SEAT_IDS[1],
      homeSeatIds: [AI_SEAT_IDS[1]],
      seats: threeSeats,
    }),
    'S. Asia (home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: AI_SEAT_IDS[0],
      homeSeatIds: [AI_SEAT_IDS[0], HUMAN_SEAT_ID],
      seats: twoSeats,
    }),
    'W. Turkey (Human & W. Turkey homes)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: HUMAN_SEAT_ID,
      homeSeatIds: [AI_SEAT_IDS[0]],
      seats: [
        seat(HUMAN_SEAT_ID, 1, 'Western Turkey'),
        seat(AI_SEAT_IDS[0], 2, 'Western Turkey'),
      ],
    }),
    'Human (W. Turkey home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: HUMAN_SEAT_ID,
      homeSeatIds: [AI_SEAT_IDS[1]],
      seats: twoSeats,
    }),
    'Human'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: 'not-a-seat',
      homeSeatIds: [],
      seats: twoSeats,
    }),
    'Neutral'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: HUMAN_SEAT_ID,
      homeSeatIds: [HUMAN_SEAT_ID],
      seats: [seat(HUMAN_SEAT_ID, 1, '   ')],
    }),
    'Human (home)'
  );
  assert.equal(
    formatHexControlLabel({
      controllerId: AI_SEAT_IDS[1],
      homeSeatIds: [],
      seats: twoSeats,
    }),
    AI_SEAT_IDS[1]
  );
});

test('unit names stay plain for the viewer, for Neutral, and in a two-seat match', () => {
  assert.equal(
    formatUnitNameForViewer({
      baseName: 'XI Armored',
      ownerId: AI_SEAT_IDS[0],
      viewerSeatId: HUMAN_SEAT_ID,
      seats: twoSeats,
    }),
    'XI Armored'
  );
  assert.equal(
    formatUnitNameForViewer({
      baseName: '1st Infantry',
      ownerId: HUMAN_SEAT_ID,
      viewerSeatId: HUMAN_SEAT_ID,
      seats: threeSeats,
    }),
    '1st Infantry'
  );
  assert.equal(
    formatUnitNameForViewer({
      baseName: 'XI Armored',
      ownerId: AI_SEAT_IDS[0],
      viewerSeatId: HUMAN_SEAT_ID,
      seats: threeSeats,
    }),
    'W. Turkey · XI Armored'
  );
  assert.equal(
    formatUnitNameForViewer({
      baseName: 'II Infantry',
      ownerId: NEUTRAL_OWNER_ID,
      viewerSeatId: HUMAN_SEAT_ID,
      seats: twoSeats,
    }),
    'II Infantry'
  );
  assert.equal(
    formatUnitNameForViewer({
      baseName: 'XI Armored',
      ownerId: AI_SEAT_IDS[0],
      viewerSeatId: null,
      seats: threeSeats,
    }),
    'W. Turkey · XI Armored'
  );
});

test('a nickname replaces the short home name on the control line, the unit prefix, and the home chip', () => {
  const named = threeSeats.map((row) => (
    row.seatId === AI_SEAT_IDS[0] ? seat(AI_SEAT_IDS[0], row.seatOrder, 'Western Turkey', row.outTurn, 'Grok') : row
  ));
  assert.equal(
    formatHexControlLabel({ controllerId: AI_SEAT_IDS[0], homeSeatIds: [], seats: named }),
    'Grok'
  );
  assert.equal(
    formatUnitNameForViewer({
      baseName: 'XI Armored',
      ownerId: AI_SEAT_IDS[0],
      viewerSeatId: HUMAN_SEAT_ID,
      seats: named,
    }),
    'Grok · XI Armored'
  );
  assert.deepEqual(
    formatHomeChip({
      homeSeatIds: [AI_SEAT_IDS[0]],
      controllerId: AI_SEAT_IDS[0],
      viewerSeatId: HUMAN_SEAT_ID,
      seats: named,
    }),
    { kind: 'enemy-home', text: 'Grok home' }
  );
});

test('home chips and home-seat lookup follow the roster', () => {
  assert.deepEqual(
    formatHomeChip({
      homeSeatIds: [HUMAN_SEAT_ID],
      controllerId: HUMAN_SEAT_ID,
      viewerSeatId: HUMAN_SEAT_ID,
      seats: twoSeats,
    }),
    { kind: 'home', text: 'Home' }
  );
  assert.deepEqual(
    formatHomeChip({
      homeSeatIds: [AI_SEAT_IDS[0]],
      controllerId: AI_SEAT_IDS[0],
      viewerSeatId: HUMAN_SEAT_ID,
      seats: twoSeats,
    }),
    { kind: 'enemy-home', text: 'W. Turkey home' }
  );
  assert.deepEqual(
    formatHomeChip({
      homeSeatIds: [],
      controllerId: NEUTRAL_OWNER_ID,
      viewerSeatId: HUMAN_SEAT_ID,
      seats: twoSeats,
    }),
    { kind: 'enemy-home', text: 'Neutral' }
  );
  assert.equal(
    formatHomeChip({
      homeSeatIds: [],
      controllerId: HUMAN_SEAT_ID,
      viewerSeatId: HUMAN_SEAT_ID,
      seats: twoSeats,
    }),
    null
  );
  assert.deepEqual(homeSeatIdsAtHex('shared', {
    homeRegionHexesBySeat: {
      [HUMAN_SEAT_ID]: ['shared'],
      [AI_SEAT_IDS[0]]: ['shared', 'ai'],
    },
  }), [HUMAN_SEAT_ID, AI_SEAT_IDS[0]]);
  assert.deepEqual(homeSeatIdsAtHex('human-only', {
    homeRegionHexesBySeat: { [HUMAN_SEAT_ID]: ['human-only'] },
  }), [HUMAN_SEAT_ID]);
  assert.equal(viewerSeatIdForRoster([{ seatId: AI_SEAT_IDS[0], kind: 'ai' }]), null);
  assert.equal(
    viewerSeatIdForRoster([{ seatId: HUMAN_SEAT_ID, kind: 'human' }]),
    HUMAN_SEAT_ID
  );
});
