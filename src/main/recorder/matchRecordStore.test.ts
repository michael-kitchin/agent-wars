/**
 * Inserting and reading match history rows.
 *
 * Purpose: A frame and its events come back in write order, with the payload decoded.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecordStore.test.js`.
 * Expected outcome: Nested values and non-ASCII text survive the round trip.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDbOps } from '../gameDb/dbConnection';
import { strategicStep } from '../../shared/matchRecording';
import {
  countMatchRecords,
  insertMatchRecord,
  lastFrameStepKeyText,
  listMatchRecords,
  matchHasEventOfType,
} from './matchRecordStore';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('a frame and two events round-trip in record order', () => {
  withTempGameDb('aw-match-store-', () => {
    const step = strategicStep(1);
    insertMatchRecord(gameDbOps, {
      kind: 'frame',
      recordType: 'state',
      formatVersion: 1,
      step,
      visibility: 'engine',
      displayText: null,
      recordedAt: '2026-01-01T00:00:00.000Z',
      payload: { note: '雪', nested: { a: 1 } },
    });
    insertMatchRecord(gameDbOps, {
      kind: 'event',
      recordType: 'orders_committed',
      formatVersion: 1,
      step,
      visibility: { seats: ['human'] },
      displayText: null,
      recordedAt: '2026-01-01T00:00:01.000Z',
      payload: { owner: 'human' },
    });
    insertMatchRecord(gameDbOps, {
      kind: 'event',
      recordType: 'match_ended',
      formatVersion: 1,
      step,
      visibility: 'everyone',
      displayText: null,
      recordedAt: '2026-01-01T00:00:02.000Z',
      payload: { winner: '' },
    });
    const rows = listMatchRecords(gameDbOps);
    assert.deepEqual(rows.map((row) => row.recordId), [1, 2, 3]);
    assert.deepEqual(rows[0]?.payload, { note: '雪', nested: { a: 1 } });
    assert.equal(rows[1]?.visibility, 'seats:human');
    assert.equal(lastFrameStepKeyText(gameDbOps), 's1');
    assert.equal(matchHasEventOfType(gameDbOps, 'match_ended'), true);
    assert.equal(matchHasEventOfType(gameDbOps, 'consultation'), false);
    assert.equal(countMatchRecords(gameDbOps), 3);
  });
});
