/**
 * Tests for strategic Best Options This Turn occupancy and approach fallback.
 *
 * Purpose: Locks that friendly-occupied uncontrolled cities are not move/melee interest, and that empty interest falls back to approach (including naval).
 * When to use: After edits to `possibleUnitActionsBestOptionsInterest.ts` or strategic this-turn approach wiring.
 * Expected outcome: Occupancy, empty-urban capture when no enemy, adjacent-enemy melee, contested melee, distant-enemy approach (including over empty cities), and naval approach contracts hold on real map hexes.
 * Exceptions: Throws when the world map has no geodesic land-mass chain of the required length, or no geodesic water chain for the naval case.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, gridDistance } from 'h3-js';
import { canLandUnitTraverseEdge, landUnitCanOccupyHex } from '../../shared/landTraversalRes1';
import type { GameStateSnapshot } from '../gameDb';
import { getOrderedHexList, LATLNG_DECIMAL_PLACES } from '../mapData';
import { ensureTerrainClassificationCacheLoaded, getRes1LandMassByH3 } from '../terrainClassificationCache';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';
import { formatLatLng } from './promptText';

/**
 * Finds a land-mass hex chain whose hop count equals H3 grid distance (a geodesic on occupiable land).
 *
 * Purpose: Strategic this-turn tests need path-legal destinations whose grid distance to a far enemy is well-defined.
 * When to use: Occupancy, empty-urban, adjacent-enemy, contested, and approach fixtures in this file.
 * Expected outcome: `hops + 1` hexes from origin to the far end; `gridDistance(chain[0], chain[hops]) === hops`.
 * Exceptions: Throws if no such chain exists on the loaded world map.
 */
function findGeodesicLandMassChain(hops: number): string[] {
  ensureTerrainClassificationCacheLoaded();
  const data = getRes1LandMassByH3();
  const allHexes = getOrderedHexList();
  const onMap = new Set(allHexes);
  for (const origin of allHexes) {
    if (!landUnitCanOccupyHex(origin, data)) continue;
    const prev = new Map<string, string | null>();
    const dist = new Map<string, number>();
    prev.set(origin, null);
    dist.set(origin, 0);
    const q = [origin];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i]!;
      const d = dist.get(cur) ?? 0;
      if (d === hops) {
        try {
          if (gridDistance(origin, cur) !== hops) continue;
        } catch {
          continue;
        }
        const chain: string[] = [];
        let walk: string | null = cur;
        while (walk) {
          chain.push(walk);
          walk = prev.get(walk) ?? null;
        }
        chain.reverse();
        return chain;
      }
      if (d >= hops) continue;
      for (const n of gridDisk(cur, 1)) {
        if (n === cur || prev.has(n) || !onMap.has(n)) continue;
        if (!canLandUnitTraverseEdge(cur, n, data)) continue;
        prev.set(n, cur);
        dist.set(n, d + 1);
        q.push(n);
      }
    }
  }
  throw new Error(`expected a geodesic land-mass chain of ${hops} hops`);
}

/**
 * Finds a geodesic chain of hexes land units cannot occupy (open water on the world map).
 *
 * Purpose: Naval approach tests need path-legal water destinations with a well-defined grid distance to a far enemy fleet.
 * When to use: `testStrategicBestOptionsNavalApproachWhenEnemyOutOfReach`.
 * Expected outcome: `hops + 1` water hexes; `gridDistance(chain[0], chain[hops]) === hops`.
 * Exceptions: Throws if no such chain exists on the loaded world map.
 */
