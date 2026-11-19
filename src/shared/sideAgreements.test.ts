/**
 * Guards, end-turn rule, and standing rule for side agreements.
 *
 * Purpose: The rules are pure, so they can be checked without a database.
 * When to use: `npm run build:main`, then `node dist/shared/sideAgreements.test.js`.
 * Expected outcome: Guards accept only their lists, end turns are capped, and standing follows the table.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isOpenSideAgreementStanding,
  isSideAgreementDecision,
  isSideAgreementIntent,
  isSideAgreementKind,
  isSideAgreementStatus,
  resolveSideAgreementEndTurn,
  SIDE_AGREEMENT_DECISIONS,
  SIDE_AGREEMENT_INTENT_LABELS,
  SIDE_AGREEMENT_INTENTS,
  SIDE_AGREEMENT_KIND_LABELS,
  SIDE_AGREEMENT_KINDS,
  SIDE_AGREEMENT_STATUSES,
  sideAgreementStanding,
  type SideAgreementStanding,
  type SideAgreementStatus,
} from './sideAgreements';

test('each guard accepts its list and rejects other values', () => {
  const guards: ReadonlyArray<[readonly string[], (value: unknown) => boolean]> = [
    [SIDE_AGREEMENT_KINDS, isSideAgreementKind],
    [SIDE_AGREEMENT_STATUSES, isSideAgreementStatus],
    [SIDE_AGREEMENT_INTENTS, isSideAgreementIntent],
    [SIDE_AGREEMENT_DECISIONS, isSideAgreementDecision],
  ];
  for (const [list, guard] of guards) {
    for (const member of list) assert.equal(guard(member), true);
    for (const other of ['allied', '', 3]) assert.equal(guard(other), false);
  }
});

test('end turn is capped at ten turns from the start and never in the past', () => {
  const at = (startTurn: number, currentTurn: number, requestedEndTurn: unknown): number | null =>
    resolveSideAgreementEndTurn({ startTurn, currentTurn, requestedEndTurn });
  assert.equal(at(5, 5, 8), 8);
  assert.equal(at(5, 5, 20), 14);
  assert.equal(at(5, 5, 4), null);
  assert.equal(at(5, 5, '8'), null);
  assert.equal(at(5, 5, 8.5), null);
  assert.equal(at(5, 15, 15), null);
  assert.equal(at(Number.NaN, 5, 8), null);
  assert.equal(at(5, Number.NaN, 8), null);
});

test('standing follows the stored status, the other side, and the end turn', () => {
  const standing = (
    status: SideAgreementStatus,
    endTurn: number,
    counterpartActive: boolean,
  ): SideAgreementStanding => sideAgreementStanding({ status, endTurn, currentTurn: 10, counterpartActive });
  for (const closed of ['ended', 'broken_by_them', 'broken_by_me'] as const) {
    assert.equal(standing(closed, 5, false), closed);
    assert.equal(standing(closed, 20, true), closed);
  }
  assert.equal(standing('active', 20, false), 'lapsed');
  assert.equal(standing('proposed', 5, false), 'lapsed');
  assert.equal(standing('proposed', 5, true), 'expired');
  assert.equal(standing('active', 10, true), 'active');
  assert.equal(standing('proposed', 12, true), 'proposed');
});

test('only proposed and active standings are open', () => {
  const open = (['proposed', 'active', 'ended', 'broken_by_them', 'broken_by_me', 'expired', 'lapsed'] as const)
    .filter((standing) => isOpenSideAgreementStanding(standing));
  assert.deepEqual(open, ['proposed', 'active']);
});

test('every kind and every intent has a readable label', () => {
  for (const kind of SIDE_AGREEMENT_KINDS) assert.notEqual(SIDE_AGREEMENT_KIND_LABELS[kind].length, 0);
  for (const intent of SIDE_AGREEMENT_INTENTS) assert.notEqual(SIDE_AGREEMENT_INTENT_LABELS[intent].length, 0);
});
