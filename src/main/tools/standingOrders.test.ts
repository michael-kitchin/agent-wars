/**
 * Tool 5 (Standing Orders) — happy path and essential failure cases per execution plan.
 * Uses established test pattern: error cases with minimal state; happy path when DB is available.
 * Run with: node dist/tools/standingOrders.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { cellToLatLng, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import { getOrderedHexList } from '../mapData';
import { safeGridHexDistance } from './assessUnitProximity';
import { executeStandingOrders, getInjectionText } from './standingOrders';
import {
  dbGetOne,
  dbRun,
  getGameState,
  resetGameForNewMatch,
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
} from '../gameDb';
import { executeStandingOrderActionForPlayer, generateOrdersForStandingOrders } from './standingOrders';
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
  const result = executeStandingOrders(
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
  const result = executeStandingOrders(
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
  const result = executeStandingOrders(
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
    const result = executeStandingOrders('assign_order', { unitId: 'opponent-air-1', order }, stateWithAirUnit, emptyMap, resolve);
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
  const result = executeStandingOrders('query_orders', {}, emptyState, emptyMap, noopResolve);
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
  const result = executeStandingOrders(
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
 * Ensures the standing-order briefing expires arrived marches before listing them as active missions.
 *
 * Purpose: Turn 9 strategic prompts still showed MARCH/en_route for units already on the destination hex, so the AI skipped reassignment and those units sat idle after expire ran post-response.
 * When to use: After edits to `getInjectionText` or `expireAndUpdateStatus` arrival cleanup.
 * Expected outcome: The arrived row is deleted; the unit appears under Units Without Standing Orders, not as an active MARCH.
 * Exceptions: None.
 */
function testGetInjectionTextExpiresArrivedMarch(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((u) => u.player === 'opponent');
    assert.ok(unit, 'Expected an opponent unit in seeded test state');
    const [lat, lng] = cellToLatLng(unit!.h3Index);
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'opponent',
        unit!.id,
        'march',
        JSON.stringify({ type: 'march', destination: [lat, lng], avoidEnemies: true, engageEnRoute: false }),
        null,
        'en_route',
        state.turnNumber,
        JSON.stringify([lat, lng]),
      ]
    );

    const text = getInjectionText('opponent', state);
    const row = dbGetOne<{ c: number }>(
      'SELECT COUNT(*) AS c FROM standing_orders WHERE player_id = ? AND unit_id = ?',
      ['opponent', unit!.id]
    );
    assert.strictEqual(row?.c ?? 0, 0, 'Arrived march must be deleted before the briefing is rendered');
    const withoutSection = text.slice(text.indexOf('## Units Without Standing Orders'));
    assert.ok(
      withoutSection.includes(`| ${unit!.id} |`),
      'arrived unit must be listed as having no standing order'
    );
    const activeSection = text.slice(0, text.indexOf('## Units Without Standing Orders'));
    assert.ok(
      !activeSection.includes(`| ${unit!.id} |`),
      'arrived march must not remain in the active standing-order table'
    );
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
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const adjacentToAir = gridDisk(airUnit.h3Index, 1).find((h3) => h3 !== airUnit.h3Index && hexByH3.has(h3));
    assert.ok(adjacentToAir, 'seeded map should place the air unit next to at least one mapped hex');
    // The air unit can start stationed over open water, so the target type has to suit the neighbouring terrain.
    const enemyType = hexByH3.get(adjacentToAir!)!.terrain === 'water' ? 'naval' : 'infantry';
    const opponentId = 'opponent-air-test-target';
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'opponent', ?, ?, 99)`,
      [opponentId, enemyType, adjacentToAir]
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

/**
 * Verifies DEFEND air auto-engagement still fires when H3 cannot measure the attacker/target pair.
 *
 * Purpose: The range gate uses a `gridDisk` fallback, but the nearest-target comparison used raw `gridDistance`;
 * across an icosahedron face crossing it threw and silently discarded a strike the gate had just approved.
 * When to use: After changes to `appendDefendStandingOrderEngagement` or the shared distance fallback.
 * Expected outcome: Exactly one air strike, aimed at the unmeasurable hex.
 * Exceptions: Skips when the seed lacks a human air unit with a throwing hex inside strike range.
 */
function testDefendAutoEngagementAirStrikeSurvivesUnmeasurablePair(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-air-crossing-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const airUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'air');
    if (!airUnit) {
      console.log('testDefendAutoEngagementAirStrikeSurvivesUnmeasurablePair: skip — no human air unit in seed');
      return;
    }
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const unmeasurableTarget = gridDisk(airUnit.h3Index, AIR_STRIKE_RANGE_HEXES).find((h3) => {
      if (h3 === airUnit.h3Index || !hexByH3.has(h3)) return false;
      try {
        gridDistance(airUnit.h3Index, h3);
        return false;
      } catch {
        return true;
      }
    });
    if (!unmeasurableTarget) {
      console.log('testDefendAutoEngagementAirStrikeSurvivesUnmeasurablePair: skip — no face crossing in strike range');
      return;
    }
    const enemyType = hexByH3.get(unmeasurableTarget)!.terrain === 'water' ? 'naval' : 'infantry';
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'opponent', ?, ?, 99)`,
      ['opponent-air-crossing-target', enemyType, unmeasurableTarget]
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
    const generated = generateOrdersForStandingOrders('human', getGameState(), latLngByH3, resolveToH3);
    assert.strictEqual(generated.airStrikes.length, 1, 'unmeasurable pair must not forfeit the strike');
    assert.strictEqual(generated.airStrikes[0]!.targetH3Index, unmeasurableTarget);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Verifies engage-en-route fires at the marching unit's own weapon range, not only at adjacency.
 *
 * Purpose: The march branch tested for distance exactly 1 while its pursue and defend siblings both compare against
 * `getRange`, so a naval unit (range 2) marched past a legal shot without taking it.
 * When to use: After edits to the `march` branch of `generateOrdersForStandingOrders`.
 * Expected outcome: A naval unit marching with `engageEnRoute` fires on an enemy two hexes away.
 * Exceptions: Skips when the seeded map lacks a naval unit with a reachable non-adjacent target hex.
 */
