/**
 * Tests for assess_unit omniscient grid scan vs path+radius scan.
 * Run with: node dist/main/tools/tool2Assessment.test.js
 */

import * as assert from 'assert';
import { cellToChildren, gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { executeTool2 } from './tool2Assessment';

/**
 * Finds two world-map cells at exact H3 grid distance `dist`.
 *
 * Purpose: Avoids pentagon `gridDistance` failures around lat/lng (0,0).
 * When to use: Tiny assess_unit fixtures that must sit on real res1 indexes.
 * Expected outcome: Pair with `gridDistance === dist`.
 * Exceptions: Throws when no pair exists on the ordered hex list.
 */
function res1PairAtGridDistance(dist: number): [string, string] {
  const hexes = getOrderedHexList();
  for (const origin of hexes) {
    let ring: string[];
    try {
      ring = gridDisk(origin, dist);
    } catch {
      continue;
    }
    for (const h3 of ring) {
      if (h3 === origin) continue;
      try {
        if (gridDistance(origin, h3) === dist) return [origin, h3];
      } catch {
        continue;
      }
    }
  }
  assert.fail(`expected a res1 pair at grid distance ${dist}`);
}

/**
 * Finds a cell at exact H3 grid distance `dist` from `origin`.
 *
 * Purpose: Adjacent and two-hop fixtures share one lookup so pentagon holes are skipped the same way.
 * When to use: In-range and moderate-ETA cases relative to `res1Origin`.
 * Expected outcome: `gridDistance(origin, result) === dist`.
 * Exceptions: Throws when no pair exists on the disk.
 */
function cellAtExactGridDistance(origin: string, dist: number): string {
  let ring: string[];
  try {
    ring = gridDisk(origin, dist);
  } catch {
    throw new Error(`gridDisk failed for distance ${dist}`);
  }
  for (const h3 of ring) {
    if (h3 === origin) continue;
    try {
      if (gridDistance(origin, h3) === dist) return h3;
    } catch {
      continue;
    }
  }
  throw new Error(`expected a res1 cell at grid distance ${dist} from origin`);
}

/**
 * Finds two world-map cells where H3 `gridDistance` throws.
 *
 * Purpose: Covers the global-map assess_unit gap when pentagon-crossing hops are skipped.
 * When to use: Fog-off res1 cases that must still list a nearest enemy.
 * Expected outcome: Pair for which `gridDistance` throws.
 * Exceptions: Throws when no such pair exists on the ordered hex list.
 */
function res1PairWhereGridDistanceThrows(): [string, string] {
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
 * Documents the module-scope binding `res1Origin` (res1Origin).
 *
 * Purpose: Strategic-map origin for tiny fixtures.
 * When to use: Omniscient and path-scan assess_unit cases.
 * Expected outcome: First cell of the distance-5 pair.
 * Exceptions: None.
 */
const [res1Origin, res1Far] = res1PairAtGridDistance(5);
/**
 * Documents the module-scope binding `res1Adjacent` (res1Adjacent).
 *
 * Purpose: In-range armor shot hex from `res1Origin`.
 * When to use: canAttackThisTurn in-range case.
 * Expected outcome: Grid distance 1 from `res1Origin`.
 * Exceptions: None.
 */
const res1Adjacent = cellAtExactGridDistance(res1Origin, 1);
/**
 * Documents the module-scope binding `res1AtTwo` (res1AtTwo).
 *
 * Purpose: Reverse-ETA moderate band (infantry closes in 2 turns) without entering weapon range.
 * When to use: Fog-off severity moderate case.
 * Expected outcome: Grid distance 2 from `res1Origin`.
 * Exceptions: None.
 */
const res1AtTwo = cellAtExactGridDistance(res1Origin, 2);
/**
 * Documents the module-scope binding `res4Origin` (res4Origin).
 *
 * Purpose: Tactical-resolution cell so the omniscient gate stays closed.
 * When to use: Fog-off + res4 assessed unit.
 * Expected outcome: A res4 child of `res1Origin`.
 * Exceptions: None.
 */
const res4Origin = cellToChildren(res1Origin, 4)[0]!;
/**
 * Documents the module-scope binding `res4Far` (res4Far).
 *
 * Purpose: Distant tactical cell paired with `res4Origin`.
 * When to use: Fog-off res4 fallback to path+radius.
 * Expected outcome: A res4 child of `res1Far` (grid distance > 4).
 * Exceptions: None.
 */
const res4Far = cellToChildren(res1Far, 4)[0]!;

/**
 * Builds a tiny snapshot and coordinate map for assess_unit.
 *
 * Purpose: Avoids the 842-cell world map while covering fog/resolution gates.
 * When to use: Each assess_unit contract below.
 * Expected outcome: Hex rows match unit positions; coord map covers those indexes.
 * Exceptions: None.
 */
function buildAssessState(
  hexes: string[],
  units: GameStateSnapshot['units'],
  fogOfWarEnabled?: boolean
): { state: GameStateSnapshot; coordMap: ReturnType<typeof buildLatLngCoordinateMap> } {
  const state: GameStateSnapshot = {
    hexes: hexes.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units,
    phase: 'planning',
    turnNumber: 7,
    pendingOrders: [],
    fogOfWarEnabled,
  };
  return { state, coordMap: buildLatLngCoordinateMap(hexes) };
}

/**
 * Runs assess_unit through the public Tool 2 executor.
 *
 * Purpose: Same entry as precomputation and the LLM tool loop.
 * When to use: After building a tiny fixture.
 * Expected outcome: Tool result object with nearby lists when status is ok.
 * Exceptions: None.
 */
function assess(state: GameStateSnapshot, coordMap: ReturnType<typeof buildLatLngCoordinateMap>, unitId: string) {
  return executeTool2('assess_unit', { unitId, radius: 4 }, state, coordMap.latLngByH3, coordMap.resolveToH3);
}

/**
 * Verifies fog-off res1 includes a human beyond radius 4 at grid distance.
 *
 * Purpose: Core omniscient-scan contract for the Unit Status nearest-enemy gap.
 * When to use: After changing the assess_unit omniscient branch.
 * Expected outcome: human-infantry-1 at hexDistance 5 with armor ETA 3.
 * Exceptions: None.
 */
function testFogOffRes1IncludesDistantEnemy(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1Far },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const enemies = out.nearbyEnemies as Array<{ unitId: string; hexDistance: number; estimatedTurnsToReach: number | null }>;
  const human = enemies.find((e) => e.unitId === 'human-infantry-1');
  assert.ok(human, 'distant human must appear when fog is off on res1');
  assert.strictEqual(human!.hexDistance, 5);
  assert.strictEqual(human!.estimatedTurnsToReach, 3);
  const threat = (out.threats as Array<{ sourceUnit: string; severity: string; description: string }>).find(
    (t) => t.sourceUnit === 'human-infantry-1'
  );
  assert.ok(threat);
  assert.strictEqual(threat!.severity, 'low');
  assert.ok(threat!.description.includes('5 turns'));
}

/**
 * Verifies fog-on keeps the radius-4 filter for the same distant pair.
 *
 * Purpose: Regression for fog-on path+radius behavior.
 * When to use: After changing the non-omniscient scan.
 * Expected outcome: nearbyEnemies does not include the distant human.
 * Exceptions: None.
 */
function testFogOnExcludesDistantEnemy(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1Far },
    ],
    true
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const enemies = out.nearbyEnemies as Array<{ unitId: string }>;
  assert.ok(!enemies.some((e) => e.unitId === 'human-infantry-1'));
}

