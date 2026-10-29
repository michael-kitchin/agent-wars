/**
 * Fortification soak while assigning combat hits.
 *
 * Purpose: A fortification spends a hit before a unit is removed, and a hit with no fort removes the unit.
 * When to use: After changing `takeHitsInCasualtyOrder` or the absorb checks in ranged and melee resolution.
 * Expected outcome: The cases below. No database.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveOneMeleeEngagement,
  resolveOneRangedEngagement,
  runMeleePhase,
  runRangedPhase,
  type CombatUnit,
} from './combatResolution';
import {
  rollRangedAgainstFortifiedHex,
  runSiegeRolls,
  takeHitsInCasualtyOrder,
  type FortificationCombatHooks,
  type FortificationVictim,
} from './fortificationCombat';
import { resolveMultiSideMeleeEngagement } from './multiSideMelee';

/**
 * Accepts the first `times` hits and refuses the rest.
 *
 * Purpose: A test can spend a known number of fortifications.
 * When to use: From the cases in this file.
 * Expected outcome: The first `times` calls return true. Later calls return false.
 * Exceptions: None.
 */
function absorbFirst(times: number): (victim: FortificationVictim) => boolean {
  let left = times;
  return () => {
    if (left <= 0) return false;
    left -= 1;
    return true;
  };
}

function unit(id: string, player: string, unitType: string, h3Index: string): CombatUnit {
  return { id, player, unitType, h3Index };
}

test('hits remove every unit when nothing absorbs', () => {
  const removed = takeHitsInCasualtyOrder(
    [{ id: 'soft', player: 'human', h3Index: 'h' }, { id: 'hard', player: 'human', h3Index: 'h' }],
    2
  );
  assert.deepEqual(removed, ['soft', 'hard']);
});

test('one absorbed hit still removes both units when three hits land on two', () => {
  const removed = takeHitsInCasualtyOrder(
    [{ id: 'soft', player: 'human', h3Index: 'h' }, { id: 'hard', player: 'human', h3Index: 'h' }],
    3,
    absorbFirst(1)
  );
  assert.deepEqual(removed, ['soft', 'hard']);
});

test('two absorbed ranged hits leave only the softest defender removed', () => {
  const hex = '8928308280fffff';
  const result = resolveOneRangedEngagement(
    [
      unit('a1', 'human', 'infantry', '8928308281fffff'),
      unit('a2', 'human', 'infantry', '8928308281fffff'),
      unit('a3', 'human', 'infantry', '8928308281fffff'),
    ],
    [
      unit('air', 'opponent', 'air', hex),
      unit('infantry', 'opponent', 'infantry', hex),
    ],
    hex,
    () => 1,
    { skipReturnFire: true, absorbHit: absorbFirst(2) }
  );
  assert.deepEqual(result.defenderRemovedIds, ['air']);
  assert.deepEqual(result.attackerRemovedIds, []);
});

test('one absorbed melee hit still removes both defenders', () => {
  const hex = '8928308280fffff';
  let roll = 0;
  const result = resolveOneMeleeEngagement(
    [
      unit('a1', 'human', 'infantry', hex),
      unit('a2', 'human', 'infantry', hex),
      unit('a3', 'human', 'infantry', hex),
    ],
    [
      unit('air', 'opponent', 'air', hex),
      unit('infantry', 'opponent', 'infantry', hex),
    ],
    () => {
      roll += 1;
      return roll <= 3 ? 1 : 20;
    },
    undefined,
    absorbFirst(1)
  );
  assert.deepEqual(result.defenderRemovedIds, ['air', 'infantry']);
  assert.deepEqual(result.attackerRemovedIds, []);
});

test('one multi-side hit that a fortification absorbs removes nobody', () => {
  const hex = '8928308280fffff';
  let roll = 0;
  let absorbed = 0;
  const result = resolveMultiSideMeleeEngagement({
    sidesOrdered: ['human', 'opponent', 'neutral'],
    unitsHere: [
      unit('h', 'human', 'infantry', hex),
      unit('o', 'opponent', 'infantry', hex),
      unit('n', 'neutral', 'infantry', hex),
    ],
    rollDie: () => {
      roll += 1;
      return roll === 1 ? 1 : 20;
    },
    next: () => 0,
    absorbHit: () => {
      absorbed += 1;
      return true;
    },
  });
  assert.equal(absorbed, 1);
  assert.equal(result.removals.length, 0);
});

