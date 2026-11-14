/**
 * Air drop candidates: one infantry unit, an empty city, and the airport the drop uses.
 *
 * Purpose: The search must return a drop the turn advance can store, and must return nothing when the city is occupied or the infantry cannot walk.
 * When to use: After changes to `listAirOperationCandidates`.
 * Expected outcome: Process exit 0. Real H3 cells are used because land steps and range checks require them.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { STRATEGIC_LAND_MAX_WATER_PCT, type LandMassByH3, type StrategicLandMassRecord } from '../../shared/landTraversalStrategic';
import { AIR_FERRY_RANGE_HEXES, AIR_STRIKE_RANGE_HEXES } from '../../shared/tacticalRanges';
import type { GameStateSnapshot } from '../gameDb';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import { displayWeatherForHex, weatherTagsForBirthHex } from '../weather/weatherPackLoad';
import { buildLiftTerrain } from './liftTerrain';
import { listAirOperationCandidates } from './airOperationCandidates';

const SEAT = 'opponent';

/**
 * A land-mass row the infantry can enter, sharing continent 1.
 *
 * Purpose: Muster steps are legal only between records that share a continent.
 * When to use: The airport and the infantry hex.
 * Expected outcome: `waterPct` is below `STRATEGIC_LAND_MAX_WATER_PCT`.
 * Exceptions: None.
 */
function landRecord(h3Index: string): StrategicLandMassRecord {
  return { h3Index, waterPct: STRATEGIC_LAND_MAX_WATER_PCT - 1, continentIds: [1], islandIds: [] };
}

/**
 * Casts a small snapshot. The seat list is the two active sides.
 *
 * Purpose: City knowledge needs an active enemy seat.
 * When to use: Every fixture in this file.
 * Expected outcome: A snapshot `listAirOperationCandidates` can read.
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
 * An air unit on a controlled airport, infantry a chosen number of steps away, and enemy cities.
 *
 * Purpose: The happy path and the refusal cases share one airport.
 * When to use: Pass `steps` 2 for a reachable infantry unit.
 * Expected outcome: `airport` is the origin. The infantry hex is that many land steps away when `steps` is 1 or 2.
 * Exceptions: Throws when the disk cannot be built.
 */
function field(args: {
  readonly steps: number;
  readonly cities: readonly { readonly h3Index: string; readonly urbanHexCount: number; readonly fortifiedCount?: number }[];
  readonly extraAirports?: readonly string[];
  readonly extraUnits?: GameStateSnapshot['units'];
  readonly includeInfantry?: boolean;
}): { readonly state: GameStateSnapshot; readonly landMass: LandMassByH3; readonly airport: string } {
  const airport = latLngToCell(0, 0, 1);
  const mid = gridDisk(airport, 1).find((hex) => hex !== airport)!;
  const near = new Set(gridDisk(airport, 1));
  const two = gridDisk(mid, 1).find((hex) => !near.has(hex))!;
  const infantryHex = args.steps <= 1 ? mid : two;
  const walk = args.steps <= 1 ? [airport, mid] : [airport, mid, two];
  const airports = [airport, ...(args.extraAirports ?? [])];
  const reserved = new Set([...walk, ...airports]);
  const hexIds = [...new Set([...reserved, ...args.cities.map((city) => city.h3Index)])];
  const state = snapshot({
    hexes: hexIds.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
    units: [
      { id: 'air-1', player: SEAT, unitType: 'air' as const, h3Index: airport },
      ...(args.includeInfantry === false
        ? []
        : [{ id: 'inf-a', player: SEAT, unitType: 'infantry' as const, h3Index: infantryHex }]),
      ...(args.extraUnits ?? []),
    ],
    strategicInfrastructure: [
      ...airports.map((h3Index) => ({ h3Index, urbanHexCount: 0, airportCount: 1, seaportCount: 0 })),
      ...args.cities.map((city) => ({
        h3Index: city.h3Index,
        urbanHexCount: city.urbanHexCount,
        airportCount: 0,
        seaportCount: 0,
        fortifiedCount: city.fortifiedCount ?? 0,
      })),
    ],
    strategicControl: [
      ...airports.map((h3Index) => ({ h3Index, controllerPlayerId: SEAT })),
      ...args.cities.map((city) => ({ h3Index: city.h3Index, controllerPlayerId: 'human' })),
    ],
  });
  const landMass: LandMassByH3 = new Map(
    [...walk, ...args.cities.map((city) => city.h3Index)].map((h3Index) => [h3Index, landRecord(h3Index)])
  );
  return { state, landMass, airport };
}

/**
 * Runs the search.
 *
 * Purpose: Every case builds terrain the same way.
 * When to use: The assertion line of each test.
 * Expected outcome: The candidate list.
 * Exceptions: None.
 */
