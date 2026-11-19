/**
 * The agreement views of one commander.
 *
 * Purpose: Standing, evidence, the recently closed window, and the order of views are pure rules.
 * When to use: `npm run build:main`, then `node dist/main/sideAgreements/sideAgreementLedger.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_SEAT_IDS, HUMAN_SEAT_ID } from '../../shared/seatIds';
import type { SeatRecord } from '../../shared/seatRoster';
import type { SideAgreementRow } from '../gameDb/sideAgreementStore';
import { buildSideAgreementViews } from './sideAgreementLedger';

const OWN = AI_SEAT_IDS[0];
const SECOND = AI_SEAT_IDS[1];
const THIRD = AI_SEAT_IDS[2];

/**
 * Builds one seat record.
 *
 * Purpose: Each case needs a roster where one side may be out.
 * When to use: `rosterWith`.
 * Expected outcome: A seat with the given id, order, and out turn.
 * Exceptions: None.
 */
function seat(seatId: SeatRecord['seatId'], seatOrder: number, outTurn: number | null = null): SeatRecord {
  return {
    seatId,
    seatOrder,
    kind: seatId === HUMAN_SEAT_ID ? 'human' : 'ai',
    homeRegion: `Region ${seatOrder}`,
    nickname: null,
    commander: null,
    outTurn,
    outBy: null,
    outReasons: [],
    place: null,
    consultationCount: 0,
    costUsd: 0,
    thinkTimeMs: 0,
  };
}

/**
 * Builds a roster of the commander and two other sides.
 *
 * Purpose: The cases name which side, if any, has left the match.
 * When to use: Every case.
 * Expected outcome: The second AI seat is listed after the third when `swapped` is true, so order comes from `seatOrder`.
 * Exceptions: None.
 */
function rosterWith(secondOut: number | null = null, swapped = false): SeatRecord[] {
  return [seat(OWN, 1), seat(SECOND, swapped ? 3 : 2, secondOut), seat(THIRD, swapped ? 2 : 3)];
}

/**
 * Builds one stored agreement row.
 *
 * Purpose: Each case overrides only what it checks.
 * When to use: Every case.
 * Expected outcome: An active non-aggression agreement from the commander with the second side.
 * Exceptions: None.
 */
function row(overrides: Partial<SideAgreementRow> = {}): SideAgreementRow {
  return {
    agreementId: 1,
    seatId: OWN,
    counterpartSeatId: SECOND,
    kind: 'non_aggression',
    terms: 'No strikes.',
    zoneH3: [],
    againstSeatId: null,
    startTurn: 3,
    endTurn: 8,
    status: 'active',
    intent: 'keep',
    reason: 'Quiet.',
    updatedTurn: 3,
    decision: null,
    decisionReason: null,
    decisionTurn: null,
    ...overrides,
  };
}

/**
 * Builds the views for the cases, with the same fixed inputs apart from the ones given.
 *
 * Purpose: Keeps each case to the line it checks.
 * When to use: Every case.
 * Expected outcome: The views at turn 6 unless a turn is given.
 * Exceptions: None.
 */
function viewsOf(rows: SideAgreementRow[], roster: SeatRecord[], currentTurn = 6) {
  return buildSideAgreementViews({ currentTurn, rows, roster, turns: [], zoneToCodes: (h3) => [...h3] });
}

test('an active agreement with an active side shows as active with evidence', () => {
  const [view] = viewsOf([row()], rosterWith());
  assert.equal(view?.standing, 'active');
  assert.equal(view?.evidence, 'No turn has resolved since this agreement began.');
  assert.equal(view?.counterpartLabel, 'Region 2');
});

test('the same agreement shows as lapsed with no evidence when the side is out', () => {
  const [view] = viewsOf([row()], rosterWith(5));
  assert.equal(view?.standing, 'lapsed');
  assert.equal(view?.evidence, null);
});

test('a proposed agreement past its end turn shows as expired', () => {
  const [view] = viewsOf([row({ status: 'proposed', endTurn: 5, updatedTurn: 5 })], rosterWith());
  assert.equal(view?.standing, 'expired');
});

test('a closed agreement stays for two turns after its last change', () => {
  const old = row({ status: 'broken_by_me', updatedTurn: 3, endTurn: 3 });
  const recent = row({ status: 'broken_by_me', updatedTurn: 5, endTurn: 3 });
  assert.equal(viewsOf([old], rosterWith(), 6).length, 0);
  assert.equal(viewsOf([recent], rosterWith(), 6).length, 1);
});

test('a broken agreement carries the turn it closed, and an open or expired one carries none', () => {
  assert.equal(viewsOf([row({ status: 'broken_by_me', updatedTurn: 5, endTurn: 8 })], rosterWith())[0]?.closedTurn, 5);
  assert.equal(viewsOf([row()], rosterWith())[0]?.closedTurn, null);
  assert.equal(viewsOf([row({ status: 'proposed', endTurn: 5, updatedTurn: 5 })], rosterWith())[0]?.closedTurn, null);
});

test('views follow the other side seat order, then the id', () => {
  const rows = [row({ agreementId: 1, counterpartSeatId: SECOND }), row({ agreementId: 2, counterpartSeatId: THIRD }), row({ agreementId: 3, counterpartSeatId: SECOND })];
  assert.deepEqual(viewsOf(rows, rosterWith(null, true)).map((view) => view.agreementId), [2, 1, 3]);
});

test('a joint action names the third side and a decision is kept only when complete', () => {
  const [view] = viewsOf([row({ kind: 'joint_action', againstSeatId: THIRD, decision: 'keep', decisionReason: 'Still useful.', decisionTurn: 5 })], rosterWith());
  assert.equal(view?.againstLabel, 'Region 3');
  assert.deepEqual(view?.decision, { turnNumber: 5, decision: 'keep', reason: 'Still useful.' });
});
