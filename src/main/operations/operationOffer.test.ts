/**
 * The one-turn window for an undefended landing.
 *
 * Purpose: The engine must wait a turn after showing an undefended row, and must not start that wait from a defended menu.
 * When to use: After changes to `decideOperationOffer`.
 * Expected outcome: Process exit 0.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideOperationOffer, EMPTY_OPERATION_OFFER, type OperationOfferState } from './operationOffer';

/**
 * Runs one decision and returns it.
 *
 * Purpose: The cases share the turn number and the flags they vary.
 * When to use: Each case below.
 * Expected outcome: The decision for those flags.
 * Exceptions: None.
 */
function decide(args: {
  readonly hasCandidate: boolean;
  readonly hasClear: boolean;
  readonly offer?: OperationOfferState;
  readonly turnNumber?: number;
}) {
  return decideOperationOffer({
    turnNumber: args.turnNumber ?? 5,
    hasCandidate: args.hasCandidate,
    hasClear: args.hasClear,
    offer: args.offer ?? EMPTY_OPERATION_OFFER,
  });
}

test('no candidate clears the offer and does not launch', () => {
  const decision = decide({
    hasCandidate: false,
    hasClear: false,
    offer: { announcedTurn: 3, clearOfferTurn: 4 },
  });
  assert.equal(decision.launch, false);
  assert.equal(decision.consult, false);
  assert.deepEqual(decision.offer, EMPTY_OPERATION_OFFER);
});

test('a defended menu consults once and never starts the launch clock', () => {
  const first = decide({ hasCandidate: true, hasClear: false });
  assert.equal(first.launch, false);
  assert.equal(first.consult, true);
  assert.deepEqual(first.offer, { announcedTurn: 5, clearOfferTurn: null });
  const again = decide({
    hasCandidate: true,
    hasClear: false,
    offer: first.offer,
    turnNumber: 6,
  });
  assert.equal(again.launch, false);
  assert.equal(again.consult, false);
  assert.deepEqual(again.offer, { announcedTurn: 5, clearOfferTurn: null });
});

test('an undefended row waits one turn, then launches once', () => {
  const opened = decide({ hasCandidate: true, hasClear: true });
  assert.equal(opened.launch, false);
  assert.equal(opened.consult, true);
  assert.deepEqual(opened.offer, { announcedTurn: 5, clearOfferTurn: 5 });
  const held = decide({ hasCandidate: true, hasClear: true, offer: opened.offer, turnNumber: 5 });
  assert.equal(held.launch, false);
  assert.equal(held.consult, false);
  const due = decide({ hasCandidate: true, hasClear: true, offer: opened.offer, turnNumber: 6 });
  assert.equal(due.launch, true);
  assert.equal(due.consult, false);
  assert.deepEqual(due.offer, { announcedTurn: 5, clearOfferTurn: null });
});

test('a gap with no undefended row clears the launch clock', () => {
  const decision = decide({
    hasCandidate: true,
    hasClear: false,
    offer: { announcedTurn: 4, clearOfferTurn: 4 },
    turnNumber: 6,
  });
  assert.equal(decision.launch, false);
  assert.deepEqual(decision.offer, { announcedTurn: 4, clearOfferTurn: null });
});
