/**
 * Orders, resolution, consult, and strategy events.
 *
 * Purpose: Each handler's event uses the visibility and payload that handler already has.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecordingEvents.test.js`.
 * Expected outcome: Human and AI orders are separate, a blank strategy writes nothing, and a consult keeps its totals.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDbOps } from '../gameDb/dbConnection';
import { MATCH_ID_CONFIG_KEY } from '../gameDb/gameConfigKv';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { advanceMatchGeneration, getMatchGeneration } from '../matchGeneration';
import { consultStillOnOpenMatch } from '../openRouter/requestOrdersConsultationMarks';
import { buildConsultTelemetrySummary } from '../openRouter/consultTelemetrySummary';
import { strategicStep, tacticalStep } from '../../shared/matchRecording';
import { readHumanOrderTables } from './matchFrameCapture';
import { listMatchRecords } from './matchRecordStore';
import {
  recordCommanderStrategy,
  recordConsultation,
  recordStrategicOrders,
  recordStrategicResolution,
  recordTacticalBeat,
  stepForConsult,
} from './matchRecordingEvents';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('strategic orders are one event per owner, and only when that owner has orders', () => {
  withTempGameDb('aw-match-orders-', () => {
    gameDbOps.run("INSERT INTO pending_orders (unit_id, to_h3_index) VALUES ('u1', '8001')");
    const tables = readHumanOrderTables(gameDbOps);
    assert.deepEqual(Object.keys(tables), [
      'pending_orders',
      'pending_ranged_orders',
      'pending_air_orders',
      'pending_missile_launches',
      'pending_ferry_orders',
      'pending_air_drop_orders',
    ]);
    assert.equal(tables.pending_orders?.rows.length, 1);
    const owners = new Map<string, unknown>([
      ['opponent', { movementOrders: [{ unitId: 'a1' }] }],
      ['opponent2', { movementOrders: [] }],
    ]);
    recordStrategicOrders({ step: strategicStep(1), humanOrderTables: tables, ordersByOwner: owners });
    const visibilities = listMatchRecords(gameDbOps).map((row) => row.visibility);
    assert.deepEqual(visibilities, ['seats:human', 'seats:opponent', 'seats:opponent2']);
  });
});

test('empty human tables write no human orders event', () => {
  withTempGameDb('aw-match-orders-empty-', () => {
    const tables = readHumanOrderTables(gameDbOps);
    recordStrategicOrders({
      step: strategicStep(1),
      humanOrderTables: tables,
      ordersByOwner: new Map<string, unknown>([
        ['opponent', {}],
        ['opponent2', {}],
      ]),
    });
    assert.deepEqual(listMatchRecords(gameDbOps).map((row) => row.visibility), ['seats:opponent', 'seats:opponent2']);
  });
});

test('resolution and a tactical beat keep their payloads and step columns', () => {
  withTempGameDb('aw-match-resolution-', () => {
    const resolution = { rolls: [1], note: '雪' };
    recordStrategicResolution(strategicStep(2), resolution);
    const beat = tacticalStep(3, 'battle-9', 4);
    recordTacticalBeat({ step: beat, orders: { a: 1 }, playback: { b: 2 } });
    const rows = listMatchRecords(gameDbOps);
    assert.equal(rows[0]?.recordType, 'strategic_resolution');
    assert.equal(rows[0]?.visibility, 'engine');
    assert.deepEqual(rows[0]?.payload, resolution);
    assert.deepEqual(rows.slice(1).map((row) => row.recordType), ['tactical_orders_committed', 'tactical_resolution']);
    assert.equal(rows[1]?.battleId, 'battle-9');
    assert.equal(rows[1]?.beatNumber, 4);
    assert.deepEqual(rows[2]?.payload, { b: 2 });
  });
});

test('creating the match id keeps the consult, and replacing the match drops it', () => {
  withTempGameDb('aw-match-identity-', () => {
    const generation = getMatchGeneration();
    assert.equal(consultStillOnOpenMatch(null, generation), true);
    upsertGameConfigValue(gameDbOps, MATCH_ID_CONFIG_KEY, 'match-created-during-consult');
    assert.equal(consultStillOnOpenMatch(null, generation), true);
    const previousId = 'match-before-replacement';
    upsertGameConfigValue(gameDbOps, MATCH_ID_CONFIG_KEY, previousId);
    advanceMatchGeneration('new_game');
    upsertGameConfigValue(gameDbOps, MATCH_ID_CONFIG_KEY, 'match-after-replacement');
    assert.equal(consultStillOnOpenMatch(previousId, generation), false);
    assert.equal(consultStillOnOpenMatch(null, generation), false);
    const openGeneration = getMatchGeneration();
    assert.equal(consultStillOnOpenMatch('match-after-replacement', openGeneration), true);
    advanceMatchGeneration('load_game');
    assert.equal(consultStillOnOpenMatch('match-after-replacement', openGeneration), false);
  });
});

test('a consult and a strategy record the summary that was already built', () => {
  withTempGameDb('aw-match-consult-', () => {
    const summary = buildConsultTelemetrySummary({
      seatId: 'opponent',
      turnNumber: 1,
      theater: 'strategic',
      battleId: null,
      modelId: 'm',
      providerSort: 'throughput',
      wallClockMs: 10,
      error: null,
      cancelReason: null,
      inputTokens: 11,
      outputTokens: 7,
      costUsd: 1.25,
      cachedTokens: 3,
      cacheWriteTokens: 0,
      attempts: [
        { requestLabel: 'requestOrders', attempt: 1, outcome: 'ok', httpStatus: 200, durationMs: 1, provider: 'test', retried: false },
        { requestLabel: 'requestOrders', attempt: 2, outcome: 'ok', httpStatus: 200, durationMs: 1, provider: 'test', retried: false },
      ],
      fallbacks: [],
      toolRounds: 0,
      outcome: 'finished',
      wallClockExceeded: false,
    });
    recordConsultation({ step: strategicStep(1), stage: 'orders', summary });
    const row = listMatchRecords(gameDbOps)[0];
    const payload = row?.payload as {
      stage: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      attempts: unknown[];
    };
    assert.equal(row?.visibility, 'seats:opponent');
    assert.equal(payload.stage, 'orders');
    assert.equal(payload.inputTokens, 11);
    assert.equal(payload.outputTokens, 7);
    assert.equal(payload.costUsd, 1.25);
    assert.equal(payload.attempts.length, 2);

    recordConsultation({ step: strategicStep(1), stage: 'orders', summary: { ...summary, seatId: null } });
    assert.equal(listMatchRecords(gameDbOps).at(-1)?.visibility, 'engine');

    recordCommanderStrategy({ step: strategicStep(1), seatId: 'opponent', strategy: 'Hold the river' });
    assert.equal(listMatchRecords(gameDbOps).at(-1)?.displayText, 'Hold the river');
    const count = listMatchRecords(gameDbOps).length;
    recordCommanderStrategy({ step: strategicStep(1), seatId: 'opponent', strategy: '  ' });
    assert.equal(listMatchRecords(gameDbOps).length, count);
    assert.deepEqual(stepForConsult(4, { battleId: 'b', tacticalTurnNumber: 2 }), tacticalStep(4, 'b', 2));
    assert.deepEqual(stepForConsult(4, null), strategicStep(4));
  });
});
