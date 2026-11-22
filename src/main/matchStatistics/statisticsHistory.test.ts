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
 * Expected outcome: One engine-only `side_statistics` row at the turn's step, at format version 1 unless another is given.
 * Exceptions: Propagates a SQLite error.
 */
function insertStatistics(turnNumber: number, payload: unknown, formatVersion = 1): void {
  insertMatchRecord(gameDbOps, {
    kind: 'event',
    recordType: 'side_statistics',
    formatVersion,
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

/**
 * Builds one side entry with every field the charts read.
 *
 * Purpose: The shape cases change one field of an otherwise complete side.
 * When to use: Any case that needs a side the reader accepts, or one with a single field broken.
 * Expected outcome: A side entry for `seatId`, with `overrides` applied last.
 * Exceptions: None.
 */
function completeSide(seatId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    seatId,
    out: false,
    builtUnits: { infantry: 1 },
    mercenaryUnits: {},
    hexes: 3,
    productionPerTurn: 2,
    storedPoints: 0,
    treasury: 5,
    upkeepPerTurn: 1,
    unitsLost: null,
    costUsd: 0,
    ...overrides,
  };
}

test('a payload missing the relationship list, with a bad hexes-taken list, or with a side or report without seat ids is skipped', () => {
  withTempGameDb('aw-statistics-history-shape-', () => {
    insertStatistics(1, { turnNumber: 1, sides: [completeSide('human')], relationships: [{ seatId: 'ai1', towardSeatId: 'human' }], hexesTaken: [] });
    insertStatistics(2, { turnNumber: 2, sides: [] });
    insertStatistics(3, { turnNumber: 3, sides: [], relationships: [], hexesTaken: 'none' });
    insertStatistics(4, { turnNumber: 4, sides: [{ hexes: 3 }], relationships: [], hexesTaken: null });
    insertStatistics(5, { turnNumber: 5, sides: [], relationships: [{ seatId: 'ai1' }], hexesTaken: null });
    insertStatistics(6, { turnNumber: 6, sides: [], relationships: [], hexesTaken: [null] });
    assert.deepEqual(readStatisticsHistory(gameDbOps).map((turn) => turn.turnNumber), [1]);
  });
});

test('a side without unit count records or with a chart number that is not a number is skipped', () => {
  withTempGameDb('aw-statistics-history-side-', () => {
    const shape = { relationships: [], hexesTaken: null };
    insertStatistics(1, { turnNumber: 1, sides: [completeSide('human', { unitsLost: 2 })], ...shape });
    insertStatistics(2, { turnNumber: 2, sides: [{ seatId: 'human' }], ...shape });
    insertStatistics(3, { turnNumber: 3, sides: [completeSide('human', { builtUnits: null })], ...shape });
    insertStatistics(4, { turnNumber: 4, sides: [completeSide('human', { mercenaryUnits: 'none' })], ...shape });
    insertStatistics(5, { turnNumber: 5, sides: [completeSide('human', { treasury: '5' })], ...shape });
    insertStatistics(6, { turnNumber: 6, sides: [completeSide('human', { unitsLost: 'many' })], ...shape });
    insertStatistics(7, { turnNumber: 7, sides: [completeSide('human', { costUsd: undefined })], ...shape });
    insertStatistics(8, { turnNumber: 8, sides: [completeSide('human')], ...shape });
    assert.deepEqual(readStatisticsHistory(gameDbOps).map((turn) => turn.turnNumber), [1, 8]);
  });
});

test('a payload that cannot be decoded and a row of another format version are skipped, and the rest still reads', () => {
  withTempGameDb('aw-statistics-history-bad-', () => {
    insertStatistics(1, { turnNumber: 1, sides: [], relationships: [], hexesTaken: null });
    insertStatistics(2, { turnNumber: 2, sides: [], relationships: [], hexesTaken: null });
    gameDbOps.run(
      `UPDATE match_records SET payload = X'00FF' WHERE record_id = (SELECT MAX(record_id) FROM match_records)`
    );
    insertStatistics(3, { turnNumber: 3, sides: [], relationships: [], hexesTaken: null }, 2);
    insertStatistics(4, { turnNumber: 4, sides: [], relationships: [], hexesTaken: null });
    assert.deepEqual(readStatisticsHistory(gameDbOps).map((turn) => turn.turnNumber), [1, 4]);
  });
});

test('a turn whose posture list is malformed is still returned', () => {
  withTempGameDb('aw-statistics-history-postures-', () => {
    insertStatistics(1, { turnNumber: 1, sides: [], relationships: [], hexesTaken: null, postures: 'bad' });
    insertStatistics(2, { turnNumber: 2, sides: [], relationships: [], hexesTaken: null, postures: [{ seatId: 7 }] });
    assert.deepEqual(readStatisticsHistory(gameDbOps).map((turn) => turn.turnNumber), [1, 2]);
  });
});
