/**
 * Fortification soak inside a combat estimate.
 *
 * Purpose: Hits land before losses, and an unexplored hex contributes no soak.
 * When to use: After changing `computeEngagementPrediction` or `defenderFortificationSoak`.
 * Expected outcome: Two sure hits against one defender and a soak of 2 remove no unit. A hidden hex soaks 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../../shared/ipc/gameStateTypes';
import { computeEngagementPrediction } from './combatEstimation';
import { defenderFortificationSoak } from './combatEstimationFortification';

test('a soak of 2 absorbs two sure hits against one defender', () => {
  const prediction = computeEngagementPrediction([1, 1], [], 2, 1, 2);
  assert.equal(prediction.defenderLossesExpected, 0);
  assert.equal(prediction.attackerHitsExpected, 1);
  assert.equal(prediction.probabilityDefenderEliminated, 0);
});

test('an unexplored hex soaks nothing', () => {
  const state = {
    exploredHexes: ['known'],
    strategicControl: [{ h3Index: 'hidden', controllerPlayerId: 'opponent' }],
    strategicInfrastructure: [{
      h3Index: 'hidden',
      urbanHexCount: 1,
      airportCount: 0,
      seaportCount: 0,
      fortifiedCount: 3,
      fortifiableCount: 0,
    }],
  } as GameStateSnapshot;
  assert.equal(defenderFortificationSoak({ state, defendingH3Index: 'hidden', defendingPlayer: 'opponent' }), 0);
});
