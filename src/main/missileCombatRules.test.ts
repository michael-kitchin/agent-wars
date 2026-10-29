/**
 * Missile combat contracts: casualty order, skipped melee rolls, and zero hit thresholds.
 *
 * Purpose: A missile is removed last and never draws a die, even when its printed defense is 0.
 * When to use: After changing `compareCasualtyOrder`, melee roll skips, or the missile hit thresholds.
 * Expected outcome: Air is lost before a missile, a melee records no missile roll, and both thresholds stay 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCasualtyOrder } from './combatConstants';
import { resolveOneMeleeEngagement } from './combatResolution';
import { attackHitThreshold, defenseHitThreshold } from './combatHitThresholds';
import type { CombatUnit } from './combatUnitTypes';

/**
 * Builds one combat unit for a melee fixture.
 *
 * Purpose: The engagement only needs identity, side, type, and hex.
 * When to use: The melee test in this file.
 * Expected outcome: A `CombatUnit` with those four fields.
 * Exceptions: None.
 */
function combatUnit(id: string, player: string, unitType: string): CombatUnit {
  return { id, player, unitType, h3Index: 'hex' };
}

test('a missile sorts after every other unit and air sorts first', () => {
  const ordered = ['missile', 'air', 'infantry', 'naval', 'armor'].sort(compareCasualtyOrder);
  assert.equal(ordered[0], 'air');
  assert.equal(ordered[ordered.length - 1], 'missile');
  assert.deepEqual(ordered, ['air', 'infantry', 'armor', 'naval', 'missile']);
});

test('melee skips a missile roll and removes the other defender first', () => {
  const rolls: string[] = [];
  const result = resolveOneMeleeEngagement(
    [combatUnit('attacker', 'human', 'infantry')],
    [combatUnit('missile', 'opponent', 'missile'), combatUnit('infantry', 'opponent', 'infantry')],
    () => 1,
    (roll) => {
      rolls.push(roll.unitType ?? '');
    }
  );
  assert.deepEqual(rolls, ['infantry', 'infantry']);
  assert.deepEqual(result.defenderRemovedIds, ['infantry']);
});

test('a missile hit threshold stays 0 when an origin bonus is present', () => {
  const unit = { unitType: 'missile', originHitBonus: 4 as const };
  assert.equal(attackHitThreshold(unit), 0);
  assert.equal(defenseHitThreshold(unit), 0);
});
