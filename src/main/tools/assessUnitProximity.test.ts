/**
 * Tests for omniscient grid-proximity helpers used by assess_unit when fog is off on the strategic map.
 * Run with: node dist/main/tools/assessUnitProximity.test.js
 */

import * as assert from 'assert';
import { getResolution, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import { getOrderedHexList } from '../mapData';
import {
  collectOmniscientNearbyUnits,
  estimatedTurnsFromGridDistance,
  gridHopDistanceBetween,
  gridHopDistancesFrom,
  FOG_PATH_DISTANCE_BRIEFING_LINE,
  OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE,
  safeGridHexDistance,
  usesFogPathDistanceBriefing,
  usesOmniscientGridProximity,
} from './assessUnitProximity';

/**
 * Documents the module-scope binding `strategicCell` (strategicCell).
 *
 * Purpose: Stable H3 resolution-1 cell for gate and distance tests.
 * When to use: Any case that must be strategic-map geometry.
 * Expected outcome: `getResolution` is 1.
 * Exceptions: None.
 */
const strategicCell = latLngToCell(0, 0, 1);
/**
 * Documents the module-scope binding `tacticalCell` (tacticalCell).
 *
 * Purpose: Stable H3 resolution-4 cell so the gate rejects tactical geometry.
 * When to use: Fog-off + non-strategic resolution cases.
 * Expected outcome: `getResolution` is 4.
 * Exceptions: None.
 */
const tacticalSampleCell = latLngToCell(0, 0, 4);

/**
 * Verifies the omniscient gate requires fog off and a resolution-1 cell.
 *
 * Purpose: Prevents tactical snapshots (fog forced false, tactical) from using the unbounded grid scan.
 * When to use: After changing `usesOmniscientGridProximity`.
 * Expected outcome: True only for fogOfWarEnabled === false with a strategic index.
 * Exceptions: None.
 */
function testOmniscientGateRequiresFogOffAndStrategic(): void {
  assert.strictEqual(getResolution(strategicCell), 1);
  assert.strictEqual(getResolution(tacticalSampleCell), 4);
  assert.strictEqual(usesOmniscientGridProximity({ fogOfWarEnabled: false, h3Index: strategicCell }), true);
  assert.strictEqual(usesOmniscientGridProximity({ fogOfWarEnabled: true, h3Index: strategicCell }), false);
  assert.strictEqual(usesOmniscientGridProximity({ h3Index: strategicCell }), false);
  assert.strictEqual(usesOmniscientGridProximity({ fogOfWarEnabled: false, h3Index: tacticalSampleCell }), false);
  assert.strictEqual(usesOmniscientGridProximity({ fogOfWarEnabled: false, h3Index: 'not-a-cell' }), false);
}

/**
 * Verifies the fog-on path-honesty gate requires fog on and a resolution-1 cell.
 *
 * Purpose: The path-versus-Best-Options line must not leak into fog-off or non-strategic geometry.
 * When to use: After changing `usesFogPathDistanceBriefing`.
 * Expected outcome: True only for fogOfWarEnabled === true with a strategic index.
 * Exceptions: None.
 */
function testFogPathGateRequiresFogOnAndStrategic(): void {
  assert.strictEqual(usesFogPathDistanceBriefing({ fogOfWarEnabled: true, h3Index: strategicCell }), true);
  assert.strictEqual(usesFogPathDistanceBriefing({ fogOfWarEnabled: false, h3Index: strategicCell }), false);
  assert.strictEqual(usesFogPathDistanceBriefing({ h3Index: strategicCell }), false);
  assert.strictEqual(usesFogPathDistanceBriefing({ fogOfWarEnabled: true, h3Index: tacticalSampleCell }), false);
  assert.strictEqual(usesFogPathDistanceBriefing({ fogOfWarEnabled: true, h3Index: 'not-a-cell' }), false);
}

/**
 * Verifies same-cell and adjacent grid distances.
 *
 * Purpose: Happy-path contract for `safeGridHexDistance`.
 * When to use: After changing grid wrapping.
 * Expected outcome: 0 for the same index; 1 for a ring-1 neighbor.
 * Exceptions: None.
 */
function testSafeGridHexDistanceSameAndAdjacent(): void {
  assert.strictEqual(safeGridHexDistance(strategicCell, strategicCell), 0);
  const neighbor = gridDisk(strategicCell, 1).find((h3) => h3 !== strategicCell);
  assert.ok(neighbor, 'expected a ring-1 neighbor');
  assert.strictEqual(safeGridHexDistance(strategicCell, neighbor!), 1);
}

/**
 * Verifies neighbor hop BFS matches `gridDistance` when that API succeeds.
 *
 * Purpose: Omniscient scoring must not drift from H3 hops on ordinary (non-pentagon-crossing) pairs.
 * When to use: After changing `gridHopDistancesFrom`.
 * Expected outcome: Same cell 0; adjacent neighbor 1, equal to `safeGridHexDistance`.
 * Exceptions: None.
 */
function testGridHopDistancesMatchGridDistanceWhenAvailable(): void {
  assert.strictEqual(gridHopDistancesFrom(strategicCell, [strategicCell]).get(strategicCell), 0);
  const neighbor = gridDisk(strategicCell, 1).find((h3) => h3 !== strategicCell);
  assert.ok(neighbor, 'expected a ring-1 neighbor');
  assert.strictEqual(safeGridHexDistance(strategicCell, neighbor!), 1);
  assert.strictEqual(gridHopDistancesFrom(strategicCell, [neighbor!]).get(neighbor!), 1);
}

/**
 * Verifies invalid indexes are skipped instead of treated as distance 0.
 *
 * Purpose: h3-js can return 0 for two garbage strings; the helper must not invent a same-hex pair.
 * When to use: After changing `safeGridHexDistance` validation.
 * Expected outcome: null for invalid/invalid and valid/invalid.
 * Exceptions: None.
 */
function testSafeGridHexDistanceInvalidIndexesReturnNull(): void {
  assert.strictEqual(safeGridHexDistance('not-a-cell', 'also-bad'), null);
  assert.strictEqual(safeGridHexDistance(strategicCell, 'not-a-cell'), null);
}

/**
 * Verifies the collector omits an unpairable unit and still returns a valid enemy.
 *
 * Purpose: One bad index must not abort the unbounded scan.
 * When to use: After changing `collectOmniscientNearbyUnits` skip rules.
 * Expected outcome: Only the valid enemy appears in nearbyEnemies.
 * Exceptions: None.
 */
function testCollectOmniscientNearbyUnitsSkipsInvalidOtherIndex(): void {
  const neighbor = gridDisk(strategicCell, 1).find((h3) => h3 !== strategicCell);
  assert.ok(neighbor, 'expected a ring-1 neighbor');
  const assessed = { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicCell };
  const collected = collectOmniscientNearbyUnits({
    assessedUnit: assessed,
    units: [
      assessed,
      { id: 'human-bad-1', player: 'human', unitType: 'infantry', h3Index: 'not-a-cell' },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: neighbor! },
    ],
    turnNumber: 4,
    latLngByH3: new Map(),
  });
  assert.strictEqual(collected.nearbyEnemies.length, 1);
  assert.strictEqual(collected.nearbyEnemies[0]!.unitId, 'human-infantry-1');
}

