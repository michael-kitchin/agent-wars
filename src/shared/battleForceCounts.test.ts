import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countBattleForces } from './battleForceCounts';
import { NEUTRAL_OWNER_ID } from './seatIds';
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

test('countBattleForces counts each side and the player share', () => {
  const subUnits = [{ player: 'human' as const }, { player: 'human' as const }, { player: 'opponent' as const }, { player: 'opponent' as const }];
  assert.deepEqual(countBattleForces(subUnits, 'opponent'), { human: 2, opponent: 2, humanShare: 0.5 });
});

test('countBattleForces counts a sub-unit carried by a ship', () => {
  const subUnits: Pick<TacticalSubUnitSnapshot, 'player' | 'embarkedOnSubUnitId'>[] = [
    { player: 'human', embarkedOnSubUnitId: null },
    { player: 'human', embarkedOnSubUnitId: 'ship-1' },
    { player: 'opponent', embarkedOnSubUnitId: null },
  ];
  assert.deepEqual(countBattleForces(subUnits, 'opponent'), { human: 2, opponent: 1, humanShare: 2 / 3 });
});

test('countBattleForces gives the whole bar to a side that is alone', () => {
  assert.deepEqual(countBattleForces([{ player: 'human' }, { player: 'human' }, { player: 'human' }], 'opponent'), { human: 3, opponent: 0, humanShare: 1 });
});

test('countBattleForces splits an empty battle evenly', () => {
  assert.deepEqual(countBattleForces([], 'opponent'), { human: 0, opponent: 0, humanShare: 0.5 });
});

test('countBattleForces counts only the named opposing party', () => {
  const subUnits = [{ player: 'human' as const }, { player: NEUTRAL_OWNER_ID }, { player: 'opponent' as const }];
  assert.deepEqual(countBattleForces(subUnits, NEUTRAL_OWNER_ID), { human: 1, opponent: 1, humanShare: 0.5 });
});
