/**
 * Sea landing candidates: force size, city order, and the ports the troops can reach.
 *
 * Purpose: The search must return a landing the turn advance can store, and must return nothing when the force or the route is missing.
 * When to use: After changes to `listSeaOperationCandidates`.
 * Expected outcome: Process exit 0. Real H3 cells are used because sailing and land steps require them.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import type { GameStateSnapshot } from '../gameDb';
import { STRATEGIC_LAND_MAX_WATER_PCT, type LandMassByH3, type StrategicLandMassRecord } from '../../shared/landTraversalStrategic';
import type { Operation } from '../../shared/operationTypes';
import { buildLiftTerrain } from './liftTerrain';
import { listSeaOperationCandidates } from './seaOperationCandidates';

const SEAT = 'opponent';

/**
 * A land-mass row the ground units can enter, sharing continent 1.
 *
 * Purpose: Muster steps are legal only between records that share a continent.
 * When to use: The port and the infantry hexes.
 * Expected outcome: `waterPct` is below `STRATEGIC_LAND_MAX_WATER_PCT`.
 * Exceptions: None.
 */
function landRecord(h3Index: string): StrategicLandMassRecord {
  return { h3Index, waterPct: STRATEGIC_LAND_MAX_WATER_PCT - 1, continentIds: [1], islandIds: [] };
}

/**
 * One stored operation that already claims the given units.
 *
 * Purpose: Those ids must not be chosen again.
 * When to use: The busy-unit case.
 * Expected outcome: A muster operation whose objective is not on the map.
 * Exceptions: None.
 */
function claimed(unitIds: readonly string[]): Operation {
  return {
    id: 'opponent-op1',
    method: 'sea',
    objectiveH3: 'not-a-city',
    musterH3: 'not-a-port',
    landingH3: null,
    unitIds,
    carrierIds: [],
    phase: 'muster',
    source: 'engine',
    launchedTurn: 1,
    phaseTurn: 1,
  };
}

/**
 * Casts a small snapshot. The seat list is always the two active sides.
 *
 * Purpose: City knowledge needs an active enemy seat. The helper must not require the rest of a live match.
 * When to use: Every fixture in this file.
 * Expected outcome: A snapshot `listSeaOperationCandidates` can read.
 * Exceptions: None.
 */
function snapshot(parts: {
  readonly hexes: GameStateSnapshot['hexes'];
  readonly units: GameStateSnapshot['units'];
  readonly strategicInfrastructure: NonNullable<GameStateSnapshot['strategicInfrastructure']>;
  readonly strategicControl: NonNullable<GameStateSnapshot['strategicControl']>;
}): GameStateSnapshot {
  return {
    hexes: parts.hexes,
    units: parts.units,
    phase: 'planning',
    turnNumber: 4,
    pendingOrders: [],
    playerPerspective: SEAT,
    seats: [
      { seatId: 'human', outTurn: null },
      { seatId: SEAT, outTurn: null },
    ],
    strategicInfrastructure: parts.strategicInfrastructure,
    strategicControl: parts.strategicControl,
  } as unknown as GameStateSnapshot;
}

/**
 * A coastal port, inland infantry, one ship, and enemy coastal cities on one water disk.
 *
 * Purpose: The happy path and the city-order cases share one ocean.
 * When to use: Pass `radius` 3 for a nearby city, or 8 when a defender must sit outside naval range.
 * Expected outcome: `port` is the origin. Infantry hexes share its land mass. `shipHex` is water beside the port.
 * Exceptions: Throws when the disk cannot be built.
 */
