/**
 * Loss sections for the turn-update popup.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary } from './lossSummary';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';
import { buildTurnLossSections, lossSectionOwnerId } from './turnLossSections';

const western = 'opponent';

test('the viewer section comes before the other side, and a cause line names the unit', () => {
  const lines = buildTurnLossSections(
    {
      byOwner: {
        [HUMAN_SEAT_ID]: { ...emptyPlayerLossSummary(), ranged: [{ unitType: 'infantry', displayName: '1st Infantry' }] },
        [western]: { ...emptyPlayerLossSummary(), melee: [{ unitType: 'armor', displayName: '1st Armor' }] },
      },
    },
    HUMAN_SEAT_ID,
    [
      { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
      { seatId: western, seatOrder: 2, homeRegion: 'Western Turkey' },
    ]
  );
  assert.equal(lines[0], '## Your Losses');
  assert.equal(lines[1], 'Ranged attack: 1st Infantry');
  assert.ok(lines.indexOf('## Western Turkey Losses') > lines.indexOf('## Your Losses'));
});

test('a null viewer uses the full home name, empty buckets are omitted, and Neutral is last', () => {
  const lines = buildTurnLossSections(
    {
      byOwner: {
        [HUMAN_SEAT_ID]: { ...emptyPlayerLossSummary(), ranged: [{ unitType: 'infantry', displayName: '1st Infantry' }] },
        [western]: emptyPlayerLossSummary(),
        [NEUTRAL_OWNER_ID]: { ...emptyPlayerLossSummary(), other: [{ unitType: 'infantry', displayName: 'Garrison' }] },
      },
    },
    null,
    [
      { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
      { seatId: western, seatOrder: 2, homeRegion: 'Western Turkey' },
    ]
  );
  assert.equal(lines.includes('## Your Losses'), false);
  assert.equal(lines.includes('## Western Turkey Losses'), false);
  assert.ok(lines.indexOf('## Levant Losses') >= 0);
  assert.ok(lines.indexOf('## Neutral Losses') > lines.indexOf('## Levant Losses'));
});

test('a blank home name uses the seat id', () => {
  const lines = buildTurnLossSections(
    {
      byOwner: {
        [western]: { ...emptyPlayerLossSummary(), ranged: [{ unitType: 'infantry', displayName: '1st Infantry' }] },
      },
    },
    null,
    [{ seatId: western, seatOrder: 1, homeRegion: '   ' }]
  );
  assert.equal(lines[0], '## opponent Losses');
});

test('lossSectionOwnerId reads the header and breaks a shared name by seat order', () => {
  const roster = [
    { seatId: HUMAN_SEAT_ID, seatOrder: 1, homeRegion: 'Levant' },
    { seatId: 'opponent2', seatOrder: 3, homeRegion: 'Eastern Turkey' },
    { seatId: western, seatOrder: 2, homeRegion: 'Eastern Turkey' },
  ];
  assert.equal(lossSectionOwnerId('Your Losses', HUMAN_SEAT_ID, roster), HUMAN_SEAT_ID);
  assert.equal(lossSectionOwnerId('Your Losses', null, roster), null);
  assert.equal(lossSectionOwnerId('Neutral Losses', HUMAN_SEAT_ID, roster), NEUTRAL_OWNER_ID);
  assert.equal(lossSectionOwnerId('Eastern Turkey Losses', null, roster), western);
  assert.equal(lossSectionOwnerId('Updates', HUMAN_SEAT_ID, roster), null);
});