function search(
  state: GameStateSnapshot,
  landMass: LandMassByH3,
  onlyObjectiveH3?: string
): ReturnType<typeof listAirOperationCandidates> {
  const terrain = buildLiftTerrain({ state, seatId: SEAT, landMass });
  return listAirOperationCandidates({
    state,
    seatId: SEAT,
    landMass,
    terrain,
    active: [],
    protectedUnitIds: new Set(),
    onlyObjectiveH3,
  });
}

test('an empty city in range of the air unit uses that airport', () => {
  const airport = latLngToCell(0, 0, 1);
  const city = gridDisk(airport, 2).find((hex) => hex !== airport && !gridDisk(airport, 1).includes(hex))!;
  const built = field({ steps: 2, cities: [{ h3Index: city, urbanHexCount: 4 }] });
  const candidates = search(built.state, built.landMass);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.method, 'air');
  assert.equal(candidates[0]?.musterH3, built.airport);
  assert.equal(candidates[0]?.landingH3, built.airport);
  assert.deepEqual(candidates[0]?.unitIds, ['inf-a']);
  assert.deepEqual(candidates[0]?.carrierIds, ['air-1']);
  assert.equal(candidates[0]?.clear, true);
  assert.equal(candidates[0]?.etaTurns, 3);
});

test('a city in range only of a second airport ferries there first', () => {
  const airport = latLngToCell(0, 0, 1);
  const second = gridDisk(airport, AIR_FERRY_RANGE_HEXES).find((hex) => !gridDisk(airport, AIR_FERRY_RANGE_HEXES - 1).includes(hex))!;
  const city = gridDisk(second, AIR_STRIKE_RANGE_HEXES).find(
    (hex) => hex !== second && hex !== airport && !isWithinGridRangePure(airport, hex, AIR_STRIKE_RANGE_HEXES)
  )!;
  const built = field({
    steps: 2,
    cities: [{ h3Index: city, urbanHexCount: 4 }],
    extraAirports: [second],
  });
  const candidates = search(built.state, built.landMass);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.landingH3, second);
  assert.equal(candidates[0]?.etaTurns, 4);
});

test('an occupied city and a fortified city are not listed', () => {
  const airport = latLngToCell(0, 0, 1);
  const ring = gridDisk(airport, 2).filter((hex) => !gridDisk(airport, 1).includes(hex));
  const occupied = ring[0]!;
  const fortified = ring[1]!;
  const occupiedField = field({
    steps: 2,
    cities: [{ h3Index: occupied, urbanHexCount: 4 }],
    extraUnits: [{ id: 'defender', player: 'human', unitType: 'infantry', h3Index: occupied }],
  });
  assert.deepEqual(search(occupiedField.state, occupiedField.landMass), []);
  const fortifiedField = field({
    steps: 2,
    cities: [{ h3Index: fortified, urbanHexCount: 4, fortifiedCount: 2 }],
  });
  assert.deepEqual(search(fortifiedField.state, fortifiedField.landMass), []);
});

test('no infantry in reach gives no candidate', () => {
  const airport = latLngToCell(0, 0, 1);
  const city = gridDisk(airport, 2).find((hex) => !gridDisk(airport, 1).includes(hex))!;
  const built = field({ steps: 2, cities: [{ h3Index: city, urbanHexCount: 4 }], includeInfantry: false });
  assert.deepEqual(search(built.state, built.landMass), []);
});

test('a named objective restricts the list to that city', () => {
  const airport = latLngToCell(0, 0, 1);
  const ring = gridDisk(airport, 2).filter((hex) => !gridDisk(airport, 1).includes(hex));
  const first = ring[0]!;
  const second = ring[1]!;
  const built = field({
    steps: 2,
    cities: [
      { h3Index: first, urbanHexCount: 2 },
      { h3Index: second, urbanHexCount: 9 },
    ],
  });
  const candidates = search(built.state, built.landMass, second);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.objectiveH3, second);
});

/**
 * A January snow airport and a home airport three hexes away.
 *
 * Purpose: The ferry hop is 4 hexes, or 2 when snow shortens it. Distance 3 is inside one and outside the other.
 * When to use: The weather-range case.
 * Expected outcome: `far` displays snow in January. `city` is in drop range of `far` and out of drop range of `home`.
 * Exceptions: Fails when the climate pack has no such airport.
 */
