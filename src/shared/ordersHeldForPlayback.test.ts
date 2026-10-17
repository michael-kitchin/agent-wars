import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HumanStandingOrderSnapshot } from './ipc/humanOrderPreviewTypes';
import { ordersHeldUntilMovementEnds } from './ordersHeldForPlayback';

/**
 * Builds one standing order for the hold tests.
 *
 * Purpose: Keeps each case focused on destination, route, and who moved.
 * When to use: Only from this file.
 * Expected outcome: A human order with the given destination and one route segment when `withRoute` is true.
 * Exceptions: None.
 */
function order(unitId: string, destinationH3Index: string | null, withRoute: boolean): HumanStandingOrderSnapshot {
  return {
    unitId,
    status: 'active',
    destinationH3Index,
    turnsRemaining: 0,
    nextMoveH3Index: destinationH3Index,
    ...(withRoute && destinationH3Index
      ? { routeSegments: [{ turn: 1, hexes: [[0, 0] as [number, number], [1, 1] as [number, number]] }] }
      : {}),
  };
}

test('ordersHeldUntilMovementEnds keeps an arrived march that playback still has to show', () => {
  const source = order('fleet-1', 'dest', true);
  const held = ordersHeldUntilMovementEnds(
    [source],
    [{ id: 'fleet-1', player: 'human', h3Index: 'dest' }],
    [{ unitId: 'fleet-1', fromH3Index: 'origin' }]
  );
  assert.deepEqual(held.originH3ByUnitId, { 'fleet-1': 'origin' });
  assert.equal(held.orders.length, 1);
  assert.equal(held.orders[0]?.unitId, 'fleet-1');
  source.routeSegments?.[0]?.hexes.splice(0, 1);
  assert.equal(held.orders[0]?.routeSegments?.[0]?.hexes.length, 2);
});

test('ordersHeldUntilMovementEnds skips a march that has not arrived and one with no destination', () => {
  const held = ordersHeldUntilMovementEnds(
    [order('army-1', 'dest', true), order('army-2', null, false)],
    [{ id: 'army-1', player: 'human', h3Index: 'mid' }],
    [{ unitId: 'army-1', fromH3Index: 'origin' }]
  );
  assert.deepEqual(held, { orders: [], originH3ByUnitId: {} });
});

test('ordersHeldUntilMovementEnds drops an arrived unit whose playback did not move it', () => {
  const held = ordersHeldUntilMovementEnds(
    [order('fleet-1', 'dest', false)],
    [{ id: 'fleet-1', player: 'human', h3Index: 'dest' }],
    [{ unitId: 'fleet-1', fromH3Index: 'dest' }]
  );
  assert.deepEqual(held, { orders: [], originH3ByUnitId: {} });
});
