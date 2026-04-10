/**
 * Verification for Tool 1 (plan_route) essential failure cases.
 * Run with: node dist/tools/tool1Pathfinding.test.js
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import { createPathfindingSession, executePlanRoute, executePlanRouteWithSession } from './tool1Pathfinding';
import type { GameStateSnapshot } from '../gameDb';
import { LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON } from '../game-actions/landMovementConstraints';

/**
 * Defines the `buildAdjacentHexPair` function shape (function buildAdjacentHexPair():).

 * Purpose: Supports maintainability by documenting why `buildAdjacentHexPair` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildAdjacentHexPair(): { originH3: string; destinationH3: string } {
  const originH3 = latLngToCell(0, 0, 3);
  const destinationH3 = gridDisk(originH3, 1).find((h3) => h3 !== originH3);
  assert.ok(destinationH3, 'expected an adjacent destination hex');
  return { originH3, destinationH3: destinationH3! };
}

/**
 * Defines the `testPlanRouteLandUnitToWaterHexReturnsTerrainHint` function shape (function testPlanRouteLandUnitToWaterHexReturnsTerrainHint(): void).

 * Purpose: Supports maintainability by documenting why `testPlanRouteLandUnitToWaterHexReturnsTerrainHint` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPlanRouteLandUnitToWaterHexReturnsTerrainHint(): void {
  const { originH3: landH3, destinationH3: waterH3 } = buildAdjacentHexPair();
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: landH3, terrain: 'land', terrainKind: 'plains' },
      { h3Index: waterH3, terrain: 'water', terrainKind: 'water' },
    ],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: landH3 },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([
    [landH3, [0.1, 0.1]],
    [waterH3, [0.9, 0.9]],
  ]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    if (lat >= 0.8 && lng >= 0.8) return waterH3;
    if (lat <= 0.2 && lng <= 0.2) return landH3;
    return landH3;
  };

  const result = executePlanRoute(
    'opponent-armor-1',
    [0.9, 0.9],
    undefined,
    state,
    latLngByH3,
    resolveToH3
  );

  assert.strictEqual(result.status, 'error');
  const err = (result as { error: string }).error;
  assert.ok(err.includes('water'), 'error should mention destination is water');
  assert.ok(err.includes('land units'), 'error should guide land units to a land hex');
}

/**
 * Defines the `testPlanRouteLandUnitRejectsWaterKindToWaterKindMovement` function shape (function testPlanRouteLandUnitRejectsWaterKindToWaterKindMovement(): void).

 * Purpose: Supports maintainability by documenting why `testPlanRouteLandUnitRejectsWaterKindToWaterKindMovement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPlanRouteLandUnitRejectsWaterKindToWaterKindMovement(): void {
  const { originH3, destinationH3 } = buildAdjacentHexPair();
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: originH3, terrain: 'coastal', terrainKind: 'water' },
      { h3Index: destinationH3, terrain: 'coastal', terrainKind: 'water' },
    ],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: originH3 }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([
    [originH3, [0.1, 0.1]],
    [destinationH3, [0.9, 0.9]],
  ]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    if (lat >= 0.8 && lng >= 0.8) return destinationH3;
    if (lat <= 0.2 && lng <= 0.2) return originH3;
    return destinationH3;
  };

  const result = executePlanRoute(
    'opponent-armor-1',
    [0.9, 0.9],
    undefined,
    state,
    latLngByH3,
    resolveToH3
  );
  assert.strictEqual(result.status, 'error');
  assert.strictEqual((result as { error: string }).error, LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON);
}

/**
 * Defines the `testPlanRouteSessionParity` function shape (function testPlanRouteSessionParity(): void).

 * Purpose: Supports maintainability by documenting why `testPlanRouteSessionParity` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPlanRouteSessionParity(): void {
  const { originH3, destinationH3 } = buildAdjacentHexPair();
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: originH3, terrain: 'land', terrainKind: 'plains' },
      { h3Index: destinationH3, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: originH3 }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([
    [originH3, [0.1, 0.1]],
    [destinationH3, [0.9, 0.9]],
  ]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    if (lat >= 0.8 && lng >= 0.8) return destinationH3;
    if (lat <= 0.2 && lng <= 0.2) return originH3;
    return destinationH3;
  };

  const defaultResult = executePlanRoute(
    'opponent-armor-1',
    [0.9, 0.9],
    { avoidEnemies: true },
    state,
    latLngByH3,
    resolveToH3
  );
  const session = createPathfindingSession(state, latLngByH3, resolveToH3);
  const sessionResult = executePlanRouteWithSession('opponent-armor-1', [0.9, 0.9], { avoidEnemies: true }, session);
  assert.deepStrictEqual(sessionResult, defaultResult);
}

/**
 * Defines the `testPlanRouteAllowsSeparatedSpecialTransitions` function shape (function testPlanRouteAllowsSeparatedSpecialTransitions(): void).

 * Purpose: Supports maintainability by documenting why `testPlanRouteAllowsSeparatedSpecialTransitions` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPlanRouteAllowsSeparatedSpecialTransitions(): void {
  const originH3 = latLngToCell(10, 10, 3);
  const middleH3 = gridDisk(originH3, 1).find((h3) => h3 !== originH3);
  assert.ok(middleH3, 'expected a neighboring middle hex');
  const destinationH3 = gridDisk(middleH3!, 1).find((h3) => h3 !== middleH3 && h3 !== originH3);
  assert.ok(destinationH3, 'expected a destination neighbor for middle hex');
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: originH3, terrain: 'coastal', terrainKind: 'water' },
      { h3Index: middleH3!, terrain: 'land', terrainKind: 'plains' },
      { h3Index: destinationH3!, terrain: 'coastal', terrainKind: 'water' },
    ],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: originH3 }],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const latLngByH3 = new Map<string, [number, number]>([
    [originH3, [0.1, 0.1]],
    [middleH3!, [0.5, 0.5]],
    [destinationH3!, [0.9, 0.9]],
  ]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    if (lat >= 0.8 && lng >= 0.8) return destinationH3!;
    if (lat >= 0.4 && lng >= 0.4 && lat <= 0.6 && lng <= 0.6) return middleH3!;
    return originH3;
  };

  const result = executePlanRoute(
    'opponent-armor-1',
    [0.9, 0.9],
    undefined,
    state,
    latLngByH3,
    resolveToH3
  );

  assert.strictEqual(result.status, 'ok');
  const okResult = result as { status: 'ok'; path: { hexes: [number, number][] }[] };
  assert.ok(okResult.path.length > 0, 'expected a traversable path for separated special transitions');
}

/**
 * Defines the `testPlanRouteSessionDeadStateCacheUsesOriginDestinationCompositeKey` function shape (function testPlanRouteSessionDeadStateCacheUsesOriginDestinationCompositeKey(): void).

 * Purpose: Supports maintainability by documenting why `testPlanRouteSessionDeadStateCacheUsesOriginDestinationCompositeKey` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPlanRouteSessionDeadStateCacheUsesOriginDestinationCompositeKey(): void {
  const destinationH3 = latLngToCell(22, 22, 3);
  const neighborHexes = gridDisk(destinationH3, 1).filter((h3) => h3 !== destinationH3);
  assert.ok(neighborHexes.length >= 2, 'expected at least two neighboring origin hexes');
  const originA = neighborHexes[0]!;
  const originB = neighborHexes[1]!;
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: destinationH3, terrain: 'land', terrainKind: 'plains' },
      { h3Index: originA, terrain: 'land', terrainKind: 'plains' },
      { h3Index: originB, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: originA },
      { id: 'opponent-armor-2', player: 'opponent', unitType: 'armor', h3Index: originB },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const destinationLatLng: [number, number] = [0.9, 0.9];
  const latLngByH3 = new Map<string, [number, number]>([
    [destinationH3, destinationLatLng],
    [originA, [0.1, 0.1]],
    [originB, [0.5, 0.5]],
  ]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    if (lat >= 0.8 && lng >= 0.8) return destinationH3;
    if (lat <= 0.2 && lng <= 0.2) return originA;
    if (lat >= 0.4 && lng >= 0.4 && lat <= 0.6 && lng <= 0.6) return originB;
    return destinationH3;
  };
  const session = createPathfindingSession(state, latLngByH3, resolveToH3);
  const resultA = executePlanRouteWithSession('opponent-armor-1', destinationLatLng, undefined, session);
  const resultB = executePlanRouteWithSession('opponent-armor-2', destinationLatLng, undefined, session);
  assert.strictEqual(resultA.status, 'ok');
  assert.strictEqual(resultB.status, 'ok');
  assert.strictEqual(
    session.statefulCache.deadStateByDestination.size,
    2,
    'expected distinct stateful dead-state cache entries for the same destination from two different origins'
  );
}

/**
 * Defines the `testPlanRouteSessionDeadStateCacheSeparatesBlockedAndUnblockedSearches` function shape (function testPlanRouteSessionDeadStateCacheSeparatesBlockedAndUnblockedSearches(): void).

 * Purpose: Supports maintainability by documenting why `testPlanRouteSessionDeadStateCacheSeparatesBlockedAndUnblockedSearches` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPlanRouteSessionDeadStateCacheSeparatesBlockedAndUnblockedSearches(): void {
  const originH3 = latLngToCell(30, 30, 3);
  const middleH3 = gridDisk(originH3, 1).find((h3) => h3 !== originH3);
  assert.ok(middleH3, 'expected a neighboring middle hex');
  const destinationH3 = gridDisk(middleH3!, 1).find((h3) => h3 !== middleH3 && h3 !== originH3);
  assert.ok(destinationH3, 'expected a destination neighbor for middle hex');
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: originH3, terrain: 'land', terrainKind: 'plains' },
      { h3Index: middleH3!, terrain: 'land', terrainKind: 'plains' },
      { h3Index: destinationH3!, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: originH3 },
      { id: 'human-blocker-1', player: 'human', unitType: 'infantry', h3Index: middleH3! },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const destinationLatLng: [number, number] = [0.9, 0.9];
  const latLngByH3 = new Map<string, [number, number]>([
    [originH3, [0.1, 0.1]],
    [middleH3!, [0.5, 0.5]],
    [destinationH3!, destinationLatLng],
  ]);
  const resolveToH3 = (lat: number, lng: number): string | undefined => {
    if (lat >= 0.8 && lng >= 0.8) return destinationH3!;
    if (lat >= 0.4 && lng >= 0.4 && lat <= 0.6 && lng <= 0.6) return middleH3!;
    return originH3;
  };
  const session = createPathfindingSession(state, latLngByH3, resolveToH3);
  const result = executePlanRouteWithSession('opponent-armor-1', destinationLatLng, { avoidEnemies: true }, session);
  assert.strictEqual(result.status, 'ok');
  const warnings = (result as { warnings?: string[] }).warnings ?? [];
  assert.ok(
    warnings.some((w) => w.includes('avoidance was not possible')),
    'expected fallback warning when blocked route fails and unblocked retry succeeds'
  );
  assert.strictEqual(
    session.statefulCache.deadStateByDestination.size,
    2,
    'expected separate blocked/unblocked dead-state cache entries for one origin+destination route'
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testPlanRouteLandUnitToWaterHexReturnsTerrainHint();
  testPlanRouteLandUnitRejectsWaterKindToWaterKindMovement();
  testPlanRouteSessionParity();
  testPlanRouteAllowsSeparatedSpecialTransitions();
  testPlanRouteSessionDeadStateCacheUsesOriginDestinationCompositeKey();
  testPlanRouteSessionDeadStateCacheSeparatesBlockedAndUnblockedSearches();
  console.log('tool1Pathfinding tests passed');
}

run();