/**
 * Fake hooks that accept a fixed number of strips.
 *
 * Purpose: Siege and empty-hex tests can count removals without a database.
 * When to use: The cases below.
 * Expected outcome: `isEnemyFortifiedHex` is true while strips remain. `stripOne` decrements that count.
 * Exceptions: None.
 */
function fortHooks(remaining: number): FortificationCombatHooks & { strips: number } {
  let left = remaining;
  let strips = 0;
  const hooks: FortificationCombatHooks & { strips: number } = {
    strips: 0,
    absorbHit: () => false,
    isEnemyFortifiedHex: () => left > 0,
    stripOne: () => {
      if (left <= 0) return false;
      left -= 1;
      strips += 1;
      hooks.strips = strips;
      return true;
    },
  };
  return hooks;
}

test('a siege strips one fortification and stops rolling', () => {
  const hex = '8928308280fffff';
  const hooks = fortHooks(1);
  let rolls = 0;
  const hexes = runSiegeRolls({
    hexList: [hex],
    units: [unit('b', 'human', 'infantry', hex), unit('a', 'human', 'infantry', hex)],
    excludedHexes: new Set(),
    hooks,
    rollDie: () => {
      rolls += 1;
      return 1;
    },
  });
  assert.deepEqual(hexes, [hex]);
  assert.equal(hooks.strips, 1);
  assert.equal(rolls, 1);
});

test('a siege does nothing when two players share the hex or the hex already fought', () => {
  const hex = '8928308280fffff';
  const hooks = fortHooks(2);
  const shared = runSiegeRolls({
    hexList: [hex],
    units: [unit('h', 'human', 'infantry', hex), unit('o', 'opponent', 'infantry', hex)],
    excludedHexes: new Set(),
    hooks,
    rollDie: () => 1,
  });
  const excluded = runSiegeRolls({
    hexList: [hex],
    units: [unit('h', 'human', 'infantry', hex)],
    excludedHexes: new Set([hex]),
    hooks,
    rollDie: () => 1,
  });
  assert.deepEqual(shared, []);
  assert.deepEqual(excluded, []);
  assert.equal(hooks.strips, 0);
});

test('ranged fire at a fortification strips one hit and stops at zero', () => {
  const hex = '8928308280fffff';
  const hooks = fortHooks(1);
  let rolls = 0;
  const stripped = rollRangedAgainstFortifiedHex({
    attackers: [unit('a', 'human', 'armor', '8928308281fffff'), unit('b', 'human', 'armor', '8928308281fffff')],
    hex,
    hooks,
    rollDie: () => {
      rolls += 1;
      return 1;
    },
  });
  assert.equal(stripped, 1);
  assert.equal(rolls, 1);
});

test('melee between two attackers does not siege the hex', () => {
  const hex = '8928308280fffff';
  const hooks = fortHooks(3);
  runMeleePhase(
    [unit('h1', 'human', 'infantry', hex), unit('h2', 'human', 'infantry', hex), unit('o', 'opponent', 'infantry', hex)],
    [hex],
    () => 0,
    { fortification: hooks }
  );
  assert.equal(hooks.strips, 0);
});

test('ranged fire at an empty fortified hex strips one fortification', () => {
  const target = '8928308280fffff';
  const attackerHex = '8928308281fffff';
  const hooks = fortHooks(1);
  const result = runRangedPhase(
    [unit('atk', 'human', 'armor', attackerHex)],
    [target, attackerHex],
    [{ unitId: 'atk', targetH3Index: target }],
    () => 0,
    { fortification: hooks }
  );
  assert.equal(hooks.strips, 1);
  assert.ok(result.combatHexes.includes(target));
  assert.deepEqual(result.removedUnitIds, []);
});