function findGeodesicWaterChain(hops: number): string[] {
  ensureTerrainClassificationCacheLoaded();
  const data = getRes1LandMassByH3();
  const allHexes = getOrderedHexList();
  const onMap = new Set(allHexes);
  const isWater = (h3: string) => !landUnitCanOccupyHex(h3, data);
  for (const origin of allHexes) {
    if (!isWater(origin)) continue;
    const prev = new Map<string, string | null>();
    const dist = new Map<string, number>();
    prev.set(origin, null);
    dist.set(origin, 0);
    const q = [origin];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i]!;
      const d = dist.get(cur) ?? 0;
      if (d === hops) {
        try {
          if (gridDistance(origin, cur) !== hops) continue;
        } catch {
          continue;
        }
        const chain: string[] = [];
        let walk: string | null = cur;
        while (walk) {
          chain.push(walk);
          walk = prev.get(walk) ?? null;
        }
        chain.reverse();
        return chain;
      }
      if (d >= hops) continue;
      for (const n of gridDisk(cur, 1)) {
        if (n === cur || prev.has(n) || !onMap.has(n) || !isWater(n)) continue;
        prev.set(n, cur);
        dist.set(n, d + 1);
        q.push(n);
      }
    }
  }
  throw new Error(`expected a geodesic water chain of ${hops} hops`);
}

/**
 * Builds a strategic snapshot on a geodesic land chain with optional urban on the first step.
 *
 * Purpose: Shared fixture so occupancy vs empty-urban vs adjacent-enemy tests differ only in units and infra.
 * When to use: The land-chain contract tests in this file.
 * Expected outcome: Infantry at `chain[0]` can legally step onto `chain[1]` / `chain[2]` this turn; `chain[4]` is out of this-turn reach.
 * Exceptions: None.
 */
function chainState(args: {
  chain: string[];
  units: GameStateSnapshot['units'];
  urbanOnStep1?: boolean;
}): GameStateSnapshot {
  return {
    turnNumber: 1,
    phase: 'planning',
    hexes: args.chain.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: args.units,
    pendingOrders: [],
    res1Infrastructure: args.urbanOnStep1
      ? [{ h3Index: args.chain[1]!, urbanHexCount: 2, airportCount: 0, seaportCount: 0 }]
      : [],
    res1Control: [],
  };
}

/**
 * Collects Best Options This Turn rows for a strategic snapshot.
 *
 * Purpose: Avoid repeating lat/lng map construction in each contract test.
 * When to use: After `chainState` in this file.
 * Expected outcome: `forThisTurnOptionsTable` rows using briefing lat/lng formatting.
 * Exceptions: None.
 */
function collectStrategicThisTurnRows(state: GameStateSnapshot) {
  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of state.hexes) {
    latLngByH3.set(h.h3Index, cellToLatLng(h.h3Index) as [number, number]);
  }
  return collectAggregatedPossibleActionRows({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
    forThisTurnOptionsTable: true,
  });
}