/**
 * Verifies turn estimates from grid hops, including zero budget.
 *
 * Purpose: Armor-style ceil division and air budget must not throw or yield Infinity.
 * When to use: After changing `estimatedTurnsFromGridDistance`.
 * Expected outcome: 5 hops / budget 2 → 3; 0 hops → 0; budget 0 → null.
 * Exceptions: None.
 */
function testEstimatedTurnsFromGridDistance(): void {
  assert.strictEqual(estimatedTurnsFromGridDistance(5, 2), 3);
  assert.strictEqual(estimatedTurnsFromGridDistance(0, 2), 0);
  assert.strictEqual(estimatedTurnsFromGridDistance(5, 0), null);
}

/**
 * Finds two world-map cells where H3 `gridDistance` throws (pentagon-crossing).
 *
 * Purpose: Reproduces the global-map gap where nearest-enemy stayed empty despite living humans.
 * When to use: Omniscient collector cases that must not skip those pairs.
 * Expected outcome: A strategic pair with `safeGridHexDistance` null.
 * Exceptions: Throws when no such pair exists on the ordered hex list.
 */
function strategicPairWhereGridDistanceThrows(): [string, string] {
  const hexes = getOrderedHexList();
  for (const origin of hexes) {
    for (const other of hexes) {
      if (other === origin) continue;
      try {
        gridDistance(origin, other);
      } catch {
        return [origin, other];
      }
    }
  }
  assert.fail('expected a res1 pair where gridDistance throws');
}

/**
 * Verifies omniscient collection still scores a pentagon-crossing enemy.
 *
 * Purpose: `gridDistance` cannot span some global strategic pairs; nearest-enemy must still fill.
 * When to use: After changing omniscient hop scoring.
 * Expected outcome: nearbyEnemies includes the human with a positive hop count.
 * Exceptions: None.
 */
