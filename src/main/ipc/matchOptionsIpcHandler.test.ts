/**
 * When the match options may be changed.
 *
 * Purpose: A change is allowed only while the live match is planning on the world map, so a write cannot race a turn's resolution or a battle.
 * When to use: `npm run build:main`, then `node dist/main/ipc/matchOptionsIpcHandler.test.js`.
 * Expected outcome: Each blocked state is refused without a write, a valid request is written once, and a failed write returns the fixed reason.
 * Exceptions: None. The cases use fakes and no database.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MatchOptionsUpdate } from '../../shared/ipc/matchOptionsTypes';
import { handleSetMatchOptions, type MatchOptionsDeps } from './matchOptionsIpcHandler';

/**
 * A request the validator accepts at turn 5.
 *
 * Purpose: The guard cases differ only in the match state.
 * When to use: As the payload of every case.
 * Expected outcome: Accepted whenever the match state allows a change.
 * Exceptions: None.
 */
const VALID_UPDATE: MatchOptionsUpdate = {
  victoryRule: 'most_city_hexes_at_turn_limit',
  turnLimit: 30,
  aiOnlyBattles: 'none',
  aiOnlyBeatLimit: 20,
  sightCues: true,
  originBonusLevel: 'low',
  techBonusLevel: 'off',
  terrainBonusLevel: 'off',
  weatherBonusLevel: 'high',
};

/**
 * Fake dependencies for a match planning turn 5, with the writes they receive.
 *
 * Purpose: Each case overrides only the state it is about.
 * When to use: Every case in this file.
 * Expected outcome: The deps object and the list the fake writer appends to.
 * Exceptions: None.
 */
function fakeDeps(overrides: Partial<MatchOptionsDeps> = {}): { deps: MatchOptionsDeps; writes: MatchOptionsUpdate[] } {
  const writes: MatchOptionsUpdate[] = [];
  const deps: MatchOptionsDeps = {
    matchLoaded: () => true,
    gameOver: () => false,
    phase: () => 'planning',
    readyInFlight: () => false,
    battleOpen: () => false,
    currentTurn: () => 5,
    write: (update) => {
      writes.push(update);
    },
    ...overrides,
  };
  return { deps, writes };
}

test('a valid request while planning is written once', () => {
  const { deps, writes } = fakeDeps();
  assert.deepEqual(handleSetMatchOptions(VALID_UPDATE, deps), { ok: true });
  assert.deepEqual(writes, [VALID_UPDATE]);
});

test('each blocked match state is refused without a write', () => {
  const blocked: Partial<MatchOptionsDeps>[] = [
    { matchLoaded: () => false },
    { gameOver: () => true },
    { phase: () => 'resolving' },
    { readyInFlight: () => true },
    { battleOpen: () => true },
    { currentTurn: () => 30 },
  ];
  for (const overrides of blocked) {
    const { deps, writes } = fakeDeps(overrides);
    const result = handleSetMatchOptions(VALID_UPDATE, deps);
    assert.equal(result.ok, false, JSON.stringify(Object.keys(overrides)));
    if (!result.ok) assert.ok(result.reason.endsWith('.'), result.reason);
    assert.deepEqual(writes, []);
  }
});

test('a failed write returns the fixed reason', () => {
  const { deps } = fakeDeps({
    write: () => {
      throw new Error('disk full');
    },
  });
  assert.deepEqual(handleSetMatchOptions(VALID_UPDATE, deps), { ok: false, reason: 'The settings could not be saved.' });
});