/**
 * Verifies fog-off on res4 does not take the omniscient scan.
 *
 * Purpose: Tactical snapshots force fog off; resolution 4 must keep radius 4.
 * When to use: After changing the omniscient gate.
 * Expected outcome: Distant res4 human is absent.
 * Exceptions: None.
 */
function testFogOffRes4ExcludesDistantEnemy(): void {
  const { state, coordMap } = buildAssessState(
    [res4Origin, res4Far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res4Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res4Far },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const enemies = out.nearbyEnemies as Array<{ unitId: string }>;
  assert.ok(!enemies.some((e) => e.unitId === 'human-infantry-1'));
}

/**
 * Verifies fog-off includes a friendly beyond radius 4.
 *
 * Purpose: Confirmed friendlies use the same unbounded grid scan.
 * When to use: After changing omniscient friendly collection.
 * Expected outcome: opponent-infantry-1 in nearbyFriendlies at distance 5.
 * Exceptions: None.
 */
function testFogOffIncludesDistantFriendly(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: res1Far },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  const friendlies = out.nearbyFriendlies as Array<{ unitId: string; hexDistance: number }>;
  const other = friendlies.find((f) => f.unitId === 'opponent-infantry-1');
  assert.ok(other, 'distant friendly must appear when fog is off on res1');
  assert.strictEqual(other!.hexDistance, 5);
}

/**
 * Verifies air as the other unit yields a null reverse ETA without throwing.
 *
 * Purpose: Air movement budget is 0.
 * When to use: After changing omniscient threat ETAs.
 * Expected outcome: nearbyEnemies includes the air unit; threat description is the no-turns form or low severity without throw.
 * Exceptions: None.
 */
