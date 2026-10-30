/**
 * Neutral conversion and rehire keep the mercenary flag and the standing orders consistent.
 *
 * Purpose: Knockout and hiring share these helpers.
 * When to use: After changing `convertUnitsToNeutral` or `transferNeutralUnitToSeat`.
 * Expected outcome: The cases below. Each case removes its temporary match.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { buildLatLngCoordinateMap } from '../mapData';
import { dbGetAll, dbGetOne, dbRun, getGameState } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { convertUnitsToNeutral, transferNeutralUnitToSeat } from './unitOwnershipTransfer';

test('convertUnitsToNeutral clears the mercenary flag and leaves another unit', () => {
  withTempGameDb('aw-own-convert-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, mercenaryRow('h1-i940', h3));
    insertUnitRow(dbRun, { ...mercenaryRow('h1-i941', h3), isMercenary: false });
    dbRun('BEGIN');
    try {
      const converted = convertUnitsToNeutral(['h1-i940'], coordinates());
      assert.equal(converted, 1);
      dbRun('COMMIT');
    } catch (err) {
      dbRun('ROLLBACK');
      throw err;
    }
    const converted = dbGetOne<{ player: string; mercenary: number }>(
      'SELECT player, is_mercenary AS mercenary FROM units WHERE id = ?',
      ['h1-i940']
    );
    assert.equal(converted?.player, NEUTRAL_OWNER_ID);
    assert.equal(converted?.mercenary, 0);
    const order = dbGetOne<{ orderType: string }>(
      'SELECT order_type AS orderType FROM standing_orders WHERE unit_id = ? AND player_id = ?',
      ['h1-i940', NEUTRAL_OWNER_ID]
    );
    assert.equal(order?.orderType, 'defend');
    const other = dbGetOne<{ player: string; mercenary: number }>(
      'SELECT player, is_mercenary AS mercenary FROM units WHERE id = ?',
      ['h1-i941']
    );
    assert.equal(other?.player, HUMAN_SEAT_ID);
    assert.equal(other?.mercenary, 0);
  });
});

test('transferNeutralUnitToSeat makes the unit a mercenary and clears its Neutral order', () => {
  withTempGameDb('aw-own-transfer-', () => {
    const h3 = humanHex();
    insertUnitRow(dbRun, mercenaryRow('h1-i942', h3));
    dbRun('BEGIN');
    convertUnitsToNeutral(['h1-i942'], coordinates());
    dbRun(
      `INSERT INTO player_unit_intel (player_id, enemy_unit_id, last_known_h3_index, intel_state, last_seen_turn)
       VALUES (?, 'h1-i942', ?, 'stale', 1)`,
      [HUMAN_SEAT_ID, h3]
    );
    const used = new Set(
      dbGetAll<{ displayOrder: number }>(
        "SELECT display_order AS displayOrder FROM units WHERE player = 'human' AND unit_type = 'infantry' AND display_order IS NOT NULL"
      ).map((row) => row.displayOrder)
    );
    transferNeutralUnitToSeat('h1-i942', HUMAN_SEAT_ID);
    dbRun('COMMIT');
    const hired = dbGetOne<{ player: string; mercenary: number; displayOrder: number }>(
      'SELECT player, is_mercenary AS mercenary, display_order AS displayOrder FROM units WHERE id = ?',
      ['h1-i942']
    );
    assert.equal(hired?.player, HUMAN_SEAT_ID);
    assert.equal(hired?.mercenary, 1);
    assert.equal(used.has(hired?.displayOrder ?? -1), false);
    assert.equal(
      dbGetOne('SELECT unit_id AS unitId FROM standing_orders WHERE unit_id = ?', ['h1-i942']),
      undefined
    );
    assert.equal(
      dbGetOne(
        'SELECT enemy_unit_id AS unitId FROM player_unit_intel WHERE player_id = ? AND enemy_unit_id = ?',
        [HUMAN_SEAT_ID, 'h1-i942']
      ),
      undefined
    );
  });
});

test('transferNeutralUnitToSeat rejects a seat-owned unit', () => {
  withTempGameDb('aw-own-reject-', () => {
    const h3 = humanHex();
    const existing = getGameState().units.find((unit) => unit.player === HUMAN_SEAT_ID);
    assert.ok(existing);
    void h3;
    assert.throws(() => transferNeutralUnitToSeat(existing.id, HUMAN_SEAT_ID));
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
 * Centers for defend orders.
 *
 * Purpose: Neutral conversion assigns a defend order on the unit's hex.
 * When to use: Inside `withTempGameDb`.
 * Expected outcome: A coordinate map for every hex.
 * Exceptions: None.
 */
function coordinates(): ReturnType<typeof buildLatLngCoordinateMap> {
  const hexes = dbGetAll<{ h3Index: string }>('SELECT h3_index AS h3Index FROM hexes').map((row) => row.h3Index);
  return buildLatLngCoordinateMap(hexes);
}

/**
 * A mercenary infantry row.
 *
 * Purpose: The conversion cases start from a known mercenary.
 * When to use: `insertUnitRow`.
 * Expected outcome: A human mercenary on the given hex.
 * Exceptions: None.
 */
function mercenaryRow(id: string, h3Index: string) {
  return {
    id,
    player: HUMAN_SEAT_ID,
    unitType: 'infantry' as const,
    displayOrder: 900,
    h3Index,
    origin: null,
    formedTurn: 1,
    isMercenary: true,
  };
}
