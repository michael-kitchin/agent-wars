/**
 * Over-budget explicit moves become standing marches only when a later turn can finish them.
 *
 * Run: `npm run build:main` then `node dist/main/openRouter/explicitMoveMarch.test.js`
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import { gridDisk, gridDistance, latLngToCell, cellToLatLng } from 'h3-js';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import { strategicH3Resolution } from '../../shared/h3Resolutions';
import type { AiSeatId } from '../../shared/seatIds';
import {
  closeGameDatabaseForTests,
  getGameState,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
  type GameStateSnapshot,
} from '../gameDb';
import { createPathfindingSession } from '../tools/pathfinding';
import { getStandingOrderForUnit } from '../tools/standingOrdersCore';
import {
  convertOverBudgetExplicitMoveToMarch,
  explicitMoveReasonIsOverBudget,
  type ConvertOverBudgetExplicitMoveArgs,
} from './explicitMoveMarch';

const seatId: AiSeatId = 'opponent';

/**
 * Builds the smallest argument object the early-return checks accept.
 *
 * Purpose: Orders-off and air cases must not need a real route.
 * When to use: Tests that return before pathfinding.
 * Expected outcome: An argument whose session is never read.
 * Exceptions: None.
 */
function earlyArgs(overrides: Partial<ConvertOverBudgetExplicitMoveArgs>): ConvertOverBudgetExplicitMoveArgs {
  const state = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [],
    units: [],
    pendingOrders: [],
  } as GameStateSnapshot;
  return {
    ordersEnabled: true,
    fromModel: true,
    seatId,
    unitId: 'missing',
    toH3Index: 'dest',
    reason: 'infantry can move at most 1 hex(es)',
    state,
    latLngByH3: new Map(),
    resolveToH3: () => undefined,
    pathfindingSession: {} as ConvertOverBudgetExplicitMoveArgs['pathfindingSession'],
    validateAiOrder: () => ({ valid: true }),
    ...overrides,
  };
}

test('the over-budget predicate accepts only the budget sentence', () => {
  assert.equal(explicitMoveReasonIsOverBudget('infantry can move at most 1 hex(es)'), true);
  assert.equal(explicitMoveReasonIsOverBudget('Invalid distance'), false);
  assert.equal(explicitMoveReasonIsOverBudget('Land units must move to a hex that overlaps a continent or large island.'), false);
});

test('standing orders off does not convert', () => {
  const result = convertOverBudgetExplicitMoveToMarch(earlyArgs({ ordersEnabled: false }));
  assert.equal(result.converted, false);
});

test('an air unit is not converted', () => {
  const state = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [],
    units: [{ id: 'air-1', player: seatId, unitType: 'air', h3Index: 'origin' }],
    pendingOrders: [],
  } as GameStateSnapshot;
  const result = convertOverBudgetExplicitMoveToMarch(earlyArgs({
    unitId: 'air-1',
    state,
    latLngByH3: new Map([['dest', [1, 2]]]),
  }));
  assert.equal(result.converted, false);
});

test('a reachable over-budget destination becomes a march and an unreachable one does not', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-explicit-march-'));
  const dbPath = path.join(tempDir, 't.sqlite');
  try {
    openGameDatabaseAtPathForTests(dbPath);
    resetGameForNewMatch();
    const state = getGameState();
    const unit = state.units.find((candidate) => candidate.player === seatId && candidate.unitType === 'infantry');
    assert.ok(unit, 'expected an infantry unit');
    const latLngByH3 = new Map(state.hexes.map((hex) => [hex.h3Index, cellToLatLng(hex.h3Index) as [number, number]]));
    const resolution = strategicH3Resolution();
    const resolveToH3 = (lat: number, lng: number): string | undefined => {
      try {
        return latLngToCell(lat, lng, resolution);
      } catch {
        return undefined;
      }
    };
    const session = createPathfindingSession(state, latLngByH3, resolveToH3);
    const land = new Set(
      state.hexes
        .filter((hex) => hex.terrain !== 'ocean' && hex.terrain !== 'water' && hex.terrain !== 'arctic_ocean')
        .map((hex) => hex.h3Index)
    );
    const missed = convertOverBudgetExplicitMoveToMarch({
      ordersEnabled: true,
      fromModel: true,
      seatId,
      unitId: unit.id,
      toH3Index: 'not-a-cell',
      reason: 'infantry can move at most 1 hex(es)',
      state,
      latLngByH3,
      resolveToH3,
      pathfindingSession: session,
      validateAiOrder: () => ({ valid: true }),
    });
    assert.equal(missed.converted, false);
    assert.equal(getStandingOrderForUnit(seatId, unit.id), null);

    let converted: { firstStep: string; toH3Index: string } | null = null;
    for (const cell of gridDisk(unit.h3Index, 4)) {
      if (!land.has(cell)) continue;
      let distance: number;
      try {
        distance = gridDistance(unit.h3Index, cell);
      } catch {
        continue;
      }
      if (distance < 3) continue;
      const result = convertOverBudgetExplicitMoveToMarch({
        ordersEnabled: true,
        fromModel: true,
        seatId,
        unitId: unit.id,
        toH3Index: cell,
        reason: 'infantry can move at most 1 hex(es)',
        state,
        latLngByH3,
        resolveToH3,
        pathfindingSession: session,
        validateAiOrder: () => ({ valid: true }),
      });
      if (!result.converted) continue;
      converted = { firstStep: result.firstStep, toH3Index: cell };
      break;
    }
    assert.ok(converted, 'expected one reachable cell three or more steps away');
    assert.notEqual(converted.firstStep, converted.toH3Index);
    const stored = getStandingOrderForUnit(seatId, unit.id);
    assert.equal(stored?.type, 'march');
    const storedCell = stored?.destination ? resolveToH3(stored.destination[0], stored.destination[1]) : undefined;
    assert.equal(storedCell, converted.toH3Index);

    const rejected = convertOverBudgetExplicitMoveToMarch({
      ordersEnabled: true,
      fromModel: true,
      seatId,
      unitId: unit.id,
      toH3Index: converted.toH3Index,
      reason: 'infantry can move at most 1 hex(es)',
      state,
      latLngByH3,
      resolveToH3,
      pathfindingSession: session,
      validateAiOrder: () => ({ valid: false, reason: 'rejected first step' }),
    });
    assert.equal(rejected.converted, false);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
