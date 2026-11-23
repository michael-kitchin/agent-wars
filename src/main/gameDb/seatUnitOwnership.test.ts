/**
 * Ownership reads and stale standing-order cleanup.
 * Run: `npm run build:main` then `node dist/main/gameDb/seatUnitOwnership.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { dbGetAll, dbGetOne, dbRun } from '../gameDb';
import { gameDbOps } from './dbConnection';
import { deleteStandingOrdersForUnitsNotOwned, listUnitIdsOwnedBy } from './seatUnitOwnership';
import { insertUnitRow } from './unitInsert';

/**
 * A unit row of the given owner.
 *
 * Purpose: The cases need owned and Neutral units.
 * When to use: `insertUnitRow`.
 * Expected outcome: An infantry row on the given hex.
 * Exceptions: None.
 */
function unitRow(id: string, player: string, h3Index: string) {
  return { id, player, unitType: 'infantry' as const, displayOrder: 900, h3Index, origin: null, formedTurn: 1, isMercenary: false };
}

test('listUnitIdsOwnedBy returns exactly the seat units', () => {
  withTempGameDb('aw-own-list-', () => {
    const h3 = dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM res_s_control LIMIT 1')?.h3Index;
    assert.ok(h3);
    const before = dbGetAll<{ id: string }>('SELECT id FROM units WHERE player = ?', [HUMAN_SEAT_ID]).map((row) => row.id);
    insertUnitRow(dbRun, unitRow('own-1', HUMAN_SEAT_ID, h3));
    insertUnitRow(dbRun, unitRow('own-n1', NEUTRAL_OWNER_ID, h3));
    const owned = listUnitIdsOwnedBy(gameDbOps, HUMAN_SEAT_ID);
    assert.deepEqual([...owned].sort(), [...before, 'own-1'].sort());
    assert.equal(owned.has('own-n1'), false);
  });
});

test('deleteStandingOrdersForUnitsNotOwned removes only rows for units the seat lost', () => {
  withTempGameDb('aw-own-delete-', () => {
    const h3 = dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM res_s_control LIMIT 1')?.h3Index;
    assert.ok(h3);
    insertUnitRow(dbRun, unitRow('own-2', HUMAN_SEAT_ID, h3));
    insertUnitRow(dbRun, unitRow('own-n2', NEUTRAL_OWNER_ID, h3));
    for (const unitId of ['own-2', 'own-n2']) {
      dbRun(
        `INSERT INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
         VALUES (?, ?, 'march', '{}', 'active', 1, ?)`,
        [HUMAN_SEAT_ID, unitId, h3]
      );
    }
    assert.equal(deleteStandingOrdersForUnitsNotOwned(gameDbOps, HUMAN_SEAT_ID), 1);
    const left = dbGetAll<{ unitId: string }>('SELECT unit_id AS unitId FROM standing_orders WHERE player_id = ?', [HUMAN_SEAT_ID]);
    assert.deepEqual(left.map((row) => row.unitId), ['own-2']);
    assert.equal(deleteStandingOrdersForUnitsNotOwned(gameDbOps, HUMAN_SEAT_ID), 0);
  });
});
