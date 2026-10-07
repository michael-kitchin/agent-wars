/**
 * Verification for Tool 1 (plan_route) essential failure cases.
 * Run with: node dist/tools/pathfinding.test.js
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import { createPathfindingSession, executePlanRouteWithSession } from './pathfinding';
import { resetPlanningPhaseSessionCacheForTests } from './pathfindingSessionCache';
import type { GameStateSnapshot } from '../gameDb';
import type { StrategicLandMassRecord } from '../../shared/landTraversalStrategic';
import { ensureTerrainClassificationCacheLoaded } from '../terrainClassificationCache';

/**
 * Defines the `landMassForHexes` function shape (function landMassForHexes().

 * Purpose: Supports maintainability by documenting why `landMassForHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function landMassForHexes(
  hexes: readonly string[],
  opts?: { waterPct?: number; continentIds?: number[]; islandIds?: number[] }
): Map<string, StrategicLandMassRecord> {
  const out = new Map<string, StrategicLandMassRecord>();
  for (const h3Index of hexes) {
    out.set(h3Index, {
      h3Index,
      waterPct: opts?.waterPct ?? 10,
      continentIds: opts?.continentIds ?? [1],
      islandIds: opts?.islandIds ?? [],
    });
  }
  return out;
}

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

  const landMass = landMassForHexes([landH3, waterH3], {
    waterPct: 10,
    continentIds: [1],
    islandIds: [],
  });
  landMass.set(waterH3, {
    h3Index: waterH3,
    waterPct: 100,
    continentIds: [],
    islandIds: [],
  });
  const result = executePlanRouteWithSession(
    'opponent-armor-1',
    [0.9, 0.9],
    undefined,
    createPathfindingSession(state, latLngByH3, resolveToH3, landMass)
  );

  assert.strictEqual(result.status, 'error');
  const err = (result as { error: string }).error;
  assert.ok(
    err.includes('continent') || err.includes('large-island') || err.includes('large island'),
    'error should mention land-mass destination requirement'
  );
}

/**
 * Defines the `testPlanRouteLandUnitRejectsOpenWaterMassDestination` function shape (function testPlanRouteLandUnitRejectsOpenWaterMassDestination(): void).

 * Purpose: Land units cannot route to hexes with no continent or island membership.
 * When to use: Regression guard for land-mass pathfinding.
 * Expected outcome: Error status with land-mass messaging.
 * Exceptions: None.
 */
function testPlanRouteLandUnitRejectsOpenWaterMassDestination(): void {
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
  const landMass = landMassForHexes([originH3, destinationH3], {
    waterPct: 100,
    continentIds: [],
    islandIds: [],
  });

  const result = executePlanRouteWithSession(
    'opponent-armor-1',
    [0.9, 0.9],
    undefined,
    createPathfindingSession(state, latLngByH3, resolveToH3, landMass)
  );
  assert.strictEqual(result.status, 'error');
  assert.ok(
    (result as { error: string }).error.includes('continent') ||
      (result as { error: string }).error.includes('large-island') ||
      (result as { error: string }).error.includes('large island')
  );
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

  const landMass = landMassForHexes([originH3, destinationH3]);
  const defaultResult = executePlanRouteWithSession(
    'opponent-armor-1',
    [0.9, 0.9],
    { avoidEnemies: true },
    createPathfindingSession(state, latLngByH3, resolveToH3, landMass)
  );
  const session = createPathfindingSession(state, latLngByH3, resolveToH3, landMass);
  const sessionResult = executePlanRouteWithSession('opponent-armor-1', [0.9, 0.9], { avoidEnemies: true }, session);
  assert.deepStrictEqual(sessionResult, defaultResult);
}

/**
 * Defines the `testPlanRouteRejectsWaterCrossingWithoutLandMassEdge` function shape (function testPlanRouteRejectsWaterCrossingWithoutLandMassEdge(): void).

 * Purpose: Land units no longer traverse open-water hexes without land-mass connectivity.
 * When to use: Regression guard for removed single-water-hop rule.
 * Expected outcome: No path when only a water hex bridges two land-mass cells.
 * Exceptions: None.
 */
