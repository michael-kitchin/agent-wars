/**
 * The agreement history reader.
 *
 * Purpose: Versions, decisions, and attack records are rebuilt from recorder events, and a bad record cannot break the read.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/agreementHistoryRead.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_AGREEMENT_HISTORY } from '../../shared/agreementHistoryTypes';
import { strategicStep, tacticalStep } from '../../shared/matchRecording';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertSideAgreement } from '../gameDb/sideAgreementStore';
import { recordAttributedLosses } from '../recorder/matchRecordingEvents';
import { recordSideAgreementDecision, recordSideAgreementRecorded } from '../recorder/sideAgreementRecordingEvents';
import type { ZoneCodeTranslator } from '../sideAgreements/sideAgreementZoneCodes';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { readAgreementHistory } from './agreementHistoryRead';

const TRANSLATOR: ZoneCodeTranslator = {
  codeToH3: (code) => (code === 'CI' ? 'h3-ci' : null),
  h3ToCode: (index) => (index === 'h3-ci' ? 'CI' : null),
};

const newAgreement = () => insertSideAgreement(gameDbOps, {
  seatId: 'opponent',
  counterpartSeatId: 'opponent2',
  kind: 'no_entry_zone',
  terms: 'Stay out.',
  zoneH3: ['h3-ci'],
  againstSeatId: null,
  startTurn: 2,
  endTurn: 8,
  status: 'proposed',
  intent: 'keep',
  reason: 'Quiet front.',
});

const EMPTY_BUCKETS = { ranged: [], melee: [], returnFire: [], airStrike: [], missileStrike: [], other: [] };
const lostUnit = (responsibleOwnerIds: string[] | null) => ({
  displayName: 'U',
  unitType: 'armor' as const,
  unitId: 'a2-i1',
  attribution: { ownerId: 'opponent2', lossH3Index: null, responsibleOwnerIds, killerUnits: [] },
});

test('a changed agreement has its versions in order, and a same-turn change keeps the later one', () => {
  withTempGameDb('aw-agreement-history-', () => {
    const row = newAgreement();
    recordSideAgreementRecorded({ step: strategicStep(2), row, previousStatus: null });
    recordSideAgreementRecorded({ step: strategicStep(4), row: { ...row, status: 'active', terms: 'First.' }, previousStatus: 'proposed' });
    recordSideAgreementRecorded({ step: strategicStep(4), row: { ...row, status: 'active', terms: 'Second.' }, previousStatus: 'active' });
    const history = readAgreementHistory(gameDbOps, TRANSLATOR);
    assert.equal(history.agreements.length, 1);
    const [entry] = history.agreements;
    assert.deepEqual(entry.versions.map((v) => [v.turnNumber, v.status, v.terms]), [[2, 'proposed', 'Stay out.'], [4, 'active', 'Second.']]);
    assert.deepEqual(entry.versions[0].zoneCodes, ['CI']);
    assert.equal(entry.startTurn, 2);
  });
});

test('a decision is attached to its agreement, and a decision for an unknown id is skipped', () => {
  withTempGameDb('aw-agreement-history-', () => {
    const row = newAgreement();
    recordSideAgreementRecorded({ step: strategicStep(2), row, previousStatus: null });
    const base = { seatId: 'opponent', counterpartSeatId: 'opponent2', decision: 'break' as const, reason: 'Done.' };
    recordSideAgreementDecision({ step: strategicStep(3), agreementId: row.agreementId, ...base });
    recordSideAgreementDecision({ step: strategicStep(3), agreementId: 999, ...base });
    const { agreements } = readAgreementHistory(gameDbOps, TRANSLATOR);
    assert.deepEqual(agreements[0].decisions, [{ turnNumber: 3, decision: 'break', reason: 'Done.' }]);
  });
});

test('only ranged, air, and missile strategic losses with a responsible owner become attack records', () => {
  withTempGameDb('aw-agreement-history-', () => {
    recordAttributedLosses(strategicStep(3), {
      source: 'strategicTurn',
      byOwner: { opponent2: { ...EMPTY_BUCKETS, ranged: [lostUnit(['opponent'])], melee: [lostUnit(['opponent'])], returnFire: [lostUnit(['opponent'])] } },
    });
    recordAttributedLosses(strategicStep(4), {
      source: 'strategicTurn',
      byOwner: { opponent2: { ...EMPTY_BUCKETS, ranged: [lostUnit(null)] } },
    });
    recordAttributedLosses(tacticalStep(5, 'b1', 1), {
      source: 'tacticalBeat',
      byOwner: { opponent2: { ...EMPTY_BUCKETS, ranged: [lostUnit(['opponent'])] } },
    });
    const { attacks } = readAgreementHistory(gameDbOps, TRANSLATOR);
    assert.deepEqual(attacks, [{ turnNumber: 3, bySeatId: 'opponent', fromSeatId: 'opponent2', units: 1 }]);
  });
});

test('a payload with a bad kind is skipped and the rest still read', () => {
  withTempGameDb('aw-agreement-history-', () => {
    const row = newAgreement();
    recordSideAgreementRecorded({ step: strategicStep(2), row, previousStatus: null });
    recordSideAgreementRecorded({ step: strategicStep(3), row: { ...row, agreementId: 50, kind: 'allied' as never }, previousStatus: null });
    const { agreements } = readAgreementHistory(gameDbOps, TRANSLATOR);
    assert.deepEqual(agreements.map((entry) => entry.agreementId), [row.agreementId]);
  });
});

test('a match with no events gives the empty history', () => {
  withTempGameDb('aw-agreement-history-', () => {
    assert.equal(readAgreementHistory(gameDbOps, TRANSLATOR), EMPTY_AGREEMENT_HISTORY);
  });
});
