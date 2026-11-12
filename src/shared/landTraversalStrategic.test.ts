/**
 * Verification for res-1 land-mass traversal predicates.
 * Run with: node dist/shared/landTraversalStrategic.test.js
 */

import * as assert from 'assert';
import { gridDisk, latLngToCell } from 'h3-js';
import {
  canLandUnitTraverseEdge,
  getLandStepDistances,
  landMassRecordsShareId,
  landUnitCanOccupyHex,
  storedStrategicTerrainKind,
  strategicMapFillTerrainKind,
  STRATEGIC_LAND_MAX_WATER_PCT,
  type LandMassByH3,
  type StrategicLandMassRecord,
} from './landTraversalStrategic';

/**
 * Defines the `record` function shape (function record().

 * Purpose: Supports maintainability by documenting why `record` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function record(
  h3Index: string,
  waterPct: number,
  continentIds: number[] = [],
  islandIds: number[] = []
): StrategicLandMassRecord {
  return { h3Index, waterPct, continentIds, islandIds };
}

/**
 * Defines the `mapOf` function shape (function mapOf(...entries: StrategicLandMassRecord[]): Map<string, StrategicLandMassRecord>).

 * Purpose: Supports maintainability by documenting why `mapOf` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function mapOf(...entries: StrategicLandMassRecord[]): Map<string, StrategicLandMassRecord> {
  return new Map(entries.map((e) => [e.h3Index, e]));
}

/**
 * Defines the `testSameContinentLowWater` function shape (function testSameContinentLowWater(): void).

 * Purpose: Supports maintainability by documenting why `testSameContinentLowWater` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSameContinentLowWater(): void {
  const data = mapOf(
    record('A', 10, [1]),
    record('B', STRATEGIC_LAND_MAX_WATER_PCT - 1, [1])
  );
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), true);
}

/**
 * Defines the `testSameContinentHighWaterBlocked` function shape (function testSameContinentHighWaterBlocked(): void).

 * Purpose: Supports maintainability by documenting why `testSameContinentHighWaterBlocked` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testSameContinentHighWaterBlocked(): void {
  const data = mapOf(record('A', 10, [1]), record('B', STRATEGIC_LAND_MAX_WATER_PCT, [1]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), false);
}

/**
 * Defines the `testDifferentContinentBlocked` function shape (function testDifferentContinentBlocked(): void).

 * Purpose: Supports maintainability by documenting why `testDifferentContinentBlocked` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testDifferentContinentBlocked(): void {
  const data = mapOf(record('A', 10, [NE_AFRICA]), record('B', 10, [NE_ASIA]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), false);
}

/**
 * Defines the `testContinentToDualTaggedDestinationAllowed` function shape (function testContinentToDualTaggedDestinationAllowed(): void).

 * Purpose: Mainland may step onto a dual continent+island cell when they share a continent id (peninsula / Baja-style tags).
 * When to use: Regression guard for mainland-to-F9-style adjacent cells.
 * Expected outcome: Continent-only origin to destination with shared continent and island ids passes when water is below 85%.
 * Exceptions: None.
 */
function testContinentToDualTaggedDestinationAllowed(): void {
  const data = mapOf(record('A', 0, [4]), record('B', 75, [4], [319103]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), true);
}

/**
 * Defines the `testContinentToIslandWithoutSharedLandMassBlocked` function shape (function testContinentToIslandWithoutSharedLandMassBlocked(): void).

 * Purpose: Pure offshore islands with no shared continent or island id stay unreachable from mainland overland.
 * When to use: Regression guard for cases like mainland Caribbean coast to Dominican Republic island.
 * Expected outcome: Continent-only origin to island-only destination with no overlapping ids is blocked.
 * Exceptions: None.
 */
function testContinentToIslandWithoutSharedLandMassBlocked(): void {
  const data = mapOf(record('A', 10, [3]), record('B', 89, [], [318876, 318929]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), false);
}

/**
 * Defines the `testIslandToContinentWithSharedContinentAllowed` function shape (function testIslandToContinentWithSharedContinentAllowed(): void).

 * Purpose: Island cells that also carry a continent id may step onto same-continent mainland when water allows.
 * When to use: Regression guard for island-to-coastal-mainland hops on a shared continent.
 * Expected outcome: Shared continent membership permits the step even without shared island ids on the destination.
 * Exceptions: None.
 */
function testIslandToContinentWithSharedContinentAllowed(): void {
  const data = mapOf(record('A', 50, [1], [42]), record('B', 10, [1]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), true);
}

