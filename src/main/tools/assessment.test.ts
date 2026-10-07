/**
 * Tests for assess_unit omniscient grid scan vs path+radius scan.
 * Run with: node dist/main/tools/assessment.test.js
 */

import * as assert from 'assert';
import { cellToChildren, gridDisk, gridDistance } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { buildLatLngCoordinateMap, getOrderedHexList } from '../mapData';
import { executeAssessment } from './assessment';

/**
 * Finds two world-map cells at exact H3 grid distance `dist`.
 *
 * Purpose: Avoids pentagon `gridDistance` failures around lat/lng (0,0).
 * When to use: Tiny assess_unit fixtures that must sit on real strategic indexes.
 * Expected outcome: Pair with `gridDistance === dist`.
 * Exceptions: Throws when no pair exists on the ordered hex list.
 */
function strategicPairAtGridDistance(dist: number): [string, string] {
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
 * When to use: In-range and moderate-ETA cases relative to `strategicOrigin`.
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
 * When to use: Fog-off strategic cases that must still list a nearest enemy.
 * Expected outcome: Pair for which `gridDistance` throws.
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
 * Documents the module-scope binding `strategicOrigin` (strategicOrigin).
 *
 * Purpose: Strategic-map origin for tiny fixtures.
 * When to use: Omniscient and path-scan assess_unit cases.
 * Expected outcome: First cell of the distance-5 pair.
 * Exceptions: None.
 */
const [strategicOrigin, strategicFar] = strategicPairAtGridDistance(5);
/**
 * Documents the module-scope binding `strategicAdjacent` (strategicAdjacent).
 *
 * Purpose: In-range armor shot hex from `strategicOrigin`.
 * When to use: canAttackThisTurn in-range case.
 * Expected outcome: Grid distance 1 from `strategicOrigin`.
 * Exceptions: None.
 */
const strategicAdjacent = cellAtExactGridDistance(strategicOrigin, 1);
/**
 * Documents the module-scope binding `strategicAtTwo` (strategicAtTwo).
 *
 * Purpose: Reverse-ETA moderate band (infantry closes in 2 turns) without entering weapon range.
 * When to use: Fog-off severity moderate case.
 * Expected outcome: Grid distance 2 from `strategicOrigin`.
 * Exceptions: None.
 */
const strategicAtTwo = cellAtExactGridDistance(strategicOrigin, 2);
/**
 * Documents the module-scope binding `tacticalOrigin` (tacticalOrigin).
 *
 * Purpose: Tactical-resolution cell so the omniscient gate stays closed.
 * When to use: Fog-off + tactical assessed unit.
 * Expected outcome: A tactical child of `strategicOrigin`.
 * Exceptions: None.
 */
const tacticalOrigin = cellToChildren(strategicOrigin, 4)[0]!;
/**
 * Documents the module-scope binding `tacticalFar` (tacticalFar).
 *
 * Purpose: Distant tactical cell paired with `tacticalOrigin`.
 * When to use: Fog-off tactical fallback to path+radius.
 * Expected outcome: A tactical child of `strategicFar` (grid distance > 4).
 * Exceptions: None.
 */
const tacticalFar = cellToChildren(strategicFar, 4)[0]!;

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
  return executeAssessment('assess_unit', { unitId, radius: 4 }, state, coordMap.latLngByH3, coordMap.resolveToH3);
}

/**
 * Verifies fog-off strategic includes a human beyond radius 4 at grid distance.
 *
 * Purpose: Core omniscient-scan contract for the Unit Status nearest-enemy gap.
 * When to use: After changing the assess_unit omniscient branch.
 * Expected outcome: human-infantry-1 at hexDistance 5 with armor ETA 3.
 * Exceptions: None.
 */
function testFogOffStrategicIncludesDistantEnemy(): void {
  const { state, coordMap } = buildAssessState(
    [strategicOrigin, strategicFar],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicFar },
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
    [strategicOrigin, strategicFar],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicFar },
    ],
    true
  );
  const out = assess(state, coordMap, 'opponent-armor-1');
  assert.strictEqual(out.status, 'ok');
  const enemies = out.nearbyEnemies as Array<{ unitId: string }>;
  assert.ok(!enemies.some((e) => e.unitId === 'human-infantry-1'));
}

/**
 * Verifies fog-off on tactical does not take the omniscient scan.
 *
 * Purpose: Tactical snapshots force fog off; resolution 4 must keep radius 4.
 * When to use: After changing the omniscient gate.
 * Expected outcome: Distant tactical human is absent.
 * Exceptions: None.
 */
