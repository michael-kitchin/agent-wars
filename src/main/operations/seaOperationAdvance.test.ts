/**
 * Sea operation advance: gather, load, land, release, and return.
 *
 * Purpose: The turn hook stores whatever this decision returns, so each rule needs one direct case.
 * When to use: After changes to `advanceSeaOperation` or `turnSeaOperationBack`.
 * Expected outcome: Process exit 0. Facts are built by hand. No database and no map.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Operation } from '../../shared/operationTypes';
import { advanceSeaOperation, cancelSeaOperation, turnSeaOperationBack, type OperationAction, type OperationFacts } from './seaOperationAdvance';

const PORT = 'port';
const CITY = 'city';
const BEACH = 'beach';

/**
 * One stored operation with the fields a test does not care about filled in.
 *
 * Purpose: Each case names only the phase, the force, and the hexes that differ.
 * When to use: At the start of a case.
 * Expected outcome: A sea operation launched on turn 1.
 * Exceptions: None.
 */
function operation(patch: Partial<Operation> & Pick<Operation, 'phase' | 'unitIds' | 'carrierIds'>): Operation {
  return {
    id: 'seat-op1',
    method: 'sea',
    objectiveH3: CITY,
    musterH3: PORT,
    landingH3: null,
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
    ...patch,
  };
}

/**
 * Facts for one operation, with empty maps and a landing the muster can use.
 *
 * Purpose: A case overrides only the maps and flags it needs.
 * When to use: Beside `operation`.
 * Expected outcome: Turn 1, the objective still an enemy city, and choosers that return a beach and the same port.
 * Exceptions: None.
 */
function facts(patch: Partial<OperationFacts> = {}): OperationFacts {
  return {
    turnNumber: 1,
    unitHexById: new Map(),
    unitTypeById: new Map(),
    carrierByCargoId: new Map(),
    storedOrderById: new Map(),
    objectiveIsEnemyCity: true,
    objectiveIsOwn: false,
    chooseLanding: () => BEACH,
    chooseReturnPort: () => PORT,
    ...patch,
  };
}

/**
 * Hexes and infantry types for the named units.
 *
 * Purpose: Muster loading reads both maps, and a missing hex means the unit is gone.
 * When to use: When every listed unit is on the same hex.
 * Expected outcome: One entry per id. Ground units are infantry.
 * Exceptions: None.
 */
function placed(ids: readonly string[], hex: string, ships: readonly string[] = []): { readonly unitHexById: Map<string, string>; readonly unitTypeById: Map<string, string> } {
  const unitHexById = new Map<string, string>();
  const unitTypeById = new Map<string, string>();
  for (const id of [...ids, ...ships]) unitHexById.set(id, hex);
  for (const id of ids) unitTypeById.set(id, 'infantry');
  return { unitHexById, unitTypeById };
}

/**
 * True when no action names the unit.
 *
 * Purpose: A release must not also march, unload, or cancel that unit.
 * When to use: Release cases.
 * Expected outcome: True when the id is absent from the action list.
 * Exceptions: None.
 */
function spares(actions: readonly OperationAction[], unitId: string): boolean {
  return actions.every((action) => action.unitId !== unitId);
}

test('muster with nobody at the port marches every unit and ship', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  unitHexById.set('ship-1', 'sea');
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({ unitHexById, unitTypeById }),
  );
  assert.deepEqual(step.actions, [
    { kind: 'march', unitId: 'inf-a', toH3: PORT },
    { kind: 'march', unitId: 'inf-b', toH3: PORT },
    { kind: 'march', unitId: 'ship-1', toH3: PORT },
  ]);
  assert.equal(step.next?.phase, 'muster');
  assert.equal(step.outcome, 'running');
});

test('muster skips a unit that already has the march it would assign', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  unitHexById.set('ship-1', 'sea');
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({
      unitHexById,
      unitTypeById,
      storedOrderById: new Map([['inf-a', { type: 'march', h3Index: PORT }]]),
    }),
  );
  assert.deepEqual(step.actions, [
    { kind: 'march', unitId: 'inf-b', toH3: PORT },
    { kind: 'march', unitId: 'ship-1', toH3: PORT },
  ]);
});

