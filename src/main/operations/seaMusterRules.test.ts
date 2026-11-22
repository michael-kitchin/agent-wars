/**
 * Contracts for the sea muster readiness rule.
 *
 * Purpose: A muster must wait for the ships its troops need and must keep its timeout minimum.
 * When to use: After changes to `seaMusterRules`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seaMusterReady, type SeaMusterReadyArgs } from './seaMusterRules';

/**
 * Builds readiness inputs with a complete, ship-ready muster as the default.
 *
 * Purpose: Each case states only the counts that differ.
 * When to use: At the start of a case.
 * Expected outcome: Two infantry present and remaining, one ship present and remaining, not timed out, minimum of two.
 * Exceptions: None.
 */
function args(patch: Partial<SeaMusterReadyArgs> = {}): SeaMusterReadyArgs {
  return {
    presentUnitTypes: ['infantry', 'infantry'],
    remainingUnitCount: 2,
    shipsPresentCount: 1,
    remainingShipCount: 1,
    timedOut: false,
    minUnitsAtTimeout: 2,
    ...patch,
  };
}

test('no ship at the port is never ready', () => {
  assert.equal(seaMusterReady(args({ shipsPresentCount: 0 })), false);
  assert.equal(seaMusterReady(args({ shipsPresentCount: 0, timedOut: true })), false);
});

test('a muster waits while a needed ship is still away', () => {
  const six = Array.from({ length: 6 }, () => 'infantry');
  assert.equal(seaMusterReady(args({ presentUnitTypes: six, remainingUnitCount: 6, shipsPresentCount: 1, remainingShipCount: 3 })), false);
});

test('a muster is ready once every troop and every needed ship is at the port', () => {
  const six = Array.from({ length: 6 }, () => 'infantry');
  assert.equal(seaMusterReady(args({ presentUnitTypes: six, remainingUnitCount: 6, shipsPresentCount: 3, remainingShipCount: 3 })), true);
});

test('a muster waits only for the ships that remain', () => {
  const four = ['armor', 'armor', 'armor', 'armor'];
  assert.equal(seaMusterReady(args({ presentUnitTypes: four, remainingUnitCount: 4, shipsPresentCount: 2, remainingShipCount: 2 })), true);
});

test('a muster waits for a troop that has not arrived', () => {
  assert.equal(seaMusterReady(args({ remainingUnitCount: 3 })), false);
});

test('a timed-out muster sails with the minimum troops', () => {
  assert.equal(seaMusterReady(args({ remainingUnitCount: 6, remainingShipCount: 3, timedOut: true })), true);
});

test('a timed-out muster below the minimum is not ready', () => {
  assert.equal(seaMusterReady(args({ presentUnitTypes: ['infantry'], remainingUnitCount: 4, remainingShipCount: 2, timedOut: true })), false);
  assert.equal(
    seaMusterReady(args({ presentUnitTypes: ['infantry', 'infantry', 'infantry'], remainingUnitCount: 6, timedOut: true, minUnitsAtTimeout: 4 })),
    false,
  );
});

test('a timed-out campaign lift counts only the troops its present ships can carry', () => {
  const six = Array.from({ length: 6 }, () => 'infantry');
  const timedOut = { presentUnitTypes: six, remainingUnitCount: 6, shipsPresentCount: 1, remainingShipCount: 3, timedOut: true, minUnitsAtTimeout: 6 };
  assert.equal(seaMusterReady(args({ ...timedOut, campaignLift: true })), false);
  assert.equal(seaMusterReady(args({ ...timedOut, campaignLift: false })), true);
  assert.equal(seaMusterReady(args({ ...timedOut, shipsPresentCount: 3, campaignLift: true })), true);
});
