/**
 * Strike lines and who may see a launch.
 *
 * Purpose: The combined sentence and the visibility rule stay fixed.
 * When to use: After changing `formatMissileStrikeSummaryLine`, `buildMissileStrikeToastLines`, or `missileLaunchVisibleToViewer`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MissileLaunchRecord } from './ipc/missileTypes';
import { AI_SEAT_IDS, HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from './seatIds';
import {
  buildMissileStrikeToastLines,
  formatMissileStrikeSummaryLine,
  missileLaunchVisibleToViewer,
  type MissileStrikeEntry,
} from './missileStrikeReport';

/**
 * A launch record with the counts a case cares about.
 *
 * Purpose: Keeps the required fields filled so each case sets only what it checks.
 * When to use: The cases in this file.
 * Expected outcome: A record aimed at `target`, controlled by the human seat unless the case says otherwise.
 * Exceptions: None.
 */
function record(partial: Partial<MissileLaunchRecord> = {}): MissileLaunchRecord {
  return {
    unitId: 'h1-m1',
    player: HUMAN_SEAT_ID,
    fromH3Index: 'from',
    targetH3Index: 'target',
    targetControllerId: HUMAN_SEAT_ID,
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

/**
 * One strike the summary can total.
 *
 * Purpose: A case sets the counts and the hex code without repeating the record shell.
 * When to use: The summary and grouping cases.
 * Expected outcome: An entry whose record fills every count the case did not set with 0.
 * Exceptions: None.
 */
function entry(partial: Partial<MissileLaunchRecord>, hexCode: string | null): MissileStrikeEntry {
  return { record: record(partial), hexCode };
}

test('one strike names one city cell', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([entry({ urbanBefore: 3, urbanDestroyed: 1 }, 'AA')]),
    'Missile strike in AA destroyed 1 city cell.'
  );
});

test('strikes total their counts and sort their hexes', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([
      entry(
        {
          urbanBefore: 4,
          urbanDestroyed: 2,
          airportsBefore: 1,
          airportsDestroyed: 1,
          destroyedAirUnitIds: ['a1', 'a2'],
        },
        'C2'
      ),
      entry(
        {
          urbanBefore: 2,
          urbanDestroyed: 1,
          fortificationsBefore: 2,
          fortificationsDestroyed: 2,
        },
        'AA'
      ),
    ]),
    'Missile strikes in AA and C2 destroyed 3 city cells, 1 airport, and 2 fortifications; 2 squadrons lost.'
  );
});

test('a kind that was present but survived is not named', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([
      entry({ airportsBefore: 2, airportsDestroyed: 0, seaportsBefore: 1, seaportsDestroyed: 1 }, 'AA'),
    ]),
    'Missile strike in AA destroyed 1 seaport.'
  );
});

test('strikes that destroyed nothing say so', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([entry({}, 'AA'), entry({}, 'AA')]),
    'Missile strikes in AA destroyed nothing.'
  );
});

test('the same hex struck twice sums', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([
      entry({ urbanBefore: 1, urbanDestroyed: 1 }, 'AA'),
      entry({ urbanBefore: 2, urbanDestroyed: 2 }, 'AA'),
    ]),
    'Missile strikes in AA destroyed 3 city cells.'
  );
});

test('flags that were present and all survived say nothing was destroyed', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([entry({ airportsBefore: 2, airportsDestroyed: 0 }, 'AA')]),
    'Missile strike in AA destroyed nothing.'
  );
});

test('two missing codes are named once and both counts still add', () => {
  assert.equal(
    formatMissileStrikeSummaryLine([
      entry({ urbanBefore: 1, urbanDestroyed: 1, destroyedAirUnitIds: ['a1'] }, null),
      entry({ seaportsBefore: 1, seaportsDestroyed: 1, destroyedAirUnitIds: ['a2'] }, null),
    ]),
    'Missile strikes in an unidentified hex destroyed 1 city cell and 1 seaport; 2 squadrons lost.'
  );
});

test('no strikes give no sentence', () => {
  assert.equal(formatMissileStrikeSummaryLine([]), null);
});

test('toast lines group by seat and share one line for neutral and uncontrolled hexes', () => {
  const city = { urbanBefore: 1, urbanDestroyed: 1 };
  assert.deepEqual(
    buildMissileStrikeToastLines([
      entry({ ...city, targetControllerId: HUMAN_SEAT_ID }, 'AA'),
      entry({ ...city, targetControllerId: AI_SEAT_IDS[0] }, 'C2'),
      entry({ ...city, targetControllerId: HUMAN_SEAT_ID }, 'E5'),
      entry({ ...city, targetControllerId: NEUTRAL_OWNER_ID }, 'G1'),
      entry({ ...city, targetControllerId: null }, 'H2'),
    ]),
    [
      { controllerId: HUMAN_SEAT_ID, line: 'Missile strikes in AA and E5 destroyed 2 city cells.' },
      { controllerId: AI_SEAT_IDS[0], line: 'Missile strike in C2 destroyed 1 city cell.' },
      { controllerId: null, line: 'Missile strikes in G1 and H2 destroyed 2 city cells.' },
    ]
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
