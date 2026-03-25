/**
 * Tests for the pre-computation pipeline (Milestone 0.6). Covers unit assessments, combat estimates,
 * hex assessments, and the orchestrator. Uses real tool executors; DB may be null (standing orders then absent).
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

function buildFixtureState(
  hexCount: number
): { state: GameStateSnapshot; coordMap: PrecomputationCoordMap } {
  const hexList = getOrderedHexList().slice(0, hexCount);
  const state: GameStateSnapshot = {
    hexes: hexList.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'land' })),
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

function testRunPrecomputation(): void {
  const { state, coordMap } = buildFixtureState(10);
  const out = runPrecomputation(state, coordMap);
  assert.strictEqual(out.unitAssessments.length, 2);
  assert.ok(Array.isArray(out.combatEstimates));
  assert.ok(Array.isArray(out.hexAssessments));
  assert.strictEqual(
    out.hexAssessments.length,
    1,
    'one hex has a human unit'
  );
  if (out.combatEstimates.length > 0) {
    const ce = out.combatEstimates[0]!;
    assert.ok(ce.aiUnitId);
    assert.ok(ce.enemyUnitId);
    assert.ok(Array.isArray(ce.targetHex) && ce.targetHex.length === 2);
    assert.ok(typeof ce.assessment === 'string');
    assert.ok(typeof ce.probabilityDefenderEliminated === 'number');
    assert.ok(typeof ce.probabilityAttackerLosesUnit === 'number');
  }
}

function testRunPrecomputationSkipHexAssessments(): void {
  const { state, coordMap } = buildFixtureState(5);
  const out = runPrecomputation(state, coordMap, { skipHexAssessments: true });
  assert.strictEqual(out.unitAssessments.length, 2);
  assert.strictEqual(out.hexAssessments.length, 0);
}

const tests = [
  { name: 'runUnitAssessments', fn: testRunUnitAssessments },
  { name: 'runPrecomputation', fn: testRunPrecomputation },
  { name: 'runPrecomputation skipHexAssessments', fn: testRunPrecomputationSkipHexAssessments },
];

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