/**
 * Ensures a friendly stack on an uncontrolled city is not listed as move/melee, and approach toward the far enemy is offered instead.
 *
 * Purpose: Strategic occupancy parity with the tactical friendly-occupied urban fix.
 * When to use: After changing strategic this-turn interest or approach fallback.
 * Expected outcome: No move/melee onto `chain[1]`; at least one approach row that reduces grid distance to the far human.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrategicBestOptionsIgnoresFriendlyOccupiedUncontrolledUrban(): void {
  const chain = findGeodesicLandMassChain(4);
  const origin = chain[0]!;
  const friendlyUrban = chain[1]!;
  const enemy = chain[4]!;
  const state = chainState({
    chain,
    urbanOnStep1: true,
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: origin },
      { id: 'opponent-inf-on-city', player: 'opponent', unitType: 'infantry', h3Index: friendlyUrban },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: enemy },
    ],
  });
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  assert.ok(
    !rows.some((r) => r.targetH3 === friendlyUrban && r.actionTypes.includes('move/melee')),
    'friendly-occupied uncontrolled urban hex must not appear as move/melee'
  );
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected approach rows when the only nearby interest hex is a friendly city');
  const originToEnemy = gridDistance(origin, enemy);
  assert.ok(
    approaches.every((r) => gridDistance(r.targetH3, enemy) < originToEnemy),
    'approach targets must reduce grid distance to the distant human'
  );
  assert.ok(
    approaches.every((r) => typeof r.enemySummary === 'string' && r.enemySummary.includes('human-inf-far')),
    'approach Target Units lists nearest enemy unit id'
  );
}

/**
 * Ensures empty uncontrolled urban does not replace approach toward a far observed human.
 *
 * Purpose: Same crowding as tactical: empty-city interest must not suppress closing when a human is on the map.
 * When to use: After changing strategic this-turn interest or approach fallback.
 * Expected outcome: Approach rows toward `chain[4]`; no move/melee onto the empty urban at `chain[1]`.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrategicBestOptionsPrefersApproachOverEmptyUncontrolledUrban(): void {
  const chain = findGeodesicLandMassChain(4);
  const origin = chain[0]!;
  const emptyUrban = chain[1]!;
  const enemy = chain[4]!;
  const state = chainState({
    chain,
    urbanOnStep1: true,
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: origin },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: enemy },
    ],
  });
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  assert.ok(
    !rows.some((r) => r.targetH3 === emptyUrban && r.actionTypes.includes('move/melee')),
    'empty uncontrolled urban must not suppress approach as move/melee'
  );
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected approach rows toward the distant human');
  const originToEnemy = gridDistance(origin, enemy);
  assert.ok(
    approaches.every((r) => gridDistance(r.targetH3, enemy) < originToEnemy),
    'approach targets must reduce grid distance to the distant human'
  );
}

/**
 * Ensures empty uncontrolled urban remains a capture option when no enemy is observed.
 *
 * Purpose: Approach-over-infra must not drop city capture when there is nobody to close on.
 * When to use: Together with `testStrategicBestOptionsPrefersApproachOverEmptyUncontrolledUrban`.
 * Expected outcome: A move/melee row onto `chain[1]` that is not labeled approach.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrategicBestOptionsKeepsEmptyUncontrolledUrbanWhenNoEnemy(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = chainState({
    chain,
    urbanOnStep1: true,
    units: [{ id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! }],
  });
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  const urbanMoves = rows.filter((r) => r.targetH3 === chain[1] && r.actionTypes.includes('move/melee'));
  assert.ok(urbanMoves.length >= 1, 'empty uncontrolled urban must remain move/melee when no enemy is observed');
  assert.ok(
    !urbanMoves.some((r) => r.actionTypes.includes('approach')),
    'city-capture interest must not be relabeled as approach'
  );
}

/**
 * Ensures an adjacent enemy hex stays move/melee (not approach-only) when it is in this-turn reach.
 *
 * Purpose: Approach fallback must not replace contact when the enemy is already a legal destination.
 * When to use: After wiring strategic approach.
 * Expected outcome: At least one move/melee row onto the adjacent human hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists (uses the first two cells).
 */
function testStrategicBestOptionsAdjacentEnemyRemainsMoveMelee(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = chainState({
    chain,
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
      { id: 'human-inf-adj', player: 'human', unitType: 'infantry', h3Index: chain[1]! },
    ],
  });
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  const melee = rows.filter(
    (r) => r.targetH3 === chain[1] && (r.actionTypes.includes('move') || r.actionTypes.includes('melee'))
  );
  assert.ok(melee.length >= 1, 'adjacent enemy hex must remain a move/melee Best Option');
  assert.ok(
    !melee.some((r) => r.actionTypes.includes('approach')),
    'adjacent enemy contact must not be labeled approach'
  );
}

