/**
 * Tool 5 (Standing Orders) — happy path and essential failure cases per execution plan.
 * Uses established test pattern: error cases with minimal state; happy path when DB is available.
 * Run with: node dist/tools/tool5StandingOrders.test.js
 */

import * as assert from 'assert';
import { executeTool5, getInjectionText } from './tool5StandingOrders';
import type { GameStateSnapshot } from '../gameDb';

const emptyMap = new Map<string, [number, number]>();
const noopResolve = (): string | undefined => undefined;

const emptyState: GameStateSnapshot = {
  turnNumber: 1,
  phase: 'planning',
  hexes: [],
  units: [],
  pendingOrders: [],
};

function testAssignOrderUnitNotFound(): void {
  const result = executeTool5(
    'assign_order',
    { unitId: 'nonexistent', order: { type: 'hold_fire' } },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('Unit not found'));
}

function testAssignOrderPursueTargetNotFound(): void {
  const stateWithUnit: GameStateSnapshot = {
    ...emptyState,
    hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'land' }],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' }],
  };
  const result = executeTool5(
    'assign_order',
    { unitId: 'opponent-armor-1', order: { type: 'pursue', targetUnitId: 'human-armor-99' } },
    stateWithUnit,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('Target unit not found'));
}

function testAssignOrderPatrolTooFewWaypoints(): void {
  const stateWithUnit: GameStateSnapshot = {
    ...emptyState,
    hexes: [
      { h3Index: 'a', terrain: 'land', terrainKind: 'land' },
      { h3Index: 'b', terrain: 'land', terrainKind: 'land' },
    ],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' }],
  };
  const result = executeTool5(
    'assign_order',
    { unitId: 'opponent-armor-1', order: { type: 'patrol', waypoints: [[0, 0]] } },
    stateWithUnit,
    emptyMap,
    (lat, lng) => (lat === 0 && lng === 0 ? 'a' : undefined)
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('at least 2 waypoints'));
}

function testQueryOrdersRequiresUnitIdOrAll(): void {
  const result = executeTool5('query_orders', {}, emptyState, emptyMap, noopResolve);
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('query_orders requires'));
}

function testCancelOrderWhenNoOrder(): void {
  const result = executeTool5(
    'cancel_order',
    { unitId: 'opponent-armor-1' },
    emptyState,
    emptyMap,
    noopResolve
  );
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('No standing order found'));
}

function testGetInjectionTextEmpty(): void {
  const stateWithUnits: GameStateSnapshot = {
    ...emptyState,
    hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'land' }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' },
    ],
  };
  const text = getInjectionText('opponent', stateWithUnits);
  assert.ok(text.includes('=== STANDING ORDER STATUS'));
  assert.ok(text.includes('Turn 1'));
  assert.ok(text.includes('Units without standing orders: opponent-armor-1'));
}

function run(): void {
  testAssignOrderUnitNotFound();
  testAssignOrderPursueTargetNotFound();
  testAssignOrderPatrolTooFewWaypoints();
  testQueryOrdersRequiresUnitIdOrAll();
  testCancelOrderWhenNoOrder();
  testGetInjectionTextEmpty();
  console.log('tool5StandingOrders tests passed');
}

run();
