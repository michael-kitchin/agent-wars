/**
 * Contract tests for strategic naval berth/egress BFS on a tiny injected graph.
 * Run with: node dist/main/navalStrategicPath.test.js
 */

import * as assert from 'assert';
import {
  findNavalStrategicPath,
  getNavalStrategicDistanceAndTurns,
  getNavalStrategicReachableHexes,
  navalLookupForHexState,
  mergeCachedSeaportsIntoInfraMap,
  seaportCountByH3ForNavalLookup,
  type NavalStrategicHexLookup,
  type NavalStrategicNeighborsOf,
} from './navalStrategicPath';
import type { NavalStrategicHexAttrs } from '../shared/navalStrategicEdges';

/**
 * Synthetic graph: PORT—W1—W2—W3—W4, PORT—INLAND_PORT. Inland port has no water adjacency.
 *
 * Purpose: Proves berth and egress without using the world hex set or seaport promotion.
 * When to use: All cases in this file.
 * Expected outcome: Stable string ids and adjacency independent of H3.
 * Exceptions: None.
 */
const W1 = 'W1';
const W2 = 'W2';
const W3 = 'W3';
const W4 = 'W4';
const PORT = 'PORT';
const INLAND_PORT = 'INLAND_PORT';

/**
 * Adjacency for the four-hex fixture.
 *
 * Purpose: Injected `neighborsOf` so tests do not depend on real H3 rings.
 * When to use: Passed into path and reachable helpers.
 * Expected outcome: Symmetric undirected edges matching the fixture comment.
 * Exceptions: Unknown ids return [].
 */
const NEIGHBORS: Record<string, string[]> = {
  [W1]: [W2, PORT],
  [W2]: [W1, W3],
  [W3]: [W2, W4],
  [W4]: [W3],
  [PORT]: [W1, INLAND_PORT],
  [INLAND_PORT]: [PORT],
};

/**
 * Native attrs: a water chain, a land seaport on water’s rim, a second inland land seaport.
 *
 * Purpose: The inland port would be a canal if land seaports were transit.
 * When to use: Lookup closure for this file.
 * Expected outcome: PORT and INLAND_PORT are land seaports; W1–W4 are transit.
 * Exceptions: Unknown ids return undefined.
 */
const ATTRS: Record<string, NavalStrategicHexAttrs> = {
  [W1]: { nativeTerrain: 'water', hasSeaport: false },
  [W2]: { nativeTerrain: 'water', hasSeaport: false },
  [W3]: { nativeTerrain: 'water', hasSeaport: false },
  [W4]: { nativeTerrain: 'water', hasSeaport: false },
  [PORT]: { nativeTerrain: 'land', terrainKind: 'plains', hasSeaport: true },
  [INLAND_PORT]: { nativeTerrain: 'land', terrainKind: 'plains', hasSeaport: true },
};

/**
 * Lookup wrapping the fixture attrs map.
 *
 * Purpose: Matches the production `NavalStrategicHexLookup` contract.
 * When to use: Every search in this file.
 * Expected outcome: Undefined for unknown ids.
 * Exceptions: None.
 */
const lookup: NavalStrategicHexLookup = (h3) => ATTRS[h3];

/**
 * Neighbor function wrapping the fixture adjacency map.
 *
 * Purpose: Matches the production `NavalStrategicNeighborsOf` contract.
 * When to use: Every search in this file.
 * Expected outcome: Empty array for unknown ids.
 * Exceptions: None.
 */
const neighborsOf: NavalStrategicNeighborsOf = (h3) => NEIGHBORS[h3] ?? [];

/**
 * Asserts water↔water and water→adjacent land seaport paths exist.
 *
 * Purpose: Happy-path sail and berth.
 * When to use: After changes to naval BFS occupancy or last-step berth.
 * Expected outcome: Inclusive paths of length 2 (one edge).
 * Exceptions: None.
 */
