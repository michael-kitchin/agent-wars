/**
 * Tests for strategic Best Options This Turn occupancy, approach fallback, and this-turn air-strike filtering.
 *
 * Purpose: Locks that friendly-occupied uncontrolled cities are not move/melee interest, that empty interest falls back to approach (including naval), and that this-turn air strikes omit own/uncontrolled cities.
 * When to use: After edits to `possibleUnitActionsBestOptionsInterest.ts` or strategic this-turn approach / air-strike wiring.
 * Expected outcome: Occupancy, empty-urban capture when no enemy, adjacent-enemy melee, contested melee, distant-enemy approach (including over empty cities and when `gridDistance` throws), naval approach, and air-strike this-turn contracts hold on real map hexes.
 * Exceptions: Throws when the world map has no geodesic land-mass chain of the required length, or no geodesic water chain for the naval case.
 */

import * as assert from 'assert';
import { cellToLatLng, gridDisk, gridDistance } from 'h3-js';
import { canLandUnitTraverseEdge, landUnitCanOccupyHex } from '../../shared/landTraversalRes1';
import type { GameStateSnapshot } from '../gameDb';
import {
  ensureStrategicCoordinateRegistryInitialized,
  getH3IndexForCode,
} from '../briefing/map/hexCoordinates';
import { getOrderedHexList, LATLNG_DECIMAL_PLACES } from '../mapData';
import { ensureTerrainClassificationCacheLoaded, getRes1LandMassByH3 } from '../terrainClassificationCache';
import { AIR_FERRY_RANGE_HEXES } from '../../shared/tacticalRanges';
import {
  buildLandChainState as chainState,
  findGeodesicLandMassChain,
} from '../testSupport/strategicLandChainFixtures';
import { collectAggregatedPossibleActionRows } from './possibleUnitActions';
import { applyInterestOrApproach } from './possibleUnitActionsBestOptionsInterest';
import { formatLatLng } from './promptText';
import { getValidDestinations } from '../oneStepMoveDestinations';
import { stayPutFriendlyOccupiedHexes } from '../tools/stayPutFriendlyOccupancy';
import { suggestApproachDestinationsForOrderlessUnits } from '../tools/orderlessUnitSuggestions';

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
 * Ensures Best Options this-turn air strikes match Air Operations: enemy units or human-controlled infra only.
 *
 * Purpose: Turn 12 listed air strikes on own cities while Strikeable Urban was 0; the tempo rule would bomb capture/home hexes.
 * When to use: After edits to this-turn air-strike filtering in `collectAggregatedPossibleActionRows`.
 * Expected outcome: Own and uncontrolled urban hexes omitted; human-controlled urban and enemy-occupied hexes kept; full (non-this-turn) rows still include own-city strikes; own airport remains a ferry dest labeled `ferry`.
 * Exceptions: Throws when the world map cannot supply four distinct in-range neighbors of a base hex.
 */
