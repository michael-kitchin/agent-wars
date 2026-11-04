/**
 * Strategic air-drop legality.
 * Run: `npm run build:main` then `node dist/main/gameActions/airDropValidation.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk } from 'h3-js';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { dbGetOne, dbRun } from '../gameDb';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { validateAirDropOrder } from './airDropValidation';

/**
 * An inland airport and one land hex inside strike range.
 *
 * Purpose: A legal drop needs both.
 * When to use: The validation cases.
 * Expected outcome: Two distinct hexes on the seeded map.
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
    const row = dbGetOne<{ terrain: string }>('SELECT terrain FROM hexes WHERE h3_index = ?', [hex]);
    return row?.terrain === 'land';
  });
  if (!target) throw new Error('seeded map has no land hex in strike range');
  return { origin, target };
}

test('a drop is legal on an enemy land hex and refused for a second infantry, water, or the home hex', () => {
  withTempGameDb('aw-air-drop-valid-', () => {
    const { origin, target } = airportAndLandTarget();
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
    insertUnitRow(dbRun, {
      id: 'inf-2',
      player: HUMAN_SEAT_ID,
      unitType: 'infantry',
      displayOrder: 3,
      h3Index: origin,
      origin: null,
      formedTurn: 1,
    });
    insertUnitRow(dbRun, {
      id: 'enemy-1',
      player: 'opponent',
      unitType: 'infantry',
      displayOrder: 4,
      h3Index: target,
      origin: null,
      formedTurn: 1,
    });
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-1', 'air-1']);
    assert.equal(validateAirDropOrder('air-1', target).valid, true);
    assert.equal(validateAirDropOrder('air-1', origin).valid, false);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['inf-2', 'air-1']);
    const second = validateAirDropOrder('air-1', target);
    assert.equal(second.valid, false);
    const water = dbGetOne<{ h3Index: string }>(
      `SELECT h3_index AS h3Index FROM hexes WHERE terrain = 'water' LIMIT 1`
    )?.h3Index;
    assert.ok(water);
    dbRun('DELETE FROM unit_transport_assignments WHERE land_unit_id = ?', ['inf-2']);
    const wet = validateAirDropOrder('air-1', water!);
    assert.equal(wet.valid, false);
  });
});