test('a complete muster loads two infantry and sails', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], PORT, ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({ unitHexById, unitTypeById }),
  );
  assert.deepEqual(step.actions, [
    { kind: 'cancelOrder', unitId: 'inf-a' },
    { kind: 'embark', unitId: 'inf-a', carrierId: 'ship-1' },
    { kind: 'cancelOrder', unitId: 'inf-b' },
    { kind: 'embark', unitId: 'inf-b', carrierId: 'ship-1' },
    { kind: 'march', unitId: 'ship-1', toH3: BEACH },
  ]);
  assert.equal(step.next?.phase, 'transit');
  assert.equal(step.next?.landingH3, BEACH);
  assert.deepEqual(step.next?.unitIds, ['inf-a', 'inf-b']);
  assert.deepEqual(step.next?.carrierIds, ['ship-1']);
  assert.equal(step.outcome, 'running');
});

test('a complete muster with no landing is abandoned and does not embark', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], PORT, ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({ unitHexById, unitTypeById, chooseLanding: () => null }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
  assert.equal(step.actions.some((action) => action.kind === 'embark'), false);
  assert.deepEqual(step.actions, [
    { kind: 'cancelOrder', unitId: 'inf-a' },
    { kind: 'cancelOrder', unitId: 'inf-b' },
    { kind: 'cancelOrder', unitId: 'ship-1' },
  ]);
});

test('muster timeout abandons one arrival and sails with two', () => {
  const one = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  one.unitHexById.set('inf-a', PORT);
  one.unitHexById.set('ship-1', PORT);
  const abandoned = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({ turnNumber: 11, unitHexById: one.unitHexById, unitTypeById: one.unitTypeById }),
  );
  assert.equal(abandoned.next, null);
  assert.equal(abandoned.outcome, 'abandoned');

  const two = placed(['inf-a', 'inf-b', 'inf-c'], 'away', ['ship-1']);
  two.unitHexById.set('inf-a', PORT);
  two.unitHexById.set('inf-b', PORT);
  two.unitHexById.set('ship-1', PORT);
  const sailing = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b', 'inf-c'], carrierIds: ['ship-1'] }),
    facts({ turnNumber: 11, unitHexById: two.unitHexById, unitTypeById: two.unitTypeById }),
  );
  assert.equal(sailing.next?.phase, 'transit');
  assert.deepEqual(sailing.next?.unitIds, ['inf-a', 'inf-b']);
  assert.deepEqual(sailing.actions.filter((action) => action.unitId === 'inf-c'), [{ kind: 'cancelOrder', unitId: 'inf-c' }]);
});

test('a launch tick replaces an order the unit already had', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({
      unitHexById,
      unitTypeById,
      storedOrderById: new Map([['inf-a', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.deepEqual(step.releasedIds, []);
  assert.deepEqual(step.next?.unitIds, ['inf-a', 'inf-b']);
  assert.deepEqual(step.actions.filter((action) => action.unitId === 'inf-a'), [{ kind: 'march', unitId: 'inf-a', toH3: PORT }]);
});

test('a ground unit marched somewhere else is released with no action', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({
      turnNumber: 2,
      unitHexById,
      unitTypeById,
      storedOrderById: new Map([['inf-a', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.deepEqual(step.releasedIds, ['inf-a']);
  assert.equal(spares(step.actions, 'inf-a'), true);
  assert.deepEqual(step.next?.unitIds, ['inf-b']);
  assert.equal(step.outcome, 'running');
});

test('a ship at the landing unloads and the operation assaults', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a'], BEACH, ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
    }),
  );
  assert.deepEqual(step.actions, [
    { kind: 'unload', unitId: 'inf-a' },
    { kind: 'march', unitId: 'inf-a', toH3: CITY },
    { kind: 'defend', unitId: 'ship-1', atH3: BEACH },
  ]);
  assert.equal(step.next?.phase, 'assault');
  assert.deepEqual(step.next?.unitIds, ['inf-a']);
  assert.deepEqual(step.next?.carrierIds, []);
});

test('cargo defends when the landing hex is the objective', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a'], CITY, ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: CITY }),
    facts({
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
    }),
  );
  assert.deepEqual(step.actions, [
    { kind: 'unload', unitId: 'inf-a' },
    { kind: 'defend', unitId: 'inf-a', atH3: CITY },
    { kind: 'defend', unitId: 'ship-1', atH3: CITY },
  ]);
  assert.equal(step.actions.some((action) => action.kind === 'march'), false);
});

test('transit turns back when the objective is neither an enemy city nor ours', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a'], 'sea', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
      objectiveIsEnemyCity: false,
      objectiveIsOwn: false,
    }),
  );
  assert.equal(step.next?.phase, 'return');
  assert.equal(step.outcome, 'running');
});