function testStrategicBestOptionsAirStrikesOmitFriendlyAndUncontrolledInfra(): void {
  const allHexes = getOrderedHexList();
  const onMap = new Set(allHexes);
  const base = allHexes[0]!;
  const nearby = gridDisk(base, 1).filter((h) => h !== base && onMap.has(h));
  if (nearby.length < 4) {
    throw new Error('expected four distinct neighbors of the first map hex for the air-strike Best Options fixture');
  }
  const ownUrban = nearby[0]!;
  const humanUrban = nearby[1]!;
  const uncontrolledUrban = nearby[2]!;
  const enemyHex = nearby[3]!;
  const hexes = [base, ownUrban, humanUrban, uncontrolledUrban, enemyHex].map((h3Index) => ({
    h3Index,
    terrain: 'land' as const,
    terrainKind: 'plains' as const,
  }));
  const state: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes,
    units: [
      { id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: base },
      { id: 'human-infantry-1', player: 'human', unitType: 'infantry', h3Index: enemyHex },
    ],
    pendingOrders: [],
    res1Infrastructure: [
      { h3Index: base, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: ownUrban, urbanHexCount: 8, airportCount: 1, seaportCount: 0 },
      { h3Index: humanUrban, urbanHexCount: 5, airportCount: 0, seaportCount: 0 },
      { h3Index: uncontrolledUrban, urbanHexCount: 3, airportCount: 0, seaportCount: 0 },
    ],
    res1Control: [
      { h3Index: base, controllerPlayerId: 'opponent' },
      { h3Index: ownUrban, controllerPlayerId: 'opponent' },
      { h3Index: humanUrban, controllerPlayerId: 'human' },
    ],
  };
  const thisTurn = collectStrategicThisTurnRows(state);
  const thisTurnStrikes = thisTurn.filter(
    (r) => r.unitId === 'opponent-air-1' && r.actionTypes.includes('air strike')
  );
  assert.ok(
    !thisTurnStrikes.some((r) => r.targetH3 === ownUrban),
    'Best Options must not list an air strike on a friendly-controlled city'
  );
  assert.ok(
    !thisTurnStrikes.some((r) => r.targetH3 === uncontrolledUrban),
    'Best Options must not list an air strike on uncontrolled urban (capture, not bomb)'
  );
  assert.ok(
    thisTurnStrikes.some((r) => r.targetH3 === humanUrban),
    'Best Options must list an air strike on human-controlled urban'
  );
  assert.ok(
    thisTurnStrikes.some((r) => r.targetH3 === enemyHex),
    'Best Options must list an air strike on an enemy-occupied hex'
  );
  assert.ok(
    thisTurn.some(
      (r) => r.unitId === 'opponent-air-1' && r.actionTypes.includes('air strike')
    ),
    'Best Options must list air strikes for the unit in range'
  );
  assert.ok(
    !thisTurn.some(
      (r) => r.unitId === 'opponent-air-1' && r.actionTypes.includes('ferry')
    ),
    'Best Options must not list ferry dests for an air unit that has a this-turn strike'
  );
  assert.ok(
    !thisTurn.some(
      (r) => r.unitId === 'opponent-air-1' && r.targetH3 === ownUrban && r.actionTypes.includes('move/melee')
    ),
    'air ferry dests must not be labeled move/melee in Best Options'
  );

  const latLngByH3 = new Map<string, [number, number]>();
  for (const h of state.hexes) {
    latLngByH3.set(h.h3Index, cellToLatLng(h.h3Index) as [number, number]);
  }
  const fullRows = collectAggregatedPossibleActionRows({
    state,
    latLngByH3,
    formatLatLng: (ll) => formatLatLng(ll, LATLNG_DECIMAL_PLACES),
  });
  assert.ok(
    fullRows.some(
      (r) => r.unitId === 'opponent-air-1' && r.targetH3 === ownUrban && r.actionTypes.includes('air strike')
    ),
    'legal-target collector still includes own-city strikes outside the this-turn table'
  );
}

/**
 * Smallest k-ring radius containing `to`, used only to score the KE/EY approach fixture.
 *
 * Purpose: `gridDistance` / `gridPathCells` both fail for that pair; k-ring membership is the remaining H3 distance.
 * When to use: Fixture construction and approach assertions in this file.
 * Expected outcome: Positive integer when `to` is in `gridDisk(from, r)` for some `r` ≤ 64; null otherwise.
 * Exceptions: None; disk enumeration failures return null.
 */
