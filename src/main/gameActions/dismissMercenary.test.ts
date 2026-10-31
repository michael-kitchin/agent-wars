/**
 * Dismiss converts a human mercenary the way desertion does, and refuses the other cases.
 *
 * Purpose: The selection panel and payroll share this conversion.
 * When to use: After changing `executeDismissMercenary`.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DISMISS_REASON_EMBARKED,
  DISMISS_REASON_MISSING,
  DISMISS_REASON_NOT_ACTIVE,
  DISMISS_REASON_NOT_MERCENARY,
  DISMISS_REASON_NOT_PLANNING,
  DISMISS_REASON_NOT_YOURS,
  DISMISS_REASON_TACTICAL,
} from '../../shared/mercenaryDismiss';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetOne, dbRun } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { readMercenaryFunds } from '../gameDb/mercenaryEconomyRead';
import { setTreasuryCredits } from '../gameDb/mercenaryState';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { setActiveTacticalBattleSnapshotRef } from '../tacticalBattle/activeTacticalBattleRef';
import { executeDismissMercenary } from './dismissMercenary';
import { transferNeutralUnitToSeat } from './unitOwnershipTransfer';

test('executeDismissMercenary converts one mercenary and leaves the treasury and a sibling', () => {
  withTempGameDb('aw-dismiss-one-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, unitRow('h1-d1', h3, 'infantry', true));
    insertUnitRow(dbRun, unitRow('h1-d2', h3, 'infantry', true));
    setTreasuryCredits(gameDbOps, HUMAN_SEAT_ID, 25);
    dbRun(
      `INSERT INTO standing_orders (player_id, unit_id, order_type, params, status, created_turn, origin_hex)
       VALUES (?, 'h1-d1', 'march', '{}', 'active', 1, ?)`,
      [HUMAN_SEAT_ID, h3]
    );
    const before = readMercenaryFunds(gameDbOps, HUMAN_SEAT_ID);
    const result = executeDismissMercenary(HUMAN_SEAT_ID, 'h1-d1');
    assert.deepEqual(result, { success: true, unitIds: ['h1-d1'] });
    const converted = ownerOf('h1-d1');
    assert.equal(converted?.player, NEUTRAL_OWNER_ID);
    assert.equal(converted?.mercenary, 0);
    const sibling = ownerOf('h1-d2');
    assert.equal(sibling?.player, HUMAN_SEAT_ID);
    assert.equal(sibling?.mercenary, 1);
    const after = readMercenaryFunds(gameDbOps, HUMAN_SEAT_ID);
    assert.equal(after.credits, 25);
    assert.equal(before.credits, 25);
    assert.equal(after.mercenaryCount, before.mercenaryCount - 1);
    assert.ok(after.upkeepPerTurn < before.upkeepPerTurn);
    assert.equal(
      dbGetOne('SELECT unit_id AS unitId FROM standing_orders WHERE player_id = ? AND unit_id = ?', [HUMAN_SEAT_ID, 'h1-d1']),
      undefined
    );
    const defend = dbGetOne<{ orderType: string }>(
      'SELECT order_type AS orderType FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      [NEUTRAL_OWNER_ID, 'h1-d1']
    );
    assert.equal(defend?.orderType, 'defend');
    transferNeutralUnitToSeat('h1-d1', HUMAN_SEAT_ID);
    const rehired = ownerOf('h1-d1');
    assert.equal(rehired?.player, HUMAN_SEAT_ID);
    assert.equal(rehired?.mercenary, 1);
  });
});

test('executeDismissMercenary converts a loaded ship with its cargo and keeps the assignments', () => {
  withTempGameDb('aw-dismiss-ship-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, unitRow('h1-d910', h3, 'naval', true));
    insertUnitRow(dbRun, unitRow('h1-d911', h3, 'infantry', false));
    insertUnitRow(dbRun, unitRow('h1-d912', h3, 'infantry', true));
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['h1-d911', 'h1-d910']);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['h1-d912', 'h1-d910']);
    const result = executeDismissMercenary(HUMAN_SEAT_ID, 'h1-d910');
    assert.deepEqual(result, { success: true, unitIds: ['h1-d910', 'h1-d911', 'h1-d912'] });
    for (const id of ['h1-d910', 'h1-d911', 'h1-d912']) {
      const row = ownerOf(id);
      assert.equal(row?.player, NEUTRAL_OWNER_ID);
      assert.equal(row?.mercenary, 0);
    }
    const assignments = [
      dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ? AND naval_unit_id = ?', ['h1-d911', 'h1-d910']),
      dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ? AND naval_unit_id = ?', ['h1-d912', 'h1-d910']),
    ];
    assert.ok(assignments[0]);
    assert.ok(assignments[1]);
    assert.throws(() => transferNeutralUnitToSeat('h1-d910', HUMAN_SEAT_ID));
  });
});

test('executeDismissMercenary refuses a regular unit, another seat, a missing id, cargo, resolution, and a knocked-out seat', () => {
  withTempGameDb('aw-dismiss-refuse-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, unitRow('h1-r1', h3, 'infantry', false));
    assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'h1-r1'), { success: false, reason: DISMISS_REASON_NOT_MERCENARY });
    assert.equal(ownerOf('h1-r1')?.player, HUMAN_SEAT_ID);

    insertUnitRow(dbRun, { ...unitRow('o1-d1', h3, 'infantry', true), player: 'opponent' });
    assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'o1-d1'), { success: false, reason: DISMISS_REASON_NOT_YOURS });
    assert.equal(ownerOf('o1-d1')?.player, 'opponent');

    insertUnitRow(dbRun, unitRow('h1-d3', h3, 'infantry', true));
    assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'missing-unit'), { success: false, reason: DISMISS_REASON_MISSING });
    assert.equal(ownerOf('h1-d3')?.mercenary, 1);

    insertUnitRow(dbRun, unitRow('h1-e2', h3, 'naval', false));
    insertUnitRow(dbRun, unitRow('h1-e1', h3, 'infantry', true));
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['h1-e1', 'h1-e2']);
    assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'h1-e1'), { success: false, reason: DISMISS_REASON_EMBARKED });
    assert.equal(ownerOf('h1-e1')?.player, HUMAN_SEAT_ID);
    assert.equal(ownerOf('h1-e1')?.mercenary, 1);

    dbRun("UPDATE turn_state SET phase = 'resolution' WHERE id = 1");
    assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'h1-d3'), { success: false, reason: DISMISS_REASON_NOT_PLANNING });
    assert.equal(ownerOf('h1-d3')?.player, HUMAN_SEAT_ID);
    assert.equal(ownerOf('h1-d3')?.mercenary, 1);
    dbRun("UPDATE turn_state SET phase = 'planning' WHERE id = 1");

    dbRun("UPDATE seats SET out_turn = 1 WHERE seat_id = 'human'");
    assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'h1-d3'), { success: false, reason: DISMISS_REASON_NOT_ACTIVE });
    assert.equal(ownerOf('h1-d3')?.player, HUMAN_SEAT_ID);
    assert.equal(ownerOf('h1-d3')?.mercenary, 1);
  });
});

test('executeDismissMercenary refuses while a tactical battle is active', () => {
  withTempGameDb('aw-dismiss-tactical-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, unitRow('h1-d4', h3, 'infantry', true));
    setActiveTacticalBattleSnapshotRef({ battleId: 'dismiss-test' } as TacticalBattleSnapshot);
    try {
      assert.deepEqual(executeDismissMercenary(HUMAN_SEAT_ID, 'h1-d4'), { success: false, reason: DISMISS_REASON_TACTICAL });
      assert.equal(ownerOf('h1-d4')?.player, HUMAN_SEAT_ID);
      assert.equal(ownerOf('h1-d4')?.mercenary, 1);
    } finally {
      setActiveTacticalBattleSnapshotRef(null);
    }
  });
});

/**
 * A human-controlled hex.
 *
 * Purpose: Inserts need a real hex.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: The hex index.
 * Exceptions: Throws when the seeded map has no human-controlled hex.
 */