function testFogOffTacticalExcludesDistantEnemy(): void {
  const { state, coordMap } = buildAssessState(
    [tacticalOrigin, tacticalFar],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: tacticalOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: tacticalFar },
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
    [strategicOrigin, strategicFar],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'opponent-infantry-1', player: 'opponent', unitType: 'infantry', h3Index: strategicFar },
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
    [strategicOrigin, strategicFar],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-air-1', player: 'human', unitType: 'air', h3Index: strategicFar },
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
    [strategicOrigin, strategicAdjacent, strategicFar],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-armor-1', player: 'human', unitType: 'armor', h3Index: strategicAdjacent },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicFar },
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
    [strategicOrigin],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicOrigin },
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
    [strategicOrigin, strategicAtTwo],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicAtTwo },
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
    [strategicOrigin, strategicAdjacent],
    [
      { id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: strategicOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicAdjacent },
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
  const [origin, far] = strategicPairWhereGridDistanceThrows();
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
    [strategicOrigin, strategicAdjacent],
    [
      { id: 'opponent-armor-1', player: 'opponent', unitType: 'armor', h3Index: strategicOrigin },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: strategicAdjacent },
    ],
    false
  );
  state.playerPerspective = 'human';
  state.enemyIntel = [
    {
      unitId: 'human-ghost-1',
      lastKnownH3Index: strategicAdjacent,
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
 * Verifies the country bonus fields of `assess_unit` and `assess_hex` follow the snapshot flag.
 *
 * Purpose: The AI needs to know where its units get the origin bonus; with the flag off, results must be unchanged.
 * When to use: After changing assessment origin bonus fields.
 * Expected outcome: On, the unit block has `originBonusHere: ['country']` and `birthCountry`, and the hex has `country`; off, none of the three keys.
 * Exceptions: None.
 */
function testCountryBonusFieldsFollowFlag(): void {
  const { state, coordMap } = buildAssessState(
    [strategicOrigin],
    [
      {
        id: 'opponent-armor-1',
        player: 'opponent',
        unitType: 'armor',
        h3Index: strategicOrigin,
        origin: {
          birthH3Index: strategicOrigin,
          birthTacticalH3Index: null,
          birthTerrainKind: 'plains',
          birthIsUrban: false,
          birthCountryName: 'France',
          birthCountryCode: 'FR',
        },
      },
    ]
  );
  const hexes = state.hexes.map((h) => ({ ...h, countryName: 'France' }));
  const on: GameStateSnapshot = { ...state, hexes, countryBonusEnabled: true };
  const position = coordMap.latLngByH3.get(strategicOrigin)!;
  const assessHex = (s: GameStateSnapshot) =>
    executeAssessment('assess_hex', { position }, s, coordMap.latLngByH3, coordMap.resolveToH3);

  const unitOn = assess(on, coordMap, 'opponent-armor-1').unit as Record<string, unknown>;
  assert.deepStrictEqual(unitOn.originBonusHere, ['country']);
  assert.strictEqual(unitOn.originBonusAmount, 2);
  assert.strictEqual(unitOn.birthCountry, 'France');
  assert.strictEqual(assessHex(on).country, 'France');

  const off: GameStateSnapshot = { ...state, hexes };
  const unitOff = assess(off, coordMap, 'opponent-armor-1').unit as Record<string, unknown>;
  assert.ok(!('originBonusHere' in unitOff) && !('originBonusAmount' in unitOff) && !('birthCountry' in unitOff));
  assert.ok(!('country' in assessHex(off)));
}

/**
 * Runs all assessment tests.
 *
 * Purpose: Node test entrypoint for main-process discovery.
 * When to use: `node dist/main/tools/assessment.test.js`.
 * Expected outcome: Throws on first failure; logs pass when all succeed.
 * Exceptions: Propagates assertion errors.
 */
function run(): void {
  testFogOffStrategicIncludesDistantEnemy();
  testFogOnExcludesDistantEnemy();
  testFogOffTacticalExcludesDistantEnemy();
  testFogOffIncludesDistantFriendly();
  testFogOffAirOtherUnitNullReverseEta();
  testFogOffCanAttackThisTurnInRangeOnly();
  testFogOffSameHexIsMeleeCritical();
  testFogOffReverseEtaTwoIsModerate();
  testFogOffAirAssessedUnitNullOwnEta();
  testFogOffIncludesPentagonCrossingEnemy();
  testFogOnIncludesInRadiusPentagonCrossingEnemy();
  testFogOffOmitsStaleIntelGhost();
  testCountryBonusFieldsFollowFlag();
  console.log('assessment.test.ts passed');
}

run();