/**
 * Ensures a contested hex (friendly + enemy together) stays move/melee, not dropped as friendly-occupied infra.
 *
 * Purpose: Occupancy filtering must not hide contact when the enemy is in the same cell as a friendly stack.
 * When to use: After changing strategic this-turn interest occupancy.
 * Expected outcome: A move/melee row onto the contested adjacent hex.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrategicBestOptionsContestedHexRemainsMoveMelee(): void {
  const chain = findGeodesicLandMassChain(4);
  const contested = chain[1]!;
  const state = chainState({
    chain,
    urbanOnStep1: true,
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
      { id: 'opponent-inf-stack', player: 'opponent', unitType: 'infantry', h3Index: contested },
      { id: 'human-inf-adj', player: 'human', unitType: 'infantry', h3Index: contested },
    ],
  });
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  const melee = rows.filter((r) => r.targetH3 === contested && r.actionTypes.includes('move/melee'));
  assert.ok(melee.length >= 1, 'contested hex must remain a move/melee Best Option');
  assert.ok(
    !melee.some((r) => r.actionTypes.includes('approach')),
    'contested contact must not be labeled approach'
  );
}

/**
 * Ensures a naval unit with no this-turn enemy/port interest still gets approach rows toward a far enemy fleet.
 *
 * Purpose: Approach fallback must apply to naval dests (berth/egress reachability), not only land.
 * When to use: After changing strategic this-turn approach wiring.
 * Expected outcome: At least one approach row that reduces grid distance to the far human naval unit.
 * Exceptions: Throws if no geodesic 5-hop water chain exists.
 */
function testStrategicBestOptionsNavalApproachWhenEnemyOutOfReach(): void {
  const chain = findGeodesicWaterChain(5);
  const origin = chain[0]!;
  const enemy = chain[5]!;
  const state: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: chain.map((h3Index) => ({ h3Index, terrain: 'water', terrainKind: 'water' })),
    units: [
      { id: 'opponent-naval-mover', player: 'opponent', unitType: 'naval', h3Index: origin },
      { id: 'human-naval-far', player: 'human', unitType: 'naval', h3Index: enemy },
    ],
    pendingOrders: [],
    res1Infrastructure: [],
    res1Control: [],
  };
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-naval-mover');
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected naval approach rows when the enemy fleet is out of this-turn reach');
  const originToEnemy = gridDistance(origin, enemy);
  assert.ok(
    approaches.every((r) => gridDistance(r.targetH3, enemy) < originToEnemy),
    'naval approach targets must reduce grid distance to the distant enemy fleet'
  );
  assert.ok(
    approaches.every((r) => typeof r.enemySummary === 'string' && r.enemySummary.includes('human-naval-far')),
    'naval approach Target Units lists nearest enemy unit id'
  );
  assert.ok(
    !rows.some((r) => r.targetH3 === enemy && r.actionTypes.includes('move/melee')),
    'far enemy hex is not a this-turn naval destination'
  );
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Runs the strategic Best Options occupancy and approach contracts.
 * When to use: `node dist/main/openrouter/possibleUnitActionsStrategicBestOptions.test.js` after `build:main`.
 * Expected outcome: Each entry runs to completion or fails the process.
 * Exceptions: None.
 */
const tests = [
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options ignores friendly-occupied uncontrolled urban',
    fn: testStrategicBestOptionsIgnoresFriendlyOccupiedUncontrolledUrban,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options prefers approach over empty uncontrolled urban',
    fn: testStrategicBestOptionsPrefersApproachOverEmptyUncontrolledUrban,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options keeps empty urban when no enemy',
    fn: testStrategicBestOptionsKeepsEmptyUncontrolledUrbanWhenNoEnemy,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options adjacent enemy remains move/melee',
    fn: testStrategicBestOptionsAdjacentEnemyRemainsMoveMelee,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options contested hex remains move/melee',
    fn: testStrategicBestOptionsContestedHexRemainsMoveMelee,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options naval approach when enemy out of reach',
    fn: testStrategicBestOptionsNavalApproachWhenEnemyOutOfReach,
  },
];

/**
 * Runs the strategic Best Options contracts and exits non-zero on the first failure.
 *
 * Purpose: Same harness style as `possibleUnitActions.test.ts`.
 * When to use: Direct node invocation of this file.
 * Expected outcome: `OK` lines for passing tests; process exit 1 on failure.
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