function humanHex(): string {
  const hex = dbGetOne<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res_s_control WHERE controller_player_id = ? LIMIT 1',
    [HUMAN_SEAT_ID]
  )?.h3Index;
  assert.ok(hex);
  return hex;
}

/**
 * Owner and mercenary flag for one unit.
 *
 * Purpose: The cases assert the row after a dismiss.
 * When to use: After `executeDismissMercenary`.
 * Expected outcome: The stored player and flag, or undefined when the id is missing.
 * Exceptions: None.
 */
function ownerOf(id: string): { player: string; mercenary: number } | undefined {
  return dbGetOne<{ player: string; mercenary: number }>(
    'SELECT player, is_mercenary AS mercenary FROM units WHERE id = ?',
    [id]
  );
}

/**
 * A unit row on a human hex.
 *
 * Purpose: The dismiss cases start from a known unit.
 * When to use: `insertUnitRow`.
 * Expected outcome: A human unit of the given type. `mercenary` sets `is_mercenary`.
 * Exceptions: None.
 */
function unitRow(id: string, h3Index: string, unitType: 'infantry' | 'naval', mercenary: boolean) {
  return {
    id,
    player: HUMAN_SEAT_ID,
    unitType,
    displayOrder: 900,
    h3Index,
    origin: null,
    formedTurn: 1,
    isMercenary: mercenary,
  };
}
