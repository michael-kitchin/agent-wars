/**
 * Landing choice for a loaded Neutral ship.
 * Run: `node dist/main/gameActions/neutralLanding.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseNeutralLandingTarget, type LandingCandidate } from './neutralLanding';

/**
 * One candidate at a grid distance.
 *
 * Purpose: The cases below name hexes by that distance.
 * When to use: Building the candidate list.
 * Expected outcome: A landing candidate.
 * Exceptions: None.
 */
function candidate(h3Index: string, occupiedBySeat: boolean): LandingCandidate {
  return { h3Index, occupiedBySeat };
}

test('an empty landing hex beats a closer occupied one when both have routes', () => {
  const choice = chooseNeutralLandingTarget({
    shipH3: 'ship',
    candidates: [candidate('occupied', true), candidate('empty', false)],
    gridDistance: (_from, to) => (to === 'occupied' ? 1 : 4),
    navalMovesPerTurn: 2,
    sailingTurns: () => 2,
  });
  assert.equal(choice?.h3Index, 'empty');
  assert.equal(choice?.occupiedBySeat, false);
});

test('an occupied landing hex wins when no empty candidate has a route', () => {
  const choice = chooseNeutralLandingTarget({
    shipH3: 'ship',
    candidates: [candidate('empty', false), candidate('occupied', true)],
    gridDistance: () => 1,
    navalMovesPerTurn: 2,
    sailingTurns: (to) => (to === 'occupied' ? 3 : null),
  });
  assert.equal(choice?.h3Index, 'occupied');
});

test('a farther hex with a shorter route is not skipped', () => {
  const choice = chooseNeutralLandingTarget({
    shipH3: 'ship',
    candidates: [candidate('slow', false), candidate('fast', false)],
    gridDistance: (_from, to) => (to === 'slow' ? 2 : 4),
    navalMovesPerTurn: 2,
    sailingTurns: (to) => (to === 'slow' ? 5 : 2),
  });
  assert.equal(choice?.h3Index, 'fast');
});

test('no candidate is chosen when nothing has a route', () => {
  const choice = chooseNeutralLandingTarget({
    shipH3: 'ship',
    candidates: [candidate('empty', false), candidate('occupied', true)],
    gridDistance: () => 1,
    navalMovesPerTurn: 2,
    sailingTurns: () => null,
  });
  assert.equal(choice, null);
});
