/**
 * Save-file writing against a temporary match.
 *
 * Purpose: Proves a save drops this machine's setup, refuses a turn that is still resolving, and writes a finished match with its result and history.
 * When to use: `npm test`.
 * Expected outcome: The open match is unchanged, and a failed write leaves no target file.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { strategicStep } from '../../shared/matchRecording';
import { dbGetOne, dbRun } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { setGameOutcomeWithOps } from '../gameDb/gameConfigKv';
import { recordStepBoundary } from '../recorder/matchRecorder';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { SAVE_APPLICATION_ID, SAVE_APP_VERSION_CONFIG_KEY, SAVE_BUSY_MESSAGE, SAVE_WRITTEN_AT_CONFIG_KEY } from './saveFileFormat';
import { matchSaveBlocker, writeSaveFileFromOpenDatabase } from './saveFileWrite';

/** Fake OpenRouter value. For testing only. */
const TEST_OPENROUTER_KEY = 'test-openrouter-key';

/**
 * Runs one case against a global match and a separate temp directory for the save files.
 *
 * Purpose: The match fixture deletes its own directory, so the save files live somewhere else until the case finishes.
 * When to use: Each test in this file.
 * Expected outcome: `runCase` receives the target and staging paths. Both temp directories are removed afterward.
 * Exceptions: Propagates a case error after cleanup.
 */
function withSaveFiles(runCase: (targetPath: string, stagingPath: string) => void): void {
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-save-files-'));
  try {
    withSeatedTempGameDb('aw-save-write-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      runCase(path.join(filesDir, 'match.agentwars'), path.join(filesDir, 'staging.agentwars'));
    });
  } finally {
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}

test('a save omits machine-local rows and keeps them in the open match', () => {
  withSaveFiles((targetPath, stagingPath) => {
    for (const key of MACHINE_LOCAL_CONFIG_KEYS) {
      dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, TEST_OPENROUTER_KEY]);
    }
    writeSaveFileFromOpenDatabase({ targetPath, stagingPath, appVersion: 'test-version' });
    const saved = new Database(targetPath, { readonly: true, fileMustExist: true });
    try {
      assert.equal(Number(saved.pragma('application_id', { simple: true })), SAVE_APPLICATION_ID);
      for (const key of MACHINE_LOCAL_CONFIG_KEYS) {
        assert.equal(saved.prepare('SELECT value FROM game_config WHERE key = ?').get(key), undefined);
        assert.equal(dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key])?.value, TEST_OPENROUTER_KEY);
      }
      assert.equal(
        (saved.prepare('SELECT value FROM game_config WHERE key = ?').get(SAVE_APP_VERSION_CONFIG_KEY) as { value: string }).value,
        'test-version',
      );
      assert.ok(saved.prepare('SELECT value FROM game_config WHERE key = ?').get(SAVE_WRITTEN_AT_CONFIG_KEY));
    } finally {
      saved.close();
    }
    assert.equal(fs.existsSync(stagingPath), false);
    assert.equal(fs.existsSync(`${targetPath}.partial`), false);
  });
});

test('a resolving turn is not written', () => {
  withSaveFiles((targetPath, stagingPath) => {
    dbRun("UPDATE turn_state SET phase = 'resolution' WHERE id = 1");
    assert.throws(
      () => writeSaveFileFromOpenDatabase({ targetPath, stagingPath, appVersion: 'test-version' }),
      (err: unknown) => err instanceof Error && err.message === SAVE_BUSY_MESSAGE,
    );
    assert.equal(fs.existsSync(targetPath), false);
  });
});

test('a finished match is written with its result and its history', () => {
  withSaveFiles((targetPath, stagingPath) => {
    recordStepBoundary(strategicStep(1), 'test-version');
    setGameOutcomeWithOps(gameDbOps, { winnerSeatId: 'human', endReason: 'last_side_standing' });
    recordStepBoundary(strategicStep(1), 'test-version');
    const recordCount = Number(dbGetOne<{ n: number }>('SELECT COUNT(*) AS n FROM match_records')?.n);
    assert.ok(recordCount >= 2, 'the match has history to save');
    assert.equal(matchSaveBlocker(), null);
    writeSaveFileFromOpenDatabase({ targetPath, stagingPath, appVersion: 'test-version' });
    const saved = new Database(targetPath, { readonly: true, fileMustExist: true });
    try {
      const read = (key: string): string | undefined => (saved.prepare('SELECT value FROM game_config WHERE key = ?').get(key) as { value: string } | undefined)?.value;
      assert.equal(read('game_over'), '1');
      assert.equal(read('winner'), dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', ['winner'])?.value);
      assert.equal(Number((saved.prepare('SELECT COUNT(*) AS n FROM match_records').get() as { n: number }).n), recordCount);
    } finally {
      saved.close();
    }
  });
});
