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
import {
  getValidDestinations,
  getValidDestinationsComputeCountForTests,
  getValidDestinationsUnoccupied,
  resetValidDestinationsCacheForTests,
} from './oneStepMoveDestinations';
import { strategicMovementHexes } from '../shared/weatherBonusRules';
import { getOrderedHexList } from './mapData';
import {
  ensureTerrainClassificationCacheLoaded,
  getStrategicLandMassByH3,
} from './terrainClassificationCache';
import { landUnitCanOccupyHex } from '../shared/landTraversalStrategic';
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
  const range = strategicMovementHexes(unit.unitType);
  const lookup = createNavalStrategicHexLookup(
    state.hexes,
    seaportCountByH3ForNavalLookup(state.hexes, state.strategicInfrastructure)
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
    strategicInfrastructure: [],
    strategicControl: [],
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
  gridDisk(origin, strategicMovementHexes('infantry'));
  const state = minimalState([origin]);
  const unit = { h3Index: origin, unitType: 'infantry' };
  const result = getValidDestinations(unit, state);
  assert.ok(result.includes(origin));
}

/**
 * Ensures stacked same-origin same-type units reuse one land-mass search, and callers cannot mutate the cache.
 *
 * Purpose: Order validation was recomputing one-step dests for every stacked pawn after Best Options had already
 * done the unique-origin work; the source function must cache so both briefing and apply share it.
 * When to use: After changing `getValidDestinations` caching.
 * Expected outcome: Two armor on the same hex compute once; mutating the first result does not change the second;
 * a different origin computes again.
 * Exceptions: None.
 */
function testGetValidDestinationsReusesStackedSameOrigin(): void {
  ensureTerrainClassificationCacheLoaded();
  resetValidDestinationsCacheForTests();
  const hexList = getOrderedHexList().slice(0, 40);
  const state = minimalState(hexList);
  const origin = hexList[0]!;
  const first = getValidDestinations({ id: 'armor-a', h3Index: origin, unitType: 'armor' }, state);
  const second = getValidDestinations({ id: 'armor-b', h3Index: origin, unitType: 'armor' }, state);
  assert.strictEqual(
    getValidDestinationsComputeCountForTests(),
    1,
    'stacked same-hex armor must share one dest computation'
  );
  assert.deepStrictEqual([...second].sort(), [...first].sort(), 'cached dest lists must match');
  first.push('mutated-hex');
  const third = getValidDestinations({ id: 'armor-c', h3Index: origin, unitType: 'armor' }, state);
  assert.ok(!third.includes('mutated-hex'), 'callers must not mutate the dest cache');
  const otherOrigin = hexList[1]!;
  getValidDestinations({ id: 'armor-d', h3Index: otherOrigin, unitType: 'armor' }, state);
  assert.strictEqual(getValidDestinationsComputeCountForTests(), 2, 'a different origin must compute dests again');
}

/**
 * Ensures assume-debarked validation does not share dests with an ordinary march from the same hex.
 *
 * Purpose: Auto-debark reachability is a different legality set from stay-embarked; mixing them in one cache slot would accept illegal marches.
 * When to use: After changing `validDestinationsCacheKey`.
 * Expected outcome: Two computes for the same origin when `assumeDebarkedForReachability` differs; dest lists still match when the unit is not actually embarked.
 * Exceptions: None.
 */
function testGetValidDestinationsAssumeDebarkedDoesNotShareSlot(): void {
  ensureTerrainClassificationCacheLoaded();
  resetValidDestinationsCacheForTests();
  const hexList = getOrderedHexList().slice(0, 40);
  const state = minimalState(hexList);
  const origin = hexList[0]!;
  const unit = { id: 'armor-debark', h3Index: origin, unitType: 'armor' };
  const ordinary = getValidDestinations(unit, state);
  const assumeDebarked = getValidDestinations(unit, state, { assumeDebarkedForReachability: true });
  assert.strictEqual(
    getValidDestinationsComputeCountForTests(),
    2,
    'assume-debarked and ordinary march must not share a dest cache slot'
  );
  assert.deepStrictEqual(
    [...assumeDebarked].sort(),
    [...ordinary].sort(),
    'unembarked armor dests are the same whether or not assume-debarked is set'
  );
}

/**
 * Order validation dests still include a hex another unit already occupies.
 *
 * Purpose: Friendly stacking is legal; `getValidDestinations` is what `validateAiOrder` uses. The unoccupied
 * wrapper is only for empty-hex briefing suggestions.
 * When to use: After changing dest occupancy filtering.
 * Expected outcome: Occupied neighbor stays in `getValidDestinations` and is dropped from `getValidDestinationsUnoccupied`.
 * Exceptions: None.
 */
function testGetValidDestinationsKeepsOccupiedHexes(): void {
  ensureTerrainClassificationCacheLoaded();
  resetValidDestinationsCacheForTests();
  const hexList = getOrderedHexList();
  const landMass = getStrategicLandMassByH3();
  const emptyState = minimalState(hexList);
  let origin: string | null = null;
  let occupied: string | undefined;
  for (const h3 of hexList) {
    if (!landUnitCanOccupyHex(h3, landMass)) continue;
    const dests = getValidDestinations({ id: 'inf-mover', h3Index: h3, unitType: 'infantry' }, emptyState);
    occupied = dests.find((d) => d !== h3);
    if (occupied) {
      origin = h3;
      break;
    }
  }
  assert.ok(origin && occupied, 'expected a land infantry origin with at least one dest besides itself');
  resetValidDestinationsCacheForTests();
  const occupiedState = {
    ...emptyState,
    units: [{ id: 'friend-on-dest', player: 'human', unitType: 'infantry', h3Index: occupied }],
  };
  const withOcc = getValidDestinations({ id: 'inf-mover', h3Index: origin, unitType: 'infantry' }, occupiedState);
  assert.ok(withOcc.includes(occupied), 'order validation dests must still include a friendly-occupied hex');
  const suggestion = getValidDestinationsUnoccupied(
    { id: 'inf-mover', h3Index: origin, unitType: 'infantry' },
    occupiedState
  );
  assert.ok(!suggestion.includes(occupied), 'suggestion helper still prefers empty hexes');
}

const tests = [
  { name: 'getValidDestinations matches reference full scan', fn: testGetValidDestinationsMatchesFullScan },
  { name: 'getValidDestinations gridDisk branch returns destinations', fn: testGetValidDestinationsDiskBranchProducesResults },
  { name: 'getValidDestinations reuses stacked same-origin dests', fn: testGetValidDestinationsReusesStackedSameOrigin },
  { name: 'getValidDestinations assume-debarked does not share dest slot', fn: testGetValidDestinationsAssumeDebarkedDoesNotShareSlot },
  { name: 'getValidDestinations keeps occupied hexes', fn: testGetValidDestinationsKeepsOccupiedHexes },
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