function coast(args: {
  readonly radius: number;
  readonly infantry: readonly string[];
  readonly cities: readonly { readonly h3Index: string; readonly urbanHexCount: number }[];
  readonly extraUnits?: GameStateSnapshot['units'];
}): {
  readonly state: GameStateSnapshot;
  readonly landMass: LandMassByH3;
  readonly port: string;
  readonly shipHex: string;
} {
  const port = latLngToCell(0, 0, 1);
  const disk = gridDisk(port, args.radius);
  const neighbors = gridDisk(port, 1).filter((h3) => h3 !== port);
  assert.ok(neighbors.length >= 3, 'expected a land neighbour and a water neighbour');
  const landHexes = neighbors.slice(0, 2);
  const infantryHexes = args.infantry.map((_, index) => landHexes[index % landHexes.length]!);
  const shipHex = neighbors.find((h3) => !landHexes.includes(h3));
  assert.ok(shipHex, 'expected a water neighbour for the ship');
  const reserved = new Set([port, shipHex, ...infantryHexes]);
  for (const city of args.cities) assert.equal(reserved.has(city.h3Index), false, 'city hex collided with the port');
  const cityHexes = new Set(args.cities.map((city) => city.h3Index));
  const hexes = disk.map((h3Index) => {
    if (infantryHexes.includes(h3Index)) return { h3Index, terrain: 'land', terrainKind: 'plains' };
    if (h3Index === port || cityHexes.has(h3Index)) return { h3Index, terrain: 'coastal', terrainKind: 'coastal' };
    return { h3Index, terrain: 'water', terrainKind: 'water' };
  });
  const units: GameStateSnapshot['units'] = [
    ...args.infantry.map((id, index) => ({
      id,
      player: SEAT,
      unitType: 'infantry' as const,
      h3Index: infantryHexes[index]!,
    })),
    { id: 'ship-1', player: SEAT, unitType: 'naval' as const, h3Index: shipHex },
    ...(args.extraUnits ?? []),
  ];
  const state = snapshot({
    hexes,
    units,
    strategicInfrastructure: [
      { h3Index: port, urbanHexCount: 0, airportCount: 0, seaportCount: 1 },
      ...args.cities.map((city) => ({
        h3Index: city.h3Index,
        urbanHexCount: city.urbanHexCount,
        airportCount: 0,
        seaportCount: 0,
      })),
    ],
    strategicControl: [
      { h3Index: port, controllerPlayerId: SEAT },
      ...args.cities.map((city) => ({ h3Index: city.h3Index, controllerPlayerId: 'human' })),
    ],
  });
  const landMass: LandMassByH3 = new Map([port, ...infantryHexes].map((h3) => [h3, landRecord(h3)]));
  return { state, landMass, port, shipHex };
}

/**
 * Runs the search and returns the rows plus the route counter.
 *
 * Purpose: Every case builds terrain the same way, so `routeChecks` starts at zero.
 * When to use: The assertion line of each test.
 * Expected outcome: The candidate list and the terrain that produced it.
 * Exceptions: None.
 */
function search(
  state: GameStateSnapshot,
  landMass: LandMassByH3,
  extra?: {
    readonly active?: readonly Operation[];
    readonly protectedUnitIds?: ReadonlySet<string>;
    readonly hasCampaignPlan?: boolean;
  }
): { readonly candidates: ReturnType<typeof listSeaOperationCandidates>; readonly routeChecks: number } {
  const terrain = buildLiftTerrain({ state, seatId: SEAT, landMass });
  const candidates = listSeaOperationCandidates({
    state,
    seatId: SEAT,
    landMass,
    terrain,
    active: extra?.active ?? [],
    protectedUnitIds: extra?.protectedUnitIds ?? new Set(),
    hasCampaignPlan: extra?.hasCampaignPlan ?? false,
  });
  return { candidates, routeChecks: terrain.routeChecks() };
}

test('a clear coastal city across water is one candidate', () => {
  const port = latLngToCell(0, 0, 1);
  const city = gridDisk(port, 2).find((h3) => !gridDisk(port, 1).includes(h3));
  assert.ok(city);
  const built = coast({
    radius: 3,
    infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d'],
    cities: [{ h3Index: city, urbanHexCount: 4 }],
  });
  const { candidates } = search(built.state, built.landMass);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.musterH3, built.port);
  assert.deepEqual(candidates[0]?.unitIds, ['inf-a', 'inf-b']);
  assert.deepEqual(candidates[0]?.carrierIds, ['ship-1']);
  assert.equal(candidates[0]?.clear, true);
  assert.equal(candidates[0]?.objectiveH3, city);
});