function testFogOffAirOtherUnitNullReverseEta(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-air-1', player: 'human', unitType: 'air', h3Index: res1Far },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const air = (out.nearbyEnemies as Array<{ unitId: string }>).find((e) => e.unitId === 'human-air-1');
  assert.ok(air);
  const threat = (out.threats as Array<{ sourceUnit: string; severity: string; description: string }>).find(
    (t) => t.sourceUnit === 'human-air-1'
  );
  assert.ok(threat);
  assert.strictEqual(threat!.severity, 'low');
  assert.ok(threat!.description.includes('grid distance'));
  assert.ok(!threat!.description.includes('can reach'));
}

/**
 * Verifies omniscient canAttackThisTurn lists only in-range shots.
 *
 * Purpose: Avoid one "none" row per enemy on the whole map.
 * When to use: After changing omniscient attack-row assembly.
 * Expected outcome: Adjacent human has a ranged row; distant human has no none-row.
 * Exceptions: None.
 */
function testFogOffCanAttackThisTurnInRangeOnly(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Adjacent, res1Far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-armor-1', player: 'human', unitType: 'armor', h3Index: res1Adjacent },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1Far },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  const attacks = out.canAttackThisTurn as Array<{ unitId: string; attackType: string }>;
  assert.ok(!attacks.some((a) => a.attackType === 'none'));
  const adj = attacks.find((a) => a.unitId === 'human-armor-1');
  assert.ok(adj);
  assert.strictEqual(adj!.attackType, 'ranged');
  assert.ok(!attacks.some((a) => a.unitId === 'human-infantry-1'));
}

/**
 * Verifies same-hex contact is melee, critical, and in canAttackThisTurn.
 *
 * Purpose: inMeleeRange is distance 0 only; stacked enemies must not be labeled ranged.
 * When to use: After changing omniscient melee / severity rules.
 * Expected outcome: melee attack row, inMeleeRange, threat critical.
 * Exceptions: None.
 */
function testFogOffSameHexIsMeleeCritical(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1Origin },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const human = (out.nearbyEnemies as Array<{
    unitId: string;
    hexDistance: number;
    inMeleeRange: boolean;
    estimatedTurnsToReach: number | null;
  }>).find((e) => e.unitId === 'human-infantry-1');
  assert.ok(human);
  assert.strictEqual(human!.hexDistance, 0);
  assert.strictEqual(human!.inMeleeRange, true);
  assert.strictEqual(human!.estimatedTurnsToReach, 0);
  const threat = (out.threats as Array<{ sourceUnit: string; severity: string }>).find(
    (t) => t.sourceUnit === 'human-infantry-1'
  );
  assert.ok(threat);
  assert.strictEqual(threat!.severity, 'critical');
  const attacks = out.canAttackThisTurn as Array<{ unitId: string; attackType: string }>;
  const melee = attacks.find((a) => a.unitId === 'human-infantry-1');
  assert.ok(melee);
  assert.strictEqual(melee!.attackType, 'melee');
}

/**
 * Verifies reverse grid ETA of 2 is moderate when the other unit cannot shoot.
 *
 * Purpose: Attention Flags light moderate for close grid hops even without a march path.
 * When to use: After changing omniscient threat severity.
 * Expected outcome: infantry at distance 2 → severity moderate.
 * Exceptions: None.
 */
function testFogOffReverseEtaTwoIsModerate(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1AtTwo],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1AtTwo },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  const threat = (out.threats as Array<{ sourceUnit: string; severity: string; description: string }>).find(
    (t) => t.sourceUnit === 'human-infantry-1'
  );
  assert.ok(threat);
  assert.strictEqual(threat!.severity, 'moderate');
  assert.ok(threat!.description.includes('2 turns'));
}

/**
 * Verifies assessing air yields null close-ETA without throwing.
 *
 * Purpose: Air budget is 0; enemy-row turns must stay null even when a shot is legal.
 * When to use: After changing omniscient ETAs for the assessed unit.
 * Expected outcome: nearbyEnemies ETA null; adjacent human still has a ranged attack row.
 * Exceptions: None.
 */
function testFogOffAirAssessedUnitNullOwnEta(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Adjacent],
    [
      { id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: res1Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1Adjacent },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-air-1');
  assert.strictEqual(out.status, 'ok');
  const human = (out.nearbyEnemies as Array<{ unitId: string; estimatedTurnsToReach: number | null }>).find(
    (e) => e.unitId === 'human-infantry-1'
  );
  assert.ok(human);
  assert.strictEqual(human!.estimatedTurnsToReach, null);
  const attacks = out.canAttackThisTurn as Array<{ unitId: string; attackType: string }>;
  assert.ok(!attacks.some((a) => a.attackType === 'none'));
  const shot = attacks.find((a) => a.unitId === 'human-infantry-1');
  assert.ok(shot);
  assert.strictEqual(shot!.attackType, 'ranged');
}