/**
 * Defines the `testIslandOnlyToContinentOnlyBlocked` function shape (function testIslandOnlyToContinentOnlyBlocked(): void).

 * Purpose: Island-only origins cannot reach continent-only land with no shared continent or island id.
 * When to use: Regression guard for isolated island polygons with no continent overlap.
 * Expected outcome: Step blocked when neither continent nor island ids intersect.
 * Exceptions: None.
 */
function testIslandOnlyToContinentOnlyBlocked(): void {
  const data = mapOf(record('A', 50, [], [42]), record('B', 10, [1]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), false);
}

/**
 * Defines the `testSameIslandLowWater` function shape (function testSameIslandLowWater(): void).

 * Purpose: Shared island ids permit movement when the destination is below the water threshold.
 * When to use: Regression guard for island transport, march, and combat on large islands.
 * Expected outcome: Same-island cells with low water remain mutually reachable.
 * Exceptions: None.
 */
function testSameIslandLowWater(): void {
  const data = mapOf(record('A', 50, [], [7]), record('B', 60, [], [7]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), true);
}

/**
 * Defines the `testSameIslandHighWaterBlocked` function shape (function testSameIslandHighWaterBlocked(): void).

 * Purpose: The 85% water cap applies to every march step, including same-island moves.
 * When to use: Regression guard for high-water island coast cells.
 * Expected outcome: Destination at or above 85% water blocks the step even with shared island ids.
 * Exceptions: None.
 */
function testSameIslandHighWaterBlocked(): void {
  const data = mapOf(record('A', 84, [], [7]), record('B', 94, [], [7]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), false);
  assert.strictEqual(landUnitCanOccupyHex('A', data), true);
  assert.strictEqual(landUnitCanOccupyHex('B', data), true);
}

/**
 * Defines the `testDifferentIslandsLinkedBySharedContinent` function shape (function testDifferentIslandsLinkedBySharedContinent(): void).

 * Purpose: Different island ids on the same continent may connect when grid-adjacent and water allows.
 * When to use: Regression guard for the unified continent-or-island overlap rule.
 * Expected outcome: Shared continent id permits the step even when island ids differ.
 * Exceptions: None.
 */
function testDifferentIslandsLinkedBySharedContinent(): void {
  const data = mapOf(record('A', 10, [1], [7]), record('B', 10, [1], [8]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), true);
}

/**
 * Defines the `testIslandToContinentWithSharedIslandAllowed` function shape (function testIslandToContinentWithSharedIslandAllowed(): void).

 * Purpose: Island-to-continent steps remain valid when the destination hex also belongs to the same island id.
 * When to use: Regression guard for coastal mainland cells that overlap an island polygon.
 * Expected outcome: Shared island membership on the destination permits the step when water is below 85%.
 * Exceptions: None.
 */
function testIslandToContinentWithSharedIslandAllowed(): void {
  const data = mapOf(record('A', 50, [], [42]), record('B', 10, [1], [42]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), true);
}

/**
 * Defines the `testDifferentIslandBlocked` function shape (function testDifferentIslandBlocked(): void).

 * Purpose: Supports maintainability by documenting why `testDifferentIslandBlocked` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testDifferentIslandBlocked(): void {
  const data = mapOf(record('A', 50, [], [7]), record('B', 50, [], [8]));
  assert.strictEqual(canLandUnitTraverseEdge('A', 'B', data), false);
}

/**
 * Defines the `testOccupancy` function shape (function testOccupancy(): void).

 * Purpose: Supports maintainability by documenting why `testOccupancy` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testOccupancy(): void {
  const data = mapOf(record('A', 10, [1]), record('B', 99, [], [3]), record('C', 100));
  assert.strictEqual(landUnitCanOccupyHex('A', data), true);
  assert.strictEqual(landUnitCanOccupyHex('B', data), true);
  assert.strictEqual(landUnitCanOccupyHex('C', data), false);
}

/** Natural Earth Africa ``NE_ID`` for landmass regression fixtures. */
const NE_AFRICA = 1159104365;
/** Natural Earth Asia ``NE_ID`` for landmass regression fixtures. */
const NE_ASIA = 1159104597;

/**
 * Defines the `testAfricaAsiaCorridorSharedContinent` function shape (function testAfricaAsiaCorridorSharedContinent(): void).

 * Purpose: Regression guard for Sinai/Arabia hops when both hexes share a continent id under NE geography regions.
 * When to use: After landmass data source migration to ``NE_ID`` membership.
 * Expected outcome: GK (Africa+Asia) may step to GT (Asia) when water_pct is below 85%.
 * Exceptions: None.
 */
function testAfricaAsiaCorridorSharedContinent(): void {
  const data = mapOf(
    record('GK', 9, [NE_AFRICA, NE_ASIA]),
    record('GT', 2, [NE_ASIA])
  );
  assert.strictEqual(canLandUnitTraverseEdge('GK', 'GT', data), true);
}

