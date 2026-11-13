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
import { carrierAcceptsLandUnit } from '../../shared/carrierCargoRules';
import { fillShip, liftGroundCap, rankLiftCities, shipsNeeded, type LiftCity } from './liftRules';

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
    assert.equal(carrierAcceptsLandUnit('naval', unitType, aboard), true);
    aboard.push(unitType);
  }
}

test('liftGroundCap follows the campaign share and never goes negative', () => {
  assert.equal(liftGroundCap({ groundUnitCount: 8, committedCount: 0, hasCampaignPlan: true }), 2);
  assert.equal(liftGroundCap({ groundUnitCount: 8, committedCount: 0, hasCampaignPlan: false }), 4);
  assert.equal(liftGroundCap({ groundUnitCount: 3, committedCount: 0, hasCampaignPlan: true }), 0);
  assert.equal(liftGroundCap({ groundUnitCount: 4, committedCount: 10, hasCampaignPlan: false }), 0);
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

test('fillShip prefers two infantry, then one infantry, then one armor', () => {
  const types = new Map<string, string>([
    ['inf-b', 'infantry'],
    ['inf-a', 'infantry'],
    ['inf-c', 'infantry'],
    ['arm-a', 'armor'],
    ['arm-b', 'armor'],
    ['ship-a', 'naval'],
  ]);
  const two = fillShip([
    { id: 'inf-b', unitType: 'infantry' },
    { id: 'inf-a', unitType: 'infantry' },
  ]);
  assert.deepEqual(two, ['inf-a', 'inf-b']);
  assertNavalLoad(two, types);
  const three = fillShip([
    { id: 'inf-c', unitType: 'infantry' },
    { id: 'inf-a', unitType: 'infantry' },
    { id: 'inf-b', unitType: 'infantry' },
  ]);
  assert.deepEqual(three, ['inf-a', 'inf-b']);
  assertNavalLoad(three, types);
  const armor = fillShip([{ id: 'arm-b', unitType: 'armor' }]);
  assert.deepEqual(armor, ['arm-b']);
  assertNavalLoad(armor, types);
  const infantryFirst = fillShip([
    { id: 'arm-a', unitType: 'armor' },
    { id: 'inf-b', unitType: 'infantry' },
  ]);
  assert.deepEqual(infantryFirst, ['inf-b']);
  assertNavalLoad(infantryFirst, types);
  assert.deepEqual(fillShip([{ id: 'ship-a', unitType: 'naval' }]), []);
  assert.deepEqual(fillShip([]), []);
});

test('shipsNeeded counts armor and pairs of infantry', () => {
  assert.equal(shipsNeeded(['infantry', 'infantry', 'infantry', 'armor']), 3);
  assert.equal(shipsNeeded([]), 0);
  assert.equal(shipsNeeded(['naval']), 0);
});
