/**
 * Tests for the pre-computation pipeline (Milestone 0.6). Covers unit assessments, hex assessments,
 * and the orchestrator. Uses real tool executors; DB may be null (standing orders then absent).
 */

import * as assert from 'assert';
import type { GameStateSnapshot } from './gameDb';
import { getOrderedHexList } from './mapData';
import { buildLatLngCoordinateMap } from './mapData';
import {
  runUnitAssessments,
  runPrecomputation,
  type PrecomputationCoordMap,
} from './precomputation';

/**
 * Defines the `buildFixtureState` function shape (function buildFixtureState().

 * Purpose: Supports maintainability by documenting why `buildFixtureState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildFixtureState(
  hexCount: number
): { state: GameStateSnapshot; coordMap: PrecomputationCoordMap } {
  const hexList = getOrderedHexList().slice(0, hexCount);
  const state: GameStateSnapshot = {
    hexes: hexList.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: hexList[0]! },
      { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: hexList[1]! },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: hexList[0]! },
    ],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
  };
  const coordMap = buildLatLngCoordinateMap(hexList);
  return { state, coordMap };
}

/**
 * Defines the `testRunUnitAssessments` function shape (function testRunUnitAssessments(): void).

 * Purpose: Supports maintainability by documenting why `testRunUnitAssessments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRunUnitAssessments(): void {
  const { state, coordMap } = buildFixtureState(10);
  const results = runUnitAssessments(state, coordMap);
  assert.strictEqual(results.length, 2, 'should return one result per opponent unit');
  const ids = results.map((r) => r.unitId).sort();
  assert.deepStrictEqual(ids, ['opponent-armor-1', 'opponent-infantry-1']);
  for (const r of results) {
    assert.strictEqual(r.result.status, 'ok');
    assert.ok(r.result.unit?.unitId);
    assert.ok(Array.isArray(r.result.nearbyEnemies));
    assert.ok(Array.isArray(r.result.threats));
  }
  assert.ok(
    results.every((a, i) => results.findIndex((b) => b.unitId === a.unitId) === i),
    'no duplicate unitIds'
  );
}

/**
 * Defines the `testRunPrecomputation` function shape (function testRunPrecomputation(): void).

 * Purpose: Supports maintainability by documenting why `testRunPrecomputation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRunPrecomputation(): void {
  const { state, coordMap } = buildFixtureState(10);
  const out = runPrecomputation(state, coordMap);
  assert.strictEqual(out.unitAssessments.length, 2);
  assert.ok(Array.isArray(out.hexAssessments));
  assert.strictEqual(
    out.hexAssessments.length,
    1,
    'one hex has a human unit'
  );
}

/**
 * Defines the `testRunPrecomputationSkipHexAssessments` function shape (function testRunPrecomputationSkipHexAssessments(): void).

 * Purpose: Supports maintainability by documenting why `testRunPrecomputationSkipHexAssessments` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRunPrecomputationSkipHexAssessments(): void {
  const { state, coordMap } = buildFixtureState(5);
  const out = runPrecomputation(state, coordMap, { skipHexAssessments: true });
  assert.strictEqual(out.unitAssessments.length, 2);
  assert.strictEqual(out.hexAssessments.length, 0);
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'runUnitAssessments', fn: testRunUnitAssessments },
  { name: 'runPrecomputation', fn: testRunPrecomputation },
  { name: 'runPrecomputation skipHexAssessments', fn: testRunPrecomputationSkipHexAssessments },
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
      process.exit(1);
    }
  }
}

run();
