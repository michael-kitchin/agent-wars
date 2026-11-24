/**
 * Sea operation muster: gather, load, time out, and give up.
 *
 * Purpose: The muster rules decide when a force sails, so each rule needs one direct case.
 * When to use: After changes to `advanceSeaMuster` or the muster rules.
 * Expected outcome: Process exit 0. Facts are built by hand. No database and no map.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PORT, BEACH, operation, facts, placed, spares } from '../testSupport/seaOperationTestFixtures';
import { advanceSeaOperation } from './seaOperationAdvance';

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

test('a muster waits while a needed ship is still at sea', () => {
  const ids = ['inf-a', 'inf-b', 'inf-c', 'inf-d', 'inf-e', 'inf-f'];
  const { unitHexById, unitTypeById } = placed(ids, PORT, ['ship-1']);
  unitHexById.set('ship-2', 'sea');
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ids, carrierIds: ['ship-1', 'ship-2'] }),
    facts({ unitHexById, unitTypeById }),
  );
  assert.equal(step.next?.phase, 'muster');
  assert.equal(step.outcome, 'running');
  assert.ok(step.actions.some((action) => action.kind === 'march' && action.unitId === 'ship-2' && action.toH3 === PORT));
  assert.ok(step.actions.every((action) => action.kind !== 'embark'));
});

test('a muster sails once every needed ship is at the port', () => {
  const ids = ['inf-a', 'inf-b', 'inf-c', 'inf-d', 'inf-e', 'inf-f'];
  const { unitHexById, unitTypeById } = placed(ids, PORT, ['ship-1', 'ship-2']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ids, carrierIds: ['ship-1', 'ship-2'] }),
    facts({ unitHexById, unitTypeById }),
  );
  assert.equal(step.next?.phase, 'transit');
  assert.deepEqual(step.next?.unitIds, ids);
  assert.deepEqual(step.next?.carrierIds, ['ship-1', 'ship-2']);
  const embarks = step.actions.filter((action) => action.kind === 'embark');
  assert.deepEqual(embarks.filter((action) => action.carrierId === 'ship-1').map((action) => action.unitId), ['inf-a', 'inf-b', 'inf-c', 'inf-d']);
  assert.deepEqual(embarks.filter((action) => action.carrierId === 'ship-2').map((action) => action.unitId), ['inf-e', 'inf-f']);
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

test('muster timeout abandons a raid with one arrival of two', () => {
  const one = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  one.unitHexById.set('inf-a', PORT);
  one.unitHexById.set('ship-1', PORT);
  const abandoned = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({ turnNumber: 11, unitHexById: one.unitHexById, unitTypeById: one.unitTypeById }),
  );
  assert.equal(abandoned.next, null);
  assert.equal(abandoned.outcome, 'abandoned');
  assert.equal(abandoned.reason, 'muster-timeout');
});

test('muster timeout sails a raid that carries three of four', () => {
  const ids = ['inf-a', 'inf-b', 'inf-c', 'inf-d'];
  const three = placed(ids, 'away', ['ship-1']);
  for (const id of ['inf-a', 'inf-b', 'inf-c', 'ship-1']) three.unitHexById.set(id, PORT);
  const sailing = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ids, carrierIds: ['ship-1'] }),
    facts({ turnNumber: 11, unitHexById: three.unitHexById, unitTypeById: three.unitTypeById }),
  );
  assert.equal(sailing.next?.phase, 'transit');
  assert.deepEqual(sailing.next?.unitIds, ['inf-a', 'inf-b', 'inf-c']);
  assert.deepEqual(sailing.actions.filter((action) => action.unitId === 'inf-d'), [{ kind: 'cancelOrder', unitId: 'inf-d' }]);
});

test('muster timeout abandons a raid that carries two of four', () => {
  const ids = ['inf-a', 'inf-b', 'inf-c', 'inf-d'];
  const two = placed(ids, 'away', ['ship-1']);
  for (const id of ['inf-a', 'inf-b', 'ship-1']) two.unitHexById.set(id, PORT);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ids, carrierIds: ['ship-1'] }),
    facts({ turnNumber: 11, unitHexById: two.unitHexById, unitTypeById: two.unitTypeById }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
});

test('a campaign lift at the muster timeout needs its minimum', () => {
  const ids = ['inf-a', 'inf-b', 'inf-c', 'inf-d'];
  const { unitHexById, unitTypeById } = placed(ids, PORT, ['ship-1']);
  unitHexById.set('inf-d', 'away');
  const step = advanceSeaOperation(
    operation({ phase: 'muster', purpose: 'campaign', minGroundUnits: 4, unitIds: ids, carrierIds: ['ship-1'] }),
    facts({ turnNumber: 11, unitHexById, unitTypeById }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'abandoned');
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

test('a muster whose only ship is gone from the map ends as lost', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away');
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({ turnNumber: 3, unitHexById, unitTypeById }),
  );
  assert.equal(step.next, null);
  assert.equal(step.outcome, 'lost');
  assert.equal(step.reason, 'muster-empty');
});

test('a muster whose only ship the commander took out ends as abandoned', () => {
  const { unitHexById, unitTypeById } = placed(['inf-a', 'inf-b'], 'away', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({
      turnNumber: 3,
      unitHexById,
      unitTypeById,
      storedOrderById: new Map([['ship-1', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.equal(step.outcome, 'abandoned');
  assert.equal(step.reason, 'muster-empty');
  assert.deepEqual(step.releasedIds, ['ship-1']);
});

test('a muster with its ship taken out is abandoned even when a ground unit was also lost', () => {
  const { unitHexById, unitTypeById } = placed(['inf-b'], 'away', ['ship-1']);
  const step = advanceSeaOperation(
    operation({ phase: 'muster', unitIds: ['inf-a', 'inf-b'], carrierIds: ['ship-1'] }),
    facts({
      turnNumber: 3,
      unitHexById,
      unitTypeById,
      storedOrderById: new Map([['ship-1', { type: 'march', h3Index: 'elsewhere' }]]),
    }),
  );
  assert.equal(step.outcome, 'abandoned');
});
