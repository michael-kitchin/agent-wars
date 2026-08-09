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
import { getOrderedHexList } from '../mapData';
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
 * Defines the `testAssignOrderAirUnitRejectsMovementOrders` function shape (function testAssignOrderAirUnitRejectsMovementOrders(): void).

 * Purpose: Guards the contract that air units cannot take hex-by-hex movement standing orders, which would
 * otherwise persist an order that re-requests an unsatisfiable land route on every turn.
 * When to use: Runs as part of the Tool 5 suite; extend it if a new movement order type is added.
 * Expected outcome: Each of march, patrol, and pursue is rejected for an air unit with a message naming the type.
 * Exceptions: None.
 */
function testAssignOrderAirUnitRejectsMovementOrders(): void {
  const stateWithAirUnit: GameStateSnapshot = {
    ...emptyState,
    hexes: [
      { h3Index: 'a', terrain: 'land', terrainKind: 'plains' },
      { h3Index: 'b', terrain: 'land', terrainKind: 'plains' },
    ],
    units: [
      { id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: 'a' },
      { id: 'human-armor-1', player: 'human', unitType: 'armor', h3Index: 'b' },
    ],
  };
  const resolve = (lat: number, lng: number): string | undefined =>
    lat === 0 && lng === 0 ? 'a' : lat === 1 && lng === 1 ? 'b' : undefined;
  const movementOrders = [
    { type: 'march', destination: [1, 1] },
    { type: 'patrol', waypoints: [[0, 0], [1, 1]] },
    { type: 'pursue', targetUnitId: 'human-armor-1' },
  ];
  for (const order of movementOrders) {
    const result = executeTool5('assign_order', { unitId: 'opponent-air-1', order }, stateWithAirUnit, emptyMap, resolve);
    assert.strictEqual(result.status, 'error', `air ${order.type} should be rejected`);
    const message = (result as { error?: string }).error ?? '';
    assert.ok(message.includes('Air units cannot take'), `unexpected message for ${order.type}: ${message}`);
    assert.ok(message.includes(order.type), `message should name the order type: ${message}`);
  }
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
  const h3Sample = getOrderedHexList()[0]!;
  const stateWithUnits: GameStateSnapshot = {
    ...emptyState,
    hexes: [{ h3Index: h3Sample, terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: h3Sample },
    ],
  };
  const text = getInjectionText('opponent', stateWithUnits);
  assert.ok(text.includes('# Standing Order Status'));
  assert.ok(text.includes('| Unit ID | Unit Type | Order Type | Destination / Target | Status | Next Move | Turns Remaining | Attention |'));
  assert.ok(text.includes('## Units Without Standing Orders'));
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
 * Defines the `testDefendAutoEngagementClosestInRangeEnemy` function shape.
 *
 * Purpose: Regression for DEFEND auto-engagement from current position while en route to the defend hex.
 * When to use: After edits to `appendDefendStandingOrderEngagement` or the defend branch in standing-order generation.
 * Expected outcome: Closest in-range enemy hex is targeted and march toward defend hex is still emitted.
 * Exceptions: Skips when seeded map lacks suitable land hexes at distances 1, 2, and 4.
 */
function testDefendAutoEngagementClosestInRangeEnemy(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const human = state.units.find((u) => u.player === 'human' && u.unitType === 'armor');
    assert.ok(human, 'Expected human armor');
    const opponent = state.units.find((u) => u.player === 'opponent' && u.unitType === 'infantry');
    assert.ok(opponent, 'Expected opponent infantry');
    const adjacentToHuman = gridDisk(human!.h3Index, 1).find(
      (h3) => h3 !== human!.h3Index && state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water')
    );
    const fartherHex = gridDisk(human!.h3Index, 2).find(
      (h3) =>
        h3 !== human!.h3Index &&
        h3 !== adjacentToHuman &&
        state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water')
    );
    assert.ok(adjacentToHuman && fartherHex, 'Expected land hexes at distances 1 and 2');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [adjacentToHuman, opponent!.id]);
    const farOpponentId = 'opponent-infantry-far-test';
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'opponent', 'infantry', ?, 99)`,
      [farOpponentId, fartherHex]
    );
    const defendDest = gridDisk(human!.h3Index, 4).find(
      (h3) => h3 !== human!.h3Index && state.hexes.some((hex) => hex.h3Index === h3 && hex.terrain !== 'water')
    );
    assert.ok(defendDest, 'Expected defend destination');
    const [defLat, defLng] = cellToLatLng(defendDest!);
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
        human!.id,
        'defend',
        JSON.stringify({ type: 'defend', defendHex: [defLat, defLng] }),
        null,
        'en_route',
        state.turnNumber,
        JSON.stringify(cellToLatLng(human!.h3Index)),
      ]
    );
    const refreshed = getGameState();
    const generated = generateOrdersForStandingOrders('human', refreshed, latLngByH3, resolveToH3);
    assert.strictEqual(generated.rangedAttacks.length, 1);
    assert.strictEqual(generated.rangedAttacks[0]!.unitId, human!.id);
    assert.strictEqual(generated.rangedAttacks[0]!.targetH3Index, adjacentToHuman);
    assert.ok(generated.movementOrders.some((o) => o.unitId === human!.id), 'defend en route should still march');
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
/**
 * Verifies that DEFEND auto-engagement generates an air strike (not ranged) for an air unit and picks the closest enemy.
 *
 * Purpose: Regression for the `appendDefendStandingOrderEngagement` air branch.
 * When to use: After edits to `appendDefendStandingOrderEngagement` or the `air` branch in standing-order generation.
 * Expected outcome: `airStrikes` contains the closest in-range enemy hex; `rangedAttacks` remains empty for that unit.
 * Exceptions: Skips when seeded map lacks a human air unit or an adjacent non-water enemy hex.
 */
function testDefendAutoEngagementAirUnitUsesAirStrikeNotRanged(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-air-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const airUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'air');
    if (!airUnit) {
      console.log('testDefendAutoEngagementAirUnitUsesAirStrikeNotRanged: skip — no human air unit in seed');
      return;
    }
    const adjacentToAir = gridDisk(airUnit.h3Index, 1).find(
      (h3) => h3 !== airUnit.h3Index && state.hexes.some((h) => h.h3Index === h3 && h.terrain !== 'water')
    );
    if (!adjacentToAir) {
      console.log('testDefendAutoEngagementAirUnitUsesAirStrikeNotRanged: skip — no adjacent non-water hex for air unit');
      return;
    }
    const opponentId = 'opponent-infantry-air-test';
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'opponent', 'infantry', ?, 99)`,
      [opponentId, adjacentToAir]
    );
    const [defLat, defLng] = cellToLatLng(airUnit.h3Index);
    const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
    const resolveToH3 = (a: number, b: number): string | undefined => {
      try { return latLngToCell(a, b, 1); } catch { return undefined; }
    };
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['human', airUnit.id, 'defend', JSON.stringify({ type: 'defend', defendHex: [defLat, defLng] }), null, 'en_route', state.turnNumber, JSON.stringify(cellToLatLng(airUnit.h3Index))]
    );
    const refreshed = getGameState();
    const generated = generateOrdersForStandingOrders('human', refreshed, latLngByH3, resolveToH3);
    assert.strictEqual(generated.airStrikes.length, 1, 'air DEFEND should produce an air strike');
    assert.strictEqual(generated.airStrikes[0]!.unitId, airUnit.id);
    assert.strictEqual(generated.airStrikes[0]!.targetType, 'units');
    assert.strictEqual(
      generated.rangedAttacks.some((r) => r.unitId === airUnit.id),
      false,
      'air unit should not appear in rangedAttacks'
    );
  } finally {
    closeGameDatabaseForTests();
  }
}

function run(): void {
  testAssignOrderUnitNotFound();
  testAssignOrderPursueTargetNotFound();
  testAssignOrderPatrolTooFewWaypoints();
  testAssignOrderAirUnitRejectsMovementOrders();
  testQueryOrdersRequiresUnitIdOrAll();
  testCancelOrderWhenNoOrder();
  testGetInjectionTextEmpty();
  testAssignMarchToCurrentHexDoesNotPersistStandingOrder();
  testGenerateRemovesArrivedMarchOrder();
  testDefendAutoEngagementClosestInRangeEnemy();
  testDefendAutoEngagementAirUnitUsesAirStrikeNotRanged();
  testHumanMarchDefaultsAvoidEnemiesFalse();
  console.log('tool5StandingOrders tests passed');
}

run();
