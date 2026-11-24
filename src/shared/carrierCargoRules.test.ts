/**
 * Capacity, layout, and fighting rules shared by ships and air units.
 * Run: `npm run build:main` then `node dist/shared/carrierCargoRules.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AIRLIFT_INFANTRY_CAPACITY,
  AIR_CARGO_SLOTS,
  NAVAL_CARGO_SLOTS,
  carrierAcceptsLandUnit,
  carrierFullReason,
  landUnitFightsWhileEmbarked,
  layoutCargoSlots,
} from './carrierCargoRules';

/**
 * Whether a ship takes one more land unit.
 *
 * Purpose: Keeps the capacity cases short.
 * When to use: The ship cases below.
 * Expected outcome: The answer of `carrierAcceptsLandUnit` for a ship.
 * Exceptions: None.
 */
function shipTakes(land: string, aboard: readonly string[]): boolean {
  return carrierAcceptsLandUnit({ carrierUnitType: 'naval', landUnitType: land, aboardUnitTypes: aboard });
}

test('a ship has four slots: four infantry, two armor, or one armor and two infantry', () => {
  assert.equal(NAVAL_CARGO_SLOTS, 4);
  assert.equal(shipTakes('infantry', ['infantry', 'infantry', 'infantry']), true);
  assert.equal(shipTakes('infantry', ['infantry', 'infantry', 'infantry', 'infantry']), false);
  assert.equal(shipTakes('armor', ['armor']), true);
  assert.equal(shipTakes('armor', ['armor', 'armor']), false);
  assert.equal(shipTakes('infantry', ['armor', 'infantry']), true);
  assert.equal(shipTakes('infantry', ['armor', 'infantry', 'infantry']), false);
  assert.equal(shipTakes('armor', ['infantry', 'infantry', 'infantry']), false);
});

test('an air unit carries two infantry and no armor', () => {
  assert.equal(AIR_CARGO_SLOTS, 2);
  assert.equal(AIRLIFT_INFANTRY_CAPACITY, 2);
  const air = (land: string, aboard: readonly string[]): boolean =>
    carrierAcceptsLandUnit({ carrierUnitType: 'air', landUnitType: land, aboardUnitTypes: aboard });
  assert.equal(air('infantry', []), true);
  assert.equal(air('infantry', ['infantry']), true);
  assert.equal(air('infantry', ['infantry', 'infantry']), false);
  assert.equal(air('armor', []), false);
});

test('cargo slots are laid out armor first, and armor covers the next slot', () => {
  const naval = layoutCargoSlots({
    carrierUnitType: 'naval',
    cargo: [
      { unitId: 'inf-b', unitType: 'infantry' },
      { unitId: 'arm-x', unitType: 'armor' },
      { unitId: 'inf-a', unitType: 'infantry' },
    ],
  });
  assert.deepEqual(naval, [
    { unitId: 'arm-x', coveredByUnitId: null },
    { unitId: null, coveredByUnitId: 'arm-x' },
    { unitId: 'inf-a', coveredByUnitId: null },
    { unitId: 'inf-b', coveredByUnitId: null },
  ]);
  const air = layoutCargoSlots({
    carrierUnitType: 'air',
    cargo: [
      { unitId: 'inf-b', unitType: 'infantry' },
      { unitId: 'inf-a', unitType: 'infantry' },
    ],
  });
  assert.deepEqual(air.map((slot) => slot.unitId), ['inf-a', 'inf-b']);
  const crowded = layoutCargoSlots({
    carrierUnitType: 'air',
    cargo: ['inf-a', 'inf-b', 'inf-c'].map((unitId) => ({ unitId, unitType: 'infantry' })),
  });
  assert.deepEqual(crowded.map((slot) => slot.unitId), ['inf-a', 'inf-b']);
});

test("the full reasons name the carrier's capacity", () => {
  assert.equal(
    carrierFullReason('naval'),
    'That naval unit has no room for it. A naval unit has 4 cargo slots: infantry takes 1 and armor 2.'
  );
  assert.equal(carrierFullReason('air'), 'That air unit has no room for it. An air unit carries up to 2 infantry.');
  assert.equal(carrierFullReason('armor'), 'That unit cannot carry land units.');
});

test('embarked cargo fights only off the water, and never on air', () => {
  assert.equal(landUnitFightsWhileEmbarked('air', 'land'), false);
  assert.equal(landUnitFightsWhileEmbarked('air', 'water'), false);
  assert.equal(landUnitFightsWhileEmbarked('naval', 'water'), false);
  assert.equal(landUnitFightsWhileEmbarked('naval', 'land'), true);
  assert.equal(landUnitFightsWhileEmbarked('naval', 'coastal'), true);
});