function snowFerryGeometry(): { readonly home: string; readonly far: string; readonly city: string; readonly snowBirth: string } {
  const far = '8101bffffffffff';
  assert.equal(displayWeatherForHex(far, 1, 1), 'snow', 'climate pack has no January snow at the known hex');
  const homes = gridDisk(far, 3).filter((hex) => computeGridDistancePure(hex, far) === 3);
  for (const home of homes) {
    const city = gridDisk(far, AIR_STRIKE_RANGE_HEXES).find((hex) => {
      if (hex === far || hex === home) return false;
      const fromFar = computeGridDistancePure(hex, far);
      const fromHome = computeGridDistancePure(hex, home);
      return fromFar != null && fromFar <= AIR_STRIKE_RANGE_HEXES && fromHome != null && fromHome > AIR_STRIKE_RANGE_HEXES;
    });
    if (!city) continue;
    const snowBirth = snowAcclimatedBirth(far);
    assert.ok(snowBirth, 'climate pack has no snow-acclimated birth hex');
    return { home, far, city, snowBirth };
  }
  assert.fail('climate pack cannot supply a snow airport with a city outside the home drop range');
}

/**
 * A birth hex whose climate includes snow.
 *
 * Purpose: The long ferry hop is allowed only for a unit acclimated to snow.
 * When to use: After the snow airport is known.
 * Expected outcome: The airport itself when it qualifies, otherwise a northern hex that does.
 * Exceptions: None. A missing hex is reported by the caller.
 */
function snowAcclimatedBirth(far: string): string | undefined {
  if (weatherTagsForBirthHex(far).includes('snow')) return far;
  for (let lat = 75; lat >= 55; lat -= 5) {
    for (let lng = -180; lng < 180; lng += 24) {
      const hex = latLngToCell(lat, lng, 1);
      if (weatherTagsForBirthHex(hex).includes('snow')) return hex;
    }
  }
  return undefined;
}

/**
 * The air unit, infantry, and the two airports for one weather case.
 *
 * Purpose: The candidate search needs a real walk to the home airport and an enemy city past its drop range.
 * When to use: Each weather flag and birth-hex combination.
 * Expected outcome: Infantry is one land step from `home`. `birthH3Index` is set only when the case supplies one.
 * Exceptions: None.
 */
function snowField(args: {
  readonly home: string;
  readonly far: string;
  readonly city: string;
  readonly weatherBonusEnabled: boolean;
  readonly birthH3Index?: string;
}): { readonly state: GameStateSnapshot; readonly landMass: LandMassByH3 } {
  const infantryHex = gridDisk(args.home, 1).find((hex) => hex !== args.home)!;
  const walk = [args.home, infantryHex];
  const hexIds = [...new Set([...walk, args.far, args.city])];
  const origin: UnitOrigin | undefined = args.birthH3Index
    ? {
        birthH3Index: args.birthH3Index,
        birthTacticalH3Index: null,
        birthTerrainKind: null,
        birthIsUrban: false,
        birthCountryName: null,
        birthCountryCode: null,
      }
    : undefined;
  const state = {
    ...snapshot({
      hexes: hexIds.map((h3Index) => ({ h3Index, terrain: 'land', terrainKind: 'plains' })),
      units: [
        { id: 'air-1', player: SEAT, unitType: 'air' as const, h3Index: args.home, ...(origin ? { origin } : {}) },
        { id: 'inf-a', player: SEAT, unitType: 'infantry' as const, h3Index: infantryHex },
      ],
      strategicInfrastructure: [
        { h3Index: args.home, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
        { h3Index: args.far, urbanHexCount: 0, airportCount: 1, seaportCount: 0 },
        { h3Index: args.city, urbanHexCount: 4, airportCount: 0, seaportCount: 0, fortifiedCount: 0 },
      ],
      strategicControl: [
        { h3Index: args.home, controllerPlayerId: SEAT },
        { h3Index: args.far, controllerPlayerId: SEAT },
        { h3Index: args.city, controllerPlayerId: 'human' },
      ],
    }),
    turnNumber: 1,
    startMonth: 1,
    ...(args.weatherBonusEnabled ? { weatherBonusEnabled: true as const } : {}),
  };
  const landMass: LandMassByH3 = new Map([...walk, args.city].map((h3Index) => [h3Index, landRecord(h3Index)]));
  return { state, landMass };
}

test('snow shortens a ferry to an airport the air unit is not acclimated for', () => {
  const geometry = snowFerryGeometry();
  const untaggedOn = snowField({ ...geometry, weatherBonusEnabled: true });
  const untaggedOff = snowField({ ...geometry, weatherBonusEnabled: false });
  const taggedOn = snowField({ ...geometry, weatherBonusEnabled: true, birthH3Index: geometry.snowBirth });
  assert.equal(search(untaggedOn.state, untaggedOn.landMass).some((candidate) => candidate.landingH3 === geometry.far), false);
  assert.equal(search(untaggedOff.state, untaggedOff.landMass).some((candidate) => candidate.landingH3 === geometry.far), true);
  assert.equal(search(taggedOn.state, taggedOn.landMass).some((candidate) => candidate.landingH3 === geometry.far), true);
});
