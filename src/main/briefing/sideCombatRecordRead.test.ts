/**
 * The record reader turns one commander's stored window into a line per other side.
 * Run with: node dist/main/briefing/sideCombatRecordRead.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary, type LostUnit } from '../../shared/lossSummary';
import { serializePlayerLossSummary } from '../../shared/lossSummaryJson';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { upsertTurnLossNote } from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { readSideCombatRecords } from './sideCombatRecordRead';

const SEAT = AI_SEAT_IDS[0];

/**
 * Builds a unit the commander lost to the human side.
 *
 * Purpose: Each case seeds losses credited to the human, the only other seat in the default match.
 * When to use: The cases below.
 * Expected outcome: An infantry unit owned by `SEAT` and credited to the human.
 * Exceptions: None.
 */
function lostToHuman(id: string): LostUnit {
  return { displayName: id, unitType: 'infantry', unitId: id, attribution: { ownerId: SEAT, lossH3Index: null, responsibleOwnerIds: [HUMAN_SEAT_ID], killerUnits: [] } };
}

/**
 * Serializes a summary with the given units in one bucket.
 *
 * Purpose: Seeds a stored loss column.
 * When to use: The cases below.
 * Expected outcome: JSON with the units in the ranged bucket, or in the other bucket when asked.
 * Exceptions: None.
 */
function json(units: LostUnit[], bucket: 'ranged' | 'other' = 'ranged'): string {
  return serializePlayerLossSummary({ ...emptyPlayerLossSummary(), [bucket]: units });
}

test('a window with no stored rows gives no records', () => {
  withSeatedTempGameDb('aw-record-read-none-', { fogOfWarEnabled: false }, () => {
    assert.equal(readSideCombatRecords(SEAT, 5).size, 0);
  });
});

test('a record counts a turn loss and a battle loss credited to a side, and names the window', () => {
  withSeatedTempGameDb('aw-record-read-', { fogOfWarEnabled: false }, () => {
    const empty = json([]);
    upsertTurnLossNote(SEAT, 'strategic', '', 1, json([lostToHuman('a1-i1')]), empty);
    upsertTurnLossNote(SEAT, 'strategic', '', 2, empty, empty);
    upsertTurnLossNote(SEAT, 'strategic', 'tb-1', 2, json([lostToHuman('a1-t1')], 'other'), empty);
    const records = readSideCombatRecords(SEAT, 3);
    const human = records.get(HUMAN_SEAT_ID);
    assert.ok(human);
    assert.ok(human.text.startsWith('Record, turns 1 to 2: h1 destroyed 2 of your units (latest turn 2): '), human.text);
    assert.equal(human.latestTurnAttackedYou, 2);
    assert.equal(records.has(SEAT), false);
  });
});

test('rows at or after the current turn are not counted', () => {
  withSeatedTempGameDb('aw-record-read-future-', { fogOfWarEnabled: false }, () => {
    upsertTurnLossNote(SEAT, 'strategic', '', 1, json([]), json([]));
    upsertTurnLossNote(SEAT, 'strategic', '', 3, json([lostToHuman('a1-i1')]), json([]));
    const human = readSideCombatRecords(SEAT, 3).get(HUMAN_SEAT_ID);
    assert.equal(human?.text, 'Record, turn 1: no losses either way.');
  });
});