function kRingDistanceForFixture(from: string, to: string): number | null {
  if (from === to) return 0;
  try {
    for (let r = 1; r <= 64; r++) {
      if (gridDisk(from, r).includes(to)) return r;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Builds the KE/EY pentagon-edge fixture used when H3 cannot measure origin-to-enemy grid distance.
 *
 * Purpose: Armor at KE listed empty-city `move/melee` while humans sat at EY; `gridDistance` and `gridPathCells` both fail for that pair even though k-ring distance is 5.
 * When to use: `testStrategicBestOptionsApproachWhenGridDistanceThrows`.
 * Expected outcome: Origin KE, enemy EY, a this-turn dest that strictly reduces disk distance, and an empty-urban dest that does not.
 * Exceptions: Throws if briefing codes KE/EY are missing or no closing land dest exists.
 */
function pentagonEdgeApproachFixture(): {
  origin: string;
  enemy: string;
  closerDest: string;
  emptyUrban: string;
  hexes: string[];
  originDist: number;
} {
  ensureStrategicCoordinateRegistryInitialized();
  ensureTerrainClassificationCacheLoaded();
  const ctx = { mode: 'strategic' as const };
  const origin = getH3IndexForCode('KE', ctx);
  const enemy = getH3IndexForCode('EY', ctx);
  if (!origin || !enemy) {
    throw new Error('expected briefing codes KE and EY in the strategic registry');
  }
  const originDist = kRingDistanceForFixture(origin, enemy);
  if (originDist === null) {
    throw new Error('expected disk-fallback distance from KE to EY');
  }
  const land = getRes1LandMassByH3();
  const onMap = new Set(getOrderedHexList());
  const landDests = gridDisk(origin, 1).filter(
    (h) => h !== origin && onMap.has(h) && landUnitCanOccupyHex(h, land) && canLandUnitTraverseEdge(origin, h, land)
  );
  const closerDest = landDests.find((h) => {
    const next = kRingDistanceForFixture(h, enemy);
    return next !== null && next < originDist;
  });
  const emptyUrban = landDests.find((h) => {
    const next = kRingDistanceForFixture(h, enemy);
    return next === null || next >= originDist;
  });
  if (!closerDest || !emptyUrban) {
    throw new Error('expected both a closing land dest and a non-closing dest from KE');
  }
  return {
    origin,
    enemy,
    closerDest,
    emptyUrban,
    hexes: [...new Set([origin, enemy, ...landDests])],
    originDist,
  };
}

/**
 * Ensures approach still closes when H3 cannot measure origin-to-enemy grid distance.
 *
 * Purpose: Best Options used raw `gridDistance`, so KE/EY made nearest-enemy distance Infinity and empty cities replaced approach.
 * When to use: After changing `filterApproachMoveHexesForThisTurnOptionsTable` distance handling.
 * Expected outcome: Approach rows toward EY; empty uncontrolled urban on a non-closing dest is not `move/melee`.
 * Exceptions: Throws when KE/EY are missing from the registry.
 */
function testStrategicBestOptionsApproachWhenGridDistanceThrows(): void {
  const { origin, enemy, closerDest, emptyUrban, hexes, originDist } = pentagonEdgeApproachFixture();
  assert.throws(() => gridDistance(origin, enemy), 'KE to EY must be unmeasurable via gridDistance');
  const state: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: hexes.map((h3Index) => ({ h3Index, terrain: 'land' as const, terrainKind: 'plains' as const })),
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: origin },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: enemy },
    ],
    pendingOrders: [],
    res1Infrastructure: [{ h3Index: emptyUrban, urbanHexCount: 2, airportCount: 0, seaportCount: 0 }],
    res1Control: [],
  };
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  assert.ok(
    !rows.some((r) => r.targetH3 === emptyUrban && r.actionTypes.includes('move/melee')),
    'empty urban must not replace approach when a dest still closes on the observed enemy'
  );
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(approaches.length >= 1, 'expected approach rows when k-ring distance can still close');
  assert.ok(
    approaches.some((r) => r.targetH3 === closerDest),
    'approach must include a dest that strictly reduces k-ring distance to the enemy'
  );
  assert.ok(
    approaches.every((r) => {
      const next = kRingDistanceForFixture(r.targetH3, enemy);
      return next !== null && next < originDist;
    }),
    'every approach dest must strictly reduce k-ring distance'
  );
}

/**
 * Finds two map hexes inside ferry range whose H3 `gridDistance` throws (icosahedron face crossing).
 *
 * Purpose: Best Options used to drop legal ferry dests when distance ranking threw, which hid whole air bases from the table.
 * When to use: `testStrategicBestOptionsKeepsFerryDestWhenGridDistanceThrows`.
 * Expected outcome: `dest` is in `gridDisk(origin, AIR_FERRY_RANGE_HEXES)` and `gridDistance(origin, dest)` throws.
 * Exceptions: Throws if the world map has no such pair.
 */
