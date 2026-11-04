/**
 * Strategic air-drop resolution and the strike it must not be replaced by.
 * Run: `npm run build:main` then `node dist/main/gameActions/airDropResolution.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetOne, dbRun, listUnitsForSnapshot, validateGameDatabaseOrThrow } from '../gameDb';
import { getDbHandle } from '../gameDb/dbConnection';
import { ensurePendingAirDropOrdersTable } from '../gameDb/pendingAirDropOrders';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { landUnitSitsOutCombat } from './airlift';
import { reconcileHumanAirActions, resolveAirDropPhase } from './airDropResolution';

/**
 * An inland airport and a land hex inside strike range.
 *
 * Purpose: Resolution cases land infantry on that hex.
 * When to use: Each drop case.
 * Expected outcome: Two distinct hexes.
 * Exceptions: Throws when the map has no such pair.
 */
function airportAndLandTarget(): { origin: string; target: string } {
  const origin = dbGetOne<{ h3Index: string }>(
    `SELECT h.h3_index AS h3Index
     FROM hexes h
     JOIN res_s_infrastructure i ON i.h3_index = h.h3_index
     WHERE h.terrain = 'land' AND i.airport_count > 0
     LIMIT 1`
  )?.h3Index;
  if (!origin) throw new Error('seeded map has no inland airport');
  const target = gridDisk(origin, AIR_STRIKE_RANGE_HEXES).find((hex) => {
    if (hex === origin) return false;
    return dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [hex])?.terrain === 'land';
  });
  if (!target) throw new Error('seeded map has no land hex in strike range');
  return { origin, target };
}

/**
 * Places an air unit and the infantry assigned to it.
 *
 * Purpose: A legal drop starts from this pair.
 * When to use: Each resolution case.
 * Expected outcome: Both units are on `origin`, and one assignment row exists.
 * Exceptions: Propagates an insert error.
 */
function placeCarrier(origin: string): void {
  insertUnitRow(dbRun, {
    id: 'air-1',
    player: HUMAN_SEAT_ID,
    unitType: 'air',
    displayOrder: 1,
    h3Index: origin,
    origin: null,
    formedTurn: 1,
  });
  insertUnitRow(dbRun, {
    id: 'inf-1',
    player: HUMAN_SEAT_ID,
    unitType: 'infantry',
    displayOrder: 2,
    h3Index: origin,
    origin: null,
    formedTurn: 1,
  });
  dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-1', 'air-1']);
}

test('infantry lands on an enemy hex and on an empty hex, and the air unit stays', () => {
  withTempGameDb('aw-air-drop-land-', () => {
    const { origin, target } = airportAndLandTarget();
    placeCarrier(origin);
    insertUnitRow(dbRun, {
      id: 'enemy-1',
      player: 'opponent',
      unitType: 'infantry',
      displayOrder: 3,
      h3Index: target,
      origin: null,
      formedTurn: 1,
    });
    const landed = resolveAirDropPhase([{ unitId: 'air-1', targetH3Index: target }], () => 100);
    assert.equal(landed.moves[0]?.returnsToBase, true);
    assert.equal(landed.moves[0]?.infantryUnitId, 'inf-1');
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['air-1'])?.h3Index, origin);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['inf-1'])?.h3Index, target);
    const roster = listUnitsForSnapshot().filter((unit) => !landed.removedUnitIds.includes(unit.id));
    assert.equal(roster.find((unit) => unit.id === 'inf-1')?.h3Index, target);
    assert.equal(dbGetOne('SELECT land_unit_id AS landUnitId FROM unit_transport_assignments WHERE land_unit_id = ?', ['inf-1']) == null, true);

    dbRun('DELETE FROM units WHERE id = ?', ['enemy-1']);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [origin, 'inf-1']);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-1', 'air-1']);
    const empty = resolveAirDropPhase([{ unitId: 'air-1', targetH3Index: target }], () => 1);
    assert.equal(empty.moves[0]?.returnsToBase, true);
    assert.equal(dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM units WHERE id = ?', ['inf-1'])?.h3Index, target);
    assert.equal(empty.diceRolls.length, 0);
  });
});

