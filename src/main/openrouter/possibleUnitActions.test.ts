/**
 * Tests for homeland / nearest / other partitioning and possible-actions markdown tables.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, gridDistance } from 'h3-js';
import { getOrderedHexList, LATLNG_DECIMAL_PLACES } from '../mapData';
import { formatLatLng } from './promptText';
import { buildPossibleUnitActionsMarkdown, partitionHomelandNearestOther } from './possibleUnitActions';
import type { GameStateSnapshot } from '../gameDb';

/**
 * Defines the `minDistToHomeland` function shape (function minDistToHomeland(h: string, homeland: Set<string>): number).

 * Purpose: Supports maintainability by documenting why `minDistToHomeland` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function minDistToHomeland(h: string, homeland: Set<string>): number {
  let m = Infinity;
  for (const t of homeland) {
    try {
      const d = gridDistance(h, t);
      if (d < m) m = d;
    } catch {
      continue;
    }
  }
  return m;
}

/**
 * Defines the `testPartitionPrefersHomelandOverNearest` function shape (function testPartitionPrefersHomelandOverNearest(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionPrefersHomelandOverNearest` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionPrefersHomelandOverNearest(): void {
  const hexList = getOrderedHexList().slice(0, 5);
  const homeland = new Set([hexList[0]!, hexList[1]!]);
  const legal = [hexList[0]!, hexList[4]!];
  const p = partitionHomelandNearestOther(legal, homeland);
  assert.deepStrictEqual(p.homeland, [hexList[0]!]);
  assert.deepStrictEqual(p.nearest, []);
  assert.deepStrictEqual(p.other, [hexList[4]!]);
}

/**
 * Defines the `testPartitionNearestWhenNoneInHomeland` function shape (function testPartitionNearestWhenNoneInHomeland(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionNearestWhenNoneInHomeland` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionNearestWhenNoneInHomeland(): void {
  const hexList = getOrderedHexList().slice(0, 8);
  const homeland = new Set([hexList[0]!]);
  const legal = [hexList[3]!, hexList[4]!, hexList[5]!];
  const p = partitionHomelandNearestOther(legal, homeland);
  assert.deepStrictEqual(p.homeland, []);
  assert.ok(p.nearest.length >= 1);
  const nearestSet = new Set(p.nearest);
  for (const h of p.other) {
    assert.ok(!nearestSet.has(h));
  }
}

/**
 * Defines the `testPartitionEmptyHomelandAllOther` function shape (function testPartitionEmptyHomelandAllOther(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionEmptyHomelandAllOther` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionEmptyHomelandAllOther(): void {
  const hexList = getOrderedHexList().slice(0, 3);
  const p = partitionHomelandNearestOther([hexList[1]!, hexList[2]!], new Set());
  assert.deepStrictEqual(p.homeland, []);
  assert.deepStrictEqual(p.nearest, []);
  assert.deepStrictEqual(p.other, [hexList[1]!, hexList[2]!].sort((a, b) => a.localeCompare(b)));
}

/**
 * Defines the `testPartitionIncludesAllTiesAtMinDistance` function shape (function testPartitionIncludesAllTiesAtMinDistance(): void).

 * Purpose: Supports maintainability by documenting why `testPartitionIncludesAllTiesAtMinDistance` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testPartitionIncludesAllTiesAtMinDistance(): void {
  const hexList = getOrderedHexList().slice(0, 20);
  const homeland = new Set([hexList[0]!]);
  const legal = hexList.slice(5, 15);
  const p = partitionHomelandNearestOther(legal, homeland);
  if (p.nearest.length >= 2) {
    const ref = minDistToHomeland(p.nearest[0]!, homeland);
    for (const h of p.nearest) {
      assert.strictEqual(minDistToHomeland(h, homeland), ref, 'all nearest bucket hexes share minimum distance to homeland');
    }
  }
}

/**
 * Defines the `testBuildPossibleUnitActionsUsesTables` function shape (function testBuildPossibleUnitActionsUsesTables(): void).

 * Purpose: Supports maintainability by documenting why `testBuildPossibleUnitActionsUsesTables` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testBuildPossibleUnitActionsUsesTables(): void {
  const allHexes = getOrderedHexList();
  const h0 = allHexes[0]!;
  const h1 = gridDisk(h0, 1).find((h) => h !== h0 && allHexes.includes(h))!;
  const hexList = [h0, h1];
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of hexList) {
    latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  }
  const state: GameStateSnapshot = {
    hexes: hexList.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: h0 },
      { id: 'human-inf-1', player: 'human', unitType: 'infantry', h3Index: h1 },
    ],
    humanHomeRegionHexes: [h1],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    res1Infrastructure: [],
    res1Control: [
      { h3Index: h0, controllerPlayerId: 'opponent' },
      { h3Index: h1, controllerPlayerId: 'human' },
    ],
  };
  const md = buildPossibleUnitActionsMarkdown({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
  });
  assert.ok(md.includes('| Unit ID | Unit Type | Action Types | Hex | Distance | Enemy Units | Hex Features |'));
  assert.ok(
    md.includes('## Enemy Homeland Hexes') ||
      md.includes('## Hexes Nearest to Enemy Homeland') ||
      md.includes('## Other Hexes')
  );
}

/**
 * Defines the `testUnitHexAppearsInSingleBucketWithPriority` function shape (function testUnitHexAppearsInSingleBucketWithPriority(): void).

 * Purpose: Supports maintainability by documenting why `testUnitHexAppearsInSingleBucketWithPriority` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testUnitHexAppearsInSingleBucketWithPriority(): void {
  const allHexes = getOrderedHexList();
  const base = allHexes[0]!;
  const ring = gridDisk(base, 2).filter((h) => h !== base && allHexes.includes(h));
  const ferryHex = ring[0]!;
  const homelandHex = ring[1]!;
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of [base, ferryHex, homelandHex]) latLngByH3.set(h, cellToLatLng(h) as [number, number]);
  const ferryPos = formatLatLng(latLngByH3.get(ferryHex)!, LATLNG_DECIMAL_PLACES);
  const state: GameStateSnapshot = {
    hexes: [
      { h3Index: base, terrain: 'land', terrainKind: 'plains' },
      { h3Index: ferryHex, terrain: 'land', terrainKind: 'plains' },
      { h3Index: homelandHex, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [{ id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: base }],
    humanHomeRegionHexes: [homelandHex],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    res1Infrastructure: [
      { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: ferryHex, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: homelandHex, urbanHexCount: 1, airportCount: 0, seaportCount: 0 },
    ],
    res1Control: [
      { h3Index: base, controllerPlayerId: 'opponent' },
      { h3Index: ferryHex, controllerPlayerId: 'opponent' },
      { h3Index: homelandHex, controllerPlayerId: 'human' },
    ],
  };
  const md = buildPossibleUnitActionsMarkdown({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
  });
  const rowLines = md
    .split('\n')
    .filter((line) => line.startsWith(`| opponent-air-1 | air |`) && line.includes(`| ${ferryPos} |`));
  assert.strictEqual(rowLines.length, 1, 'expected one row for same unit+hex across all buckets');
  assert.ok(rowLines[0]!.includes('move/melee'), 'expected merged row to include move/melee action');
  assert.ok(rowLines[0]!.includes('air strike'), 'expected merged row to include air strike action');
  assert.ok(md.includes('## Hexes Nearest to Enemy Homeland'), 'expected higher-priority nearest bucket to be used');
}

/**
 * Documents the module-scope binding `tests` (tests).

 * Purpose: Supports maintainability by documenting why `tests` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const tests = [
  { name: 'partitionHomelandNearestOther prefers homeland', fn: testPartitionPrefersHomelandOverNearest },
  { name: 'partitionHomelandNearestOther uses nearest when no homeland hit', fn: testPartitionNearestWhenNoneInHomeland },
  { name: 'partitionHomelandNearestOther empty homeland -> other only', fn: testPartitionEmptyHomelandAllOther },
  { name: 'partitionHomelandNearestOther tie handling', fn: testPartitionIncludesAllTiesAtMinDistance },
  { name: 'buildPossibleUnitActionsMarkdown emits markdown tables', fn: testBuildPossibleUnitActionsUsesTables },
  { name: 'buildPossibleUnitActionsMarkdown de-duplicates unit+hex across buckets', fn: testUnitHexAppearsInSingleBucketWithPriority },
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
