/**
 * Tool 5 (Standing Orders) — happy path and essential failure cases per execution plan.
 * Uses established test pattern: error cases with minimal state; happy path when DB is available.
 * Run with: node dist/tools/tool5StandingOrders.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { executeTool5, getInjectionText } from './tool5StandingOrders';
import {
  dbGetOne,
  dbRun,
  getGameState,
  resetGameForNewMatch,
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
} from '../gameDb';
import { executeStandingOrderActionForPlayer, generateOrdersForStandingOrders } from './tool5StandingOrders';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Documents the module-scope binding `emptyMap` (emptyMap).

 * Purpose: Supports maintainability by documenting why `emptyMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const emptyMap = new Map<string, [number, number]>();
/**
 * Documents the module-scope binding `noopResolve` (noopResolve).

 * Purpose: Supports maintainability by documenting why `noopResolve` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const noopResolve = (): string | undefined => undefined;

/**
 * Documents the module-scope binding `emptyState` (emptyState: GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `emptyState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const emptyState: GameStateSnapshot = {
    /**
   * Documents the object literal property `turnNumber` (turnNumber: 1).

   * Purpose: Supports maintainability by documenting why `turnNumber` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
turnNumber: 1,
    /**
   * Documents the object literal property `phase` (phase: 'planning').

   * Purpose: Supports maintainability by documenting why `phase` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
phase: 'planning',
    /**
   * Documents the object literal property `hexes` (hexes: []).

   * Purpose: Supports maintainability by documenting why `hexes` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hexes: [],
    /**
   * Documents the object literal property `units` (units: []).

   * Purpose: Supports maintainability by documenting why `units` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
units: [],
    /**
   * Documents the object literal property `pendingOrders` (pendingOrders: []).

   * Purpose: Supports maintainability by documenting why `pendingOrders` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
pendingOrders: [],
};

/**
 * Defines the `testAssignOrderUnitNotFound` function shape (function testAssignOrderUnitNotFound(): void).

 * Purpose: Supports maintainability by documenting why `testAssignOrderUnitNotFound` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testAssignOrderPursueTargetNotFound` function shape (function testAssignOrderPursueTargetNotFound(): void).

 * Purpose: Supports maintainability by documenting why `testAssignOrderPursueTargetNotFound` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssignOrderPursueTargetNotFound(): void {
  const stateWithUnit: GameStateSnapshot = {
    ...emptyState,
    hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'plains' }],
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

/**
 * Defines the `testAssignOrderPatrolTooFewWaypoints` function shape (function testAssignOrderPatrolTooFewWaypoints(): void).

 * Purpose: Supports maintainability by documenting why `testAssignOrderPatrolTooFewWaypoints` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssignOrderPatrolTooFewWaypoints(): void {
  const stateWithUnit: GameStateSnapshot = {
    ...emptyState,
    hexes: [
      { h3Index: 'a', terrain: 'land', terrainKind: 'plains' },
      { h3Index: 'b', terrain: 'land', terrainKind: 'plains' },
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

/**
 * Defines the `testQueryOrdersRequiresUnitIdOrAll` function shape (function testQueryOrdersRequiresUnitIdOrAll(): void).

 * Purpose: Supports maintainability by documenting why `testQueryOrdersRequiresUnitIdOrAll` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testQueryOrdersRequiresUnitIdOrAll(): void {
  const result = executeTool5('query_orders', {}, emptyState, emptyMap, noopResolve);
  assert.strictEqual(result.status, 'error');
  assert.ok((result as { error?: string }).error?.includes('query_orders requires'));
}

/**
 * Defines the `testCancelOrderWhenNoOrder` function shape (function testCancelOrderWhenNoOrder(): void).

 * Purpose: Supports maintainability by documenting why `testCancelOrderWhenNoOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `testGetInjectionTextEmpty` function shape (function testGetInjectionTextEmpty(): void).

 * Purpose: Supports maintainability by documenting why `testGetInjectionTextEmpty` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testGetInjectionTextEmpty(): void {
  const stateWithUnits: GameStateSnapshot = {
    ...emptyState,
    hexes: [{ h3Index: 'a', terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: 'a' },
    ],
  };
  const text = getInjectionText('opponent', stateWithUnits);
  assert.ok(text.includes('=== STANDING ORDER STATUS'));
  assert.ok(text.includes('Turn 1'));
  assert.ok(text.includes('| Unit ID | Unit Type | Order Type | Destination / Target | Status | Next Move | Turns Remaining | Attention |'));
  assert.ok(text.includes('**Units without standing orders**'));
  assert.ok(text.includes('| opponent-armor-1 |'));
}

/**
 * Defines the `testAssignMarchToCurrentHexDoesNotPersistStandingOrder` function shape (function testAssignMarchToCurrentHexDoesNotPersistStandingOrder(): void).

 * Purpose: Supports maintainability by documenting why `testAssignMarchToCurrentHexDoesNotPersistStandingOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAssignMarchToCurrentHexDoesNotPersistStandingOrder(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent');
    assert.ok(unit, 'Expected an opponent unit in seeded test state');
    const [lat, lng] = cellToLatLng(unit!.h3Index);
    const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
    const resolveToH3 = (a: number, b: number): string | undefined => {
      try {
        return latLngToCell(a, b, 1);
      } catch {
        return undefined;
      }
    };

    const result = executeStandingOrderActionForPlayer(
      'opponent',
      'assign_order',
      { unitId: unit!.id, order: { type: 'march', destination: [lat, lng] } },
      state,
      latLngByH3,
      resolveToH3
    );
    assert.strictEqual(result.status, 'ok');
    const row = dbGetOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      ['opponent', unit!.id]
    );
    assert.strictEqual(row?.c ?? 0, 0, 'Arrived march order should not persist');
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Defines the `testGenerateRemovesArrivedMarchOrder` function shape (function testGenerateRemovesArrivedMarchOrder(): void).

 * Purpose: Supports maintainability by documenting why `testGenerateRemovesArrivedMarchOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testGenerateRemovesArrivedMarchOrder(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'human');
    assert.ok(unit, 'Expected a human unit in seeded test state');
    const [lat, lng] = cellToLatLng(unit!.h3Index);
    const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
    const resolveToH3 = (a: number, b: number): string | undefined => {
      try {
        return latLngToCell(a, b, 1);
      } catch {
        return undefined;
      }
    };

    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'human',
        unit!.id,
        'march',
        JSON.stringify({ type: 'march', destination: [lat, lng], avoidEnemies: true, engageEnRoute: false }),
        null,
        'en_route',
        state.turnNumber,
        JSON.stringify([lat, lng]),
      ]
    );

    generateOrdersForStandingOrders('human', state, latLngByH3, resolveToH3);
    const row = dbGetOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      ['human', unit!.id]
    );
    assert.strictEqual(row?.c ?? 0, 0, 'Arrived march order should be deleted during generation');
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Defines the `testHumanMarchDefaultsAvoidEnemiesFalse` function shape (function testHumanMarchDefaultsAvoidEnemiesFalse(): void).

 * Purpose: Supports maintainability by documenting why `testHumanMarchDefaultsAvoidEnemiesFalse` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testHumanMarchDefaultsAvoidEnemiesFalse(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'human' && (u.unitType === 'infantry' || u.unitType === 'armor'));
    assert.ok(unit, 'Expected a human land unit in seeded test state');
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const destinationH3 = gridDisk(unit!.h3Index, 1).find((h3) => {
      if (h3 === unit!.h3Index) return false;
      const hex = hexByH3.get(h3);
      if (!hex) return false;
      return hex.terrain !== 'water';
    });
    assert.ok(destinationH3, 'Expected an adjacent non-water destination hex');
    const [destLat, destLng] = cellToLatLng(destinationH3!);
    const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
    const resolveToH3 = (a: number, b: number): string | undefined => {
      try {
        return latLngToCell(a, b, 1);
      } catch {
        return undefined;
      }
    };
    const result = executeStandingOrderActionForPlayer(
      'human',
      'assign_order',
      { unitId: unit!.id, order: { type: 'march', destination: [destLat, destLng] } },
      state,
      latLngByH3,
      resolveToH3
    );
    assert.strictEqual(result.status, 'ok');
    const row = dbGetOne<{ params: string }>(
      'SELECT params FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      ['human', unit!.id]
    );
    assert.ok(row?.params, 'Expected persisted standing order params');
    const parsed = JSON.parse(row!.params) as { avoidEnemies?: boolean };
    assert.strictEqual(parsed.avoidEnemies, false, 'Human march should default avoidEnemies to false');
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testAssignOrderUnitNotFound();
  testAssignOrderPursueTargetNotFound();
  testAssignOrderPatrolTooFewWaypoints();
  testQueryOrdersRequiresUnitIdOrAll();
  testCancelOrderWhenNoOrder();
  testGetInjectionTextEmpty();
  testAssignMarchToCurrentHexDoesNotPersistStandingOrder();
  testGenerateRemovesArrivedMarchOrder();
  testHumanMarchDefaultsAvoidEnemiesFalse();
  console.log('tool5StandingOrders tests passed');
}

run();
