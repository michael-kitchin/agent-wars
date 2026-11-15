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
import { readMatchId, setGameOutcomeWithOps } from '../gameDb/gameConfigKv';
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
      assert.equal(recording.records.length, 3);
      assert.deepEqual(recording.records.map((row) => row.recordId), [1, 2, 3]);
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
      const finished = path.join(userData, 'recordings', recordingFileName(matchId));
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
  assert.equal(recordingFileName('a/b:c'), 'recording-a-b-c.agentwars-recording');
});
