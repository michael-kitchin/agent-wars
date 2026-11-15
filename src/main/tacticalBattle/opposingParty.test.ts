/**
 * Which seats are in a tactical battle.
 *
 * Purpose: A human battle omits the lead, and an AI-only battle names both parties.
 * When to use: `npm run build:main`, then `node dist/main/tacticalBattle/opposingParty.test.js`.
 * Expected outcome: The human seat is included only in a human battle.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import { battleHasPartySeat } from './opposingParty';

test('a human battle includes the human seat and the opposing side', () => {
  const battle = { battleId: 'b1', opposingPartyId: AI_SEAT_IDS[0] };
  assert.equal(battleHasPartySeat(battle, HUMAN_SEAT_ID), true);
  assert.equal(battleHasPartySeat(battle, AI_SEAT_IDS[0]), true);
  assert.equal(battleHasPartySeat(battle, AI_SEAT_IDS[1]), false);
});

test('an AI-only battle does not include the human seat', () => {
  const battle = { battleId: 'b2', leadPartyId: AI_SEAT_IDS[0], opposingPartyId: AI_SEAT_IDS[1] };
  assert.equal(battleHasPartySeat(battle, HUMAN_SEAT_ID), false);
  assert.equal(battleHasPartySeat(battle, AI_SEAT_IDS[0]), true);
  assert.equal(battleHasPartySeat(battle, AI_SEAT_IDS[1]), true);
});
