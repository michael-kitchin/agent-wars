/**
 * Contracts for the pure lift limits.
 *
 * Purpose: The cap, the city order, the ship load, and the ship count must stay stable for later callers.
 * When to use: After changes to `liftRules`.
 * Expected outcome: Process exit 0. Each chosen load is also a legal naval load.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridDisk, latLngToCell } from 'h3-js';
import { carrierAcceptsLandUnit } from '../../shared/carrierCargoRules';
import type { GameStateSnapshot } from '../gameDb';
import { countObjectiveReinforcers, fillShip, liftGroundCap, liftProtectedUnitIds, rankLiftCities, shipsNeeded, type LiftCity } from './liftRules';

/**
 * Checks that boarding the returned ids one at a time is legal for a ship.
 *
 * Purpose: The load must match the shared carrier rule, not a second copy of the numbers.
 * When to use: After `fillShip`.
 * Expected outcome: Each id is accepted given the types already aboard.
 * Exceptions: Throws when an id is missing from `types`.
 */
function assertNavalLoad(ids: readonly string[], types: ReadonlyMap<string, string>): void {
  const aboard: string[] = [];
  for (const id of ids) {
    const unitType = types.get(id);
    assert.ok(unitType, id);
    assert.equal(carrierAcceptsLandUnit({ carrierUnitType: 'naval', landUnitType: unitType, aboardUnitTypes: aboard }), true);
    aboard.push(unitType);
  }
}

test('liftGroundCap follows the campaign share and never goes negative', () => {
  assert.equal(liftGroundCap({ groundUnitCount: 8, committedCount: 0, hasCampaignPlan: true }), 2);
  assert.equal(liftGroundCap({ groundUnitCount: 8, committedCount: 0, hasCampaignPlan: false }), 4);
  assert.equal(liftGroundCap({ groundUnitCount: 3, committedCount: 0, hasCampaignPlan: true }), 0);
  assert.equal(liftGroundCap({ groundUnitCount: 4, committedCount: 10, hasCampaignPlan: false }), 0);
  assert.equal(liftGroundCap({ groundUnitCount: 8, committedCount: 0, hasCampaignPlan: true, campaignShare: 0.5 }), 4);
  assert.equal(liftGroundCap({ groundUnitCount: 8, committedCount: 0, hasCampaignPlan: false, campaignShare: 0.25 }), 4);
});

test('rankLiftCities orders by size then hex id and does not change the input', () => {
  const large: LiftCity = { h3Index: 'm', urbanHexCount: 9, inEnemyHome: false, knownFortifiedCount: 0 };
  const lowId: LiftCity = { h3Index: 'a', urbanHexCount: 4, inEnemyHome: true, knownFortifiedCount: 3 };
  const highId: LiftCity = { h3Index: 'b', urbanHexCount: 4, inEnemyHome: false, knownFortifiedCount: 0 };
  const input = [highId, large, lowId];
  assert.deepEqual(
    rankLiftCities(input).map((city) => city.h3Index),
    ['m', 'a', 'b']
  );
  assert.deepEqual(input.map((city) => city.h3Index), ['b', 'm', 'a']);
});

test('fillShip loads armor first, then infantry, up to four slots', () => {
  const types = new Map<string, string>([
    ['inf-b', 'infantry'],
    ['inf-a', 'infantry'],
    ['inf-c', 'infantry'],
    ['inf-d', 'infantry'],
    ['inf-e', 'infantry'],
    ['arm-a', 'armor'],
    ['arm-b', 'armor'],
    ['arm-c', 'armor'],
    ['ship-a', 'naval'],
  ]);
  const candidates = (ids: readonly string[]): { id: string; unitType: string }[] =>
    ids.map((id) => ({ id, unitType: types.get(id) ?? '' }));
  const five = fillShip(candidates(['inf-e', 'inf-c', 'inf-a', 'inf-d', 'inf-b']));
  assert.deepEqual(five, ['inf-a', 'inf-b', 'inf-c', 'inf-d']);
  assertNavalLoad(five, types);
  const twoArmor = fillShip(candidates(['arm-c', 'arm-a', 'arm-b', 'inf-a']));
  assert.deepEqual(twoArmor, ['arm-a', 'arm-b']);
  assertNavalLoad(twoArmor, types);
  const mixed = fillShip(candidates(['inf-c', 'arm-b', 'inf-a', 'inf-b']));
  assert.deepEqual(mixed, ['arm-b', 'inf-a', 'inf-b']);
  assertNavalLoad(mixed, types);
  const armorOnly = fillShip(candidates(['arm-b']));
  assert.deepEqual(armorOnly, ['arm-b']);
  assert.deepEqual(fillShip([{ id: 'ship-a', unitType: 'naval' }]), []);
  assert.deepEqual(fillShip([]), []);
});

