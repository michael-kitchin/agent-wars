/**
 * Tests for the pre-computation pipeline (Milestone 0.6). Covers unit assessments, hex assessments,
 * and the orchestrator. Uses real tool executors; DB may be null (standing orders then absent).
 */

import * as assert from 'assert';
import { gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { getOrderedHexList } from './mapData';
import { buildLatLngCoordinateMap } from './mapData';
import {
  runUnitAssessments,
  runPrecomputation,
  type PrecomputationCoordMap,
} from './precomputation';
import { getRes1LandMassByH3 } from './terrainClassificationCache';
import {
  canLandUnitTraverseEdge,
  landUnitCanOccupyHex,
} from '../shared/landTraversalRes1';

/**
 * Picks two adjacent hexes that land units can traverse, then fills to `hexCount`.
 *
 * Purpose: Fixture units must sit on a landMass-legal edge so assess_unit path
 * distances exercise real land BFS instead of grid-distance fallback.
 * When to use: Precomputation tests that run Tool 2 against the live map.
 * Expected outcome: At least two hexes; first pair is land-connected when landMass data allows.
 * Exceptions: Throws when no land-connected adjacent pair exists in the ordered hex list.
 */
function buildLandConnectedHexList(hexCount: number): string[] {
  const allHexes = getOrderedHexList();
  const allSet = new Set(allHexes);
  const landMass = getRes1LandMassByH3();
  let originH3: string | undefined;
  let neighborH3: string | undefined;
  for (const candidate of allHexes) {
    if (!landUnitCanOccupyHex(candidate, landMass)) continue;
    for (const neighbor of gridDisk(candidate, 1)) {
      if (neighbor === candidate || !allSet.has(neighbor)) continue;
      if (!landUnitCanOccupyHex(neighbor, landMass)) continue;
      if (!canLandUnitTraverseEdge(candidate, neighbor, landMass)) continue;
      originH3 = candidate;
      neighborH3 = neighbor;
      break;
    }
    if (originH3 && neighborH3) break;
  }
  assert.ok(originH3 && neighborH3, 'expected a land-connected adjacent hex pair');
  const selected = new Set<string>([originH3!, neighborH3!]);
  for (const h3 of allHexes) {
    if (selected.size >= hexCount) break;
    selected.add(h3);
  }
  return [originH3!, neighborH3!, ...[...selected].filter((h) => h !== originH3 && h !== neighborH3)];
}

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
  const hexList = buildLandConnectedHexList(hexCount);
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
  // Cross-hex land assessment must pass landMass into pathfinding; otherwise
  // estimatedTurnsToReach stays null while enemies still appear via grid distance.
  const infantryAssessment = results.find((r) => r.unitId === 'opponent-infantry-1');
  assert.ok(infantryAssessment, 'expected opponent-infantry-1 assessment');
  const humanEnemy = infantryAssessment!.result.nearbyEnemies.find(
    (e) => e.unitId === 'human-infantry-1'
  );
  assert.ok(humanEnemy, 'opponent-infantry-1 should see human-infantry-1 nearby');
  assert.strictEqual(
    typeof humanEnemy!.estimatedTurnsToReach,
    'number',
    'land path distance/turns must resolve when landMass is available'
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
 * Verifies fog-off res1 precomputation lists a human beyond radius 4.
 *
 * Purpose: Unit Status nearest-enemy must see omniscient grid targets when fog is off.
 * When to use: After changing runUnitAssessments / assess_unit omniscient scan.
 * Expected outcome: opponent-armor-1 nearbyEnemies includes the distant human at grid distance 5.
 * Exceptions: None.
 */
function testRunUnitAssessmentsFogOffIncludesDistantHuman(): void {
  const hexes = getOrderedHexList();
  let origin = hexes[0]!;
  let far: string | undefined;
  for (const candidate of hexes) {
    let ring: string[];
    try {
      ring = gridDisk(candidate, 5);
    } catch {
      continue;
    }
    for (const h3 of ring) {
      if (h3 === candidate) continue;
      try {
        if (gridDistance(candidate, h3) === 5) {
          origin = candidate;
          far = h3;
          break;
        }
      } catch {
        continue;
      }
    }
    if (far) break;
  }
  assert.ok(far, 'expected a res1 pair at grid distance 5');
  const hexList = [origin, far];
  const state: GameStateSnapshot = {
    hexes: hexList.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: far },
    ],
    phase: 'planning',
    turnNumber: 3,
    pendingOrders: [],
    fogOfWarEnabled: false,
  };
  const coordMap = buildLatLngCoordinateMap(hexList);
  const results = runUnitAssessments(state, coordMap);
  assert.strictEqual(results.length, 1);
  const human = results[0]!.result.nearbyEnemies.find((e) => e.unitId === 'human-infantry-1');
  assert.ok(human, 'distant human must appear in fog-off precomputation');
  assert.strictEqual(human!.hexDistance, 5);
}