test('no free ship or a single ground unit yields no candidate', () => {
  const port = latLngToCell(0, 0, 1);
  const city = gridDisk(port, 2).find((h3) => !gridDisk(port, 1).includes(h3))!;
  const built = coast({ radius: 3, infantry: ['inf-a', 'inf-b'], cities: [{ h3Index: city, urbanHexCount: 4 }] });
  const noShip = {
    ...built.state,
    units: built.state.units.filter((unit) => unit.unitType !== 'naval'),
  };
  assert.deepEqual(search(noShip, built.landMass).candidates, []);
  const oneUnit = {
    ...built.state,
    units: built.state.units.filter((unit) => unit.id !== 'inf-b'),
  };
  assert.deepEqual(search(oneUnit, built.landMass).candidates, []);
});

test('a protected ship is not chosen', () => {
  const port = latLngToCell(0, 0, 1);
  const city = gridDisk(port, 2).find((h3) => !gridDisk(port, 1).includes(h3))!;
  const built = coast({
    radius: 3,
    infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d'],
    cities: [{ h3Index: city, urbanHexCount: 4 }],
  });
  const { candidates } = search(built.state, built.landMass, { protectedUnitIds: new Set(['ship-1']) });
  assert.deepEqual(candidates, []);
});

test('a protected unit and a unit already in an operation are not chosen', () => {
  const port = latLngToCell(0, 0, 1);
  const city = gridDisk(port, 2).find((h3) => !gridDisk(port, 1).includes(h3))!;
  const built = coast({
    radius: 3,
    infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d', 'inf-e', 'inf-f'],
    cities: [{ h3Index: city, urbanHexCount: 4 }],
  });
  const { candidates } = search(built.state, built.landMass, {
    active: [claimed(['inf-a'])],
    protectedUnitIds: new Set(['inf-b']),
  });
  assert.deepEqual(candidates[0]?.unitIds, ['inf-c', 'inf-d']);
});

test('one ship carries two of the three units the cap allows', () => {
  const port = latLngToCell(0, 0, 1);
  const city = gridDisk(port, 2).find((h3) => !gridDisk(port, 1).includes(h3))!;
  const built = coast({
    radius: 3,
    infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d', 'inf-e', 'inf-f'],
    cities: [{ h3Index: city, urbanHexCount: 4 }],
  });
  const { candidates } = search(built.state, built.landMass);
  assert.deepEqual(candidates[0]?.unitIds, ['inf-a', 'inf-b']);
  assert.deepEqual(candidates[0]?.carrierIds, ['ship-1']);
});

test('a clear city is listed before a larger city with a defender', () => {
  const port = latLngToCell(0, 0, 1);
  const near = gridDisk(port, 2).find((h3) => !gridDisk(port, 1).includes(h3))!;
  const far = gridDisk(port, 9).find((h3) => !gridDisk(port, 8).includes(h3))!;
  const built = coast({
    radius: 9,
    infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d'],
    cities: [
      { h3Index: near, urbanHexCount: 2 },
      { h3Index: far, urbanHexCount: 9 },
    ],
    extraUnits: [{ id: 'defender', player: 'human', unitType: 'infantry', h3Index: far }],
  });
  const { candidates } = search(built.state, built.landMass);
  assert.equal(candidates[0]?.objectiveH3, near);
  assert.equal(candidates[0]?.clear, true);
  assert.equal(candidates[1]?.objectiveH3, far);
  assert.equal(candidates[1]?.clear, false);
  assert.equal(candidates[1]?.defenders, 1);
});

