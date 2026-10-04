/**
 * Contract tests for the hit thresholds every combat roll uses.
 * Run: `npm run build:main` then `node dist/main/combatHitThresholds.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackHitThreshold, defenseHitThreshold } from './combatHitThresholds';

test('attack threshold is the printed attack, less the weather penalty, plus the origin bonus', () => {
  assert.equal(attackHitThreshold({ unitType: 'armor' }), 10);
  assert.equal(attackHitThreshold({ unitType: 'armor', weatherAttackPenalty: 3 }), 7);
  assert.equal(attackHitThreshold({ unitType: 'armor', weatherAttackPenalty: 5 }), 5);
  assert.equal(attackHitThreshold({ unitType: 'armor', originHitBonus: 2 }), 12);
  assert.equal(attackHitThreshold({ unitType: 'armor', originHitBonus: 4 }), 14);
});

test('a High weather penalty never drops an attack below 2, and a High origin bonus never lifts a threshold past 17', () => {
  assert.equal(attackHitThreshold({ unitType: 'infantry', weatherAttackPenalty: 5 }), 2);
  assert.equal(attackHitThreshold({ unitType: 'infantry', weatherAttackPenalty: 5, originHitBonus: 4 }), 6);
  for (const unitType of ['infantry', 'armor', 'naval', 'air']) {
    assert.ok(attackHitThreshold({ unitType, weatherAttackPenalty: 5 }) >= 2, unitType);
    assert.ok(attackHitThreshold({ unitType, originHitBonus: 4 }) <= 17, unitType);
    assert.ok(defenseHitThreshold({ unitType, originHitBonus: 4 }) <= 17, unitType);
  }
});

test('target cover lowers the attack with the weather penalty, before the floor and the origin bonus', () => {
  assert.equal(attackHitThreshold({ unitType: 'armor', targetCover: 2 }), 8);
  assert.equal(attackHitThreshold({ unitType: 'armor', weatherAttackPenalty: 5, targetCover: 2 }), 3);
  assert.equal(attackHitThreshold({ unitType: 'infantry', targetCover: 2, originHitBonus: 2 }), 4);
});

test('defense threshold is the printed defense plus the origin bonus, and ignores cover', () => {
  assert.equal(defenseHitThreshold({ unitType: 'infantry', originHitBonus: 2 }), 9);
  assert.equal(defenseHitThreshold({ unitType: 'infantry', originHitBonus: 4 }), 11);
  assert.equal(defenseHitThreshold({ unitType: 'infantry', targetCover: 2 }), 7);
});