function findUnmeasurableFerryDiskPair(): { origin: string; dest: string } {
  const onMap = new Set(getOrderedHexList());
  for (const origin of onMap) {
    let disk: string[];
    try {
      disk = gridDisk(origin, AIR_FERRY_RANGE_HEXES);
    } catch {
      continue;
    }
    for (const dest of disk) {
      if (dest === origin || !onMap.has(dest)) continue;
      try {
        gridDistance(origin, dest);
      } catch {
        return { origin, dest };
      }
    }
  }
  throw new Error('expected a ferry-range map pair where gridDistance throws');
}

/**
 * Ensures approach Target Hexes skip stay-put friendly-occupied cells and match the orderless suggestion.
 *
 * Purpose: A live strategic dump listed approach onto CL while friendlies already sat there, and the
 * orderless Suggested Destination was an em dash or a different hex. Both surfaces must copy the same
 * closing dest that is not a stay-put stack.
 * When to use: After changing `applyInterestOrApproach` occupancy or `suggestApproachDestinationsForOrderlessUnits`.
 * Expected outcome: No approach row onto the stay-put friendly hex; the orderless suggestion is one of the remaining approach hexes.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrategicBestOptionsApproachSkipsFriendlyOccupiedAndMatchesOrderless(): void {
  const chain = findGeodesicLandMassChain(4);
  const state = chainState({
    chain,
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: chain[0]! },
      { id: 'opponent-inf-block', player: 'opponent', unitType: 'infantry', h3Index: chain[1]! },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: chain[4]! },
    ],
  });
  const rows = collectStrategicThisTurnRows(state).filter((r) => r.unitId === 'opponent-inf-mover');
  const approaches = rows.filter((r) => r.actionTypes.includes('approach'));
  assert.ok(
    !approaches.some((r) => r.targetH3 === chain[1]),
    'stay-put friendly-occupied hex must not be an approach dest'
  );
  assert.ok(approaches.length >= 1, 'expected unoccupied approach dests toward the far human');
  const suggestions = suggestApproachDestinationsForOrderlessUnits('opponent', state, ['opponent-inf-mover']);
  const suggested = suggestions.get('opponent-inf-mover');
  assert.ok(suggested, 'orderless table must offer a closing dest when one exists');
  assert.ok(
    approaches.some((r) => r.targetH3 === suggested),
    'Suggested Destination must be one of this unit\'s Best Options approach hexes'
  );
}

/**
 * Ensures a hex a friendly is leaving this period is an approach dest, including for orderless suggestions.
 *
 * Purpose: WEGO follow-on: the engine will accept the dest once the occupant marches away; stay-put occupancy
 * must not hide that cell from Best Options or the orderless column.
 * When to use: After changing stay-put occupancy or `applyInterestOrApproach`.
 * Expected outcome: Approach and orderless include the leaver origin; a stay-put stack on the leaver dest remains omitted.
 * Exceptions: Throws if no geodesic 4-hop land chain exists.
 */
function testStrategicBestOptionsApproachListsHexAFriendlyIsLeaving(): void {
  const chain = findGeodesicLandMassChain(4);
  const origin = chain[0]!;
  const leaverHex = chain[1]!;
  const leaverDest = chain[2]!;
  const enemy = chain[4]!;
  const state = chainState({
    chain,
    units: [
      { id: 'opponent-inf-mover', player: 'opponent', unitType: 'infantry', h3Index: origin },
      { id: 'opponent-inf-leaver', player: 'opponent', unitType: 'infantry', h3Index: leaverHex },
      { id: 'human-inf-far', player: 'human', unitType: 'infantry', h3Index: enemy },
    ],
  });
  const thisPeriodMoves = new Map([['opponent-inf-leaver', leaverDest]]);
  const stayPut = stayPutFriendlyOccupiedHexes(
    [
      { id: 'opponent-inf-mover', h3Index: origin },
      { id: 'opponent-inf-leaver', h3Index: leaverHex },
    ],
    thisPeriodMoves
  );
  const legalHexes = getValidDestinations(
    { id: 'opponent-inf-mover', h3Index: origin, unitType: 'infantry' },
    state
  ).filter((h3) => h3 !== origin);
  assert.ok(legalHexes.includes(leaverHex), 'fixture requires the leaver hex to be a one-step dest');
  const resolved = applyInterestOrApproach({
    unitH3: origin,
    legalHexes,
    interest: [],
    enemyOccupiedH3: new Set([enemy]),
    indexed: {
      enemyUnitsByHex: new Map([[enemy, [{ id: 'human-inf-far', unitType: 'infantry' }]]]),
      friendlyUnitsByHex: new Map([
        [origin, [{ id: 'opponent-inf-mover', unitType: 'infantry' }]],
        [leaverHex, [{ id: 'opponent-inf-leaver', unitType: 'infantry' }]],
      ]),
      controlByHex: new Map(),
      infraByHex: new Map(),
    },
    stayPutFriendlyH3: stayPut,
  });
  assert.equal(resolved.actionType, 'approach');
  assert.ok(resolved.hexes.includes(leaverHex), 'hex a friendly is leaving must be an approach dest');
  const suggestions = suggestApproachDestinationsForOrderlessUnits(
    'opponent',
    state,
    ['opponent-inf-mover'],
    thisPeriodMoves
  );
  const suggested = suggestions.get('opponent-inf-mover');
  assert.ok(suggested, 'orderless table must offer a closing dest when a leaver origin is eligible');
  assert.ok(resolved.hexes.includes(suggested), 'Suggested Destination must be one of the stay-put-filtered approach hexes');
}

