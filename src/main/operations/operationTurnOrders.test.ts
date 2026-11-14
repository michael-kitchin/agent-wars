/**
 * Ferry and drop orders for a stored air operation.
 *
 * Purpose: Ready must drop from the launch airport, ferry otherwise, and strip other air orders for that carrier.
 * When to use: After changes to `operationTurnOrders` or `mergeOperationTurnOrders`.
 * Expected outcome: Process exit 0. The operation row is stored in a temporary match. The unit rows are on the snapshot.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import { dbGetOne, dbRun } from '../gameDb';
import { writeOperationsForSeat } from '../gameDb/operationMemory';
import type { OwnerTurnOrders } from '../gameActions/ownerTurnOrders';
import type { Operation } from '../../shared/operationTypes';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { mergeOperationTurnOrders, operationTurnOrders } from './operationTurnOrders';

const SEAT = 'opponent';
const AIRPORT = 'airport-hex';
const OTHER = 'other-hex';
const CITY = 'city-hex';

/**
 * One air operation in the phase the case names.
 *
 * Purpose: The order builder reads the stored row, not the snapshot.
 * When to use: Before `operationTurnOrders`.
 * Expected outcome: A stored air operation whose carrier is `air-1`.
 * Exceptions: None.
 */
function operation(phase: Operation['phase'], landingH3: string | null = AIRPORT): Operation {
  return {
    id: 'opponent-op1',
    method: 'air',
    objectiveH3: CITY,
    musterH3: AIRPORT,
    landingH3,
    unitIds: ['inf-a'],
    carrierIds: ['air-1'],
    phase,
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
  };
}

/**
 * A snapshot whose only units are the carrier and its infantry.
 *
 * Purpose: The builder reads cargo from the snapshot.
 * When to use: Pass `aboard` when the infantry is on the air unit.
 * Expected outcome: Two units. The infantry names the carrier only when `aboard` is true.
 * Exceptions: None.
 */
function state(carrierHex: string, aboard: boolean): GameStateSnapshot {
  return {
    units: [
      { id: 'air-1', player: SEAT, unitType: 'air', h3Index: carrierHex },
      {
        id: 'inf-a',
        player: SEAT,
        unitType: 'infantry',
        h3Index: carrierHex,
        embarkedOnCarrierUnitId: aboard ? 'air-1' : null,
      },
    ],
  } as unknown as GameStateSnapshot;
}

/**
 * Stores one operation and reads the turn orders.
 *
 * Purpose: Each case uses the same temporary match.
 * When to use: The assertion line.
 * Expected outcome: The orders for `SEAT`.
 * Exceptions: None.
 */
function orders(phase: Operation['phase'], carrierHex: string, aboard: boolean, landingH3?: string | null) {
  writeOperationsForSeat({ getOne: dbGetOne, run: dbRun }, SEAT, [operation(phase, landingH3)]);
  return operationTurnOrders(SEAT, state(carrierHex, aboard));
}

test('transit on the launch airport drops, and another airport ferries', () => {
  withTempGameDb('aw-air-turn-orders-', () => {
    const drop = orders('transit', AIRPORT, true);
    assert.equal(drop.airDropOrders.length, 1);
    assert.equal(drop.airDropOrders[0]?.targetH3Index, CITY);
    assert.equal(drop.ferryOrders.length, 0);
    const ferry = orders('transit', OTHER, true, AIRPORT);
    assert.equal(ferry.ferryOrders.length, 1);
    assert.equal(ferry.ferryOrders[0]?.destinationH3Index, AIRPORT);
    assert.equal(ferry.airDropOrders.length, 0);
  });
});

test('muster lists the carrier and orders nothing', () => {
  withTempGameDb('aw-air-turn-orders-', () => {
    const result = orders('muster', AIRPORT, false);
    assert.deepEqual(result.ferryOrders, []);
    assert.deepEqual(result.airDropOrders, []);
    assert.equal(result.carrierIds.has('air-1'), true);
  });
});

test('merge removes the carrier strike, keeps another, and appends the drop', () => {
  const base: OwnerTurnOrders = {
    movementOrders: [],
    rangedOrders: [],
    airStrikeOrders: [
      { unitId: 'air-1', targetH3Index: CITY, targetType: 'units' },
      { unitId: 'air-2', targetH3Index: CITY, targetType: 'units' },
    ],
    ferryOrders: [{ unitId: 'air-1', destinationH3Index: OTHER }],
    airDropOrders: [],
    embarkOrders: [],
    missileLaunchOrders: [],
  };
  const merged = mergeOperationTurnOrders(base, {
    ferryOrders: [],
    airDropOrders: [{ unitId: 'air-1', targetH3Index: CITY }],
    carrierIds: new Set(['air-1']),
  });
  assert.deepEqual(merged.airStrikeOrders.map((order) => order.unitId), ['air-2']);
  assert.deepEqual(merged.ferryOrders, []);
  assert.equal(merged.airDropOrders?.[0]?.unitId, 'air-1');
});
