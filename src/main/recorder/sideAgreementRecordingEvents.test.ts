/**
 * The two side agreement recorder events.
 *
 * Purpose: Each change and each decision is one row that only the owning commander may see.
 * When to use: `npm run build:main`, then `node dist/main/recorder/sideAgreementRecordingEvents.test.js`.
 * Expected outcome: The cases below.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep } from '../../shared/matchRecording';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertSideAgreement } from '../gameDb/sideAgreementStore';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { decodeRecordPayload } from './matchRecordCodec';
import { recordSideAgreementDecision, recordSideAgreementRecorded } from './sideAgreementRecordingEvents';

/**
 * Reads the only row of one record type.
 *
 * Purpose: Each case writes one event and checks its columns and payload.
 * When to use: After a record call.
 * Expected outcome: The row's visibility, format version, display text, and decoded payload.
 * Exceptions: None.
 */
function readOnlyEvent(recordType: string): { visibility: string; formatVersion: number; displayText: string | null; payload: Record<string, unknown> } {
  const rows = gameDbOps.getAll<{ visibility: string; format_version: number; display_text: string | null; payload: Buffer }>(
    `SELECT visibility, format_version, display_text, payload FROM match_records WHERE record_type = ?`,
    [recordType]
  );
  assert.equal(rows.length, 1);
  const row = rows[0];
  return {
    visibility: row.visibility,
    formatVersion: row.format_version,
    displayText: row.display_text,
    payload: decodeRecordPayload(row.payload) as Record<string, unknown>,
  };
}

test('an agreement change is one event visible to its owner with the previous status', () => {
  withTempGameDb('aw-agreement-event-', () => {
    const step = strategicStep(4);
    const row = insertSideAgreement(gameDbOps, {
      seatId: 'opponent',
      counterpartSeatId: 'human',
      kind: 'non_aggression',
      terms: 'No strikes.',
      zoneH3: [],
      againstSeatId: null,
      startTurn: 4,
      endTurn: 9,
      status: 'active',
      intent: 'keep',
      reason: 'Quiet front.',
    });
    recordSideAgreementRecorded({ step, row, previousStatus: 'proposed' });
    const event = readOnlyEvent('agreement_recorded');
    assert.equal(event.visibility, 'seats:opponent');
    assert.equal(event.formatVersion, 1);
    assert.ok(!event.displayText);
    assert.equal(event.payload.agreementId, row.agreementId);
    assert.equal(event.payload.status, 'active');
    assert.equal(event.payload.previousStatus, 'proposed');
    assert.equal(event.payload.terms, 'No strikes.');

    recordSideAgreementDecision({ step, agreementId: row.agreementId, seatId: 'opponent', counterpartSeatId: 'human', decision: 'break', reason: 'Empty front.' });
    const decision = readOnlyEvent('agreement_decision');
    assert.equal(decision.visibility, 'seats:opponent');
    assert.equal(decision.payload.decision, 'break');
    assert.equal(decision.payload.reason, 'Empty front.');
  });
});