/**
 * Checks which classified kind is stored for a new match.
 *
 * Purpose: Seeding must keep non-water kinds and open ocean, and must store a land-traversable water hex as coastal.
 * When to use: Direct node invocation of this file.
 * Expected outcome: Plains stays plains. Water at 39.7% with a continent id is coastal. Water at the cap stays water. Water with no landmass ids stays water. A null record stays water.
 * Exceptions: None.
 */
function testStoredStrategicTerrainKind(): void {
  assert.strictEqual(storedStrategicTerrainKind('plains', record('p', 10, [1])), 'plains');
  assert.strictEqual(storedStrategicTerrainKind('water', record('c', 39.7, [1])), 'coastal');
  assert.strictEqual(
    storedStrategicTerrainKind('water', record('w', STRATEGIC_LAND_MAX_WATER_PCT, [1])),
    'water'
  );
  assert.strictEqual(storedStrategicTerrainKind('water', record('o', 40)), 'water');
  assert.strictEqual(storedStrategicTerrainKind('water', null), 'water');
}

/**
 * The strategic polygon stays coastal when seeding relabeled a water-dominant hex.
 *
 * Purpose: Child-majority fill would paint that hex as water after open-water cells keep their own rows.
 * When to use: Direct node invocation of this file.
 * Expected outcome: Coastal stored kind wins over a water majority. Plains and water pass the child majority through.
 * Exceptions: None.
 */
function testStrategicMapFillTerrainKind(): void {
  assert.strictEqual(strategicMapFillTerrainKind('coastal', 'water'), 'coastal');
  assert.strictEqual(strategicMapFillTerrainKind('plains', 'plains'), 'plains');
  assert.strictEqual(strategicMapFillTerrainKind('water', 'water'), 'water');
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Land steps grow one per edge and stop at a cell on another continent.
 *
 * Purpose: Campaign reach walks land edges, not straight hops.
 * When to use: Direct node invocation of this file.
 * Expected outcome: Ring 1 is one step except the blocked continent. Ring 2 that is reached is two steps. Depth 1 does not reach ring 2.
 * Exceptions: None.
 */
function testLandStepDistances(): void {
  const origin = latLngToCell(10, 10, 1);
  const disk = gridDisk(origin, 2);
  const ring1 = gridDisk(origin, 1).filter((h3) => h3 !== origin);
  const blocked = ring1[0]!;
  const data: LandMassByH3 = new Map(
    disk.map((h3) => [h3, { h3Index: h3, waterPct: 0, continentIds: h3 === blocked ? [2] : [1], islandIds: [] }])
  );
  const steps = getLandStepDistances({ originH3s: [origin], hexSet: new Set(disk), data, maxDepth: 2 });
  assert.equal(steps.get(origin), 0);
  for (const h3 of ring1) {
    if (h3 !== blocked) assert.equal(steps.get(h3), 1);
  }
  assert.equal(steps.has(blocked), false);
  const ring2 = disk.filter((h3) => h3 !== origin && !ring1.includes(h3));
  const reachedRing2 = ring2.filter((h3) => steps.has(h3));
  assert.ok(reachedRing2.length > 0);
  assert.ok(reachedRing2.every((h3) => steps.get(h3) === 2));
  const shallow = getLandStepDistances({ originH3s: [origin], hexSet: new Set(disk), data, maxDepth: 1 });
  assert.equal(ring2.some((h3) => shallow.has(h3)), false);
  assert.equal(landMassRecordsShareId(data.get(origin)!, data.get(blocked)!), false);
  assert.equal(landMassRecordsShareId(data.get(origin)!, data.get(ring1[1]!)!), true);
}

function run(): void {
  testLandStepDistances();
  testStoredStrategicTerrainKind();
  testStrategicMapFillTerrainKind();
  testSameContinentLowWater();
  testSameContinentHighWaterBlocked();
  testDifferentContinentBlocked();
  testAfricaAsiaCorridorSharedContinent();
  testContinentToDualTaggedDestinationAllowed();
  testContinentToIslandWithoutSharedLandMassBlocked();
  testIslandToContinentWithSharedContinentAllowed();
  testIslandOnlyToContinentOnlyBlocked();
  testSameIslandLowWater();
  testSameIslandHighWaterBlocked();
  testDifferentIslandsLinkedBySharedContinent();
  testIslandToContinentWithSharedIslandAllowed();
  testDifferentIslandBlocked();
  testOccupancy();
  console.log('landTraversalRes1 tests passed');
}

run();
