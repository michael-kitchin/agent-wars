/**
 * Equivalence tests for bounded `getValidDestinations` vs a reference full-hex scan.
 *
 * Purpose: Guards that the `gridDisk` fast path returns the same destination sets as the reference scan.
 * When to use: Run via `npm test` after changes to `oneStepMoveDestinations.ts`.
 * Expected outcome: Sorted destination sets match for sample units; disk branch returns at least the origin hex.
 * Exceptions: None.
 */

import * as assert from 'assert';
import { gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { getValidDestinations, resolveMovementTerrainForHex } from './oneStepMoveDestinations';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
import { passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { getOrderedHexList } from './mapData';
import {
  ensureTerrainClassificationCacheLoaded,
} from './terrainClassificationCache';

/**
 * Defines the `getValidDestinationsFullScan` function shape (function getValidDestinationsFullScan().

 * Purpose: Supports maintainability by documenting why `getValidDestinationsFullScan` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getValidDestinationsFullScan(
  unit: { id?: string; h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
  const hexSet = new Set(state.hexes.map((h) => h.h3Index));

  if (wantLand) {
    return getValidDestinations(unit, state);
  }

  const seaportCountByHex = new Map((state.res1Infrastructure ?? []).map((row) => [row.h3Index, row.seaportCount] as const));
  const valid: string[] = [unit.h3Index];
  for (const h of state.hexes) {
    if (h.h3Index === unit.h3Index) continue;
    let dist: number;
    try {
      dist = gridDistance(unit.h3Index, h.h3Index);
    } catch {
      continue;
    }
    if (dist < 1 || dist > range) continue;
    const movementTerrain = resolveMovementTerrainForHex(h, seaportCountByHex);
    if (unit.unitType === 'naval' && !passabilityAllowsNavalUnit(movementTerrain)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Defines the `minimalState` function shape (function minimalState(hexIndexes: string[]): GameStateSnapshot).

 * Purpose: Supports maintainability by documenting why `minimalState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function minimalState(hexIndexes: string[]): GameStateSnapshot {
  return {
    turnNumber: 1,
    phase: 'planning',
    hexes: hexIndexes.map((h3Index) => ({ h3Index, terrain: 'plains' as const, terrainKind: 'plains' })),
    units: [],
    pendingOrders: [],
    res1Infrastructure: [],
    res1Control: [],
    playerPerspective: 'human',
    fogOfWarEnabled: false,
    visibleHexes: hexIndexes,
    exploredHexes: hexIndexes,
  } as GameStateSnapshot;
}

/**
 * Defines the `testGetValidDestinationsMatchesFullScan` function shape (function testGetValidDestinationsMatchesFullScan(): void).

 * Purpose: Supports maintainability by documenting why `testGetValidDestinationsMatchesFullScan` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testGetValidDestinationsMatchesFullScan(): void {
  ensureTerrainClassificationCacheLoaded();
  const hexList = getOrderedHexList().slice(0, 40);
  const state = minimalState(hexList);
  const unitTypes = ['infantry', 'armor', 'naval', 'air'] as const;
  for (const unitType of unitTypes) {
    const unit = { h3Index: hexList[0]!, unitType };
    const bounded = [...getValidDestinations(unit, state)].sort();
    const legacy = [...getValidDestinationsFullScan(unit, state)].sort();
    assert.deepStrictEqual(bounded, legacy, `${unitType} destinations must match full scan`);
  }
}

/**
 * Defines the `testGetValidDestinationsDiskBranchProducesResults` function shape (function testGetValidDestinationsDiskBranchProducesResults(): void).

 * Purpose: Supports maintainability by documenting why `testGetValidDestinationsDiskBranchProducesResults` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testGetValidDestinationsDiskBranchProducesResults(): void {
  ensureTerrainClassificationCacheLoaded();
  const origin = getOrderedHexList()[0]!;
  gridDisk(origin, MOVEMENT_RANGE_BY_UNIT_TYPE.infantry ?? 1);
  const state = minimalState([origin]);
  const unit = { h3Index: origin, unitType: 'infantry' };
  const result = getValidDestinations(unit, state);
  assert.ok(result.includes(origin));
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'getValidDestinations matches reference full scan', fn: testGetValidDestinationsMatchesFullScan },
  { name: 'getValidDestinations gridDisk branch returns destinations', fn: testGetValidDestinationsDiskBranchProducesResults },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`OK ${t.name}`);
    } catch (err) {
      console.error(`FAIL ${t.name}`, err);
      process.exitCode = 1;
    }
  }
}

run();
