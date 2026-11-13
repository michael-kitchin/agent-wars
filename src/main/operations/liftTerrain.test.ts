/**
 * Snapshot readings for embark, sailing, landing, and nearby units.
 *
 * Purpose: The helper must follow the snapshot it is given, including a snapshot with no infrastructure rows.
 * When to use: After changes to `liftTerrain`.
 * Expected outcome: Process exit 0. Real H3 cells are used because neighbour and sailing searches require them.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { STRATEGIC_LAND_MAX_WATER_PCT, type LandMassByH3, type StrategicLandMassRecord } from '../../shared/landTraversalStrategic';
import { buildLiftTerrain } from './liftTerrain';

/**
 * A land-mass row under the water cap, sharing continent 1.
 *
 * Purpose: A landing step is legal only when the city record can be entered from the beach.
 * When to use: Landing fixtures.
 * Expected outcome: `waterPct` is below `STRATEGIC_LAND_MAX_WATER_PCT`.
 * Exceptions: None.
 */
function landRecord(h3Index: string): StrategicLandMassRecord {
  return { h3Index, waterPct: STRATEGIC_LAND_MAX_WATER_PCT - 1, continentIds: [1], islandIds: [] };
}

/**
 * Casts a small snapshot. Missing infrastructure and control stay missing when the caller omits them.
 *
 * Purpose: The helper must tolerate those arrays being absent.
 * When to use: Every fixture in this file.
 * Expected outcome: A snapshot the helper can read.
 * Exceptions: None.
 */
function snapshot(parts: {
  readonly hexes: GameStateSnapshot['hexes'];
  readonly units?: GameStateSnapshot['units'];
  readonly strategicInfrastructure?: GameStateSnapshot['strategicInfrastructure'];
  readonly strategicControl?: GameStateSnapshot['strategicControl'];
}): GameStateSnapshot {
  return {
    hexes: parts.hexes,
    units: parts.units ?? [],
    phase: 'planning',
    turnNumber: 1,
    pendingOrders: [],
    playerPerspective: 'opponent',
    ...('strategicInfrastructure' in parts ? { strategicInfrastructure: parts.strategicInfrastructure } : {}),
    ...('strategicControl' in parts ? { strategicControl: parts.strategicControl } : {}),
  } as unknown as GameStateSnapshot;
}

/**
 * One on-map cell and the cells within four steps. The origin is equatorial so the ring does not cross the antimeridian.
 *
 * Purpose: Sailing and landing tests need real neighbours.
 * When to use: The first line of each test that searches.
 * Expected outcome: `origin` is the queried cell. `far` is four edges away. `inland` is five edges away. Neither is taken from a fixed index of the disk, because the origin is not first.
 * Exceptions: Throws when the disk cannot be built.
 */
function ring(): {
  readonly origin: string;
  readonly far: string;
  readonly inland: string;
  readonly disk: readonly string[];
  readonly neighbors: readonly string[];
} {
  const origin = latLngToCell(0, 0, 1);
  const disk = gridDisk(origin, 4);
  const inner = new Set(gridDisk(origin, 3));
  const far = disk.find((h3) => h3 !== origin && !inner.has(h3));
  const inland = gridDisk(origin, 5).find((h3) => h3 !== origin && !disk.includes(h3));
  const neighbors = gridDisk(origin, 1).filter((h3) => h3 !== origin);
  assert.ok(far && inland && neighbors.length >= 2, 'expected a four-edge cell, a five-edge cell, and two neighbours');
  return { origin, far, inland, disk, neighbors };
}

test('embark and debark follow the snapshot terrain and control', () => {
  const { origin, neighbors } = ring();
  const inland = neighbors[0]!;
  const port = neighbors[1]!;
  const state = snapshot({
    hexes: [
      { h3Index: origin, terrain: 'coastal', terrainKind: 'coastal' },
      { h3Index: inland, terrain: 'land', terrainKind: 'plains' },
      { h3Index: port, terrain: 'water', terrainKind: 'water' },
    ],
    strategicInfrastructure: [{ h3Index: port, urbanHexCount: 0, airportCount: 0, seaportCount: 1 }],
    strategicControl: [{ h3Index: port, controllerPlayerId: 'human' }],
  });
  const terrain = buildLiftTerrain({ state, seatId: 'opponent', landMass: new Map() });
  assert.equal(terrain.embarkLegal(origin), true);
  assert.equal(terrain.debarkLegal(origin), true);
  assert.equal(terrain.shipCanEnter(origin), true);
  assert.equal(terrain.embarkLegal(inland), false);
  assert.equal(terrain.debarkLegal(inland), false);
  assert.equal(terrain.shipCanEnter(inland), false);
  assert.equal(terrain.embarkLegal(port), false);
  assert.equal(terrain.debarkLegal(port), false);
  const owned = snapshot({
    hexes: state.hexes,
    strategicInfrastructure: state.strategicInfrastructure,
    strategicControl: [{ h3Index: port, controllerPlayerId: 'opponent' }],
  });
  const ownedTerrain = buildLiftTerrain({ state: owned, seatId: 'opponent', landMass: new Map() });
  assert.equal(ownedTerrain.embarkLegal(port), true);
  assert.equal(ownedTerrain.debarkLegal(port), true);
  assert.equal(terrain.embarkLegal('missing'), false);
});

