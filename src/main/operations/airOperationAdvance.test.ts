/**
 * Air operation advance: muster, drop, assault, cancel, and the method dispatch.
 *
 * Purpose: The turn hook stores whatever this decision returns, so each ending and the first tick need one direct case.
 * When to use: After changes to `advanceAirOperation` or `cancelAirOperation`.
 * Expected outcome: Process exit 0. Facts are built by hand. No database and no map.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../shared/operationTypes';
import { OPERATION_AIR_TRANSIT_TIMEOUT_TURNS, OPERATION_ASSAULT_TIMEOUT_TURNS } from './operationRules';
import { advanceOperation } from './operationAdvance';
import { advanceAirOperation, cancelAirOperation } from './airOperationAdvance';
import type { OperationAction, OperationFacts } from './seaOperationAdvance';

const AIRPORT = 'airport';
const CITY = 'city';
const OTHER = 'other';

/**
 * One air operation with the fields a test does not care about filled in.
 *
 * Purpose: Each case names the phase and the hexes that differ.
 * When to use: At the start of a case.
 * Expected outcome: An air operation launched on turn 1.
 * Exceptions: None.
 */
function operation(patch: Partial<Operation> = {}): Operation {
  return {
    id: 'seat-op1',
    method: 'air',
    objectiveH3: CITY,
    musterH3: AIRPORT,
    landingH3: AIRPORT,
    unitIds: ['inf-a'],
    carrierIds: ['air-1'],
    phase: 'muster',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

/**
 * Facts for one air operation.
 *
 * Purpose: A case overrides only the maps and flags it needs.
 * When to use: Beside `operation`.
 * Expected outcome: Turn 1, the objective still an enemy city, and no enemy unit on it.
 * Exceptions: None.
 */
function facts(patch: Partial<OperationFacts> = {}): OperationFacts {
  return {
    turnNumber: 1,
    unitHexById: new Map([
      ['air-1', AIRPORT],
      ['inf-a', OTHER],
    ]),
    unitTypeById: new Map([
      ['air-1', 'air'],
      ['inf-a', 'infantry'],
    ]),
    carrierByCargoId: new Map(),
    storedOrderById: new Map([['air-1', { type: 'defend', h3Index: AIRPORT }]]),
    objectiveIsEnemyCity: true,
    objectiveIsOwn: false,
    objectiveHasEnemyUnit: false,
    chooseLanding: () => null,
    chooseReturnPort: () => null,
    ...patch,
  };
}

/**
 * True when the action list defends the named unit on the named hex.
 *
 * Purpose: An end must put the air unit back on defend.
 * When to use: End and cancel cases.
 * Expected outcome: True when a defend action matches.
 * Exceptions: None.
 */
function defends(actions: readonly OperationAction[], unitId: string, atH3: string): boolean {
  return actions.some((action) => action.kind === 'defend' && action.unitId === unitId && action.atH3 === atH3);
}

test('a carrier defending its airport gets hold-fire and the infantry marches', () => {
  const step = advanceAirOperation(operation(), facts());
  assert.equal(step.outcome, 'running');
  assert.equal(step.next?.phase, 'muster');
  assert.ok(step.actions.some((action) => action.kind === 'holdFire' && action.unitId === 'air-1'));
  assert.ok(step.actions.some((action) => action.kind === 'march' && action.unitId === 'inf-a' && action.toH3 === AIRPORT));
});

test('infantry already on the airport embarks and the phase becomes transit', () => {
  const step = advanceAirOperation(
    operation(),
    facts({ unitHexById: new Map([['air-1', AIRPORT], ['inf-a', AIRPORT]]) })
  );
  assert.equal(step.next?.phase, 'transit');
  assert.ok(step.actions.some((action) => action.kind === 'embark' && action.unitId === 'inf-a'));
});

test('a carrier that left the airport ends and defends on its new hex', () => {
  const step = advanceAirOperation(
    operation(),
    facts({ unitHexById: new Map([['air-1', OTHER], ['inf-a', OTHER]]) })
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
  assert.equal(defends(step.actions, 'air-1', OTHER), true);
  assert.ok(step.actions.some((action) => action.kind === 'cancelOrder' && action.unitId === 'inf-a'));
});

test('transit with the infantry still aboard and a legal city returns no action', () => {
  const step = advanceAirOperation(
    operation({ phase: 'transit' }),
    facts({ carrierByCargoId: new Map([['inf-a', 'air-1']]) })
  );
  assert.deepEqual(step.actions, []);
  assert.equal(step.next?.phase, 'transit');
});

test('infantry on an enemy objective enters assault without defending the carrier', () => {
  const step = advanceAirOperation(
    operation({ phase: 'transit' }),
    facts({ unitHexById: new Map([['air-1', AIRPORT], ['inf-a', CITY]]) })
  );
  assert.equal(step.next?.phase, 'assault');
  assert.equal(defends(step.actions, 'inf-a', CITY), true);
  assert.equal(step.actions.some((action) => action.unitId === 'air-1'), false);
});

test('infantry on an objective the seat already holds completes the operation', () => {
  const step = advanceAirOperation(
    operation({ phase: 'transit' }),
    facts({
      unitHexById: new Map([['air-1', AIRPORT], ['inf-a', CITY]]),
      objectiveIsOwn: true,
      objectiveIsEnemyCity: false,
    })
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'completed');
  assert.equal(defends(step.actions, 'air-1', AIRPORT), true);
});

test('a transit timeout unloads the infantry and defends both units', () => {
  const step = advanceAirOperation(
    operation({ phase: 'transit', phaseTurn: 1 }),
    facts({
      turnNumber: 1 + OPERATION_AIR_TRANSIT_TIMEOUT_TURNS,
      carrierByCargoId: new Map([['inf-a', 'air-1']]),
    })
  );
  assert.equal(step.outcome, 'abandoned');
  assert.ok(step.actions.some((action) => action.kind === 'unload' && action.unitId === 'inf-a'));
  assert.equal(defends(step.actions, 'inf-a', AIRPORT), true);
  assert.equal(defends(step.actions, 'air-1', AIRPORT), true);
});

test('an assault the seat already owns completes and defends the carrier', () => {
  const step = advanceAirOperation(
    operation({ phase: 'assault' }),
    facts({
      unitHexById: new Map([['air-1', AIRPORT], ['inf-a', CITY]]),
      objectiveIsOwn: true,
    })
  );
  assert.equal(step.outcome, 'completed');
  assert.equal(defends(step.actions, 'air-1', AIRPORT), true);
});

test('an assault timeout defends the carrier and leaves the infantry order alone', () => {
  const step = advanceAirOperation(
    operation({ phase: 'assault', phaseTurn: 1 }),
    facts({
      turnNumber: 1 + OPERATION_ASSAULT_TIMEOUT_TURNS,
      unitHexById: new Map([['air-1', AIRPORT], ['inf-a', CITY]]),
    })
  );
  assert.equal(step.outcome, 'abandoned');
  assert.equal(step.actions.some((action) => action.unitId === 'inf-a'), false);
  assert.equal(defends(step.actions, 'air-1', AIRPORT), true);
});

test('cancel from muster and transit leaves nobody aboard and defends the carrier', () => {
  const muster = cancelAirOperation(operation(), facts());
  assert.equal(muster.outcome, 'abandoned');
  assert.ok(muster.actions.some((action) => action.kind === 'cancelOrder' && action.unitId === 'inf-a'));
  assert.equal(defends(muster.actions, 'air-1', AIRPORT), true);
  const transit = cancelAirOperation(
    operation({ phase: 'transit' }),
    facts({ carrierByCargoId: new Map([['inf-a', 'air-1']]) })
  );
  assert.ok(transit.actions.some((action) => action.kind === 'unload' && action.unitId === 'inf-a'));
  assert.equal(defends(transit.actions, 'air-1', AIRPORT), true);
});

test('a missing carrier ends lost and does not unload', () => {
  const step = advanceAirOperation(
    operation({ phase: 'transit' }),
    facts({
      unitHexById: new Map([['inf-a', CITY]]),
      carrierByCargoId: new Map([['inf-a', 'air-1']]),
    })
  );
  assert.equal(step.outcome, 'lost');
  assert.equal(step.actions.some((action) => action.kind === 'unload'), false);
});

test('advanceOperation routes air and sea to their own decisions', () => {
  const air = advanceOperation(operation(), facts({ unitHexById: new Map() }));
  assert.equal(air.reason, 'carrier-missing');
  const sea = advanceOperation(
    { ...operation(), method: 'sea', unitIds: [], carrierIds: [] },
    facts()
  );
  assert.notEqual(sea.reason, 'carrier-missing');
});
