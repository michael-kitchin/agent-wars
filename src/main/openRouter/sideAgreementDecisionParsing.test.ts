/**
 * Parsing the agreement decisions of an orders reply.
 *
 * Purpose: A bad entry becomes a drop reason and never blocks the orders.
 * When to use: `npm run build:main`, then `node dist/main/openRouter/sideAgreementDecisionParsing.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIDE_AGREEMENT_MAX_DECISIONS } from '../../shared/sideAgreements';
import { normalizeAgreementDecisions } from './sideAgreementDecisionParsing';

test('an omitted field gives nothing, and a non-array gives one reason', () => {
  assert.deepEqual(normalizeAgreementDecisions(undefined), { decisions: [], dropReasons: [] });
  assert.deepEqual(normalizeAgreementDecisions('keep').dropReasons, ['agreementDecisions dropped: expected an array.']);
});

test('a valid entry is kept with its reason cleaned', () => {
  const result = normalizeAgreementDecisions([{ id: 7, decision: 'break', reason: '  Their   front\nis empty. ' }]);
  assert.deepEqual(result.decisions, [{ agreementId: 7, decision: 'break', reason: 'Their front is empty.' }]);
  assert.deepEqual(result.dropReasons, []);
});

test('a bad id or decision is dropped with the same reason', () => {
  const reason = 'agreementDecisions entry dropped: expected a positive integer id and a decision of keep or break.';
  const result = normalizeAgreementDecisions([{ id: 0, decision: 'keep' }, { id: 1e21, decision: 'keep' }, { id: '7', decision: 'keep' }, { id: 7, decision: 'betray' }, 'x']);
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.dropReasons, [reason, reason, reason, reason, reason]);
});

test('a repeated id is dropped once, and entries past the limit share one reason', () => {
  const repeated = normalizeAgreementDecisions([{ id: 3, decision: 'keep' }, { id: 3, decision: 'break' }]);
  assert.equal(repeated.decisions.length, 1);
  assert.deepEqual(repeated.dropReasons, ['agreementDecisions entry dropped: agreement 3 appears more than once.']);
  const many = normalizeAgreementDecisions(Array.from({ length: SIDE_AGREEMENT_MAX_DECISIONS + 1 }, (_unused, index) => ({ id: index + 1, decision: 'keep' })));
  assert.equal(many.decisions.length, SIDE_AGREEMENT_MAX_DECISIONS);
  assert.deepEqual(many.dropReasons, [`agreementDecisions dropped: at most ${SIDE_AGREEMENT_MAX_DECISIONS} decisions are read.`]);
});