test('sailTurns counts a four-edge water route and not a same-hex query', () => {
  const { origin, far, inland, disk } = ring();
  const hexes: { h3Index: string; terrain: string; terrainKind: string }[] = disk.map((h3Index) => ({
    h3Index,
    terrain: 'water',
    terrainKind: 'water',
  }));
  hexes.push({ h3Index: inland, terrain: 'land', terrainKind: 'plains' });
  const terrain = buildLiftTerrain({
    state: snapshot({ hexes, strategicInfrastructure: [], strategicControl: [] }),
    seatId: 'opponent',
    landMass: new Map(),
  });
  assert.equal(terrain.sailTurns(origin, origin), 0);
  assert.equal(terrain.routeChecks(), 0);
  assert.equal(terrain.sailTurns(origin, far), 2);
  assert.equal(terrain.routeChecks(), 1);
  assert.equal(terrain.sailTurns(origin, inland), null);
  assert.equal(terrain.routeChecks(), 2);
});

test('landingHexes keeps a coastal city and a beach that can step onto an inland city', () => {
  const { origin, neighbors } = ring();
  const inlandNeighbor = neighbors[0]!;
  const beach = neighbors[1]!;
  const coastalCity = snapshot({
    hexes: [
      { h3Index: origin, terrain: 'coastal', terrainKind: 'coastal' },
      { h3Index: inlandNeighbor, terrain: 'land', terrainKind: 'plains' },
    ],
    strategicInfrastructure: [],
    strategicControl: [],
  });
  const coastal = buildLiftTerrain({ state: coastalCity, seatId: 'opponent', landMass: new Map() });
  const coastalLandings = coastal.landingHexes(origin);
  assert.equal(coastalLandings.includes(origin), true);
  assert.equal(coastalLandings.includes(inlandNeighbor), false);

  const inlandCity = snapshot({
    hexes: [
      { h3Index: origin, terrain: 'land', terrainKind: 'plains' },
      { h3Index: beach, terrain: 'coastal', terrainKind: 'coastal' },
    ],
    strategicInfrastructure: [],
    strategicControl: [],
  });
  const landMass: LandMassByH3 = new Map([
    [origin, landRecord(origin)],
    [beach, landRecord(beach)],
  ]);
  const inland = buildLiftTerrain({ state: inlandCity, seatId: 'opponent', landMass });
  const inlandLandings = inland.landingHexes(origin);
  assert.equal(inlandLandings.includes(origin), false);
  assert.equal(inlandLandings.includes(beach), true);
});

test('enemyUnitsWithin counts other sides and ignores an unmeasurable hex', () => {
  const { origin, neighbors } = ring();
  const beside = neighbors[0]!;
  const state = snapshot({
    hexes: [{ h3Index: origin, terrain: 'land', terrainKind: 'plains' }],
    units: [
      { id: 'own', player: 'opponent', unitType: 'infantry', h3Index: origin },
      { id: 'neutral', player: 'neutral', unitType: 'infantry', h3Index: beside },
      { id: 'broken', player: 'human', unitType: 'infantry', h3Index: 'not-a-hex' },
    ],
    strategicInfrastructure: [],
    strategicControl: [],
  });
  const terrain = buildLiftTerrain({ state, seatId: 'opponent', landMass: new Map() });
  assert.equal(terrain.enemyUnitsWithin(origin, 0), 0);
  assert.equal(terrain.enemyUnitsWithin(origin, 1), 1);
  assert.equal(terrain.enemyUnitsWithin(beside, 0), 1);
});

test('a snapshot with no infrastructure and no control does not throw', () => {
  const { origin } = ring();
  const state = snapshot({ hexes: [{ h3Index: origin, terrain: 'coastal', terrainKind: 'coastal' }] });
  const terrain = buildLiftTerrain({ state, seatId: 'opponent', landMass: new Map() });
  assert.equal(terrain.embarkLegal(origin), true);
  assert.equal(terrain.debarkLegal(origin), true);
  assert.deepEqual(terrain.landingHexes(origin), [origin]);
});
