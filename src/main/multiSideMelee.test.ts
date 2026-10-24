import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COMBAT_DIE_SIDES } from './combatDice';
import { runMeleePhase, type CombatUnit } from './combatResolution';
import { resolveMultiSideMeleeEngagement } from './multiSideMelee';
import type { CombatDiceRoll } from '../shared/ipc/combatDiceTypes';

/**
 * A unit standing in one hex.
 *
 * Purpose: Melee tests build combatants without a database.
 * When to use: Each scripted engagement in this file.
 * Expected outcome: A `CombatUnit` with the given id, owner, and type.
 * Exceptions: None.
 */
function unit(id: string, player: string, unitType = 'infantry'): CombatUnit {
  return { id, player, unitType, h3Index: 'hex' };
}

/**
 * Returns scripted numbers, then repeats the last one.
 *
 * Purpose: Dice and side picks need a fixed sequence.
 * When to use: `rollDie` and `next` stubs.
 * Expected outcome: Each call returns the next value.
 * Exceptions: None. An empty list returns 0.
 */
function scripted(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[Math.min(index, Math.max(values.length - 1, 0))] ?? 0;
    index += 1;
    return value;
  };
}

test('attacker hits land on the first side and that side hits back', () => {
  const units = [unit('a1', 'A'), unit('a2', 'A'), unit('b1', 'B'), unit('b2', 'B'), unit('c1', 'C'), unit('c2', 'C')];
  const result = resolveMultiSideMeleeEngagement({
    sidesOrdered: ['A', 'B', 'C'],
    unitsHere: units,
    rollDie: scripted([1, 1, 1, 20, 20, 20]),
    next: scripted([0]),
  });
  assert.deepEqual(result.removals.map((removal) => removal.victim.id), ['b1', 'b2', 'a1']);
  assert.deepEqual(result.removals.map((removal) => removal.victim.player), ['B', 'B', 'A']);
  assert.equal(result.removals.some((removal) => removal.victim.player === 'C'), false);
  assert.deepEqual(result.removals[0]?.killerIds, ['a1', 'a2']);
  assert.deepEqual(result.removals[2]?.killerIds, ['b1', 'b2']);
});

test('a hit is weighted by how many units each other side has left', () => {
  const units = [unit('a1', 'A'), unit('b1', 'B'), unit('c1', 'C'), unit('c2', 'C'), unit('c3', 'C')];
  const result = resolveMultiSideMeleeEngagement({
    sidesOrdered: ['A', 'B', 'C'],
    unitsHere: units,
    rollDie: scripted([1, 20, 20, 20, 20]),
    next: scripted([0.5]),
  });
  assert.deepEqual(result.removals.map((removal) => removal.victim.id), ['c1']);
});

test('hits left after every enemy unit is gone are lost', () => {
  const units = [unit('a1', 'A'), unit('a2', 'A'), unit('a3', 'A'), unit('b1', 'B'), unit('c1', 'C')];
  const result = resolveMultiSideMeleeEngagement({
    sidesOrdered: ['A', 'B', 'C'],
    unitsHere: units,
    rollDie: scripted([1, 1, 1, 20, 20]),
    next: scripted([0]),
  });
  assert.deepEqual(result.removals.map((removal) => removal.victim.id), ['b1', 'c1']);
});

test('every unit rolls even when it is removed later', () => {
  const recorded: CombatDiceRoll[] = [];
  const units = [unit('a1', 'A'), unit('a2', 'A'), unit('b1', 'B'), unit('b2', 'B'), unit('c1', 'C'), unit('c2', 'C')];
  resolveMultiSideMeleeEngagement({
    sidesOrdered: ['A', 'B', 'C'],
    unitsHere: units,
    rollDie: scripted([1, 1, 1, 20, 20, 20]),
    next: scripted([0]),
    onRoll: (roll) => recorded.push(roll),
  });
  assert.equal(recorded.length, units.length);
  assert.deepEqual(recorded.map((roll) => roll.kind), [
    'meleeAttack', 'meleeAttack', 'meleeDefense', 'meleeDefense', 'meleeDefense', 'meleeDefense',
  ]);
});

test('two-sided melee keeps its removals and dice log', () => {
  const hex = '891f1d48b8fffff';
  const face = 9;
  const melee = runMeleePhase(
    [
      { id: 'h1', player: 'human', unitType: 'infantry', h3Index: hex },
      { id: 'o1', player: 'opponent', unitType: 'infantry', h3Index: hex },
    ],
    [hex],
    () => (face - 0.5) / COMBAT_DIE_SIDES
  );
  assert.deepEqual(melee.removedUnitIds, []);
  assert.deepEqual(
    (melee.diceRolls ?? []).map((roll) => [roll.kind, roll.player, roll.face, roll.anchorH3Index]),
    [
      ['meleeAttack', 'opponent', face, hex],
      ['meleeDefense', 'human', face, hex],
    ]
  );
});
