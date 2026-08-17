/**
 * Contract tests for strategic naval transit vs land-seaport berth/egress edges.
 * Run with: node dist/shared/navalStrategicEdges.test.js
 */

import * as assert from 'assert';
import {
  estimateNavalStrategicTurns,
  isLandSeaportHex,
  isNativeNavalTransitTerrain,
  navalMayOccupyHex,
  navalMayTraverseStrategicEdge,
  type NavalStrategicHexAttrs,
} from './navalStrategicEdges';

/**
 * Builds a compact attrs object for edge-contract assertions.
 *
 * Purpose: Keeps tests focused on terrain/seaport combinations without snapshot fixtures.
 * When to use: Each case in this file.
 * Expected outcome: A `NavalStrategicHexAttrs` value matching the given fields.
 * Exceptions: None.
 */
function attrs(
  nativeTerrain: string,
  hasSeaport: boolean,
  terrainKind?: string
): NavalStrategicHexAttrs {
  return { nativeTerrain, hasSeaport, terrainKind };
}

/**
 * Guards native transit classification for water, coastal bucket, and coastal kind.
 *
 * Purpose: Coastline sailing must not depend on seaport promotion.
 * When to use: After changes to `isNativeNavalTransitTerrain`.
 * Expected outcome: Water and coastal are transit; plains and wetlands are not.
 * Exceptions: None.
 */
function testNativeTransitClassification(): void {
  assert.strictEqual(isNativeNavalTransitTerrain('water'), true);
  assert.strictEqual(isNativeNavalTransitTerrain('coastal'), true);
  assert.strictEqual(isNativeNavalTransitTerrain('land', 'coastal'), true);
  assert.strictEqual(isNativeNavalTransitTerrain('land', 'plains'), false);
  assert.strictEqual(isNativeNavalTransitTerrain('wetlands', 'wetlands'), false);
}

/**
 * Guards land-seaport vs wet-port classification.
 *
 * Purpose: A seaport on water/coastal stays transit; a seaport on land is a berth hex.
 * When to use: After changes to `isLandSeaportHex`.
 * Expected outcome: Plains+seaport is a land seaport; water+seaport and coastal+seaport are not.
 * Exceptions: None.
 */
function testLandSeaportClassification(): void {
  assert.strictEqual(isLandSeaportHex(attrs('land', true, 'plains')), true);
  assert.strictEqual(isLandSeaportHex(attrs('wetlands', true, 'wetlands')), true);
  assert.strictEqual(isLandSeaportHex(attrs('water', true, 'water')), false);
  assert.strictEqual(isLandSeaportHex(attrs('coastal', true, 'coastal')), false);
  assert.strictEqual(isLandSeaportHex(attrs('land', false, 'plains')), false);
}

/**
 * Guards occupancy: transit and land seaports are occupiable; seaport-less inland is not.
 *
 * Purpose: Hold-in-place on a berth must stay legal.
 * When to use: After changes to `navalMayOccupyHex`.
 * Expected outcome: Water, coastal, and land seaport occupy; plains without seaport do not.
 * Exceptions: None.
 */
function testOccupancy(): void {
  assert.strictEqual(navalMayOccupyHex(attrs('water', false)), true);
  assert.strictEqual(navalMayOccupyHex(attrs('coastal', false)), true);
  assert.strictEqual(navalMayOccupyHex(attrs('land', true, 'plains')), true);
  assert.strictEqual(navalMayOccupyHex(attrs('land', false, 'plains')), false);
}

/**
 * Guards legal sail, berth, and egress edges plus forbidden port-to-port and inland steps.
 *
 * Purpose: Essential movement contract for strategic naval connectivity.
 * When to use: After changes to `navalMayTraverseStrategicEdge`.
 * Expected outcome: Transit↔transit, berth, and egress pass; port→port and port→inland fail.
 * Exceptions: None.
 */
function testTraverseEdges(): void {
  const water = attrs('water', false);
  const coastal = attrs('coastal', false, 'coastal');
  const wetPort = attrs('water', true, 'water');
  const landPort = attrs('land', true, 'plains');
  const inlandPort = attrs('land', true, 'forest');
  const plains = attrs('land', false, 'plains');
  assert.strictEqual(navalMayTraverseStrategicEdge(water, water), true);
  assert.strictEqual(navalMayTraverseStrategicEdge(water, coastal), true);
  assert.strictEqual(navalMayTraverseStrategicEdge(wetPort, water), true);
  assert.strictEqual(navalMayTraverseStrategicEdge(water, landPort), true);
  assert.strictEqual(navalMayTraverseStrategicEdge(landPort, water), true);
  assert.strictEqual(navalMayTraverseStrategicEdge(landPort, inlandPort), false);
  assert.strictEqual(navalMayTraverseStrategicEdge(landPort, plains), false);
  assert.strictEqual(navalMayTraverseStrategicEdge(water, plains), false);
}

/**
 * Guards turn estimates so land-seaport egress is not folded into later sailing budgets.
 *
 * Purpose: `ceil(hexDistance / budget)` undercounts when the first turn may only leave the berth.
 * When to use: After changes to `estimateNavalStrategicTurns`.
 * Expected outcome: Transit uses ceil(distance / budget); land-seaport origin uses 1 + ceil((distance - 1) / budget).
 * Exceptions: None.
 */
function testEstimateNavalStrategicTurns(): void {
  assert.strictEqual(estimateNavalStrategicTurns(0, 2, true), 0);
  assert.strictEqual(estimateNavalStrategicTurns(0, 2, false), 0);
  assert.strictEqual(estimateNavalStrategicTurns(-1, 2, true), 0);
  assert.strictEqual(estimateNavalStrategicTurns(4, 2, false), 2);
  assert.strictEqual(estimateNavalStrategicTurns(4, 2, true), 3);
  assert.strictEqual(estimateNavalStrategicTurns(1, 2, true), 1);
  assert.strictEqual(estimateNavalStrategicTurns(2, 2, true), 2);
  assert.strictEqual(estimateNavalStrategicTurns(3, 2, true), 2);
  assert.strictEqual(estimateNavalStrategicTurns(5, 2, true), 3);
  assert.strictEqual(estimateNavalStrategicTurns(4, 0, true), 4);
}

/**
 * Entry point for naval strategic edge contract tests.
 *
 * Purpose: Runs all cases in this module for CI.
 * When to use: Invoked when the compiled test file is executed.
 * Expected outcome: All assertions pass and a success line is logged.
 * Exceptions: Propagates assertion failures to the process exit code.
 */
function run(): void {
  testNativeTransitClassification();
  testLandSeaportClassification();
  testOccupancy();
  testTraverseEdges();
  testEstimateNavalStrategicTurns();
  console.log('navalStrategicEdges.test.ts passed');
}

run();