function testWaterSailAndBerth(): void {
  assert.deepStrictEqual(
    findNavalStrategicPath({ originH3: W1, destinationH3: W2, maxSteps: 2, lookup, neighborsOf }),
    [W1, W2]
  );
  assert.deepStrictEqual(
    findNavalStrategicPath({ originH3: W1, destinationH3: PORT, maxSteps: 2, lookup, neighborsOf }),
    [W1, PORT]
  );
}

/**
 * Asserts egress from a land seaport to adjacent water.
 *
 * Purpose: Origin-on-port must still sail out.
 * When to use: After changes to origin land-seaport clamping.
 * Expected outcome: One-edge path PORT→W1; PORT→W2 is out of egress range.
 * Exceptions: None.
 */
function testEgressFromLandSeaport(): void {
  assert.deepStrictEqual(
    findNavalStrategicPath({ originH3: PORT, destinationH3: W1, maxSteps: 3, lookup, neighborsOf }),
    [PORT, W1]
  );
  assert.strictEqual(
    findNavalStrategicPath({ originH3: PORT, destinationH3: W2, maxSteps: 3, lookup, neighborsOf }),
    null,
    'same-turn egress cannot continue to a second water hex'
  );
  assert.deepStrictEqual(
    findNavalStrategicPath({
      originH3: PORT,
      destinationH3: W2,
      maxSteps: 8,
      lookup,
      neighborsOf,
      clampLandSeaportOriginToOneStep: false,
    }),
    [PORT, W1, W2]
  );
}

/**
 * Asserts land seaports cannot canal to a second port even with click-range 3.
 *
 * Purpose: Range must not resurrect port-to-port transit.
 * When to use: After changes to intermediate-node expansion.
 * Expected outcome: Null paths for PORT→INLAND_PORT and W1→INLAND_PORT.
 * Exceptions: None.
 */
function testNoCanalThroughLandSeaport(): void {
  assert.strictEqual(
    findNavalStrategicPath({ originH3: PORT, destinationH3: INLAND_PORT, maxSteps: 3, lookup, neighborsOf }),
    null
  );
  assert.strictEqual(
    findNavalStrategicPath({ originH3: W1, destinationH3: INLAND_PORT, maxSteps: 3, lookup, neighborsOf }),
    null
  );
}

/**
 * Asserts reachable sets include adjacent berth and exclude the inland canal port.
 *
 * Purpose: Click destinations must match path legality.
 * When to use: After changes to `getNavalStrategicReachableHexes`.
 * Expected outcome: From W1: W1, W2, PORT. From PORT with any cap: PORT and W1 only.
 * Exceptions: None.
 */
function testReachableSets(): void {
  const fromWater = getNavalStrategicReachableHexes({ originH3: W1, maxSteps: 3, lookup, neighborsOf });
  assert.ok(fromWater.has(W1));
  assert.ok(fromWater.has(W2));
  assert.ok(fromWater.has(PORT));
  assert.ok(!fromWater.has(INLAND_PORT));

  const fromPort = getNavalStrategicReachableHexes({ originH3: PORT, maxSteps: 1, lookup, neighborsOf });
  assert.ok(fromPort.has(PORT));
  assert.ok(fromPort.has(W1));
  assert.ok(!fromPort.has(W2));
  assert.ok(!fromPort.has(INLAND_PORT));

  const fromPortHighCap = getNavalStrategicReachableHexes({ originH3: PORT, maxSteps: 3, lookup, neighborsOf });
  assert.ok(!fromPortHighCap.has(INLAND_PORT));
  assert.ok(!fromPortHighCap.has(W2));
}

/**
 * Guards multi-turn distance so land-seaport egress is not counted as a full sailing budget.
 *
 * Purpose: `check_distance` / `assess_unit` must report 3 turns for a 4-edge voyage from a berth at budget 2.
 * When to use: After changes to `getNavalStrategicDistanceAndTurns`.
 * Expected outcome: PORT→W4 is 4 hexes and 3 turns; W1→W4 is 3 hexes and 2 turns; hold is 0; inland canal is null.
 * Exceptions: None.
 */
