/**
 * Verification for Tool 1 (plan_route) essential failure cases.
 * Run with: node dist/tools/tool1Pathfinding.test.js
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import { createPathfindingSession, executePlanRoute, executePlanRouteWithSession } from './tool1Pathfinding';
import type { GameStateSnapshot } from '../gameDb';
import { LAND_UNITS_CANNOT_MOVE_WATER_OR_ARCTIC_TO_WATER_OR_ARCTIC_REASON } from '../game-actions/landMovementConstraints';

function buildAdjacentHexPair(): { originH3: string; destinationH3: string } {
  const originH3 = latLngToCell(0, 0, 3);
  const destinationH3 = gridDisk(originH3, 1).find((h3) => h3 !== originH3);
  assert.ok(destinationH3, 'expected an adjacent destination hex');
  return { originH3, destinationH3: destinationH3! };
}

/**
 * When a land unit is routed to a water hex, plan_route returns an error that includes
 * terrain guidance so the LLM can retry with a land destination.
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
 * Land route planning rejects movement between special water/arctic endpoints, even when terrain labels are coastal.
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
 * Session-backed and default planning paths stay behaviorally equivalent for the same snapshot and destination.
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
 * Stateful planner allows routes that touch special water/arctic classes when separated by a normal hex.
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

function run(): void {
  testPlanRouteLandUnitToWaterHexReturnsTerrainHint();
  testPlanRouteLandUnitRejectsWaterKindToWaterKindMovement();
  testPlanRouteSessionParity();
  testPlanRouteAllowsSeparatedSpecialTransitions();
  console.log('tool1Pathfinding tests passed');
}

run();