test('return fire removes the air unit and the infantry, and the infantry never reaches the target', () => {
  withTempGameDb('aw-air-drop-shot-', () => {
    const { origin, target } = airportAndLandTarget();
    placeCarrier(origin);
    insertUnitRow(dbRun, {
      id: 'enemy-1',
      player: 'opponent',
      unitType: 'armor',
      displayOrder: 3,
      h3Index: target,
      origin: null,
      formedTurn: 1,
    });
    const shot = resolveAirDropPhase([{ unitId: 'air-1', targetH3Index: target }], () => 1);
    assert.equal(shot.moves[0]?.returnsToBase, false);
    assert.equal(shot.moves[0]?.infantryUnitId, undefined);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['air-1']) == null, true);
    assert.equal(dbGetOne('SELECT id FROM units WHERE id = ?', ['inf-1']) == null, true);
    assert.equal(shot.diceRolls[0]?.kind, 'antiAir');
    const roster = listUnitsForSnapshot().filter((unit) => !shot.removedUnitIds.includes(unit.id));
    assert.equal(roster.some((unit) => unit.id === 'air-1' || unit.id === 'inf-1'), false);
  });
});

test('an explicit drop cancels a generated strike and a ferry, and an explicit strike cancels the drop', () => {
  const generated = { unitId: 'air-1', targetH3Index: 'hex', targetType: 'units' as const };
  const drop = { unitId: 'air-1', targetH3Index: 'land' };
  const ferry = { unitId: 'air-1', destinationH3Index: 'far' };
  const kept = reconcileHumanAirActions({
    generatedStrikes: [generated],
    explicitStrikes: [],
    ferryOrders: [ferry],
    dropOrders: [drop],
  });
  assert.equal(kept.strikes.some((strike) => strike.unitId === 'air-1'), false);
  assert.equal(kept.dropOrders.length, 1);
  const strikeIds = new Set(kept.strikes.map((strike) => strike.unitId));
  const drops = kept.dropOrders.filter((order) => !strikeIds.has(order.unitId));
  const ferries = kept.ferryOrders.filter((order) => !strikeIds.has(order.unitId) && !drops.some((row) => row.unitId === order.unitId));
  assert.equal(ferries.length, 0);

  const explicit = reconcileHumanAirActions({
    generatedStrikes: [generated],
    explicitStrikes: [generated],
    ferryOrders: [],
    dropOrders: [drop],
  });
  const explicitIds = new Set(explicit.strikes.map((strike) => strike.unitId));
  assert.equal(explicit.dropOrders.filter((order) => !explicitIds.has(order.unitId)).length, 0);
});

test('ship cargo sits out combat on water and fights on a coast', () => {
  withTempGameDb('aw-air-drop-ship-', () => {
    const water = dbGetOne<{ h3Index: string }>("SELECT h3_index AS h3Index FROM hexes WHERE terrain = 'water' LIMIT 1")?.h3Index;
    const coast = dbGetOne<{ h3Index: string }>("SELECT h3_index AS h3Index FROM hexes WHERE terrain = 'coastal' LIMIT 1")?.h3Index;
    assert.ok(water);
    assert.ok(coast);
    insertUnitRow(dbRun, {
      id: 'ship-1',
      player: HUMAN_SEAT_ID,
      unitType: 'naval',
      displayOrder: 1,
      h3Index: water!,
      origin: null,
      formedTurn: 1,
    });
    insertUnitRow(dbRun, {
      id: 'inf-1',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 2,
      h3Index: water!,
      origin: null,
      formedTurn: 1,
    });
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-1', 'ship-1']);
    assert.equal(landUnitSitsOutCombat('inf-1'), true);
    dbRun('UPDATE units SET h3_index = ? WHERE id IN (?, ?)', [coast, 'ship-1', 'inf-1']);
    assert.equal(landUnitSitsOutCombat('inf-1'), false);
  });
});

test('a version 26 database without the drop table still opens, and the ensure creates it', () => {
  withTempGameDb('aw-air-drop-table-', () => {
    const database = getDbHandle();
    assert.ok(database);
    database!.exec('DROP TABLE pending_air_drop_orders');
    validateGameDatabaseOrThrow(database!);
    ensurePendingAirDropOrdersTable((sql) => database!.exec(sql));
    ensurePendingAirDropOrdersTable((sql) => database!.exec(sql));
    const row = database!.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pending_air_drop_orders'"
    ).get() as { name: string } | undefined;
    assert.equal(row?.name, 'pending_air_drop_orders');
  });
});
