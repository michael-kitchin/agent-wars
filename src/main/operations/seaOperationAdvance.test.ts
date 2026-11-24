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
import { PORT, CITY, BEACH, operation, facts, placed, spares } from '../testSupport/seaOperationTestFixtures';
import { advanceSeaOperation, cancelSeaOperation, turnSeaOperationBack } from './seaOperationAdvance';

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

test('a transit whose only cargo was released abandons and cancels the ship', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a'], 'sea', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({
      turnNumber: 2,
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
      storedOrderById: new Map([['inf-a', { type: 'defend', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
  assert.deepEqual(step.actions, [{ kind: 'cancelOrder', unitId: 'ship-1' }]);
});

test('a transit whose only cargo is missing from the map is lost', () => {
  const { unitHexById, unitTypeById } = placed([], 'sea', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a'], carrierIds: ['ship-1'], landingH3: BEACH }),
    facts({ turnNumber: 2, unitHexById, unitTypeById }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'lost');
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
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
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

test('units already ashore leave a turned-back transit and defend where they stand', () => {
  const carried = placed(['inf-a'], 'sea', ['ship-1']);
  const unitHexById = new Map(carried.unitHexById);
  unitHexById.set('inf-b', BEACH);
  const unitTypeById = new Map(carried.unitTypeById);
  unitTypeById.set('inf-b', 'infantry');
  const first = advanceSeaOperation(
    operation({ phase: 'transit', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'], landingH3: BEACH, phaseTurn: 1 }),
    facts({
      turnNumber: 2,
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
      objectiveIsEnemyCity: false,
      objectiveIsOwn: false,
    }),
  );
  assert.deepEqual(first.next?.unitIds, ['inf-a']);
  assert.deepEqual(first.releasedIds, []);
  assert.ok(first.actions.some((action) => action.kind === 'defend' && action.unitId === 'inf-b' && action.atH3 === BEACH));
  const returned = first.next;
  assert.ok(returned);
  const second = advanceSeaOperation(
    returned,
    facts({
      turnNumber: 3,
      unitHexById,
      unitTypeById,
      carrierByCargoId: new Map([['inf-a', 'ship-1']]),
      storedOrderById: new Map([['inf-b', { type: 'defend', h3Index: BEACH }]]),
      objectiveIsEnemyCity: false,
      objectiveIsOwn: false,
    }),
  );
  assert.equal(second.releasedIds.includes('inf-b'), false);
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
    facts({ unitHexById, carrierByCargoId: new Map([['inf-a', 'ship-1']]), chooseReturnPort: () => 'home-2' }),
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
