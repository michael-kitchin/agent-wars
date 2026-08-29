/**
 * Integration contracts for strategic naval berth/egress on the seeded world map.
 * Run with: node dist/main/gameActions/navalSeaportBerth.test.js
 */

import * as assert from 'assert';
import { gridDistance } from 'h3-js';
import { dbRun, getGameState } from '../gameDb';
import { assignHumanMarchOrder, previewHumanMarchOrders } from '../gameActions';
import { getRes1ProductionContext, getRes1LandMassByH3 } from '../terrainClassificationCache';
import { hexHasSeaport, isLandSeaportSpawnHex } from '../movementTerrain';
import { resetHumanMarchPreviewDiagnosticsForTests } from './humanMarchPreview';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { landUnitCanOccupyHex } from '../../shared/landTraversalRes1';
import { isNativeNavalTransitTerrain } from '../../shared/navalStrategicEdges';

/**
 * Opens a temp game DB and clears march-preview caches for each case.
 *
 * Purpose: Same fixture style as multi-select integration tests.
 * When to use: Every case in this file.
 * Expected outcome: Isolated SQLite file; preview diagnostics reset.
 * Exceptions: None.
 */
function withTempDb(runCase: () => void): void {
  withTempGameDb('aw-naval-berth-', () => {
    resetHumanMarchPreviewDiagnosticsForTests();
    runCase();
  });
}

/**
 * Finds a land seaport with an adjacent transit hex.
 *
 * Purpose: Berth and egress cases need a real wet last step.
 * When to use: Setup for berth/egress/canal tests.
 * Expected outcome: `{ portH3, waterH3 }` or null when the seeded map has no such pair.
 * Exceptions: None.
 */
function findLandSeaportWithAdjacentWater(): { portH3: string; waterH3: string; dryInlandH3: string | null } | null {
  const state = getGameState();
  const landMass = getRes1LandMassByH3();
  let fallback: { portH3: string; waterH3: string; dryInlandH3: string | null } | null = null;
  for (const hex of state.hexes) {
    if (isNativeNavalTransitTerrain(hex.terrain, hex.terrainKind)) continue;
    if (!landUnitCanOccupyHex(hex.h3Index, landMass)) continue;
    if (!hexHasSeaport(hex.h3Index)) continue;
    const waterH3 = findAdjacentTransit(state, hex.h3Index);
    if (!waterH3) continue;
    const dryInlandH3 = findAdjacentInland(state, hex.h3Index);
    const found = { portH3: hex.h3Index, waterH3, dryInlandH3 };
    if (dryInlandH3) return found;
    fallback = found;
  }
  return fallback;
}

/**
 * Returns an adjacent native transit hex, or null.
 *
 * Purpose: Shared neighbor scan for berth/egress setup.
 * When to use: From fixture finders in this file.
 * Expected outcome: First on-map neighbor whose terrain is water or coastal.
 * Exceptions: None.
 */