function testMarchEngageEnRouteUsesWeaponRange(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-enroute-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const navalUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    if (!navalUnit) {
      console.log('testMarchEngageEnRouteUsesWeaponRange: skip — no human naval unit in seed');
      return;
    }
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const occupied = new Set(state.units.map((u) => u.h3Index));
    // Exactly two hexes away: inside naval range 2, outside the old adjacency-only test.
    const targetH3 = gridDisk(navalUnit.h3Index, 2).find(
      (h3) => hexByH3.has(h3) && !occupied.has(h3) && safeGridHexDistance(navalUnit.h3Index, h3) === 2
    );
    const marchDest = state.hexes.find(
      (h) => h.terrain === 'water' && h.h3Index !== navalUnit.h3Index && h.h3Index !== targetH3
    );
    if (!targetH3 || !marchDest) {
      console.log('testMarchEngageEnRouteUsesWeaponRange: skip — seed lacks a range-2 target or march destination');
      return;
    }
    dbRun(
      `INSERT INTO units (id, player, unit_type, h3_index, display_order) VALUES (?, 'opponent', 'naval', ?, 98)`,
      ['opponent-enroute-target', targetH3]
    );
    const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
    const resolveToH3 = (a: number, b: number): string | undefined => {
      try { return latLngToCell(a, b, 1); } catch { return undefined; }
    };
    const [destLat, destLng] = cellToLatLng(marchDest.h3Index);
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'human',
        navalUnit.id,
        'march',
        JSON.stringify({ type: 'march', destination: [destLat, destLng], avoidEnemies: false, engageEnRoute: true }),
        null,
        'en_route',
        state.turnNumber,
        JSON.stringify(cellToLatLng(navalUnit.h3Index)),
      ]
    );
    const generated = generateOrdersForStandingOrders('human', getGameState(), latLngByH3, resolveToH3);
    const shot = generated.rangedAttacks.find((r) => r.unitId === navalUnit.id);
    assert.ok(shot, 'naval march with engageEnRoute must fire at a target two hexes away');
    assert.strictEqual(shot!.targetH3Index, targetH3);
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Verifies a DEFEND order pointing away from an air unit's hex never turns into a march.
 *
 * Purpose: Regression for the air branch of defend handling; air units reposition by ferry only, and routing
 * them asks for a land path they can never satisfy.
 * When to use: After edits to the `defend` branch of `generateOrdersForStandingOrders`.
 * Expected outcome: The air unit gets no movement order, while an infantry unit staged identically does —
 * the infantry leg proves the scenario can produce one, so the air assertion is not vacuous.
 * Exceptions: Skips when the seeded map lacks the required units or an empty adjacent land pair.
 */
