/**
 * Verification for Tool 1 (plan_route) essential failure cases.
 * Run with: node dist/tools/tool1Pathfinding.test.js
 */

import * as assert from 'assert';
import { executePlanRoute } from './tool1Pathfinding';
import type { GameStateSnapshot } from '../gameDb';

/**
 * When a land unit is routed to a water hex, plan_route returns an error that includes
 * terrain guidance so the LLM can retry with a land destination.
 */
function testPlanRouteLandUnitToWaterHexReturnsTerrainHint(): void {
  const landH3 = '891f1d48b9fffff';
  const waterH3 = '891f1d48b1fffff';
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: landH3, terrain: 'land', terrainKind: 'land' },
      { h3Index: waterH3, terrain: 'water', terrainKind: 'ocean' },
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

function run(): void {
  testPlanRouteLandUnitToWaterHexReturnsTerrainHint();
  console.log('tool1Pathfinding tests passed');
}

run();
