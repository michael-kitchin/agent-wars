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
  lastFrameHeader,
  lastFrameStepKeyText,
  lastMatchRecordId,
  lastRecordIdOfType,
  listMatchEventsAtStep,
  listMatchEventsOfType,
  listMatchRecordHeadersOfType,
  listMatchRecords,
  listReadableMatchEventsAtStep,
  matchHasEventOfType,
  readMatchRecord,
} from './matchRecordStore';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('a frame and two events round-trip in record order', () => {
  withTempGameDb('aw-match-store-', () => {
    assert.equal(lastMatchRecordId(gameDbOps), null);
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
    assert.equal(lastMatchRecordId(gameDbOps), 3);
    assert.deepEqual(listMatchEventsOfType(gameDbOps, 'orders_committed').map((row) => row.recordId), [2]);
    assert.deepEqual(listMatchEventsOfType(gameDbOps, 'consultation'), []);
  });
});

test('the targeted readers find one record, one step, and the newest of a type', () => {
  withTempGameDb('aw-match-store-targeted-', () => {
    assert.equal(lastFrameHeader(gameDbOps), null);
    assert.equal(lastRecordIdOfType(gameDbOps, 'view_snapshot'), null);
    const add = (kind: 'frame' | 'event', recordType: string, turn: number, payload: unknown): void => {
      insertMatchRecord(gameDbOps, {
        kind,
        recordType,
        formatVersion: 1,
        step: strategicStep(turn),
        visibility: 'engine',
        displayText: null,
        recordedAt: '2026-01-01T00:00:00.000Z',
        payload,
      });
    };
    add('frame', 'state', 1, { f: 1 });
    add('event', 'view_snapshot', 1, { v: 1 });
    add('frame', 'state', 2, { f: 2 });
    add('event', 'view_snapshot', 2, { v: 2 });
    add('event', 'view_snapshot', 2, { v: 3 });
    assert.deepEqual(lastFrameHeader(gameDbOps), { recordId: 3, stepKey: 's2', step: strategicStep(2) });
    assert.equal(lastRecordIdOfType(gameDbOps, 'view_snapshot'), 5);
    assert.deepEqual(readMatchRecord(gameDbOps, 2)?.payload, { v: 1 });
    assert.equal(readMatchRecord(gameDbOps, 99), null);
    assert.deepEqual(listMatchEventsAtStep(gameDbOps, 'view_snapshot', 's2').map((row) => row.payload), [{ v: 2 }, { v: 3 }]);
    assert.deepEqual(listMatchEventsAtStep(gameDbOps, 'view_snapshot', 's9'), []);
    const headers = listMatchRecordHeadersOfType(gameDbOps, 'view_snapshot');
    assert.deepEqual(headers.map((row) => row.recordId), [2, 4, 5]);
    assert.equal(headers.every((row) => !('payload' in row)), true);
    assert.deepEqual(headers.map((row) => row.turnNumber), [1, 2, 2]);
  });
});

test('the readable per-step reader skips a payload that cannot be decoded and keeps the rest', () => {
  withTempGameDb('aw-match-store-readable-step-', () => {
    for (const text of ['first', 'damaged', 'third']) {
      insertMatchRecord(gameDbOps, {
        kind: 'event',
        recordType: 'message_sent',
        formatVersion: 1,
        step: strategicStep(2),
        visibility: 'engine',
        displayText: null,
        recordedAt: '2026-01-01T00:00:00.000Z',
        payload: { text },
      });
    }
    gameDbOps.run(`UPDATE match_records SET payload = X'00FF' WHERE record_id = 2`);
    assert.throws(() => listMatchEventsAtStep(gameDbOps, 'message_sent', 's2'));
    assert.deepEqual(listReadableMatchEventsAtStep(gameDbOps, 'message_sent', 's2').map((row) => row.payload), [
      { text: 'first' },
      { text: 'third' },
    ]);
  });
});