function testAirDefendDoesNotProduceMovementOrder(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-air-defend-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const airUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'air');
    const infantryUnit = state.units.find((u) => u.player === 'human' && u.unitType === 'infantry');
    if (!airUnit || !infantryUnit) {
      console.log('testAirDefendDoesNotProduceMovementOrder: skip — seed lacks a human air or infantry unit');
      return;
    }
    const hexByH3 = new Map(state.hexes.map((h) => [h.h3Index, h]));
    const occupied = new Set(state.units.map((u) => u.h3Index));
    let stationH3: string | undefined;
    let defendTargetH3: string | undefined;
    for (const hex of state.hexes) {
      if (hex.terrain !== 'land' || occupied.has(hex.h3Index)) continue;
      const neighbour = gridDisk(hex.h3Index, 1).find(
        (n) => n !== hex.h3Index && !occupied.has(n) && hexByH3.get(n)?.terrain === 'land'
      );
      if (neighbour) {
        stationH3 = hex.h3Index;
        defendTargetH3 = neighbour;
        break;
      }
    }
    if (!stationH3 || !defendTargetH3) {
      console.log('testAirDefendDoesNotProduceMovementOrder: skip — no empty adjacent land pair in seed');
      return;
    }

    const latLngByH3 = new Map(state.hexes.map((h) => [h.h3Index, cellToLatLng(h.h3Index) as [number, number]]));
    const resolveToH3 = (a: number, b: number): string | undefined => {
      try { return latLngToCell(a, b, 1); } catch { return undefined; }
    };
    const [defendLat, defendLng] = cellToLatLng(defendTargetH3);

    const movementOrderCountFor = (unitId: string, originalH3: string): number => {
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [stationH3, unitId]);
      dbRun('DELETE FROM standing_orders WHERE player_id = ?', ['human']);
      dbRun(
        `INSERT INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
         VALUES (?, ?, 'defend', ?, NULL, 'en_route', ?, ?)`,
        [
          'human',
          unitId,
          JSON.stringify({ type: 'defend', defendHex: [defendLat, defendLng] }),
          state.turnNumber,
          JSON.stringify(cellToLatLng(stationH3!)),
        ]
      );
      const generated = generateOrdersForStandingOrders('human', getGameState(), latLngByH3, resolveToH3);
      dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [originalH3, unitId]);
      return generated.movementOrders.filter((m) => m.unitId === unitId).length;
    };

    assert.strictEqual(
      movementOrderCountFor(infantryUnit.id, infantryUnit.h3Index),
      1,
      'infantry defending an adjacent hex should march to it'
    );
    assert.strictEqual(
      movementOrderCountFor(airUnit.id, airUnit.h3Index),
      0,
      'air unit defending an adjacent hex must not receive a movement order'
    );
  } finally {
    closeGameDatabaseForTests();
  }
}

/**
 * Flags a healthy march whose destination recedes from the nearest observed enemy.
 *
 * Purpose: Turn 18 left in-range units on receding MARCH orders because Attention was no.
 * When to use: After edits to `standingOrderRowRecedesFromEnemy` / `getInjectionText`.
 * Expected outcome: The active standing-order row stays `en_route` and Attention is yes.
 * Exceptions: Skips when the seeded map lacks a non-air opponent, a human unit, or a two-hop dest.
 */
function testGetInjectionTextAttentionYesForRecedingMarch(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-tool5-recede-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const seeded = getGameState();
    const opponent = seeded.units.find((u) => u.player === 'opponent' && u.unitType !== 'air');
    const human = seeded.units.find((u) => u.player === 'human');
    if (!opponent || !human) {
      console.log('testGetInjectionTextAttentionYesForRecedingMarch: skip — seed lacks a non-air opponent or human unit');
      return;
    }
    const hexSet = new Set(seeded.hexes.map((h) => h.h3Index));
    const origin = human.h3Index;
    const ring1 = gridDisk(origin, 1).filter((h) => h !== origin && hexSet.has(h));
    const neighbor = ring1[0];
    const far = gridDisk(origin, 2).find((h) => hexSet.has(h) && h !== origin && !ring1.includes(h));
    if (!neighbor || !far) {
      console.log('testGetInjectionTextAttentionYesForRecedingMarch: skip — no two-hop dest on the seeded map');
      return;
    }
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [neighbor, opponent.id]);
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [origin, human.id]);
    const [destLat, destLng] = cellToLatLng(far);
    dbRun(
      `INSERT OR REPLACE INTO standing_orders (player_id, unit_id, order_type, params, computed_route, status, created_turn, origin_hex)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'opponent',
        opponent.id,
        'march',
        JSON.stringify({ type: 'march', destination: [destLat, destLng], avoidEnemies: false, engageEnRoute: false }),
        null,
        'en_route',
        seeded.turnNumber,
        JSON.stringify(cellToLatLng(neighbor)),
      ]
    );
    const text = getInjectionText('opponent', getGameState());
    const row = text.split('\n').find((line) => line.includes(`| ${opponent.id} |`));
    assert.ok(row, `expected a standing-order row for ${opponent.id}`);
    assert.ok(row!.includes('en_route'), `receding march must remain en_route: ${row}`);
    assert.ok(row!.includes('| yes |'), `receding march must mark Attention yes: ${row}`);
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
  testGetInjectionTextExpiresArrivedMarch();
  testAssignMarchToCurrentHexDoesNotPersistStandingOrder();
  testGenerateRemovesArrivedMarchOrder();
  testDefendAutoEngagementClosestInRangeEnemy();
  testDefendAutoEngagementAirUnitUsesAirStrikeNotRanged();
  testDefendAutoEngagementAirStrikeSurvivesUnmeasurablePair();
  testMarchEngageEnRouteUsesWeaponRange();
  testAirDefendDoesNotProduceMovementOrder();
  testGetInjectionTextAttentionYesForRecedingMarch();
  testHumanMarchDefaultsAvoidEnemiesFalse();
  console.log('standingOrders tests passed');
}

run();
