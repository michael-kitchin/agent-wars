/**
 * Capacity and fighting rules shared by ships and air units.
 * Run: `npm run build:main` then `node dist/shared/carrierCargoRules.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIRLIFT_INFANTRY_CAPACITY, carrierAcceptsLandUnit, landUnitFightsWhileEmbarked } from './carrierCargoRules';

test('an air unit carries one infantry unit and that infantry does not fight', () => {
  assert.equal(AIRLIFT_INFANTRY_CAPACITY, 1);
  assert.equal(carrierAcceptsLandUnit('air', 'infantry', []), true);
  assert.equal(carrierAcceptsLandUnit('air', 'infantry', ['infantry']), false);
  assert.equal(carrierAcceptsLandUnit('air', 'armor', []), false);
  assert.equal(landUnitFightsWhileEmbarked('air', 'land'), false);
  assert.equal(landUnitFightsWhileEmbarked('air', 'water'), false);
});

test('a ship carries one armor unit or two infantry, and cargo fights off the water', () => {
  assert.equal(carrierAcceptsLandUnit('naval', 'armor', []), true);
  assert.equal(carrierAcceptsLandUnit('naval', 'armor', ['infantry']), false);
  assert.equal(carrierAcceptsLandUnit('naval', 'infantry', []), true);
  assert.equal(carrierAcceptsLandUnit('naval', 'infantry', ['infantry']), true);
  assert.equal(carrierAcceptsLandUnit('naval', 'infantry', ['infantry', 'infantry']), false);
  assert.equal(carrierAcceptsLandUnit('naval', 'infantry', ['armor']), false);
  assert.equal(landUnitFightsWhileEmbarked('naval', 'water'), false);
  assert.equal(landUnitFightsWhileEmbarked('naval', 'land'), true);
  assert.equal(landUnitFightsWhileEmbarked('naval', 'coastal'), true);
});
