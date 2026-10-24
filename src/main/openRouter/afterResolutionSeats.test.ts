/**
 * Post-resolution consultation gates for one seat among several.
 * Run: `node dist/main/openRouter/afterResolutionSeats.test.js`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GameStateSnapshot } from '../gameDb';
import {
  computePostResolutionConsultTriggers,
  enemyHadStrategicResolutionObservableActions,
  seatHadStrategicResolutionUnitActions,
} from './consultationPolicy';

const state = { units: [], turnNumber: 1 } as unknown as GameStateSnapshot;

/**
 * Only the seat that fought is treated as having acted.
 *
 * Purpose: An idle commander is replaced on its own; a neighbor that fought does not clear that idle gate.
 * When to use: After the per-seat resolution maps change.
 * Expected outcome: `'opponent'` is not idle. `'opponent2'` is idle and that alone asks for a consultation.
 * Exceptions: None.
 */
test('only the seat that fought leaves the idle gate', () => {
  const resolution = {
    hadStrategicMarchResolutionBySeat: { opponent: true },
    combatParticipantUnitIdsBySeat: { opponent: ['a1-i1'] },
  };
  const opponentIdle = !seatHadStrategicResolutionUnitActions(resolution, 'opponent');
  const secondIdle = !seatHadStrategicResolutionUnitActions(resolution, 'opponent2');
  assert.equal(opponentIdle, false);
  assert.equal(secondIdle, true);
  assert.equal(
    computePostResolutionConsultTriggers({
      mandatoryCount: 0,
      subscriptionCount: 0,
      seatIdle: opponentIdle,
      enemyObservable: false,
    }).shouldConsult,
    false
  );
  const second = computePostResolutionConsultTriggers({
    mandatoryCount: 0,
    subscriptionCount: 0,
    seatIdle: secondIdle,
    enemyObservable: false,
  });
  assert.equal(second.shouldConsult, true);
  assert.equal(second.policyOnlyConsult, true);
});

/**
 * Neutral fire is not an enemy action for the victim's commander.
 *
 * Purpose: Neutral garrisons fire every turn, and that must not force a consultation.
 * When to use: After enemy-observable detection starts ignoring non-seat killers.
 * Expected outcome: A neutral killer is quiet. A human killer is observable.
 * Exceptions: None.
 */
test('neutral fire does not make another seat observable', () => {
  assert.equal(
    enemyHadStrategicResolutionObservableActions(
      { killsByDirectFire: [{ victimId: 'a2-i1', killerIds: ['neutral-garrison-1'] }] },
      state,
      'opponent2'
    ),
    false
  );
  assert.equal(
    enemyHadStrategicResolutionObservableActions(
      { killsByDirectFire: [{ victimId: 'a2-i1', killerIds: ['h1-i1'] }] },
      state,
      'opponent2'
    ),
    true
  );
});
