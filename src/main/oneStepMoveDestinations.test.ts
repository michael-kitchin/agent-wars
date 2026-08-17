/**
 * Equivalence tests for bounded `getValidDestinations` vs a reference scan.
 *
 * Purpose: Guards that naval destinations follow berth/egress edges rather than disk + seaport promotion.
 * When to use: Run via `npm test` after changes to `oneStepMoveDestinations.ts`.
 * Expected outcome: Sorted destination sets match for sample units; infantry disk branch returns at least the origin hex.
 * Exceptions: None.
 */

import * as assert from 'assert';
import { gridDisk } from 'h3-js';
import type { GameStateSnapshot } from './gameDb';
import { getValidDestinations } from './oneStepMoveDestinations';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../shared/tacticalRanges';
import { getOrderedHexList } from './mapData';
import {
  ensureTerrainClassificationCacheLoaded,
} from './terrainClassificationCache';
import {
  isLandSeaportHex,
  navalMayOccupyHex,
  navalMayTraverseStrategicEdge,
  type NavalStrategicHexAttrs,
} from '../shared/navalStrategicEdges';
import {
  createNavalStrategicHexLookup,
  seaportCountByH3ForNavalLookup,
} from './navalStrategicPath';

/**
 * Walks naval berth/egress edges out to `range` without calling `getNavalStrategicReachableHexes`.
 *
 * Purpose: Independent reference scan so the production BFS cannot silently match a disk+promotion filter.
 * When to use: Naval branch of `getValidDestinationsFullScan`.
 * Expected outcome: Origin included when occupiable; land seaports appear only as last-step berths.
 * Exceptions: None.
 */
function navalReachableByEdgeScan(
  originH3: string,
  range: number,
  lookup: (h3: string) => NavalStrategicHexAttrs | undefined
): string[] {
  const originAttrs = lookup(originH3);
  if (!originAttrs || !navalMayOccupyHex(originAttrs)) return [];
  const seen = new Set<string>([originH3]);
  const depth = new Map<string, number>([[originH3, 0]]);
  const queue = [originH3];
  const cap = isLandSeaportHex(originAttrs) ? Math.min(range, 1) : range;
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depth.get(current) ?? 0;
    if (currentDepth >= cap) continue;
    const currentAttrs = lookup(current);
    if (!currentAttrs) continue;
    if (isLandSeaportHex(currentAttrs) && current !== originH3) continue;
    let ring: string[] = [];
    try {
      ring = gridDisk(current, 1);
    } catch {
      continue;
    }
    for (const neighbor of ring) {
      if (neighbor === current || seen.has(neighbor)) continue;
      const neighborAttrs = lookup(neighbor);
      if (!neighborAttrs || !navalMayOccupyHex(neighborAttrs)) continue;
      if (!navalMayTraverseStrategicEdge(currentAttrs, neighborAttrs)) continue;
      seen.add(neighbor);
      depth.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }
  return [...seen];
}

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
  if (unit.unitType === 'infantry' || unit.unitType === 'armor' || unit.unitType === 'air') {
    return getValidDestinations(unit, state);
  }
  const range = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
  const lookup = createNavalStrategicHexLookup(
    state.hexes,
    seaportCountByH3ForNavalLookup(state.hexes, state.res1Infrastructure)
  );
  return navalReachableByEdgeScan(unit.h3Index, range, lookup);
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
