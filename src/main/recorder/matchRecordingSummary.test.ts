/**
 * Recording totals.
 *
 * Purpose: The summary command and a caller that already parsed a file share one set of totals.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecordingSummary.test.js`.
 * Expected outcome: Consults group by seat and stage. A non-numeric field counts as zero. The Total row is always present.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';
import type { MatchRecord, ParsedRecording } from '../../shared/matchRecording';
import { RECORDING_FILE_FORMAT } from '../../shared/matchRecording';
import { formatRecordingSummary, summarizeRecording } from './matchRecordingSummary';

/**
 * One history row with the fields a summary case overrides.
 *
 * Purpose: The cases only vary kind, type, turn, and payload.
 * When to use: Each summary test.
 * Expected outcome: A complete record.
 * Exceptions: None.
 */
function record(row: Pick<MatchRecord, 'recordId' | 'kind' | 'recordType' | 'turnNumber' | 'payload'> & Partial<Pick<MatchRecord, 'recordedAt'>>): MatchRecord {
  return {
    formatVersion: 1,
    stepKey: `s${row.turnNumber}`,
    scope: 'strategic',
    battleId: '',
    beatNumber: 0,
    visibility: 'engine',
    displayText: null,
    recordedAt: '2026-01-01T00:00:00.000Z',
    ...row,
  };
}

test('consult totals group by seat and a broken field counts as zero', () => {
  const recording: ParsedRecording = {
    header: {
      line: 'header',
      format: RECORDING_FILE_FORMAT,
      formatVersion: 1,
      appVersion: '0.0.0',
      matchId: 'summary-match',
      playthroughId: '',
      exportedAt: '2026-01-01T00:00:00.000Z',
    },
    staticData: { line: 'static', hexes: { columns: [], rows: [] } },
    records: [
      record({ recordId: 1, kind: 'frame', recordType: 'state', turnNumber: 1, payload: { tables: {} } }),
      record({ recordId: 2, kind: 'frame', recordType: 'state', turnNumber: 2, payload: { tables: {} } }),
      record({
        recordId: 3,
        kind: 'event',
        recordType: 'consultation',
        turnNumber: 1,
        payload: { seatId: 'opponent', stage: 'orders', inputTokens: 10, outputTokens: 3, cachedTokens: 1, costUsd: 1.5, wallClockMs: 4, attempts: [] },
      }),
      record({
        recordId: 4,
        kind: 'event',
        recordType: 'consultation',
        turnNumber: 2,
        payload: { seatId: 'opponent', stage: 'orders', inputTokens: 5, outputTokens: 1, cachedTokens: 0, costUsd: 0.25, wallClockMs: 2, attempts: [{}] },
      }),
      record({
        recordId: 5,
        kind: 'event',
        recordType: 'consultation',
        turnNumber: 2,
        payload: { seatId: 'opponent2', stage: 'orders', inputTokens: 2, outputTokens: 1, cachedTokens: 0, costUsd: 0.1, wallClockMs: 1, attempts: [] },
      }),
      record({
        recordId: 6,
        kind: 'event',
        recordType: 'consultation',
        turnNumber: 2,
        payload: { seatId: 'opponent', stage: 'orders', inputTokens: 'bad' },
      }),
    ],
  };
  const summary = summarizeRecording(recording);
  assert.equal(summary.frames, 2);
  assert.equal(summary.events, 4);
  assert.equal(summary.lastTurnNumber, 2);
  assert.deepEqual(summary.consultTotals.map((row) => row.seatId), ['opponent', 'opponent2']);
  assert.equal(summary.consultTotals[0]?.consults, 3);
  assert.equal(summary.consultTotals[0]?.inputTokens, 15);
  assert.equal(summary.consultTotals[0]?.costUsd, 1.75);
  const text = formatRecordingSummary(summary);
  assert.match(text, /opponent2\torders\t1\t2\t1\t0\t0\.1000\t1/);
  assert.match(text, /Total\t\t4\t17\t5\t1\t1\.8500\t7/);
});