test('transit is lost when the ship and its cargo are gone', () => {
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts(),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'lost');
  assert.deepEqual(step.releasedIds, []);
});

test('one ship landing does not drop that cargo on the next tick', () => {
  const firstHex = placed(['inf-a', 'inf-b'], 'sea', ['ship-1', 'ship-2']);
  firstHex.unitHexById.set('ship-1', BEACH);
  firstHex.unitHexById.set('inf-a', BEACH);
  const first = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1', 'ship-2'], landingH3: BEACH }),
    facts({
      unitHexById: firstHex.unitHexById,
      unitTypeById: firstHex.unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1'], ['inf-b', 'ship-2']]),
    }),
  );
  assert.equal(first.next?.phase, 'transit');
  assert.deepEqual(first.next?.unitIds, ['inf-a', 'inf-b']);
  assert.deepEqual(first.next?.carrierIds, ['ship-2']);
  assert.deepEqual(first.actions.filter((action) => action.unitId === 'inf-a'), [
    { kind: 'unload', unitId: 'inf-a' },
    { kind: 'march', unitId: 'inf-a', toH3: CITY },
  ]);

  const secondHex = placed(['inf-a', 'inf-b'], 'sea', ['ship-2']);
  secondHex.unitHexById.set('inf-a', BEACH);
  const second = advanceSeaOperation(
    operation({
      phase: 'transit',
      unitIds: first.next?.unitIds ?? [],
      carrierIds: first.next?.carrierIds ?? [],
      landingH3: BEACH,
    }),
    facts({
      unitHexById: secondHex.unitHexById,
      unitTypeById: secondHex.unitTypeById,
      carrierByCargoId: new Map([['inf-b', 'ship-2']]),
      storedOrderById: new Map([['inf-a', { type: 'march', h3Index: CITY }]]),
    }),
  );
  assert.deepEqual(second.next?.unitIds, ['inf-a', 'inf-b']);
  assert.equal(second.releasedIds.includes('inf-a'), false);
});

