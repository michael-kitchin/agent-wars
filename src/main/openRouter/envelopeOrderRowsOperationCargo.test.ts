/**
 * Orders on a unit aboard an operation's ship or air unit are refused.
 *
 * Purpose: Those orders were taking the cargo out of the operation.
 * When to use: After changes to `processV3OrdersArray` cargo refusal.
 * Expected outcome: Process exit 0. A temporary database holds the operations and the cargo rows.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../shared/operationTypes';
import { ensureStrategicCoordinateRegistryInitialized } from '../briefing/map/hexCoordinates';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { dbGetOne, dbRun, getGameState } from '../gameDb';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import { insertUnitRow } from '../gameDb/unitInsert';
import { buildLatLngCoordinateMap } from '../mapData';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { processV3OrdersArray } from './envelopeOrderRows';

const SEA_ID = 'sea-1';
const AIR_ID = 'air-1';

/**
 * One stored operation with the fields this file does not vary filled in.
 *
 * Purpose: The cargo cases name the force and the method.
 * When to use: Before `writeOperationsForSeat`.
 * Expected outcome: An operation launched on turn 1, in transit, with a landing hex.
 * Exceptions: None.
 */
function operation(patch: Partial<Operation> & Pick<Operation, 'id' | 'method' | 'unitIds' | 'carrierIds'>): Operation {
  return {
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: 'beach',
    phase: 'transit',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

/**
 * True when a cargo row still assigns the land unit.
 *
 * Purpose: A refused order must not clear the assignment.
 * When to use: After `processV3OrdersArray`.
 * Expected outcome: True when the row is present.
 * Exceptions: None.
 */
function cargoAssigned(landUnitId: string): boolean {
  const row = dbGetOne<{ navalUnitId: string }>(
    'SELECT naval_unit_id AS navalUnitId FROM unit_transport_assignments WHERE land_unit_id = ?',
    [landUnitId]
  );
  return row !== undefined;
}

test('processV3OrdersArray drops orders for operation cargo and leaves other embarked units alone', () => {
  withTempGameDb('aw-operation-cargo-orders-', () => {
    ensureStrategicCoordinateRegistryInitialized();
    const hex = dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM hexes LIMIT 1')?.h3Index;
    assert.ok(hex, 'seeded map has a hex');
    const units = [
      { id: 'u1', unitType: 'infantry' as const },
      { id: 's1', unitType: 'naval' as const },
      { id: 'u3', unitType: 'infantry' as const },
      { id: 'a1', unitType: 'air' as const },
      { id: 'u4', unitType: 'infantry' as const },
      { id: 's2', unitType: 'naval' as const },
    ];
    units.forEach((unit, index) => {
      insertUnitRow(dbRun, {
        id: unit.id,
        player: 'opponent',
        unitType: unit.unitType,
        displayOrder: 100 + index,
        h3Index: hex,
        origin: null,
        formedTurn: 1,
      });
    });
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, 'opponent', [
      operation({ id: SEA_ID, method: 'sea', unitIds: ['u1'], carrierIds: ['s1'] }),
      operation({ id: AIR_ID, method: 'air', unitIds: ['u3'], carrierIds: ['a1'] }),
    ]);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['u1', 's1']);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['u3', 'a1']);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['u4', 's2']);

    const state = getGameState();
    const { latLngByH3, resolveToH3 } = buildLatLngCoordinateMap(state.hexes.map((row) => row.h3Index));
    const destination = h3ToCode(hex, { mode: 'strategic' });
    const strategic = { mode: 'strategic' as const, seatId: 'opponent' as const };
    const seaPrefix = 'operations order dropped: u1 is aboard s1 in';

    const assigned = processV3OrdersArray(
      [{ action: 'assign_order', unitId: 'u1', order: { type: 'march', destination } }],
      state,
      latLngByH3,
      resolveToH3,
      strategic
    );
    assert.equal(assigned.dropReasons.filter((reason) => reason.startsWith(seaPrefix)).length, 1);
    assert.equal(assigned.appliedStandingOrderCount, 0);
    assert.equal(
      dbGetOne('SELECT unit_id AS unitId FROM standing_orders WHERE unit_id = ?', ['u1']),
      undefined
    );

    const moved = processV3OrdersArray(
      [{ action: 'explicit_move', unitId: 'u1', destination }],
      state,
      latLngByH3,
      resolveToH3,
      strategic
    );
    assert.ok(moved.dropReasons.some((reason) => reason.startsWith(seaPrefix)));
    assert.deepEqual(moved.movementOrders, []);
    assert.equal(cargoAssigned('u1'), true);

    const dropped = processV3OrdersArray(
      [{ action: 'disembark', unitId: 'u3', destination }],
      state,
      latLngByH3,
      resolveToH3,
      strategic
    );
    assert.ok(dropped.dropReasons.some((reason) => reason.endsWith(`To take it out, cancel ${AIR_ID}.`)));
    assert.equal(cargoAssigned('u3'), true);

    const outsider = processV3OrdersArray(
      [{ action: 'explicit_move', unitId: 'u4', destination }],
      state,
      latLngByH3,
      resolveToH3,
      strategic
    );
    assert.equal(outsider.dropReasons.some((reason) => reason.startsWith('operations order dropped')), false);

    const tactical = processV3OrdersArray(
      [{ action: 'assign_order', unitId: 'u1', order: { type: 'march', destination } }],
      state,
      latLngByH3,
      resolveToH3,
      { mode: 'tactical', seatId: 'opponent', battleId: 'battle-1' }
    );
    assert.equal(tactical.dropReasons.some((reason) => reason.startsWith('operations order dropped')), false);

    for (const action of ['cancel_order', 'embark', 'transport_move'] as const) {
      const row = action === 'cancel_order'
        ? { action, unitId: 'u1' }
        : action === 'embark'
          ? { action, unitId: 'u1', navalUnitId: 's1' }
          : { action, unitId: 'u1', navalUnitId: 's1', destination };
      const result = processV3OrdersArray([row], state, latLngByH3, resolveToH3, strategic);
      assert.ok(
        result.dropReasons.some((reason) => reason.startsWith(seaPrefix) && reason.includes('give s1 a standing order of your own')),
        action
      );
      assert.equal(result.appliedStandingOrderCount, 0, action);
      assert.deepEqual(result.movementOrders, [], action);
      assert.deepEqual(result.embarkOrders, [], action);
    }
    assert.equal(cargoAssigned('u1'), true);
    assert.equal(
      dbGetOne('SELECT unit_id AS unitId FROM standing_orders WHERE unit_id = ?', ['u1']),
      undefined
    );
  });
});
