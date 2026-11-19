/**
 * The evidence text of one agreement.
 *
 * Purpose: Losses count only from the turn an agreement began, in the words of the Record column.
 * When to use: `npm run build:main`, then `node dist/main/sideAgreements/sideAgreementEvidence.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyPlayerLossSummary, type LostUnit, type PlayerLossSummary } from '../../shared/lossSummary';
import type { CombatRecordTurn } from '../briefing/sideCombatRecord';
import { formatSideAgreementEvidence } from './sideAgreementEvidence';

const OWN = 'opponent';
const OTHER = 'opponent2';

/**
 * Builds one of the commander's lost units, credited to the other side.
 *
 * Purpose: A case needs a loss the other side caused when it attacked.
 * When to use: The cases below.
 * Expected outcome: An infantry unit owned by the commander.
 * Exceptions: None.
 */
function lostUnit(id: string): LostUnit {
  return { displayName: id, unitType: 'infantry', unitId: id, attribution: { ownerId: OWN, lossH3Index: null, responsibleOwnerIds: [OTHER], killerUnits: [] } };
}

/**
 * Builds a turn from partial summaries.
 *
 * Purpose: A case fills only the buckets it is about.
 * When to use: The cases below.
 * Expected outcome: A turn with empty buckets elsewhere.
 * Exceptions: None.
 */
function turn(turnNumber: number, own: Partial<PlayerLossSummary> = {}): CombatRecordTurn {
  return { turnNumber, ownLosses: { ...emptyPlayerLossSummary(), ...own }, otherLosses: emptyPlayerLossSummary(), battleLosses: [] };
}

const EMPTY_TEXT = 'No turn has resolved since this agreement began.';

test('no turn at or after the start gives the no-turn sentence', () => {
  assert.equal(formatSideAgreementEvidence({ seatId: OWN, counterpartSeatId: OTHER, startTurn: 5, turns: [] }), EMPTY_TEXT);
  assert.equal(formatSideAgreementEvidence({ seatId: OWN, counterpartSeatId: OTHER, startTurn: 5, turns: [turn(4, { ranged: [lostUnit('a')] })] }), EMPTY_TEXT);
});

test('a loss after the start is counted and a loss before it is not', () => {
  const text = formatSideAgreementEvidence({
    seatId: OWN,
    counterpartSeatId: OTHER,
    startTurn: 5,
    turns: [turn(4, { ranged: [lostUnit('old'), lostUnit('old2')] }), turn(6, { ranged: [lostUnit('new')] })],
  });
  assert.ok(text.startsWith('Record, turn'));
  assert.ok(text.includes('destroyed 1 of your units'));
});