function findAdjacentTransit(state: ReturnType<typeof getGameState>, centerH3: string): string | null {
  for (const hex of state.hexes) {
    const transit = hex.terrain === 'water' || hex.terrain === 'coastal' || hex.terrainKind === 'coastal';
    if (!transit) continue;
    try {
      if (gridDistance(hex.h3Index, centerH3) === 1) return hex.h3Index;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Returns an adjacent inland land hex that is not transit.
 *
 * Purpose: Canal and port-to-port cases need a land neighbor of a seaport.
 * When to use: After locating a land seaport.
 * Expected outcome: First land neighbor, or null.
 * Exceptions: None.
 */
function findAdjacentInland(state: ReturnType<typeof getGameState>, centerH3: string): string | null {
  for (const hex of state.hexes) {
    if (isNativeNavalTransitTerrain(hex.terrain, hex.terrainKind)) continue;
    try {
      if (gridDistance(hex.h3Index, centerH3) !== 1) continue;
    } catch {
      continue;
    }
    if (findAdjacentTransit(state, hex.h3Index)) continue;
    return hex.h3Index;
  }
  return null;
}

/**
 * Writes a seaport onto a hex without changing control.
 *
 * Purpose: Builds an inland second port for canal/port-to-port failures.
 * When to use: After choosing an inland neighbor.
 * Expected outcome: `res1_infrastructure.seaport_count = 1`.
 * Exceptions: None.
 */
function setSeaportCount(h3Index: string, seaportCount: number): void {
  dbRun(
    `INSERT INTO res1_infrastructure (h3_index, urban_hex_count, airport_count, seaport_count)
     VALUES (?, 0, 0, ?)
     ON CONFLICT(h3_index) DO UPDATE SET seaport_count = excluded.seaport_count`,
    [h3Index, seaportCount]
  );
}

/**
 * Naval on adjacent water may berth onto a land seaport this turn.
 *
 * Purpose: Happy-path berth for preview and assign.
 * When to use: After wiring naval reachable sets to berth edges.
 * Expected outcome: Preview and assign succeed.
 * Exceptions: None.
 */
function testBerthFromAdjacentWaterSucceeds(): void {
  withTempDb(() => {
    const pair = findLandSeaportWithAdjacentWater();
    assert.ok(pair, 'expected a land seaport adjacent to water');
    const naval = getGameState().units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(naval, 'expected seeded human naval');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [pair!.waterH3, naval!.id]);
    const preview = previewHumanMarchOrders([naval!.id], pair!.portH3);
    assert.strictEqual(preview.validForAll, true, preview.invalidReason ?? 'expected berth preview');
    const assign = assignHumanMarchOrder(naval!.id, pair!.portH3);
    assert.strictEqual(assign.success, true, assign.reason ?? 'expected berth assign');
  });
}

/**
 * Naval on a land seaport cannot march to a neighboring land seaport.
 *
 * Purpose: Port-to-port is forbidden even when both hexes are occupiable.
 * When to use: After berth/egress wiring.
 * Expected outcome: Preview and assign fail.
 * Exceptions: None.
 */
function testPortToPortAssignFails(): void {
  withTempDb(() => {
    const pair = findLandSeaportWithAdjacentWater();
    assert.ok(pair, 'expected a land seaport adjacent to water');
    const inland = pair!.dryInlandH3;
    assert.ok(inland, 'expected a dry inland neighbor of the land seaport');
    setSeaportCount(inland!, 1);
    const naval = getGameState().units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(naval, 'expected seeded human naval');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [pair!.portH3, naval!.id]);
    const destHex = getGameState().hexes.find((h) => h.h3Index === inland);
    assert.ok(destHex, 'expected destination hex row');
    assert.strictEqual(
      isNativeNavalTransitTerrain(destHex!.terrain, destHex!.terrainKind),
      false,
      `inland neighbor must not be transit (${destHex!.terrain}/${destHex!.terrainKind})`
    );
    const preview = previewHumanMarchOrders([naval!.id], inland!);
    assert.strictEqual(
      preview.validForAll,
      false,
      preview.invalidReason ?? `expected port-to-port preview fail for ${inland}`
    );
    const assign = assignHumanMarchOrder(naval!.id, inland!);
    assert.strictEqual(assign.success, false);
  });
}

/**
 * Naval on water cannot use a land seaport as a canal to a second inland port.
 *
 * Purpose: Range must not resurrect inland transit through ports.
 * When to use: After berth/egress wiring.
 * Expected outcome: Assign to the inland second port fails.
 * Exceptions: None.
 */
function testCannotCanalThroughLandSeaport(): void {
  withTempDb(() => {
    const pair = findLandSeaportWithAdjacentWater();
    assert.ok(pair, 'expected a land seaport adjacent to water');
    const inland = pair!.dryInlandH3;
    assert.ok(inland && inland !== pair!.waterH3, 'expected inland neighbor distinct from water');
    setSeaportCount(inland!, 1);
    const naval = getGameState().units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(naval, 'expected seeded human naval');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [pair!.waterH3, naval!.id]);
    const assign = assignHumanMarchOrder(naval!.id, inland!);
    assert.strictEqual(assign.success, false);
  });
}

/**
 * A land hex within grid range without a wet last step is not a naval destination.
 *
 * Purpose: Grid distance plus occupancy is not sufficient after dropping seaport promotion.
 * When to use: After commit uses reachable sets.
 * Expected outcome: Assign and preview fail for seaport-less inland land next to a land seaport.
 * Exceptions: None.
 */