test('shipsNeeded counts four slots to a ship', () => {
  assert.equal(shipsNeeded(['infantry', 'infantry', 'infantry', 'armor']), 2);
  assert.equal(shipsNeeded([]), 0);
  assert.equal(shipsNeeded(['naval']), 0);
  assert.equal(shipsNeeded(['infantry', 'infantry', 'infantry', 'infantry']), 1);
  assert.equal(shipsNeeded(['armor', 'armor', 'armor']), 2);
});

test('repeated fillShip uses exactly the ships shipsNeeded counts', () => {
  const mixes: readonly (readonly string[])[] = [
    ['infantry', 'infantry', 'infantry', 'infantry', 'infantry'],
    ['armor', 'armor', 'armor'],
    ['armor', 'infantry', 'infantry', 'infantry'],
    ['armor', 'armor', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry'],
    ['infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'armor'],
    ['armor', 'infantry', 'armor', 'infantry', 'armor', 'infantry', 'infantry'],
    ['infantry'],
  ];
  for (const mix of mixes) {
    let waiting = mix.map((unitType, index) => ({ id: `u${String(index).padStart(2, '0')}`, unitType }));
    let ships = 0;
    while (waiting.length > 0) {
      const chosen = new Set(fillShip(waiting));
      assert.ok(chosen.size > 0, 'a ship takes at least one unit while any waits');
      waiting = waiting.filter((unit) => !chosen.has(unit.id));
      ships += 1;
    }
    assert.equal(ships, shipsNeeded(mix), mix.join(','));
  }
});

/**
 * Picks an unused hex at an exact grid distance from `origin`.
 *
 * Purpose: The reinforcer count depends on distance, not on a particular hex id.
 * When to use: Once per fixture unit.
 * Expected outcome: A hex in the disk of `distance` that is outside the next-smaller disk.
 * Exceptions: Throws when the disk has no unused hex.
 */
function hexAtDistance(origin: string, distance: number, used: Set<string>): string {
  const closer = new Set(distance === 0 ? [] : gridDisk(origin, distance - 1));
  const hex = gridDisk(origin, distance).find((cell) => !closer.has(cell) && !used.has(cell));
  if (!hex) throw new Error(`no hex at distance ${distance}`);
  used.add(hex);
  return hex;
}

test('countObjectiveReinforcers counts one enemy land unit inside eta and outside the clear radius', () => {
  const city = latLngToCell(0, 0, 1);
  const used = new Set<string>([city]);
  const state = {
    units: [
      { id: 'inf-eta', player: 'ai2', unitType: 'infantry', h3Index: hexAtDistance(city, 3, used) },
      { id: 'naval-eta', player: 'ai2', unitType: 'naval', h3Index: hexAtDistance(city, 3, used) },
      { id: 'arm-own', player: 'ai1', unitType: 'armor', h3Index: hexAtDistance(city, 3, used) },
      { id: 'arm-near', player: 'ai2', unitType: 'armor', h3Index: hexAtDistance(city, 1, used) },
      { id: 'inf-far', player: 'ai2', unitType: 'infantry', h3Index: hexAtDistance(city, 5, used) },
    ],
  } as unknown as GameStateSnapshot;
  assert.equal(countObjectiveReinforcers({ state, seatId: 'ai1', cityH3: city, etaTurns: 3 }), 1);
});

test('liftProtectedUnitIds protects units beside an enemy, withheld units, and defenders', () => {
  const enemyHex = latLngToCell(0, 0, 1);
  const used = new Set<string>([enemyHex]);
  const state = {
    units: [
      { id: 'inf-beside', player: 'ai1', unitType: 'infantry', h3Index: hexAtDistance(enemyHex, 1, used) },
      { id: 'inf-two-away', player: 'ai1', unitType: 'infantry', h3Index: hexAtDistance(enemyHex, 2, used) },
      { id: 'inf-withheld', player: 'ai1', unitType: 'infantry', h3Index: hexAtDistance(enemyHex, 3, used) },
      { id: 'inf-defender', player: 'ai1', unitType: 'infantry', h3Index: hexAtDistance(enemyHex, 4, used) },
      { id: 'enemy', player: 'ai2', unitType: 'infantry', h3Index: enemyHex },
    ],
  } as unknown as GameStateSnapshot;
  const enemyUnitsWithin = (h3Index: string, radius: number): number =>
    state.units.filter((unit) => unit.player === 'ai2' && gridDisk(h3Index, radius).includes(unit.h3Index)).length;
  const protectedIds = liftProtectedUnitIds({
    state,
    seatId: 'ai1',
    terrain: { enemyUnitsWithin },
    defenderUnitIds: ['inf-defender'],
    withheldIds: new Set(['inf-withheld']),
  });
  assert.deepEqual([...protectedIds].sort(), ['inf-beside', 'inf-defender', 'inf-withheld']);
});
