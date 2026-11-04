/**
 * An air unit loads one infantry unit, and that infantry leaves the fight and dies with the air unit.
 * Run: `npm run build:main` then `node dist/main/gameActions/airlift.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SEAT_ID, NEUTRAL_OWNER_ID } from '../../shared/seatIds';
import { dbGetOne, dbRun } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { landUnitSitsOutCombat } from './airlift';
import { prepareNeutralTransportsForTurn } from './neutralTurn';
import {
  applyEmbarkOrdersForPlayer,
  deleteStrategicParentUnitAndApplyTransportOutcome,
  executeSealiftSlotUpdate,
} from './sealift';

/**
 * An inland airport on the seeded map.
 *
 * Purpose: Debark must work where a ship has no port.
 * When to use: Each case that places an air unit.
 * Expected outcome: A land hex whose airport count is at least 1.
 * Exceptions: Throws when the seeded map has none.
 */
function inlandAirport(): string {
  const row = dbGetOne<{ h3Index: string }>(
    `SELECT h.h3_index AS h3Index
     FROM hexes h
     JOIN res_s_infrastructure i ON i.h3_index = h.h3_index
     WHERE h.terrain = 'land' AND i.airport_count > 0
     LIMIT 1`
  );
  if (!row) throw new Error('seeded map has no inland airport');
  return row.h3Index;
}

/**
 * Places one unit on a hex.
 *
 * Purpose: The cases start from known rows.
 * When to use: Before an embark, debark, or delete.
 * Expected outcome: One `units` row.
 * Exceptions: Propagates an insert error.
 */
function place(id: string, player: string, unitType: string, h3Index: string): void {
  insertUnitRow(dbRun, {
    id,
    player,
    unitType,
    displayOrder: 1,
    h3Index,
    origin: null,
    formedTurn: 1,
  });
}

test('one infantry boards an air unit and a second infantry or armor does not', () => {
  withTempGameDb('aw-airlift-board-', () => {
    const hex = inlandAirport();
    place('air-1', HUMAN_SEAT_ID, 'air', hex);
    place('inf-1', HUMAN_SEAT_ID, 'infantry', hex);
    place('inf-2', HUMAN_SEAT_ID, 'infantry', hex);
    place('arm-1', HUMAN_SEAT_ID, 'armor', hex);
    applyEmbarkOrdersForPlayer(
      [
        { unitId: 'inf-1', navalUnitId: 'air-1' },
        { unitId: 'inf-2', navalUnitId: 'air-1' },
        { unitId: 'arm-1', navalUnitId: 'air-1' },
      ],
      HUMAN_SEAT_ID
    );
    const aboard = dbGetOne<{ landUnitId: string }>(
      'SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE naval_unit_id = ?',
      ['air-1']
    );
    assert.equal(aboard?.landUnitId, 'inf-1');
    const refused = executeSealiftSlotUpdate({ h3Index: hex, navalUnitId: 'air-1', slotIndex: 2, landUnitId: 'inf-2' });
    assert.equal(refused.success, false);
    assert.equal(refused.reason, 'An air unit has only one infantry slot.');
    const armor = executeSealiftSlotUpdate({ h3Index: hex, navalUnitId: 'air-1', slotIndex: 1, landUnitId: 'arm-1' });
    assert.equal(armor.success, false);
    assert.equal(armor.reason, 'An air unit can carry only infantry.');
  });
});

test('infantry debarks on an inland airport and sits out combat until it does', () => {
  withTempGameDb('aw-airlift-debark-', () => {
    const hex = inlandAirport();
    place('air-1', HUMAN_SEAT_ID, 'air', hex);
    place('inf-1', HUMAN_SEAT_ID, 'infantry', hex);
    place('inf-free', HUMAN_SEAT_ID, 'infantry', hex);
    const boarded = executeSealiftSlotUpdate({ h3Index: hex, navalUnitId: 'air-1', slotIndex: 1, landUnitId: 'inf-1' });
    assert.equal(boarded.success, true);
    assert.equal(landUnitSitsOutCombat('inf-1'), true);
    assert.equal(landUnitSitsOutCombat('inf-free'), false);
    const debarked = executeSealiftSlotUpdate({ h3Index: hex, navalUnitId: 'air-1', slotIndex: 1, landUnitId: null });
    assert.equal(debarked.success, true);
    assert.equal(
      dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ?', ['inf-1']),
      undefined
    );
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['inf-1'])?.h3Index, hex);
    assert.equal(landUnitSitsOutCombat('inf-1'), false);
  });
});

test('deleting the air unit deletes its infantry and leaves a co-located infantry unit', () => {
  withTempGameDb('aw-airlift-loss-', () => {
    const hex = inlandAirport();
    place('air-1', HUMAN_SEAT_ID, 'air', hex);
    place('inf-1', HUMAN_SEAT_ID, 'infantry', hex);
    place('inf-free', HUMAN_SEAT_ID, 'infantry', hex);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-1', 'air-1']);
    deleteStrategicParentUnitAndApplyTransportOutcome('air-1');
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['air-1']), undefined);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['inf-1']), undefined);
    assert.ok(dbGetOne('SELECT id FROM units WHERE id = ?', ['inf-free']));
  });
});

test('neutral air cargo unloads in place and both units remain', () => {
  withTempGameDb('aw-airlift-neutral-', () => {
    const hex = inlandAirport();
    place('n-air', NEUTRAL_OWNER_ID, 'air', hex);
    place('n-inf', NEUTRAL_OWNER_ID, 'infantry', hex);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['n-inf', 'n-air']);
    const coordinates = buildLatLngCoordinateMap(getOrderedHexList());
    prepareNeutralTransportsForTurn(coordinates);
    assert.equal(
      dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE naval_unit_id = ?', ['n-air']),
      undefined
    );
    assert.equal(dbGetOne<{ player: string }>('SELECT player FROM units WHERE id = ?', ['n-air'])?.player, NEUTRAL_OWNER_ID);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['n-inf'])?.h3Index, hex);
  });
});
