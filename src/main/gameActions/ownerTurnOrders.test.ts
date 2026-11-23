/**
 * Contract tests for the owned-unit order filter.
 * Run: `npm run build:main` then `node dist/main/gameActions/ownerTurnOrders.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_OWNER_TURN_ORDERS, keepOrdersForOwnedUnits, type OwnerTurnOrders } from './ownerTurnOrders';

test('orders for units outside the owned set are dropped from every list', () => {
  const orders: OwnerTurnOrders = {
    movementOrders: [{ unitId: 'a', toH3Index: 'x' }, { unitId: 'b', toH3Index: 'x' }],
    rangedOrders: [{ unitId: 'a', targetH3Index: 'x' }, { unitId: 'b', targetH3Index: 'x' }],
    airStrikeOrders: [{ unitId: 'b', targetH3Index: 'x', targetType: 'unit' }],
    ferryOrders: [{ unitId: 'b', toH3Index: 'x' }],
    embarkOrders: [],
    missileLaunchOrders: [{ unitId: 'b', targetH3Index: 'x' }],
    airDropOrders: [{ unitId: 'b', targetH3Index: 'x' }],
  } as unknown as OwnerTurnOrders;
  const kept = keepOrdersForOwnedUnits(orders, new Set(['a']));
  assert.deepEqual(kept.movementOrders.map((o) => o.unitId), ['a']);
  assert.deepEqual(kept.rangedOrders.map((o) => o.unitId), ['a']);
  assert.equal(kept.airStrikeOrders.length, 0);
  assert.equal(kept.ferryOrders.length, 0);
  assert.equal(kept.missileLaunchOrders.length, 0);
  assert.equal(kept.airDropOrders?.length, 0);
});

test('an embark onto an unowned ship is dropped, and an absent drop list stays absent', () => {
  const orders: OwnerTurnOrders = {
    ...EMPTY_OWNER_TURN_ORDERS,
    airDropOrders: undefined,
    embarkOrders: [
      { unitId: 'a', navalUnitId: 'ship' },
      { unitId: 'a', navalUnitId: 'fired-ship' },
    ],
  };
  const kept = keepOrdersForOwnedUnits(orders, new Set(['a', 'ship']));
  assert.deepEqual(kept.embarkOrders, [{ unitId: 'a', navalUnitId: 'ship' }]);
  assert.equal(kept.airDropOrders, undefined);
});

test('the input is not changed', () => {
  const movement = [{ unitId: 'a', toH3Index: 'x' }, { unitId: 'b', toH3Index: 'x' }];
  const orders: OwnerTurnOrders = { ...EMPTY_OWNER_TURN_ORDERS, movementOrders: movement };
  keepOrdersForOwnedUnits(orders, new Set(['a']));
  assert.equal(orders.movementOrders, movement);
  assert.equal(movement.length, 2);
});