test('elapsed time and stage rows sum the consults', () => {
  const header: ParsedRecording['header'] = {
    line: 'header',
    format: RECORDING_FILE_FORMAT,
    formatVersion: 1,
    appVersion: '0.0.0',
    matchId: 'elapsed',
    playthroughId: '',
    exportedAt: '2026-01-01T00:00:00.000Z',
  };
  const talk = (recordId: number, seatId: string, recordedAt: string) => record({
    recordId,
    kind: 'event',
    recordType: 'consultation',
    turnNumber: 4,
    recordedAt,
    payload: { seatId, stage: 'talk', costUsd: 1, wallClockMs: 10 },
  });
  const recording: ParsedRecording = {
    header,
    staticData: { line: 'static', hexes: { columns: [], rows: [] } },
    records: [
      talk(1, 'opponent', '2026-11-15T00:00:00.000Z'),
      talk(2, 'opponent2', '2026-11-15T00:10:00.000Z'),
      record({
        recordId: 3,
        kind: 'event',
        recordType: 'consultation',
        turnNumber: 4,
        recordedAt: 'not-a-time',
        payload: { seatId: 'opponent', stage: 'orders', costUsd: 2, wallClockMs: 5 },
      }),
    ],
  };
  const summary = summarizeRecording(recording);
  assert.equal(summary.elapsedMs, 600000);
  assert.equal(summary.elapsedMsPerTurn, 150000);
  assert.equal(summary.consultWallClockMsPerTurn, Math.round(25 / 4));
  const talkStage = summary.stageTotals.find((row) => row.stage === 'talk');
  const ordersStage = summary.stageTotals.find((row) => row.stage === 'orders');
  assert.equal(talkStage?.seatId, 'Stage');
  assert.equal(talkStage?.costUsd, 2);
  assert.equal(ordersStage?.costUsd, 2);
  const text = formatRecordingSummary(summary);
  assert.match(text, /Elapsed ms 600000/);
  assert.match(text, /Elapsed ms per turn 150000/);
  assert.match(text, /Consult wall-clock ms per turn/);
  assert.match(text, /Frame JSON characters/);
  assert.match(text, /Stage\ttalk\t/);
  assert.match(text, /Stage\torders\t/);
  const one = summarizeRecording({ ...recording, records: [talk(1, 'opponent', 'not-a-time')] });
  assert.equal(one.elapsedMs, 0);
  assert.equal(one.elapsedMsPerTurn, 0);
});

test('the summary command reads a gzip recording and refuses a raw fixture', () => {
  const fixturePath = path.join(__dirname, '..', '..', '..', 'src', 'main', 'fixtures', 'recording-format-1.jsonl');
  const cli = path.join(__dirname, 'recordingSummaryCli.js');
  const missing = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.equal(missing.stderr, 'Pass the path of a recording file.\n');
  const raw = spawnSync(process.execPath, [cli, fixturePath], { encoding: 'utf8' });
  assert.equal(raw.status, 1);
  assert.equal(raw.stderr, 'The recording file could not be read.\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-summary-'));
  const gzipPath = path.join(dir, 'fixture.agentwars-recording');
  try {
    fs.writeFileSync(gzipPath, gzipSync(fs.readFileSync(fixturePath)));
    const gzip = spawnSync(process.execPath, [cli, gzipPath], { encoding: 'utf8' });
    assert.equal(gzip.status, 0, gzip.stderr);
    assert.match(gzip.stdout, /Frame JSON characters/);
    assert.match(gzip.stdout, /Recording file bytes \d+/);
    assert.match(gzip.stdout, /Elapsed ms /);
    assert.match(gzip.stdout, /Frames 1/);
    assert.match(gzip.stdout, /Events 1/);
    assert.match(gzip.stdout, /Total\t\t0\t0\t0\t0\t0\.0000\t0/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
