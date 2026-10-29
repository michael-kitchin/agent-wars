/**
 * Strike lines and who may see a launch.
 *
 * Purpose: The example sentence and the visibility rule stay fixed.
 * When to use: After changing `formatMissileStrikeLine` or `missileLaunchVisibleToViewer`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MissileLaunchRecord } from './ipc/missileTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from './seatIds';
import { formatMissileStrikeLine, missileLaunchVisibleToViewer } from './missileStrikeReport';

/**
 * A launch record with the counts a case cares about.
 *
 * Purpose: Keeps the required fields filled so each case sets only what it checks.
 * When to use: The cases in this file.
 * Expected outcome: A record aimed at `target`.
 * Exceptions: None.
 */
function record(partial: Partial<MissileLaunchRecord> & Pick<MissileLaunchRecord, 'player' | 'targetControllerId'>): MissileLaunchRecord {
  return {
    unitId: 'h1-m1',
    fromH3Index: 'from',
    targetH3Index: 'target',
    urbanBefore: 0,
    urbanDestroyed: 0,
    airportsBefore: 0,
    airportsDestroyed: 0,
    seaportsBefore: 0,
    seaportsDestroyed: 0,
    fortificationsBefore: 0,
    fortificationsDestroyed: 0,
    destroyedAirUnitIds: [],
    ...partial,
  };
}

test('formatMissileStrikeLine names the destroyed flags and a lost squadron', () => {
  const line = formatMissileStrikeLine({
    placeName: 'Osaka',
    record: record({
      player: HUMAN_SEAT_ID,
      targetControllerId: AI_SEAT_IDS[0],
      urbanBefore: 290,
      urbanDestroyed: 276,
      airportsBefore: 2,
      airportsDestroyed: 2,
      destroyedAirUnitIds: ['a2-a1'],
    }),
  });
  assert.equal(line, 'Missile strike on Osaka: 276 city cells and 2 airports destroyed; 1 squadron lost.');
});

test('formatMissileStrikeLine counts fortifications after city cells', () => {
  const line = formatMissileStrikeLine({
    placeName: 'Vienna',
    record: record({
      player: HUMAN_SEAT_ID,
      targetControllerId: AI_SEAT_IDS[0],
      urbanBefore: 21,
      urbanDestroyed: 9,
      fortificationsBefore: 12,
      fortificationsDestroyed: 10,
    }),
  });
  assert.equal(line, 'Missile strike on Vienna: 9 city cells and 10 fortifications destroyed.');
});

test('formatMissileStrikeLine says when the hex had nothing to destroy', () => {
  const line = formatMissileStrikeLine({
    placeName: 'Osaka',
    record: record({ player: HUMAN_SEAT_ID, targetControllerId: null }),
  });
  assert.equal(line, 'Missile strike on Osaka: nothing there to destroy.');
});

test('formatMissileStrikeLine uses singular nouns for one of each and plural squadrons', () => {
  const line = formatMissileStrikeLine({
    placeName: 'Osaka',
    record: record({
      player: HUMAN_SEAT_ID,
      targetControllerId: null,
      urbanBefore: 1,
      urbanDestroyed: 1,
      airportsBefore: 1,
      airportsDestroyed: 0,
      seaportsBefore: 1,
      seaportsDestroyed: 1,
      destroyedAirUnitIds: ['a1', 'a2'],
    }),
  });
  assert.equal(
    line,
    'Missile strike on Osaka: 1 city cell, 0 airports, and 1 seaport destroyed; 2 squadrons lost.'
  );
});

test('missileLaunchVisibleToViewer allows an omniscient viewer, the launcher, the controller, and a seen hex', () => {
  const launch = record({ player: HUMAN_SEAT_ID, targetControllerId: AI_SEAT_IDS[0], targetH3Index: 'target' });
  assert.equal(missileLaunchVisibleToViewer(launch, null, new Set()), true);
  assert.equal(missileLaunchVisibleToViewer(launch, HUMAN_SEAT_ID, new Set()), true);
  assert.equal(missileLaunchVisibleToViewer(launch, AI_SEAT_IDS[0], new Set()), true);
  const hidden = record({ player: AI_SEAT_IDS[1], targetControllerId: AI_SEAT_IDS[2], targetH3Index: 'target' });
  assert.equal(missileLaunchVisibleToViewer(hidden, HUMAN_SEAT_ID, new Set(['target'])), true);
  assert.equal(missileLaunchVisibleToViewer(hidden, HUMAN_SEAT_ID, new Set()), false);
});
