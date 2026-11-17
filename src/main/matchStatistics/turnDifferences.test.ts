/**
 * Units lost and hexes taken between two turns.
 *
 * Purpose: Both numbers are differences, and they are unknown unless the previous turn is the one directly before.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/turnDifferences.test.js`.
 * Expected outcome: The cases below, on hand-built ownership.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  forgetTurnOwnershipForTests,
  hexesTakenBetween,
  rememberedTurnOwnership,
  rememberTurnOwnership,
  unitsLostBySeat,
  type TurnOwnership,
} from './turnDifferences';

const seats = ['human', 'opponent'];

/**
 * Builds a hand-made ownership value.
 *
 * Purpose: Each case needs a small turn without a database.
 * When to use: Every case.
 * Expected outcome: A `TurnOwnership` with the given maps.
 * Exceptions: None.
 */
function ownership(
  turnNumber: number,
  units: Record<string, string>,
  hexes: Record<string, string>,
  matchGeneration = 1
): TurnOwnership {
  return {
    matchGeneration,
    turnNumber,
    unitOwnerById: new Map(Object.entries(units)),
    hexControllerById: new Map(Object.entries(hexes)),
  };
}

beforeEach(() => forgetTurnOwnershipForTests());

test('a unit that vanishes or changes owner is lost by its old owner', () => {
  const previous = ownership(1, { a: 'human', b: 'human', c: 'opponent', d: 'neutral' }, {});
  const current = ownership(2, { b: 'opponent', c: 'opponent' }, {});
  const lost = unitsLostBySeat(previous, current, seats, new Set());
  assert.equal(lost?.get('human'), 2);
  assert.equal(lost?.get('opponent'), 0);
});

test('a launched missile is spent, not lost; a destroyed missile and one that changes owner are lost', () => {
  const previous = ownership(1, { missileA: 'human', missileB: 'opponent', missileC: 'opponent', infantry: 'human' }, {});
  const current = ownership(2, { missileB: 'human' }, {});
  const lost = unitsLostBySeat(previous, current, seats, new Set(['missileA']));
  assert.equal(lost?.get('human'), 1);
  assert.equal(lost?.get('opponent'), 2);
});

test('a hex that moves between seats is one hex taken, and other changes are not captures', () => {
  const previous = ownership(1, {}, { h1: 'opponent', h2: 'opponent', h3: 'neutral', h4: 'human' });
  const current = ownership(2, {}, { h1: 'human', h2: 'neutral', h3: 'human', h4: 'human' });
  assert.deepEqual(hexesTakenBetween(previous, current, seats), [{ bySeatId: 'human', fromSeatId: 'opponent', hexes: 1 }]);
});

test('a missing previous turn, another match, and a gap are unknown', () => {
  const current = ownership(3, {}, {});
  assert.equal(unitsLostBySeat(null, current, seats, new Set()), null);
  assert.equal(hexesTakenBetween(null, current, seats), null);
  assert.equal(unitsLostBySeat(ownership(2, {}, {}, 9), current, seats, new Set()), null);
  assert.equal(hexesTakenBetween(ownership(1, {}, {}), current, seats), null);
  assert.deepEqual(hexesTakenBetween(ownership(2, {}, {}), current, seats), []);
});

test('memory keeps the later entry for a turn and forgets a turn two back', () => {
  rememberTurnOwnership(ownership(2, { a: 'human' }, {}));
  rememberTurnOwnership(ownership(2, { a: 'human', b: 'human' }, {}));
  assert.equal(rememberedTurnOwnership(2, 1)?.unitOwnerById.size, 2);
  rememberTurnOwnership(ownership(3, {}, {}));
  assert.notEqual(rememberedTurnOwnership(2, 1), null);
  rememberTurnOwnership(ownership(4, {}, {}));
  assert.equal(rememberedTurnOwnership(2, 1), null);
  assert.notEqual(rememberedTurnOwnership(3, 1), null);
  rememberTurnOwnership(ownership(5, {}, {}, 2));
  assert.equal(rememberedTurnOwnership(4, 1), null);
});
