/**
 * Pact partner contracts for campaign targeting.
 * Run with: node dist/main/openRouter/campaignPactPartners.test.js
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SideAgreementRow } from '../gameDb/sideAgreementStore';
import { pactPartnerSeatIdsFrom } from './campaignPactPartners';

/**
 * Builds one agreement row from the commander `a1` with the counterpart `a2`.
 *
 * Purpose: Each case changes only the fields that decide whether the row is a pact.
 * When to use: Every case below.
 * Expected outcome: An active non-aggression row ending on turn 20.
 * Exceptions: None.
 */
function row(overrides: Partial<SideAgreementRow> = {}): SideAgreementRow {
  return {
    agreementId: 1,
    seatId: 'a1',
    counterpartSeatId: 'a2',
    kind: 'non_aggression',
    terms: '',
    zoneH3: [],
    againstSeatId: null,
    startTurn: 1,
    endTurn: 20,
    status: 'active',
    intent: 'keep',
    reason: '',
    updatedTurn: 1,
    decision: null,
    decisionReason: null,
    decisionTurn: null,
    ...overrides,
  };
}

/**
 * Runs the pure filter on turn 10 with `a2` and `a3` active.
 *
 * Purpose: The cases share the turn and the active seats.
 * When to use: Every case below.
 * Expected outcome: The partner set for the rows.
 * Exceptions: None.
 */
function partners(rows: readonly SideAgreementRow[], activeSeatIds: readonly string[] = ['a2', 'a3']): ReadonlySet<string> {
  return pactPartnerSeatIdsFrom({ rows, turnNumber: 10, activeSeatIds: new Set(activeSeatIds) });
}

test('an active non-aggression pact with an active counterpart makes it a partner', () => {
  assert.equal(partners([row()]).has('a2'), true);
});

test('an active ceasefire in place makes the counterpart a partner', () => {
  assert.equal(partners([row({ kind: 'ceasefire_in_place' })]).has('a2'), true);
});

test('other kinds, proposals, expired pacts, and inactive counterparts are not partners', () => {
  assert.equal(partners([row({ kind: 'joint_action' })]).has('a2'), false);
  assert.equal(partners([row({ status: 'proposed' })]).has('a2'), false);
  assert.equal(partners([row({ endTurn: 9 })]).has('a2'), false);
  assert.equal(partners([row()], ['a3']).has('a2'), false);
});