/**
 * Ensures a legal ferry destination still appears in Best Options when H3 cannot measure grid distance.
 *
 * Purpose: Turn 12 Air Operations listed ferry dests for bases FI/FM/F4, but Best Options omitted those air units because `gridDistance` threw and row assembly skipped the dest.
 * When to use: After edits to `appendRowsForLegalHexes` distance handling.
 * Expected outcome: This-turn rows include a `ferry` action from origin to dest even though `gridDistance` throws for that pair.
 * Exceptions: Throws when the world map has no unmeasurable in-disk pair.
 */
function testStrategicBestOptionsKeepsFerryDestWhenGridDistanceThrows(): void {
  const { origin, dest } = findUnmeasurableFerryDiskPair();
  assert.throws(() => gridDistance(origin, dest), 'fixture pair must be unmeasurable via gridDistance');
  const state: GameStateSnapshot = {
    turnNumber: 1,
    phase: 'planning',
    hexes: [
      { h3Index: origin, terrain: 'land', terrainKind: 'plains' },
      { h3Index: dest, terrain: 'land', terrainKind: 'plains' },
    ],
    units: [{ id: 'opponent-air-1', player: 'opponent', unitType: 'air', h3Index: origin }],
    pendingOrders: [],
    res1Infrastructure: [
      { h3Index: origin, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
      { h3Index: dest, urbanHexCount: 4, airportCount: 1, seaportCount: 0 },
    ],
    res1Control: [
      { h3Index: origin, controllerPlayerId: 'opponent' },
      { h3Index: dest, controllerPlayerId: 'opponent' },
    ],
  };
  const thisTurn = collectStrategicThisTurnRows(state);
  assert.ok(
    thisTurn.some(
      (r) => r.unitId === 'opponent-air-1' && r.targetH3 === dest && r.actionTypes.includes('ferry')
    ),
    'Best Options must list the legal ferry dest even when gridDistance throws'
  );
}

/**
 * Documents the module-scope binding `tests` (tests).
 *
 * Purpose: Runs the strategic Best Options occupancy and approach contracts.
 * When to use: `node dist/main/openRouter/possibleUnitActionsStrategicBestOptions.test.js` after `build:main`.
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
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options air strikes omit friendly and uncontrolled infra',
    fn: testStrategicBestOptionsAirStrikesOmitFriendlyAndUncontrolledInfra,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options keeps ferry dest when gridDistance throws',
    fn: testStrategicBestOptionsKeepsFerryDestWhenGridDistanceThrows,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options approaches when gridDistance throws',
    fn: testStrategicBestOptionsApproachWhenGridDistanceThrows,
  },
  {
    name: 'collectAggregatedPossibleActionRows strategic Best Options approach skips friendly-occupied and matches orderless',
    fn: testStrategicBestOptionsApproachSkipsFriendlyOccupiedAndMatchesOrderless,
  },
  {
    name: 'applyInterestOrApproach lists a hex a friendly is leaving this period',
    fn: testStrategicBestOptionsApproachListsHexAFriendlyIsLeaving,
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
