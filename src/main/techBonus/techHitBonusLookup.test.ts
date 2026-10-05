/**
 * Contracts for classifying a birth hex and stamping its hit bonus.
 *
 * Purpose: Locks the cutoff, the unloaded-cache fallback, and the Low and High amounts.
 * When to use: `node dist/main/techBonus/techHitBonusLookup.test.js` after `npm run build:main`.
 * Expected outcome: 21 urban cells are Advanced. 20, a missing hex, and an unloaded cache are Basic. The cap is not tested here.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attackHitThreshold, defenseHitThreshold } from '../combatHitThresholds';
import { createTechHitBonusLookup, withTechHitBonus } from './techHitBonusLookup';
import { techLevelForBirthHex } from './techLevelForBirthHex';

const off = { countryBonusEnabled: false, terrainBonusEnabled: false } as const;
const low = { ...off, techBonusEnabled: true as const, techBonusLevel: 'low' as const };
const high = { ...off, techBonusEnabled: true as const, techBonusLevel: 'high' as const };

test('a birth hex is Advanced at 21 urban cells and Basic at 20, and an unloaded cache stays Basic', () => {
  assert.equal(techLevelForBirthHex('hex', () => 21), 'advanced');
  assert.equal(techLevelForBirthHex('hex', () => 20), 'basic');
  assert.equal(techLevelForBirthHex('hex', () => null), 'basic');
  assert.equal(techLevelForBirthHex(null, () => 21), 'basic');
  assert.equal(techLevelForBirthHex('hex'), 'basic');
});

test('Low adds 2 attack and 0 defense for an Advanced unit, and High adds both', () => {
  const units = [{ id: 'armor-1', origin: { birthH3Index: 'hex' } }];
  const urbanHexCountAt = () => 21;
  const lowLookup = createTechHitBonusLookup({ settings: low, units, urbanHexCountAt });
  const [lowUnit] = withTechHitBonus([{ id: 'armor-1', unitType: 'armor' }], lowLookup);
  assert.equal(attackHitThreshold(lowUnit!), 12);
  assert.equal(defenseHitThreshold(lowUnit!), 7);
  assert.deepEqual(lowLookup('armor-1'), { attack: 2, defense: 0 });

  const highLookup = createTechHitBonusLookup({ settings: high, units, urbanHexCountAt });
  const [highUnit] = withTechHitBonus([{ id: 'armor-1', unitType: 'armor' }], highLookup);
  assert.equal(attackHitThreshold(highUnit!), 12);
  assert.equal(defenseHitThreshold(highUnit!), 9);

  const basic = createTechHitBonusLookup({
    settings: high,
    units: [{ id: 'armor-1', origin: { birthH3Index: 'small' } }],
    urbanHexCountAt: () => 20,
  });
  const row = { id: 'armor-1', unitType: 'armor' };
  const [unchanged] = withTechHitBonus([row], basic);
  assert.equal(unchanged, row);
  assert.equal(attackHitThreshold(unchanged!), 10);
  assert.equal(defenseHitThreshold(unchanged!), 7);
  assert.deepEqual(createTechHitBonusLookup({ settings: off, units, urbanHexCountAt })('armor-1'), { attack: 0, defense: 0 });
});
