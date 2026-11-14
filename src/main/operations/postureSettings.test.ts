/**
 * The default posture matches the constants it replaces, and every menu order names each method once.
 * Run with: node dist/main/operations/postureSettings.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OPERATION_CHOICE_METHODS } from '../../shared/operationTypes';
import { POSTURES, POSTURE_SETTINGS } from '../../shared/postureTypes';
import { LIFT_MAX_GROUND_SHARE } from './liftRules';
import { NAVAL_PRIORITY_CAP_SHARE } from '../openRouter/productionPriorities';

test('overland matches the constants a seat uses when it has no posture', () => {
  const overland = POSTURE_SETTINGS.overland;
  assert.equal(overland.liftGroundShare, LIFT_MAX_GROUND_SHARE);
  assert.equal(overland.navalPriorityCapShare, NAVAL_PRIORITY_CAP_SHARE);
  assert.equal(overland.creditsCityUrbanFactor, 1);
  assert.equal(overland.airOperationSlotFactor, 1);
  assert.equal(overland.campaignAssaultFactor, 1);
  assert.equal(overland.engineLaunchMaxDefenders, 0);
  assert.equal(overland.missilePriorityEveryCity, false);
  assert.deepEqual(overland.menuMethodOrder, ['land', 'sea', 'air']);
});

test('every posture orders land, sea, and air once each', () => {
  for (const posture of POSTURES) {
    const order = [...POSTURE_SETTINGS[posture].menuMethodOrder].sort();
    assert.deepEqual(order, [...OPERATION_CHOICE_METHODS].sort(), posture);
  }
});