test('a loaded ship with its own march releases itself and its cargo', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'sea', ['ship-1', 'ship-2']);
  const continued = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1', 'ship-2'], landingH3: BEACH }),
    facts({
      turnNumber: 2,
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1'], ['inf-b', 'ship-2']]),
      storedOrderById: new Map([['ship-1', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.deepEqual(continued.releasedIds, ['inf-a', 'ship-1']);
  assert.equal(continued.actions.some((action) => action.kind === 'unload'), false);
  assert.equal(spares(continued.actions, 'ship-1'), true);
  assert.equal(spares(continued.actions, 'inf-a'), true);
  assert.equal(continued.next?.phase, 'transit');
  assert.deepEqual(continued.next?.carrierIds, ['ship-2']);
  assert.equal(continued.outcome, 'running');

  const last = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      turnNumber: 2,
      unitHexById: placed(['inf-a'], 'sea', ['ship-1']).unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
      storedOrderById: new Map([['ship-1', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.deepEqual(last.releasedIds, ['inf-a', 'ship-1']);
  assert.equal(last.next, null);
  assert.equal(last.outcome, 'abandoned');
  assert.equal(last.actions.some((action) => action.kind === 'unload'), false);
});

test('an embarked unit with its own order is released and the ship unloads the rest', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], BEACH, ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      turnNumber: 2,
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1'], ['inf-b', 'ship-1']]),
      storedOrderById: new Map([['inf-a', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.deepEqual(step.releasedIds, ['inf-a']);
  assert.equal(step.actions.some((action) => action.kind === 'unload' && action.unitId === 'inf-a'), false);
  assert.deepEqual(step.actions.filter((action) => action.kind === 'unload'), [{ kind: 'unload', unitId: 'inf-b' }]);
  assert.deepEqual(step.next?.unitIds, ['inf-b']);
});

test('assault timeout ends with no new order', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a'], 'away');
  const step = advanceSeaOperation(
    operation({ phase: 'assault', unitIds: ['inf-a'], carrierIds: [] }),
    facts({ turnNumber: 7, unitHexById, unitTypeById }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
  assert.deepEqual(step.actions, []);
});

test('assault completes with a defend for a unit on the objective', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away');
  unitHexById.set('inf-a', CITY);
  const step = advanceSeaOperation(
    operation({ phase: 'assault', unitIds: ['inf-a', 'inf-b'], carrierIds: [] }),
    facts({ unitHexById, unitTypeById, objectiveIsOwn: true, objectiveIsEnemyCity: false }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'completed');
  assert.deepEqual(step.actions, [{ kind: 'defend', unitId: 'inf-a', atH3: CITY }]);
});

test('return unloads at the port and a long voyage home keeps running', () => {
  const home = placed(['inf-a'], PORT, ['ship-1']);
  const arrived = advanceSeaOperation(
    operation({ phase: 'return', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      unitHexById: home.unitHexById,
      unitTypeById: home.unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
    }),
  );
  assert.deepEqual(arrived.actions, [
    { kind: 'unload', unitId: 'inf-a' },
    { kind: 'defend', unitId: 'inf-a', atH3: PORT },
    { kind: 'defend', unitId: 'ship-1', atH3: PORT },
  ]);
  assert.equal(arrived.next, null);
  assert.equal(arrived.outcome, 'abandoned');

  const atSea = placed(['inf-a'], 'sea', ['ship-1']);
  const sailing = advanceSeaOperation(
    operation({ phase: 'return', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH, phaseTurn: 1 }),
    facts({
      turnNumber: 101,
      unitHexById: atSea.unitHexById,
      unitTypeById: atSea.unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
    }),
  );
  assert.equal(sailing.outcome, 'running');
  assert.equal(sailing.next?.phase, 'return');
  assert.deepEqual(sailing.next?.carrierIds, ['ship-1']);
  assert.deepEqual(sailing.next?.unitIds, ['inf-a']);
});

test('turning back sails to the port chosen from the first ship', () => {
  const seen: string[] = [];
  const { unitHexById } = placed(['inf-a'], 'sea', ['ship-1']);
  const step = turnSeaOperationBack(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      unitHexById,
      chooseReturnPort: (fromH3) => {
        seen.push(fromH3);
        return 'home-2';
      },
    }),
  );
  assert.deepEqual(seen, ['sea']);
  assert.equal(step.next?.phase, 'return');
  assert.equal(step.next?.musterH3, 'home-2');
  assert.deepEqual(step.actions, [{ kind: 'march', unitId: 'ship-1', toH3: 'home-2' }]);
  assert.equal(step.outcome, 'running');
});

test('cancelling a muster frees every unit and ship', () => {
  const step = cancelSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a'], carrierIds: ['ship-1'] }),
    facts(),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
  assert.deepEqual(step.actions, [
    { kind: 'cancelOrder', unitId: 'inf-a' },
    { kind: 'cancelOrder', unitId: 'ship-1' },
  ]);
});

test('cancelling a transit turns the ships back', () => {
  const { unitHexById } = placed(['inf-a'], 'sea', ['ship-1']);
  const step = cancelSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({ unitHexById, chooseReturnPort: () => 'home-2' }),
  );
  assert.equal(step.next?.phase, 'return');
  assert.equal(step.next?.musterH3, 'home-2');
  assert.equal(step.outcome, 'running');
  assert.deepEqual(step.actions, [{ kind: 'march', unitId: 'ship-1', toH3: 'home-2' }]);
});

test('cancelling an assault ends it without a new order', () => {
  const step = cancelSeaOperation(
    operation({ phase: 'assault', unitIds: ['inf-a'], carrierIds: [] }),
    facts(),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
  assert.deepEqual(step.actions, []);
});

test('cancelling a return leaves the operation', () => {
  const stored = operation({ phase: 'return', unitIds: ['inf-a'], carrierIds: ['ship-1'] });
  const step = cancelSeaOperation(stored, facts());
  assert.equal(step.next, stored);
  assert.equal(step.outcome, 'running');
  assert.equal(step.reason, 'already returning');
  assert.deepEqual(step.actions, []);
});