function testDistanceAndTurnsAccountsForEgress(): void {
  const fromPort = getNavalStrategicDistanceAndTurns({
    originH3: PORT,
    destinationH3: W4,
    lookup,
    neighborsOf,
    movementBudget: 2,
  });
  assert.deepStrictEqual(fromPort, { hexDistance: 4, estimatedTurns: 3 });

  const fromWater = getNavalStrategicDistanceAndTurns({
    originH3: W1,
    destinationH3: W4,
    lookup,
    neighborsOf,
    movementBudget: 2,
  });
  assert.deepStrictEqual(fromWater, { hexDistance: 3, estimatedTurns: 2 });

  const hold = getNavalStrategicDistanceAndTurns({
    originH3: PORT,
    destinationH3: PORT,
    lookup,
    neighborsOf,
    movementBudget: 2,
  });
  assert.deepStrictEqual(hold, { hexDistance: 0, estimatedTurns: 0 });

  assert.strictEqual(
    getNavalStrategicDistanceAndTurns({
      originH3: PORT,
      destinationH3: INLAND_PORT,
      lookup,
      neighborsOf,
      movementBudget: 2,
    }),
    null
  );
}

/**
 * Infra-only seaport map still works when the classification cache is unloaded.
 *
 * Purpose: Snapshot seaports must remain visible without walking every hex through live DB.
 * When to use: Isolated lookup construction in tests and production before cache load.
 * Expected outcome: Positive counts come from infra rows; omitted hexes are absent from the map.
 * Exceptions: None.
 */
function testSeaportCountFromInfraWithoutWalkingHexes(): void {
  const map = seaportCountByH3ForNavalLookup([], [{ h3Index: PORT, seaportCount: 2 }]);
  assert.strictEqual(map.get(PORT), 2);
  assert.strictEqual(map.get(W1), undefined);
}

/**
 * Snapshot zeros win over classification-cache seaport counts; omitted hexes still gap-fill.
 *
 * Purpose: Destroyed ports must not become berths because world metadata still lists a seaport.
 * When to use: Merge used by `seaportCountByH3ForNavalLookup`.
 * Expected outcome: Explicit 0 is preserved; a missing hex with a positive cache count is added.
 * Exceptions: None.
 */
function testDestroyedSeaportIsNotRestoredFromCache(): void {
  const map = new Map<string, number>([[PORT, 0]]);
  mergeCachedSeaportsIntoInfraMap(map, new Map([[PORT, 1], [W1, 1]]));
  assert.strictEqual(map.get(PORT), 0);
  assert.strictEqual(map.get(W1), 1);
}

/**
 * Naval lookup is reused for the same session object.
 *
 * Purpose: Hover preview and `plan_route` share one lookup so seaport merge is not rebuilt twice.
 * When to use: Pathfinding sessions that outlive a single destination hover.
 * Expected outcome: Same object on reuse; a different session key builds a distinct lookup.
 * Exceptions: None.
 */
function testNavalLookupSessionReuse(): void {
  const hexes = [{ h3Index: W1, terrain: 'water' }];
  const session = {};
  const first = navalLookupForHexState(session, hexes, undefined);
  const second = navalLookupForHexState(session, hexes, undefined);
  assert.strictEqual(first, second);
  const other = navalLookupForHexState({}, hexes, undefined);
  assert.notStrictEqual(first, other);
}

/**
 * Entry point for naval strategic path contract tests.
 *
 * Purpose: Runs all cases in this module for CI.
 * When to use: Invoked when the compiled test file is executed.
 * Expected outcome: All assertions pass and a success line is logged.
 * Exceptions: Propagates assertion failures to the process exit code.
 */
function run(): void {
  testWaterSailAndBerth();
  testEgressFromLandSeaport();
  testNoCanalThroughLandSeaport();
  testReachableSets();
  testDistanceAndTurnsAccountsForEgress();
  testSeaportCountFromInfraWithoutWalkingHexes();
  testDestroyedSeaportIsNotRestoredFromCache();
  testNavalLookupSessionReuse();
  console.log('navalStrategicPath.test.ts passed');
}

run();
