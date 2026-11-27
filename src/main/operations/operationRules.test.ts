/**
 * Which sea and air rows the engine may launch on its own.
 *
 * Purpose: The engine must keep its defender limit and must not attack a pact partner without the commander.
 * When to use: `npm run build:main`, then `node dist/main/operations/operationRules.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS } from '../../shared/seatIds';
import { engineMayLaunchOperation } from './operationRules';

const PARTNER = AI_SEAT_IDS[1];

/**
 * The rule with a limit of two defenders and one pact partner.
 *
 * Purpose: The cases vary only the row and the holder of its city.
 * When to use: Every case below.
 * Expected outcome: The result of `engineMayLaunchOperation`.
 * Exceptions: None.
 */
function mayLaunch(clear: boolean, defenders: number, objectiveHolderSeatId: string | null): boolean {
  return engineMayLaunchOperation({
    candidate: { clear, defenders },
    maxDefenders: 2,
    objectiveHolderSeatId,
    pactPartnerSeatIds: new Set([PARTNER]),
  });
}

test('a clear row launches', () => {
  assert.equal(mayLaunch(true, 9, AI_SEAT_IDS[2]), true);
});

test('a held row launches only at or under the defender limit', () => {
  assert.equal(mayLaunch(false, 2, AI_SEAT_IDS[2]), true);
  assert.equal(mayLaunch(false, 3, AI_SEAT_IDS[2]), false);
});

test('a row against a pact partner city does not launch, even when clear', () => {
  assert.equal(mayLaunch(true, 0, PARTNER), false);
  assert.equal(mayLaunch(false, 1, PARTNER), false);
});

test('a city with no holder is treated as no pact', () => {
  assert.equal(mayLaunch(true, 0, null), true);
});
