/**
 * Contract tests for the hit thresholds every combat roll uses.
 * Run: `npm run build:main` then `node dist/main/combatHitThresholds.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackHitThreshold, defenseHitThreshold } from './combatHitThresholds';

test('attack threshold is the printed attack, less the weather penalty, plus the origin bonus', () => {
  assert.equal(attackHitThreshold({ unitType: 'armor' }), 3);
  assert.equal(attackHitThreshold({ unitType: 'armor', weatherAttackPenalty: 1 }), 2);
  assert.equal(attackHitThreshold({ unitType: 'armor', originHitBonus: 1 }), 4);
  assert.equal(attackHitThreshold({ unitType: 'armor', originHitBonus: 2 }), 5);
});

test('a High weather penalty never drops a threshold below 1, and a High origin bonus never lifts one past 5', () => {
  assert.equal(attackHitThreshold({ unitType: 'armor', weatherAttackPenalty: 2 }), 1);
  assert.equal(attackHitThreshold({ unitType: 'armor', weatherAttackPenalty: 2, originHitBonus: 2 }), 3);
  for (const unitType of ['infantry', 'armor', 'naval', 'air']) {
    assert.ok(attackHitThreshold({ unitType, weatherAttackPenalty: 2 }) >= 1, unitType);
    assert.ok(attackHitThreshold({ unitType, originHitBonus: 2 }) <= 5, unitType);
    assert.ok(defenseHitThreshold({ unitType, originHitBonus: 2 }) <= 5, unitType);
  }
});

test('defense threshold is the printed defense plus the origin bonus', () => {
  assert.equal(defenseHitThreshold({ unitType: 'infantry', originHitBonus: 1 }), 3);
  assert.equal(defenseHitThreshold({ unitType: 'infantry', originHitBonus: 2 }), 4);
});