function testGridRangeWithoutWetPathFails(): void {
  withTempDb(() => {
    const pair = findLandSeaportWithAdjacentWater();
    assert.ok(pair, 'expected a land seaport adjacent to water');
    const inland = pair!.dryInlandH3;
    assert.ok(inland, 'expected inland neighbor');
    setSeaportCount(inland!, 0);
    const naval = getGameState().units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(naval, 'expected seeded human naval');
    dbRun('UPDATE units SET h3_index = ? WHERE id = ?', [pair!.waterH3, naval!.id]);
    let dist = 99;
    try {
      dist = gridDistance(pair!.waterH3, inland!);
    } catch {
      dist = 99;
    }
    assert.ok(dist <= 3, 'expected inland neighbor to be within naval click range of adjacent water');
    const preview = previewHumanMarchOrders([naval!.id], inland!);
    assert.strictEqual(preview.validForAll, false);
    const assign = assignHumanMarchOrder(naval!.id, inland!);
    assert.strictEqual(assign.success, false);
  });
}

/**
 * Occupiable water beyond same-turn naval range remains a legal multi-turn standing-order preview.
 *
 * Purpose: Preview must call `plan_route` for occupiable hexes instead of rejecting anything outside the 3-hex click cap.
 * When to use: After changes to naval march hover gating.
 * Expected outcome: Preview is valid with more than one turn segment, and assign succeeds.
 * Exceptions: None.
 */
function testMultiTurnOpenWaterPreviewSucceeds(): void {
  withTempDb(() => {
    const state = getGameState();
    const naval = state.units.find((u) => u.player === 'human' && u.unitType === 'naval');
    assert.ok(naval, 'expected seeded human naval');
    const origin = naval!.h3Index;
    let preview: ReturnType<typeof previewHumanMarchOrders> | null = null;
    let farWater: string | null = null;
    let attempts = 0;
    for (const hex of state.hexes) {
      if (!isNativeNavalTransitTerrain(hex.terrain, hex.terrainKind)) continue;
      if (hex.h3Index === origin) continue;
      let dist = 99;
      try {
        dist = gridDistance(origin, hex.h3Index);
      } catch {
        continue;
      }
      if (dist <= 3 || dist > 12) continue;
      attempts += 1;
      if (attempts > 24) break;
      const candidate = previewHumanMarchOrders([naval!.id], hex.h3Index);
      if (!candidate.validForAll) continue;
      farWater = hex.h3Index;
      preview = candidate;
      break;
    }
    assert.ok(farWater && preview, 'expected a reachable transit hex beyond same-turn naval range');
    const segments = preview!.previews[0]?.preview.segments ?? [];
    assert.ok(segments.length >= 2, `expected a multi-turn path, got ${segments.length} segment(s)`);
    const assign = assignHumanMarchOrder(naval!.id, farWater!);
    assert.strictEqual(assign.success, true, assign.reason ?? `expected multi-turn water assign to ${farWater}`);
  });
}

/**
 * A destroyed land seaport is not a seaport for spawn or occupancy flags.
 *
 * Purpose: Live `seaport_count = 0` must win over classification-cache metadata.
 * When to use: After infrastructure destruction or tests that zero a seeded port.
 * Expected outcome: `hexHasSeaport` and `isLandSeaportSpawnHex` are false even when production context still lists a port.
 * Exceptions: None.
 */
function testDestroyedLandSeaportIsNotASeaport(): void {
  withTempDb(() => {
    const found = findLandSeaportWithAdjacentWater();
    assert.ok(found, 'expected a land seaport with adjacent water');
    const { portH3 } = found!;
    assert.ok(getRes1ProductionContext({ h3Index: portH3 }).seaportCount > 0, 'fixture must still be a metadata seaport');
    assert.strictEqual(hexHasSeaport(portH3), true);
    setSeaportCount(portH3, 0);
    assert.strictEqual(hexHasSeaport(portH3), false);
    const hex = getGameState().hexes.find((h) => h.h3Index === portH3);
    assert.ok(hex, 'expected port hex on map');
    assert.strictEqual(
      isLandSeaportSpawnHex({
        h3Index: portH3,
        normalizedTerrain: hex!.terrain,
        terrainKind: hex!.terrainKind,
      }),
      false
    );
  });
}

/**
 * Entry point for naval berth integration tests.
 *
 * Purpose: Runs all cases in this module for CI.
 * When to use: Invoked when the compiled test file is executed.
 * Expected outcome: All assertions pass and a success line is logged.
 * Exceptions: Propagates assertion failures to the process exit code.
 */
function run(): void {
  testBerthFromAdjacentWaterSucceeds();
  testPortToPortAssignFails();
  testCannotCanalThroughLandSeaport();
  testGridRangeWithoutWetPathFails();
  testMultiTurnOpenWaterPreviewSucceeds();
  testDestroyedLandSeaportIsNotASeaport();
  console.log('navalSeaportBerth.test.ts passed');
}

run();
