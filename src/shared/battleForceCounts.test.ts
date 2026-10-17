import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countBattleForces } from './battleForceCounts';
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

test('countBattleForces counts each side and the player share', () => {
  const subUnits = [{ player: 'human' as const }, { player: 'human' as const }, { player: 'opponent' as const }, { player: 'opponent' as const }];
  assert.deepEqual(countBattleForces(subUnits), { human: 2, opponent: 2, humanShare: 0.5 });
});

test('countBattleForces counts a sub-unit carried by a ship', () => {
  const subUnits: Pick<TacticalSubUnitSnapshot, 'player' | 'embarkedOnSubUnitId'>[] = [
    { player: 'human', embarkedOnSubUnitId: null },
    { player: 'human', embarkedOnSubUnitId: 'ship-1' },
    { player: 'opponent', embarkedOnSubUnitId: null },
  ];
  assert.deepEqual(countBattleForces(subUnits), { human: 2, opponent: 1, humanShare: 2 / 3 });
});

test('countBattleForces gives the whole bar to a side that is alone', () => {
  assert.deepEqual(countBattleForces([{ player: 'human' }, { player: 'human' }, { player: 'human' }]), { human: 3, opponent: 0, humanShare: 1 });
});

test('countBattleForces splits an empty battle evenly', () => {
  assert.deepEqual(countBattleForces([]), { human: 0, opponent: 0, humanShare: 0.5 });
});
