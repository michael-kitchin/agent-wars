/**
 * The strategic loss window reads battle losses once per unit and only for the turns asked.
 * Run with: node dist/main/briefing/strategicLossWindow.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary, type LostUnit } from '../../shared/lossSummary';
import { serializePlayerLossSummary } from '../../shared/lossSummaryJson';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { upsertTurnLossNote, type TurnNoteRow } from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { readStrategicBattleLossesByTurn } from './strategicLossWindow';

const SEAT = AI_SEAT_IDS[0];

/**
 * Builds one lost unit.
 *
 * Purpose: Each case needs units with ids and an owner.
 * When to use: The cases below.
 * Expected outcome: An armor unit whose attribution names `owner`.
 * Exceptions: None.
 */
function unit(id: string, owner: string): LostUnit {
  return {
    displayName: id,
    unitType: 'armor',
    unitId: id,
    attribution: { ownerId: owner, lossH3Index: 'hA', responsibleOwnerIds: ['human'], killerUnits: [] },
  };
}

/**
 * Serializes one summary with units in the `other` bucket.
 *
 * Purpose: Battle rows and the turn's own row both store units there in these cases.
 * When to use: Seeding rows.
 * Expected outcome: JSON for a summary with only the `other` bucket filled.
 * Exceptions: None.
 */
function jsonOf(units: LostUnit[]): string {
  return serializePlayerLossSummary({ ...emptyPlayerLossSummary(), other: units });
}

/**
 * Builds the turn row a prompt window would hold.
 *
 * Purpose: The helper takes the window's rows, not the database's.
 * When to use: The cases below.
 * Expected outcome: A row with no strategy and the given loss columns.
 * Exceptions: None.
 */
function windowRow(turnNumber: number, own: string | null = null, other: string | null = null): TurnNoteRow {
  return { turnNumber, strategyText: null, aiLossJson: own, humanLossJson: other };
}

test('a battle row\'s units come back under their turn', () => {
  withSeatedTempGameDb('aw-loss-window-', { fogOfWarEnabled: false }, () => {
    upsertTurnLossNote(SEAT, 'strategic', 'tb-1', 3, jsonOf([unit('a1-t1', SEAT)]), jsonOf([unit('h1-t1', 'human')]));
    const byTurn = readStrategicBattleLossesByTurn(SEAT, [windowRow(2), windowRow(3)]);
    assert.deepEqual(byTurn.get(3)?.map((lost) => lost.unitId), ['a1-t1', 'h1-t1']);
    assert.equal(byTurn.has(2), false);
  });
});

test('a unit already in the turn\'s own row is dropped, and a repeat across battles prints once', () => {
  withSeatedTempGameDb('aw-loss-window-dup-', { fogOfWarEnabled: false }, () => {
    upsertTurnLossNote(SEAT, 'strategic', 'tb-1', 3, jsonOf([unit('a1-t1', SEAT), unit('a1-t2', SEAT)]), jsonOf([]));
    upsertTurnLossNote(SEAT, 'strategic', 'tb-2', 3, jsonOf([unit('a1-t2', SEAT)]), jsonOf([]));
    const own = jsonOf([unit('a1-t1', SEAT)]);
    const byTurn = readStrategicBattleLossesByTurn(SEAT, [windowRow(3, own, null)]);
    assert.deepEqual(byTurn.get(3)?.map((lost) => lost.unitId), ['a1-t2']);
  });
});

test('a turn outside the window is not read', () => {
  withSeatedTempGameDb('aw-loss-window-turns-', { fogOfWarEnabled: false }, () => {
    upsertTurnLossNote(SEAT, 'strategic', 'tb-1', 5, jsonOf([unit('a1-t1', SEAT)]), jsonOf([]));
    assert.equal(readStrategicBattleLossesByTurn(SEAT, [windowRow(3)]).size, 0);
  });
});