/**
 * Stacked same-type units share nearby-enemy geometry but keep their own briefing rows.
 *
 * Purpose: Precomputation must not skip stacked units, and must not copy armor results onto co-located infantry.
 * When to use: After changing runUnitAssessments same-hex cache.
 * Expected outcome: Two armor rows with matching enemy distances and their own weather tags; infantry on the same hex is a distinct scan; friendlies exclude self.
 * Exceptions: None.
 */
function testRunUnitAssessmentsReusesSameHexSameType(): void {
  const { state, coordMap } = buildFixtureState(10);
  const origin = state.hexes[0]!.h3Index;
  const neighbor = state.hexes[1]!.h3Index;
  state.weatherBonusEnabled = true;
  state.startMonth = 1;
  state.units = [
    { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: origin, weatherTags: ['heat'] },
    { id: 'opponent-armor-2', player: 'opponent', unitType: 'armor', h3Index: origin, weatherTags: ['snow'] },
    { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: origin },
    { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: neighbor },
  ];
  const results = runUnitAssessments(state, coordMap);
  assert.strictEqual(results.length, 3, 'one briefing row per opponent unit');
  const armor1 = results.find((r) => r.unitId === 'opponent-armor-1');
  const armor2 = results.find((r) => r.unitId === 'opponent-armor-2');
  const infantry = results.find((r) => r.unitId === 'opponent-infantry-1');
  assert.ok(armor1 && armor2 && infantry);
  assert.strictEqual(armor1!.result.unit.unitId, 'opponent-armor-1');
  assert.strictEqual(armor2!.result.unit.unitId, 'opponent-armor-2');
  assert.deepStrictEqual(armor1!.result.unit.weatherTags, ['heat']);
  assert.deepStrictEqual(armor2!.result.unit.weatherTags, ['snow']);
  assert.strictEqual(armor1!.result.unit.weatherHere, armor2!.result.unit.weatherHere);
  const armor1Human = armor1!.result.nearbyEnemies.find((e) => e.unitId === 'human-infantry-1');
  const armor2Human = armor2!.result.nearbyEnemies.find((e) => e.unitId === 'human-infantry-1');
  assert.ok(armor1Human && armor2Human, 'stacked armor must both see the human');
  assert.strictEqual(armor1Human!.hexDistance, armor2Human!.hexDistance);
  assert.strictEqual(armor1Human!.inRangedRange, armor2Human!.inRangedRange);
  const infantryHuman = infantry!.result.nearbyEnemies.find((e) => e.unitId === 'human-infantry-1');
  assert.ok(infantryHuman, 'co-located infantry must still be assessed');
  const armor2Friendlies = (armor2!.result.nearbyFriendlies ?? []) as Array<{ unitId: string }>;
  const armor2FriendlyIds = armor2Friendlies.map((f) => f.unitId).sort();
  assert.ok(armor2FriendlyIds.includes('opponent-armor-1'), 'cloned armor should list the donor as friendly');
  assert.ok(!armor2FriendlyIds.includes('opponent-armor-2'), 'cloned armor must not list itself as friendly');
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
  { name: 'runUnitAssessments fog off includes distant human', fn: testRunUnitAssessmentsFogOffIncludesDistantHuman },
  { name: 'runUnitAssessments reuses same-hex same-type', fn: testRunUnitAssessmentsReusesSameHexSameType },
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
