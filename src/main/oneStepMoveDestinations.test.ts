/**
 * Equivalence tests for bounded `getValidDestinations` vs the legacy full-hex scan fallback.
 *
 * Purpose: Guards that the `gridDisk` fast path returns the same destination sets as the full scan.
 * When to use: Run via `npm test` after changes to `oneStepMoveDestinations.ts`.
 * Expected outcome: Sorted destination sets match for sample units; disk branch returns at least the origin hex.
 * Exceptions: None.
 */

import * as assert from 'assert';
import { gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { getValidDestinations, resolveMovementTerrainForHex } from './oneStepMoveDestinations';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
import { passabilityAllowsLandUnit, passabilityAllowsNavalUnit } from '../shared/pipelineTerrain';
import { getOrderedHexList } from './mapData';

/**
 * Defines the `getValidDestinationsFullScan` function shape (function getValidDestinationsFullScan()).

 * Purpose: Legacy full-scan reference kept for regression comparison only.
 * When to use: Only from equivalence tests in this file.
 * Expected outcome: Same results as pre-optimization `getValidDestinations` implementation.
 * Exceptions: None.
 */
function getValidDestinationsFullScan(
  unit: { h3Index: string; unitType: string },
  state: GameStateSnapshot
): string[] {
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const wantLand = unit.unitType === 'infantry' || unit.unitType === 'armor';
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
    if (wantLand && !passabilityAllowsLandUnit(movementTerrain)) continue;
    valid.push(h.h3Index);
  }
  return valid;
}

/**
 * Defines the `minimalState` function shape (function minimalState(hexIndexes: string[]): GameStateSnapshot).

 * Purpose: Builds a tiny `GameStateSnapshot` fixture for destination equivalence tests.
 * When to use: From tests that compare bounded vs full-scan move destinations.
 * Expected outcome: Snapshot with the given hex list and default empty units/infra.
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

 * Purpose: Asserts bounded and legacy scans agree for each unit type on a small hex sample.
 * When to use: Regression guard after optimizing `getValidDestinations`.
 * Expected outcome: Sorted destination arrays are deep-equal per unit type.
 * Exceptions: None.
 */
function testGetValidDestinationsMatchesFullScan(): void {
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

 * Purpose: Smoke test that the `gridDisk` branch returns at least the unit's current hex.
 * When to use: After changes to the disk-based candidate loop.
 * Expected outcome: Result includes the origin hex index.
 * Exceptions: None.
 */
function testGetValidDestinationsDiskBranchProducesResults(): void {
  const origin = getOrderedHexList()[0]!;
  gridDisk(origin, MOVEMENT_RANGE_BY_UNIT_TYPE.infantry ?? 1);
  const state = minimalState([origin]);
  const unit = { h3Index: origin, unitType: 'infantry' };
  const result = getValidDestinations(unit, state);
  assert.ok(result.includes(origin));
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Declares ordered test cases for this file's `run` entrypoint.
 * When to use: Extend when adding move-destination equivalence cases.
 * Expected outcome: Each entry has a `name` and zero-arg `fn`.
 * Exceptions: None.
 */
const tests = [
  { name: 'getValidDestinations matches legacy full scan', fn: testGetValidDestinationsMatchesFullScan },
  { name: 'getValidDestinations gridDisk branch returns destinations', fn: testGetValidDestinationsDiskBranchProducesResults },
];

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Executes this module's tests in declaration order for Node's direct execution model.
 * When to use: Default entry when running `node dist/main/oneStepMoveDestinations.test.js`.
 * Expected outcome: All tests pass and print OK lines.
 * Exceptions: Sets `process.exitCode` on failure.
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
