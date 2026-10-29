/**
 * Which battle cells a mover may enter when another side fortified them.
 *
 * Purpose: March, hover, and ferry share one block, and the mover's own cell stays reachable.
 * When to use: After changing `isCellBlockedByFortification` or `tacticalMarchSetForMover`.
 * Expected outcome: The owner walks through. Another side does not. The origin stays in the set. No record is the full footprint.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from './seatIds';
import { isCellBlockedByFortification, tacticalMarchSetForMover } from './tacticalFortificationMovement';

const footprint = ['origin', 'fort', 'open'] as const;

test('the owner is not blocked and another side is', () => {
  const battle = { tacticalFortificationOwnerByH3: { fort: HUMAN_SEAT_ID } };
  assert.equal(isCellBlockedByFortification(battle, 'fort', HUMAN_SEAT_ID), false);
  assert.equal(isCellBlockedByFortification(battle, 'fort', AI_SEAT_IDS[0]), true);
  assert.equal(isCellBlockedByFortification(battle, 'open', AI_SEAT_IDS[0]), false);
});

test('the march set keeps the origin and drops another side\'s fortification', () => {
  const battle = {
    tacticalChildH3Indexes: [...footprint],
    tacticalFortificationOwnerByH3: { fort: HUMAN_SEAT_ID, origin: HUMAN_SEAT_ID },
  };
  const owner = tacticalMarchSetForMover({ battle, moverPlayer: HUMAN_SEAT_ID, originH3: 'origin' });
  assert.deepEqual([...owner].sort(), ['fort', 'open', 'origin']);
  const attacker = tacticalMarchSetForMover({ battle, moverPlayer: AI_SEAT_IDS[0], originH3: 'fort' });
  assert.equal(attacker.has('fort'), true);
  assert.equal(attacker.has('origin'), false);
  assert.equal(attacker.has('open'), true);
});

test('no owner record is the full footprint', () => {
  const battle = { tacticalChildH3Indexes: [...footprint] };
  const set = tacticalMarchSetForMover({ battle, moverPlayer: AI_SEAT_IDS[0] });
  assert.deepEqual([...set].sort(), [...footprint].sort());
});
