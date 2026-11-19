/**
 * Stored side agreements.
 *
 * Purpose: The table keeps each commander's private agreements, with the limits the table itself enforces.
 * When to use: `npm run build:main`, then `node dist/main/gameDb/sideAgreementStore.test.js`.
 * Expected outcome: The cases below. A new match clears the table, and opening creates it again.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetGameForNewMatch } from '../gameDb';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { gameDbOps } from './dbConnection';
import { ensureSideAgreementTable } from './sideAgreementTable';
import {
  getSideAgreement,
  insertSideAgreement,
  listSideAgreementsForSeat,
  setSideAgreementDecision,
  updateSideAgreement,
  type SideAgreementInsert,
} from './sideAgreementStore';

/**
 * Builds a valid new agreement for the tests.
 *
 * Purpose: Each case starts from the same opponent-with-human agreement and overrides what it checks.
 * When to use: Every case in this file.
 * Expected outcome: An insert input with the given overrides applied.
 * Exceptions: None.
 */
function agreementInput(overrides: Partial<SideAgreementInsert> = {}): SideAgreementInsert {
  return {
    seatId: 'opponent',
    counterpartSeatId: 'human',
    kind: 'non_aggression',
    terms: 'No strikes.',
    zoneH3: [],
    againstSeatId: null,
    startTurn: 3,
    endTurn: 8,
    status: 'active',
    intent: 'keep',
    reason: 'Quiet front.',
    ...overrides,
  };
}

test('an inserted agreement reads back with its zone and no decision', () => {
  withTempGameDb('aw-side-agreement-insert-', () => {
    const row = insertSideAgreement(gameDbOps, agreementInput({ kind: 'no_entry_zone', zoneH3: ['8a1', '8a2'] }));
    assert.ok(row.agreementId > 0);
    assert.equal(row.updatedTurn, row.startTurn);
    assert.deepEqual(row.zoneH3, ['8a1', '8a2']);
    assert.deepEqual([row.decision, row.decisionReason, row.decisionTurn], [null, null, null]);
  });
});

test('an update writes only when a field differs', () => {
  withTempGameDb('aw-side-agreement-update-', () => {
    const row = insertSideAgreement(gameDbOps, agreementInput({ status: 'proposed' }));
    const fields = { agreementId: row.agreementId, terms: row.terms, zoneH3: row.zoneH3, endTurn: row.endTurn, status: row.status, intent: row.intent, reason: row.reason };
    const same = updateSideAgreement(gameDbOps, { ...fields, turnNumber: 5 });
    assert.equal(same?.changed, false);
    assert.equal(getSideAgreement(gameDbOps, row.agreementId)?.updatedTurn, 3);
    const changed = updateSideAgreement(gameDbOps, { ...fields, status: 'active', turnNumber: 5 });
    assert.equal(changed?.changed, true);
    assert.equal(changed?.previousStatus, 'proposed');
    assert.equal(changed?.row.updatedTurn, 5);
    assert.equal(updateSideAgreement(gameDbOps, { ...fields, agreementId: 999, turnNumber: 5 }), null);
  });
});

test('a decision is stored and replaced, and an unknown id is refused', () => {
  withTempGameDb('aw-side-agreement-decision-', () => {
    const row = insertSideAgreement(gameDbOps, agreementInput());
    assert.equal(setSideAgreementDecision(gameDbOps, { agreementId: row.agreementId, decision: 'keep', reason: 'ok', turnNumber: 4 }), true);
    assert.equal(setSideAgreementDecision(gameDbOps, { agreementId: row.agreementId, decision: 'break', reason: 'now', turnNumber: 5 }), true);
    const stored = getSideAgreement(gameDbOps, row.agreementId);
    assert.deepEqual([stored?.decision, stored?.decisionReason, stored?.decisionTurn], ['break', 'now', 5]);
    assert.equal(setSideAgreementDecision(gameDbOps, { agreementId: 999, decision: 'keep', reason: '', turnNumber: 4 }), false);
  });
});

test('a seat lists only its own agreements in id order, and a bad zone reads as empty', () => {
  withTempGameDb('aw-side-agreement-list-', () => {
    const first = insertSideAgreement(gameDbOps, agreementInput());
    insertSideAgreement(gameDbOps, agreementInput({ seatId: 'opponent2' }));
    const third = insertSideAgreement(gameDbOps, agreementInput({ counterpartSeatId: 'opponent2' }));
    assert.deepEqual(listSideAgreementsForSeat(gameDbOps, 'opponent').map((row) => row.agreementId), [first.agreementId, third.agreementId]);
    gameDbOps.run(`UPDATE side_agreements SET zone_h3_json = 'not json' WHERE agreement_id = ?`, [first.agreementId]);
    assert.deepEqual(getSideAgreement(gameDbOps, first.agreementId)?.zoneH3, []);
  });
});

test('the table refuses a self agreement and an end turn before the start', () => {
  withTempGameDb('aw-side-agreement-checks-', () => {
    assert.throws(() => insertSideAgreement(gameDbOps, agreementInput({ counterpartSeatId: 'opponent' })));
    assert.throws(() => insertSideAgreement(gameDbOps, agreementInput({ startTurn: 5, endTurn: 4 })));
  });
});

test('a new match clears the table, and opening creates it again', () => {
  withTempGameDb('aw-side-agreement-reset-', () => {
    insertSideAgreement(gameDbOps, agreementInput());
    resetGameForNewMatch();
    assert.equal(gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM side_agreements')?.n, 0);
    gameDbOps.run('DROP TABLE side_agreements');
    ensureSideAgreementTable((sql) => gameDbOps.run(sql));
    assert.equal(gameDbOps.getAll('PRAGMA table_info(side_agreements)').length > 0, true);
  });
});