function testCollectOmniscientNearbyUnitsIncludesPentagonCrossingEnemy(): void {
  const [origin, far] = strategicPairWhereGridDistanceThrows();
  assert.strictEqual(safeGridHexDistance(origin, far), null);
  const assessed = { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: origin };
  const collected = collectOmniscientNearbyUnits({
    assessedUnit: assessed,
    units: [
      assessed,
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: far },
    ],
    turnNumber: 30,
    latLngByH3: new Map(),
  });
  const human = collected.nearbyEnemies.find((e) => e.unitId === 'human-infantry-1');
  assert.ok(human, 'pentagon-crossing human must appear in nearbyEnemies');
  assert.ok(human!.hexDistance >= 1);
}

/**
 * Verifies single-pair hop distance measures a pentagon-crossing pair and matches H3 when available.
 *
 * Purpose: Best Options approach and the fog-on assess_unit scan silently dropped pairs where `gridDistance` throws, so stacks recommended empty cities and in-range enemies vanished from Unit Status.
 * When to use: After changing `gridHopDistanceBetween` or the BFS depth cap.
 * Expected outcome: Same value as `gridDistance` for a measurable neighbor; a positive hop count for the throwing pair, stable across the memo.
 * Exceptions: None.
 */
function testGridHopDistanceBetweenCoversPentagonCrossingPair(): void {
  const neighbor = gridDisk(strategicCell, 1).find((h) => h !== strategicCell);
  assert.ok(neighbor, 'expected a ring-1 neighbor');
  assert.strictEqual(gridHopDistanceBetween(strategicCell, strategicCell), 0);
  assert.strictEqual(gridHopDistanceBetween(strategicCell, neighbor!), gridDistance(strategicCell, neighbor!));

  const [origin, far] = strategicPairWhereGridDistanceThrows();
  assert.strictEqual(safeGridHexDistance(origin, far), null);
  const hops = gridHopDistanceBetween(origin, far);
  assert.ok(hops !== null && hops >= 1, 'pentagon-crossing pair must still report hops');
  assert.strictEqual(gridHopDistanceBetween(origin, far), hops, 'second call must hit the fallback memo');
  assert.strictEqual(
    hops,
    gridHopDistancesFrom(origin, [far]).get(far),
    'wrapper must agree with an uncapped BFS for this pair'
  );
}

/**
 * Ensures the fog-off Unit Status honesty line does not require plan_route before every move.
 *
 * Purpose: Grid-hop distances are not march paths; this-turn dests still come from Best Options Target Hexes.
 * When to use: After edits to `OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE`.
 * Expected outcome: Mentions Best Options dest copy; does not say use plan_route before moving.
 * Exceptions: None.
 */
function testOmniscientHonestyLineUsesBestOptionsDestCopy(): void {
  assert.ok(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE.includes('grid hops'));
  assert.ok(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE.includes('Best Options This Turn'));
  assert.ok(!OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE.includes('Use plan_route before moving.'));
}

/**
 * Ensures the fog-on Unit Status honesty line distinguishes path length from this-turn hop dests.
 *
 * Purpose: Fog-on printed distances can exceed one movement budget while Best Options still lists a legal hop.
 * When to use: After edits to `FOG_PATH_DISTANCE_BRIEFING_LINE`.
 * Expected outcome: Mentions path lengths and Best Options dest copy; does not reuse the omniscient hop sentence.
 * Exceptions: None.
 */
function testFogPathHonestyLineUsesBestOptionsDestCopy(): void {
  assert.ok(FOG_PATH_DISTANCE_BRIEFING_LINE.includes('path lengths'));
  assert.ok(FOG_PATH_DISTANCE_BRIEFING_LINE.includes('Best Options This Turn'));
  assert.ok(!FOG_PATH_DISTANCE_BRIEFING_LINE.includes(OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE));
}

/**
 * Runs all assessUnitProximity tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/tools/assessUnitProximity.test.js`.
 * Expected outcome: Throws on first failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testOmniscientGateRequiresFogOffAndStrategic();
  testFogPathGateRequiresFogOnAndStrategic();
  testSafeGridHexDistanceSameAndAdjacent();
  testGridHopDistancesMatchGridDistanceWhenAvailable();
  testSafeGridHexDistanceInvalidIndexesReturnNull();
  testCollectOmniscientNearbyUnitsSkipsInvalidOtherIndex();
  testEstimatedTurnsFromGridDistance();
  testCollectOmniscientNearbyUnitsIncludesPentagonCrossingEnemy();
  testGridHopDistanceBetweenCoversPentagonCrossingPair();
  testOmniscientHonestyLineUsesBestOptionsDestCopy();
  testFogPathHonestyLineUsesBestOptionsDestCopy();
  console.log('assessUnitProximity.test.ts passed');
}

run();
