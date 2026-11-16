/**
 * Reading the statistics series back.
 *
 * Purpose: A turn with a battle has two events, and the later one wins. A broken payload is skipped.
 * When to use: `npm run build:main`, then `node dist/main/matchStatistics/statisticsHistory.test.js`.
 * Expected outcome: One entry per turn, in turn order.
 * Exceptions: None. The temporary match is closed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strategicStep } from '../../shared/matchRecording';
import { gameDbOps } from '../gameDb/dbConnection';
import { insertMatchRecord } from '../recorder/matchRecordStore';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { readStatisticsHistory } from './statisticsHistory';

/**
 * Inserts one statistics event with the given payload.
 *
 * Purpose: The cases need events without running the recorder.
 * When to use: Every case.
 * Expected outcome: One engine-only `side_statistics` row at the turn's step.
 * Exceptions: Propagates a SQLite error.
 */
function insertStatistics(turnNumber: number, payload: unknown): void {
  insertMatchRecord(gameDbOps, {
    kind: 'event',
    recordType: 'side_statistics',
    formatVersion: 1,
    step: strategicStep(turnNumber),
    visibility: 'engine',
    displayText: null,
    recordedAt: '2026-01-01T00:00:00.000Z',
    payload,
  });
}

test('the later event for a turn wins, the series is in turn order, and a broken payload is skipped', () => {
  withTempGameDb('aw-statistics-history-', () => {
    insertStatistics(3, { turnNumber: 3, sides: [], relationships: [], hexesTaken: null });
    insertStatistics(2, { turnNumber: 2, sides: [], relationships: [], hexesTaken: null, marker: 'early' });
    insertStatistics(2, { turnNumber: 2, sides: [], relationships: [], hexesTaken: [], marker: 'late' });
    insertStatistics(4, { turnNumber: 'x', sides: [] });
    insertStatistics(5, 'not an object');
    const history = readStatisticsHistory(gameDbOps);
    assert.deepEqual(history.map((turn) => turn.turnNumber), [2, 3]);
    assert.equal((history[0] as unknown as { marker: string }).marker, 'late');
  });
});
