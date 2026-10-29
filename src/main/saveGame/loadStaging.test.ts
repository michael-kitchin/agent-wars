/**
 * Staging a save before it replaces the open match.
 *
 * Purpose: Proves this machine's setup is copied in, a text file leaves nothing behind, and a closed match database is refused.
 * When to use: `npm test`.
 * Expected outcome: A usable staging file, or no file when the source is not a save or the match database is closed.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { closeGameDatabaseForTests, dbRun } from '../gameDb';
import { MACHINE_LOCAL_CONFIG_KEYS } from '../gameDb/machineLocalConfigKeys';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { LOAD_FAILED_MESSAGE, SAVE_APP_VERSION_CONFIG_KEY, SAVE_NOT_A_SAVE_MESSAGE, SAVE_WRITTEN_AT_CONFIG_KEY } from './saveFileFormat';
import { stageSaveFileForLoad } from './loadStaging';
import { writeSaveFileFromOpenDatabase } from './saveFileWrite';

/** Fake OpenRouter value. For testing only. */
const TEST_OPENROUTER_KEY = 'test-openrouter-key';

test('staging a save copies this machine setup and drops save metadata', () => {
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-load-stage-'));
  try {
    withSeatedTempGameDb('aw-load-stage-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      for (const key of MACHINE_LOCAL_CONFIG_KEYS) {
        dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, TEST_OPENROUTER_KEY]);
      }
      const savePath = path.join(filesDir, 'match.agentwars');
      const stagingPath = path.join(filesDir, 'load-staging.agentwars');
      writeSaveFileFromOpenDatabase({
        targetPath: savePath,
        stagingPath: path.join(filesDir, 'save-staging.agentwars'),
        appVersion: 'test-version',
      });
      const staged = stageSaveFileForLoad(savePath, stagingPath, 'test-current');
      assert.equal(staged.ok, true);
      const db = new Database(stagingPath, { readonly: true, fileMustExist: true });
      try {
        for (const key of MACHINE_LOCAL_CONFIG_KEYS) {
          const row = db.prepare('SELECT value FROM game_config WHERE key = ?').get(key) as { value: string } | undefined;
          assert.equal(row?.value, TEST_OPENROUTER_KEY);
        }
        assert.equal(db.prepare('SELECT value FROM game_config WHERE key = ?').get(SAVE_APP_VERSION_CONFIG_KEY), undefined);
        assert.equal(db.prepare('SELECT value FROM game_config WHERE key = ?').get(SAVE_WRITTEN_AT_CONFIG_KEY), undefined);
      } finally {
        db.close();
      }
    });
  } finally {
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
});

test('staging a text file reports that it is not a save and leaves no file', () => {
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-load-stage-text-'));
  try {
    withSeatedTempGameDb('aw-load-stage-text-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      const textPath = path.join(filesDir, 'notes.txt');
      const stagingPath = path.join(filesDir, 'load-staging.agentwars');
      fs.writeFileSync(textPath, 'not a database');
      assert.deepEqual(stageSaveFileForLoad(textPath, stagingPath, 'test-current'), {
        ok: false,
        message: SAVE_NOT_A_SAVE_MESSAGE,
      });
      assert.equal(fs.existsSync(stagingPath), false);
    });
  } finally {
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
});

test('staging a save while the match database is closed leaves no file', () => {
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-load-stage-closed-'));
  try {
    withSeatedTempGameDb('aw-load-stage-closed-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      const savePath = path.join(filesDir, 'match.agentwars');
      const stagingPath = path.join(filesDir, 'load-staging.agentwars');
      writeSaveFileFromOpenDatabase({
        targetPath: savePath,
        stagingPath: path.join(filesDir, 'save-staging.agentwars'),
        appVersion: 'test-version',
      });
      closeGameDatabaseForTests();
      assert.deepEqual(stageSaveFileForLoad(savePath, stagingPath, 'test-current'), {
        ok: false,
        message: LOAD_FAILED_MESSAGE,
      });
      assert.equal(fs.existsSync(stagingPath), false);
    });
  } finally {
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
});
