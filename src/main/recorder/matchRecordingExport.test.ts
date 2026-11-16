/**
 * Writing a finished match to a recording file.
 *
 * Purpose: The file round-trips the history, omits machine-local rows, and is replaced only when the database has more rows.
 * When to use: `npm run build:main`, then `node dist/main/recorder/matchRecordingExport.test.js`.
 * Expected outcome: A running match writes nothing. A finished match writes one file, leaves it when the count matches, and rewrites a corrupt file.
 * Exceptions: None. The temporary directories are removed afterward.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { gameDbOps } from '../gameDb/dbConnection';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { upsertGameConfigValue } from '../gameDb/gameConfigRows';
import { readMatchId, readPlaythroughId, setGameOutcomeWithOps, storeNewPlaythroughId } from '../gameDb/gameConfigKv';
import { strategicStep } from '../../shared/matchRecording';
import { readRecordingFile } from './matchRecordingFile';
import { exportFinishedMatchRecordingIfNeeded, recordingFileName, writeMatchRecordingFile } from './matchRecordingExport';
import { listMatchRecords } from './matchRecordStore';
import { recordMatchEvent, recordStepBoundary } from './matchRecorder';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('a recording file round-trips and a finished match is exported once until new rows arrive', () => {
  withTempGameDb('aw-match-export-', () => {
    // Test value. Not a credential.
    const sentinel = 'SENTINEL-KEY-12345';
    for (const key of MACHINE_LOCAL_CONFIG_KEYS) upsertGameConfigValue(gameDbOps, key, sentinel);
    recordStepBoundary(strategicStep(1), '1.0.0');
    recordStepBoundary(strategicStep(2), '1.0.0');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recording-'));
    const target = path.join(dir, 'round.agentwars-recording');
    try {
      writeMatchRecordingFile({ ops: gameDbOps, targetPath: target, appVersion: '1.0.0', exportedAt: '2026-01-01T00:00:00.000Z' });
      const recording = readRecordingFile(target);
      assert.equal(recording.records.length, 5);
      assert.deepEqual(recording.records.map((row) => row.recordId), [1, 2, 3, 4, 5]);
      assert.deepEqual(recording.records.map((row) => row.payload), listMatchRecords(gameDbOps).map((row) => row.payload));
      const hexCount = Number(gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM hexes')?.n);
      assert.equal(recording.staticData.hexes.rows.length, hexCount);
      assert.equal(gunzipSync(fs.readFileSync(target)).toString('utf8').includes(sentinel), false);

      const userData = path.join(dir, 'user');
      const exportDeps = {
        userDataDir: userData,
        appVersion: '1.0.0',
        now: () => new Date('2026-01-02T00:00:00.000Z'),
        deferredConsultPending: false,
      };
      exportFinishedMatchRecordingIfNeeded(exportDeps);
      assert.equal(fs.existsSync(path.join(userData, 'recordings')), false);

      exportFinishedMatchRecordingIfNeeded({ ...exportDeps, deferredConsultPending: true });
      setGameOutcomeWithOps(gameDbOps, { winnerSeatId: 'human', endReason: 'ended_by_human' });
      recordStepBoundary(strategicStep(2), '1.0.0');
      exportFinishedMatchRecordingIfNeeded({ ...exportDeps, deferredConsultPending: true });
      const matchId = readMatchId(gameDbOps) ?? '';
      const playthroughId = readPlaythroughId(gameDbOps) ?? '';
      const finished = path.join(userData, 'recordings', recordingFileName(matchId, playthroughId));
      assert.equal(fs.existsSync(finished), false);
      exportFinishedMatchRecordingIfNeeded(exportDeps);
      assert.equal(fs.existsSync(finished), true);
      const firstTime = fs.statSync(finished).mtimeMs;
      exportFinishedMatchRecordingIfNeeded({ ...exportDeps, now: () => new Date('2026-06-01T00:00:00.000Z') });
      assert.equal(fs.statSync(finished).mtimeMs, firstTime);

      fs.writeFileSync(finished, 'not a recording');
      exportFinishedMatchRecordingIfNeeded(exportDeps);
      assert.equal(readRecordingFile(finished).header.matchId, matchId);

      recordMatchEvent({ type: 'consultation', step: strategicStep(2), visibility: 'engine', payload: { stage: 'orders' } });
      exportFinishedMatchRecordingIfNeeded(exportDeps);
      const rewritten = readRecordingFile(finished);
      assert.equal(rewritten.records.at(-1)?.recordType, 'consultation');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('a match id with path characters becomes a safe file name', () => {
  assert.equal(recordingFileName('a/b:c', 'p/q'), 'recording-a-b-c-p-q.agentwars-recording');
});

test('the export renames over the target and end match passes the pending flag', () => {
  const root = path.join(__dirname, '..', '..', '..');
  const exportSource = fs.readFileSync(path.join(root, 'src', 'main', 'recorder', 'matchRecordingExport.ts'), 'utf8');
  const writeStart = exportSource.indexOf('export function writeMatchRecordingFile');
  const writeBody = exportSource.slice(writeStart, exportSource.indexOf('export function exportFinishedMatchRecordingIfNeeded'));
  assert.equal(writeBody.includes('fs.rmSync(args.targetPath)'), false);
  assert.equal(writeBody.includes('fs.existsSync(args.targetPath)'), false);
  const endSource = fs.readFileSync(path.join(root, 'src', 'main', 'ipc', 'endMatchIpcHandler.ts'), 'utf8');
  assert.equal(endSource.includes('deferredConsultPending: deps.isDeferredConsultPending()'), true);
  const mainSource = fs.readFileSync(path.join(root, 'src', 'main', 'main.ts'), 'utf8');
  assert.equal(
    mainSource.includes('registerEndMatchIpcHandler(ipcMain, { isDeferredConsultPending: hasDeferredPlaybackConsultPending })'),
    true
  );
});

test('two playthroughs of one finished match leave two files', () => {
  withTempGameDb('aw-match-playthroughs-', () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    setGameOutcomeWithOps(gameDbOps, { winnerSeatId: 'human', endReason: 'ended_by_human' });
    recordStepBoundary(strategicStep(1), '1.0.0');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recording-plays-'));
    const exportDeps = {
      userDataDir: dir,
      appVersion: '1.0.0',
      now: () => new Date('2026-01-02T00:00:00.000Z'),
      deferredConsultPending: false,
    };
    try {
      const matchId = readMatchId(gameDbOps) ?? '';
      const firstPlaythrough = readPlaythroughId(gameDbOps) ?? '';
      exportFinishedMatchRecordingIfNeeded(exportDeps);
      const firstPath = path.join(dir, 'recordings', recordingFileName(matchId, firstPlaythrough));
      const firstBytes = fs.readFileSync(firstPath);
      const secondPlaythrough = storeNewPlaythroughId(gameDbOps);
      exportFinishedMatchRecordingIfNeeded({ ...exportDeps, now: () => new Date('2026-02-02T00:00:00.000Z') });
      const secondPath = path.join(dir, 'recordings', recordingFileName(matchId, secondPlaythrough));
      assert.notEqual(firstPath, secondPath);
      assert.equal(fs.existsSync(secondPath), true);
      assert.deepEqual(fs.readFileSync(firstPath), firstBytes);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('a file with the same count and a different last record id is rewritten', () => {
  withTempGameDb('aw-match-tail-', () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    setGameOutcomeWithOps(gameDbOps, { winnerSeatId: 'human', endReason: 'ended_by_human' });
    recordStepBoundary(strategicStep(1), '1.0.0');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recording-tail-'));
    const exportDeps = {
      userDataDir: dir,
      appVersion: '1.0.0',
      now: () => new Date('2026-01-02T00:00:00.000Z'),
      deferredConsultPending: false,
    };
    try {
      exportFinishedMatchRecordingIfNeeded(exportDeps);
      const matchId = readMatchId(gameDbOps) ?? '';
      const playthroughId = readPlaythroughId(gameDbOps) ?? '';
      const finished = path.join(dir, 'recordings', recordingFileName(matchId, playthroughId));
      const before = readRecordingFile(finished).records.length;
      gameDbOps.run('DELETE FROM match_records WHERE record_id = (SELECT MIN(record_id) FROM match_records)');
      recordMatchEvent({ type: 'consultation', step: strategicStep(1), visibility: 'engine', payload: { stage: 'orders' } });
      exportFinishedMatchRecordingIfNeeded({ ...exportDeps, now: () => new Date('2026-03-02T00:00:00.000Z') });
      const after = readRecordingFile(finished);
      assert.equal(after.records.length, before);
      assert.equal(after.records.at(-1)?.recordType, 'consultation');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('writing twice leaves the second file and a directory target keeps the directory', () => {
  withTempGameDb('aw-match-replace-', () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recording-replace-'));
    const target = path.join(dir, 'round.agentwars-recording');
    try {
      writeMatchRecordingFile({ ops: gameDbOps, targetPath: target, appVersion: '1.0.0', exportedAt: '2026-01-01T00:00:00.000Z' });
      recordMatchEvent({ type: 'consultation', step: strategicStep(1), visibility: 'engine', payload: { stage: 'talk' } });
      writeMatchRecordingFile({ ops: gameDbOps, targetPath: target, appVersion: '1.0.0', exportedAt: '2026-01-02T00:00:00.000Z' });
      assert.equal(fs.existsSync(`${target}.tmp`), false);
      assert.equal(readRecordingFile(target).records.at(-1)?.recordType, 'consultation');
      const blocked = path.join(dir, 'blocked');
      fs.mkdirSync(blocked);
      assert.throws(() => writeMatchRecordingFile({
        ops: gameDbOps,
        targetPath: blocked,
        appVersion: '1.0.0',
        exportedAt: '2026-01-03T00:00:00.000Z',
      }));
      assert.equal(fs.statSync(blocked).isDirectory(), true);
      assert.equal(fs.existsSync(`${blocked}.tmp`), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test('multi-byte text in records survives the line-by-line write and read', () => {
  withTempGameDb('aw-match-export-utf8-', () => {
    recordStepBoundary(strategicStep(1), '1.0.0');
    const text = '雪の戦い ⚔ Ünïcödé 🌍'.repeat(200);
    recordMatchEvent({ type: 'commander_strategy', step: strategicStep(1), visibility: 'engine', payload: { text } });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-recording-utf8-'));
    const target = path.join(dir, 'utf8.agentwars-recording');
    try {
      writeMatchRecordingFile({ ops: gameDbOps, targetPath: target, appVersion: '1.0.0', exportedAt: '2026-01-01T00:00:00.000Z' });
      const recording = readRecordingFile(target);
      assert.deepEqual(recording.records.map((row) => row.payload), listMatchRecords(gameDbOps).map((row) => row.payload));
      assert.equal((recording.records.at(-1)?.payload as { text: string }).text, text);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