test('twelve reachable cities return five candidates and a bounded route count', () => {
  const port = latLngToCell(0, 0, 1);
  const blocked = new Set(gridDisk(port, 1));
  const cities = gridDisk(port, 3)
    .filter((h3) => !blocked.has(h3))
    .slice(0, 12)
    .map((h3Index, index) => ({ h3Index, urbanHexCount: 12 - index }));
  assert.equal(cities.length, 12);
  const built = coast({ radius: 3, infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d'], cities });
  const { candidates, routeChecks } = search(built.state, built.landMass);
  assert.equal(candidates.length, 5);
  assert.ok(routeChecks > 0 && routeChecks <= 200, `routeChecks ${routeChecks} exceeded 200`);
});

test('a city on an inland sea the ship cannot reach is skipped', () => {
  const port = latLngToCell(0, 0, 1);
  const farOrigin = latLngToCell(40, 40, 1);
  assert.equal(gridDisk(port, 3).includes(farOrigin), false);
  const city = gridDisk(farOrigin, 1).find((h3) => h3 !== farOrigin)!;
  const built = coast({ radius: 2, infantry: ['inf-a', 'inf-b'], cities: [] });
  const farHexes = gridDisk(farOrigin, 1).map((h3Index) => ({
    h3Index,
    terrain: h3Index === city ? 'coastal' : 'water',
    terrainKind: h3Index === city ? 'coastal' : 'water',
  }));
  const state = {
    ...built.state,
    hexes: [...built.state.hexes, ...farHexes],
    strategicInfrastructure: [
      ...(built.state.strategicInfrastructure ?? []),
      { h3Index: city, urbanHexCount: 3, airportCount: 0, seaportCount: 0 },
    ],
    strategicControl: [...(built.state.strategicControl ?? []), { h3Index: city, controllerPlayerId: 'human' }],
  };
  assert.deepEqual(search(state, built.landMass).candidates, []);
});

test('a campaign that has already committed the lift cap yields nothing', () => {
  const built = coast({
    radius: 2,
    infantry: ['inf-a', 'inf-b', 'inf-c', 'inf-d', 'inf-e', 'inf-f', 'inf-g', 'inf-h'],
    cities: [],
  });
  const { candidates } = search(built.state, built.landMass, {
    active: [claimed(['inf-a', 'inf-b'])],
    hasCampaignPlan: true,
  });
  assert.deepEqual(candidates, []);
});

test('the muster port is the one the ground units can reach', () => {
  const troopsPort = latLngToCell(0, 0, 1);
  const neighbors = gridDisk(troopsPort, 1).filter((h3) => h3 !== troopsPort);
  const infantryHex = neighbors[0]!;
  const shipPort = gridDisk(troopsPort, 4).find((h3) => !gridDisk(troopsPort, 3).includes(h3))!;
  const city = gridDisk(troopsPort, 2).find((h3) => h3 !== troopsPort && !neighbors.includes(h3))!;
  const disk = gridDisk(troopsPort, 4);
  const hexes = disk.map((h3Index) => {
    if (h3Index === infantryHex) return { h3Index, terrain: 'land', terrainKind: 'plains' };
    if (h3Index === troopsPort || h3Index === city) return { h3Index, terrain: 'coastal', terrainKind: 'coastal' };
    return { h3Index, terrain: 'water', terrainKind: 'water' };
  });
  const state = snapshot({
    hexes,
    units: [
      { id: 'inf-a', player: SEAT, unitType: 'infantry', h3Index: infantryHex },
      { id: 'inf-b', player: SEAT, unitType: 'infantry', h3Index: infantryHex },
      { id: 'inf-c', player: SEAT, unitType: 'infantry', h3Index: infantryHex },
      { id: 'inf-d', player: SEAT, unitType: 'infantry', h3Index: infantryHex },
      { id: 'ship-1', player: SEAT, unitType: 'naval', h3Index: shipPort },
    ],
    strategicInfrastructure: [
      { h3Index: troopsPort, urbanHexCount: 0, airportCount: 0, seaportCount: 1 },
      { h3Index: shipPort, urbanHexCount: 0, airportCount: 0, seaportCount: 1 },
      { h3Index: city, urbanHexCount: 4, airportCount: 0, seaportCount: 0 },
    ],
    strategicControl: [
      { h3Index: troopsPort, controllerPlayerId: SEAT },
      { h3Index: shipPort, controllerPlayerId: SEAT },
      { h3Index: city, controllerPlayerId: 'human' },
    ],
  });
  const landMass: LandMassByH3 = new Map([
    [troopsPort, landRecord(troopsPort)],
    [infantryHex, landRecord(infantryHex)],
  ]);
  const { candidates } = search(state, landMass);
  assert.equal(candidates[0]?.musterH3, troopsPort);
});