function testPlanRouteRejectsWaterCrossingWithoutLandMassEdge(): void {
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

  const landMass = landMassForHexes([originH3, middleH3!, destinationH3!], { continentIds: [1] });
  landMass.set(originH3, { h3Index: originH3, waterPct: 95, continentIds: [1], islandIds: [] });
  landMass.set(destinationH3!, { h3Index: destinationH3!, waterPct: 95, continentIds: [1], islandIds: [] });

  const result = executePlanRouteWithSession(
    'opponent-armor-1',
    [0.9, 0.9],
    undefined,
    createPathfindingSession(state, latLngByH3, resolveToH3, landMass)
  );

  assert.strictEqual(result.status, 'error');
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
  const landMass = landMassForHexes([destinationH3, originA, originB]);
  const session = createPathfindingSession(state, latLngByH3, resolveToH3, landMass);
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
  const landMass = landMassForHexes([originH3, middleH3!, destinationH3!]);
  const session = createPathfindingSession(state, latLngByH3, resolveToH3, landMass);
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
 * Opponent assign_order batches and human previews keep separate reusable planning-phase sessions.
 *
 * Purpose: Human-only reuse left each opponent assign_order rebuilding hex maps.
 * When to use: After changing planning-phase session cache eligibility.
 * Expected outcome: Second create for the same perspective returns the same object; human and opponent slots do not clobber each other.
 * Exceptions: None.
 */
function testPlanningPhaseSessionReuseKeepsHumanAndOpponentSlots(): void {
  resetPlanningPhaseSessionCacheForTests();
  ensureTerrainClassificationCacheLoaded();
  const { originH3, destinationH3 } = buildAdjacentHexPair();
  const latLngByH3 = new Map<string, [number, number]>([
    [originH3, [0.1, 0.1]],
    [destinationH3, [0.9, 0.9]],
  ]);
  const resolveToH3 = (): string => originH3;
  const units = [{ id: 'opponent-armor-1', player: 'opponent' as const, unitType: 'armor', h3Index: originH3 }];
  const hexes = [
    { h3Index: originH3, terrain: 'land', terrainKind: 'plains' },
    { h3Index: destinationH3, terrain: 'land', terrainKind: 'plains' },
  ];
  const opponentState: GameStateSnapshot = {
    hexes,
    units,
    phase: 'planning',
    turnNumber: 91001,
    pendingOrders: [],
    playerPerspective: 'opponent',
  };
  const humanState: GameStateSnapshot = {
    ...opponentState,
    playerPerspective: 'human',
  };

  const opponentFirst = createPathfindingSession(opponentState, latLngByH3, resolveToH3);
  const opponentSecond = createPathfindingSession(opponentState, latLngByH3, resolveToH3);
  assert.strictEqual(opponentFirst, opponentSecond, 'opponent planning sessions should reuse');

  const humanFirst = createPathfindingSession(humanState, latLngByH3, resolveToH3);
  assert.notStrictEqual(humanFirst, opponentFirst, 'human and opponent sessions must not share');
  const humanSecond = createPathfindingSession(humanState, latLngByH3, resolveToH3);
  assert.strictEqual(humanFirst, humanSecond, 'human planning sessions should reuse');

  const nextTurnState: GameStateSnapshot = { ...opponentState, turnNumber: 91002 };
  const opponentNextTurn = createPathfindingSession(nextTurnState, latLngByH3, resolveToH3);
  assert.notStrictEqual(opponentNextTurn, opponentFirst, 'a new turn must not reuse the previous session');
}

/**
 * Test isolation: clearing the planning-phase cache must drop prior session objects.
 *
 * Purpose: Same-turn fixtures in one Node process must not inherit dead-state maps from an earlier test.
 * When to use: After changing `resetPlanningPhaseSessionCacheForTests`.
 * Expected outcome: After reset, the next create is a new object; a following create reuses that new object.
 * Exceptions: None.
 */
function testPlanningPhaseSessionCacheResetIsolatesCreates(): void {
  resetPlanningPhaseSessionCacheForTests();
  ensureTerrainClassificationCacheLoaded();
  const { originH3, destinationH3 } = buildAdjacentHexPair();
  const latLngByH3 = new Map<string, [number, number]>([
    [originH3, [0.1, 0.1]],
    [destinationH3, [0.9, 0.9]],
  ]);
  const resolveToH3 = (): string => originH3;
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: originH3, terrain: 'land', terrainKind: 'plains' },
      { h3Index: destinationH3, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [{ id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: originH3 }],
    phase: 'planning',
    turnNumber: 91011,
    pendingOrders: [],
    playerPerspective: 'opponent',
  };
  const first = createPathfindingSession(state, latLngByH3, resolveToH3);
  resetPlanningPhaseSessionCacheForTests();
  const afterReset = createPathfindingSession(state, latLngByH3, resolveToH3);
  assert.notStrictEqual(first, afterReset, 'reset must drop the prior session object');
  const reused = createPathfindingSession(state, latLngByH3, resolveToH3);
  assert.strictEqual(afterReset, reused, 'reuse still applies after a clean reset');
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  resetPlanningPhaseSessionCacheForTests();
  testPlanRouteLandUnitToWaterHexReturnsTerrainHint();
  testPlanRouteLandUnitRejectsOpenWaterMassDestination();
  testPlanRouteSessionParity();
  testPlanRouteRejectsWaterCrossingWithoutLandMassEdge();
  testPlanRouteSessionDeadStateCacheUsesOriginDestinationCompositeKey();
  testPlanRouteSessionDeadStateCacheSeparatesBlockedAndUnblockedSearches();
  testPlanningPhaseSessionReuseKeepsHumanAndOpponentSlots();
  testPlanningPhaseSessionCacheResetIsolatesCreates();
  console.log('pathfinding tests passed');
}

run();