/**
 * Verifies fog-off assess_unit still lists an enemy when `gridDistance` throws.
 *
 * Purpose: Unit Status nearest-enemy must not stay empty for pentagon-crossing global pairs.
 * When to use: After changing omniscient hop scoring.
 * Expected outcome: human-infantry-1 in nearbyEnemies with hexDistance >= 1.
 * Exceptions: None.
 */
function testFogOffIncludesPentagonCrossingEnemy(): void {
  const [origin, far] = res1PairWhereGridDistanceThrows();
  const { state, coordMap } = buildAssessState(
    [origin, far],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: far },
    ],
    false
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const human = (out.nearbyEnemies as Array<{ unitId: string; hexDistance: number }>).find(
    (e) => e.unitId === 'human-infantry-1'
  );
  assert.ok(human, 'pentagon-crossing human must appear when fog is off on res1');
  assert.ok(human!.hexDistance >= 1);
}

/**
 * Verifies fog-on assess_unit still lists an in-radius enemy when `gridDistance` throws.
 *
 * Purpose: Unit Status showed `—` for air at a cell three k-ring steps from observed humans because the radius scan treated a pentagon-edge throw as unreachable once land BFS failed.
 * When to use: After changing fog-on `getGridDistance` / radius prefilter.
 * Expected outcome: human-armor-1 in nearbyEnemies at hexDistance 3 (k-ring), so a legal this-turn air strike is visible in Unit Status.
 * Exceptions: None.
 */
function testFogOnIncludesInRadiusPentagonCrossingEnemy(): void {
  const origin = '811ebffffffffff';
  const enemy = '81357ffffffffff';
  assert.throws(() => gridDistance(origin, enemy), 'fixture pair must throw from gridDistance');
  const { state, coordMap } = buildAssessState(
    [origin, enemy],
    [
      { id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: origin },
      { id: 'human-armor-1', player: 'human', unitType: 'armor', h3Index: enemy },
    ],
    true
  );
  const out = assess(state, coordMap, 'opponent-air-1');
  assert.strictEqual(out.status, 'ok');
  const human = (out.nearbyEnemies as Array<{ unitId: string; hexDistance: number }>).find(
    (e) => e.unitId === 'human-armor-1'
  );
  assert.ok(human, 'in-radius pentagon-crossing human must appear when fog is on');
  assert.strictEqual(human!.hexDistance, 3);
}

/**
 * Verifies fog-off omniscient scan does not merge stale last-known rows.
 *
 * Purpose: Living enemies are already on the snapshot; ghosts must not appear as nearest enemy.
 * When to use: After changing the omniscient vs path-scan stale-intel split.
 * Expected outcome: nearbyEnemies has the living human only; no confidence stale.
 * Exceptions: None.
 */
function testFogOffOmitsStaleIntelGhost(): void {
  const { state, coordMap } = buildAssessState(
    [res1Origin, res1Adjacent],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: res1Origin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: res1Adjacent },
    ],
    false
  );
  state.playerPerspective = 'human';
  state.enemyIntel = [
    {
      unitId: 'human-ghost-1',
      lastKnownH3Index: res1Adjacent,
      lastKnownLatLng: [0, 0],
      intelState: 'stale',
      lastSeenTurn: 1,
      staleUntilTurn: 99,
    },
  ];
  const out = assess(state, coordMap, 'opponent-armor-1');
  const enemies = out.nearbyEnemies as Array<{ unitId: string; confidence: string }>;
  assert.ok(enemies.some((e) => e.unitId === 'human-infantry-1'));
  assert.ok(!enemies.some((e) => e.unitId === 'human-ghost-1'));
  assert.ok(!enemies.some((e) => e.confidence === 'stale'));
}

/**
 * Runs all tool2Assessment tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/tools/tool2Assessment.test.js`.
 * Expected outcome: Throws on first failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testFogOffRes1IncludesDistantEnemy();
  testFogOnExcludesDistantEnemy();
  testFogOffRes4ExcludesDistantEnemy();
  testFogOffIncludesDistantFriendly();
  testFogOffAirOtherUnitNullReverseEta();
  testFogOffCanAttackThisTurnInRangeOnly();
  testFogOffSameHexIsMeleeCritical();
  testFogOffReverseEtaTwoIsModerate();
  testFogOffAirAssessedUnitNullOwnEta();
  testFogOffIncludesPentagonCrossingEnemy();
  testFogOnIncludesInRadiusPentagonCrossingEnemy();
  testFogOffOmitsStaleIntelGhost();
  console.log('tool2Assessment.test.ts passed');
}

run();
