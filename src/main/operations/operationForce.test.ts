/**
 * Which units an operation holds, and which operation is carrying a unit.
 *
 * Purpose: The order parser and the briefing both ask these questions.
 * When to use: After changes to `operationForce`.
 * Expected outcome: Process exit 0. The pure cases build operations by hand. The lookup cases use a temporary database.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../shared/operationTypes';
import { dbGetOne, dbRun } from '../gameDb';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import { insertUnitRow } from '../gameDb/unitInsert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { createOperationCargoLookup, operationCarryingUnit, operationForceIds } from './operationForce';

/**
 * One stored operation with the fields a test does not care about filled in.
 *
 * Purpose: Each case names only the method, the id, and the force.
 * When to use: At the start of a case.
 * Expected outcome: An operation launched on turn 1, still mustering.
 * Exceptions: None.
 */
function operation(patch: Partial<Operation> & Pick<Operation, 'id' | 'method' | 'unitIds' | 'carrierIds'>): Operation {
  return {
    objectiveH3: 'city',
    musterH3: 'port',
    landingH3: null,
    phase: 'muster',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

test('operationForceIds collects ground units and carriers from sea and air operations', () => {
  const ops = [
    operation({ id: 'sea-1', method: 'sea', unitIds: ['u1', 'u2'], carrierIds: ['s1'] }),
    operation({ id: 'air-1', method: 'air', unitIds: ['u3'], carrierIds: ['a1'] }),
  ];
  assert.deepEqual([...operationForceIds(ops)].sort(), ['a1', 's1', 'u1', 'u2', 'u3']);
  assert.deepEqual([...operationForceIds([])], []);
});

test('operationCarryingUnit matches the unit and its carrier', () => {
  const sea = operation({ id: 'sea-1', method: 'sea', unitIds: ['u1', 'u2'], carrierIds: ['s1'] });
  const air = operation({ id: 'air-1', method: 'air', unitIds: ['u3'], carrierIds: ['a1'] });
  const ops = [sea, air];
  assert.deepEqual(operationCarryingUnit(ops, 'u1', 's1'), { operationId: 'sea-1', method: 'sea', carrierId: 's1' });
  assert.deepEqual(operationCarryingUnit(ops, 'u3', 'a1'), { operationId: 'air-1', method: 'air', carrierId: 'a1' });
  assert.equal(operationCarryingUnit(ops, 'u1', 'other-ship'), null);
  assert.equal(operationCarryingUnit(ops, 'u9', 's1'), null);
  assert.equal(operationCarryingUnit(ops, 'u1', null), null);
});

test('createOperationCargoLookup reads stored cargo and ignores units that are not aboard an operation', () => {
  withTempGameDb('aw-operation-force-', () => {
    const hex = dbGetOne<{ h3Index: string }>('SELECT h3_index AS h3Index FROM hexes LIMIT 1')?.h3Index;
    assert.ok(hex, 'seeded map has a hex');
    const placed = [
      { id: 'u1', unitType: 'infantry' as const },
      { id: 'u2', unitType: 'infantry' as const },
      { id: 's1', unitType: 'naval' as const },
      { id: 'u5', unitType: 'infantry' as const },
    ];
    placed.forEach((unit, index) => {
      insertUnitRow(dbRun, {
        id: unit.id,
        player: 'opponent',
        unitType: unit.unitType,
        displayOrder: index + 1,
        h3Index: hex,
        origin: null,
        formedTurn: 1,
      });
    });
    writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, 'opponent', [
      operation({ id: 'sea-1', method: 'sea', unitIds: ['u1', 'u2'], carrierIds: ['s1'] }),
    ]);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['u1', 's1']);
    const lookup = createOperationCargoLookup('opponent');
    assert.deepEqual(lookup('u1'), { operationId: 'sea-1', method: 'sea', carrierId: 's1' });
    assert.equal(lookup('u2'), null);
    dbRun('INSERT INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', ['u5', 's1']);
    assert.equal(lookup('u5'), null);
    assert.equal(createOperationCargoLookup('opponent2')('u1'), null);
  });
});
