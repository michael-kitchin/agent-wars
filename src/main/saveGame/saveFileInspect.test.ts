/**
 * Save-file inspection against a temporary match.
 *
 * Purpose: Proves a fresh save is accepted and a text file, a raw database, a wrong version, and an unknown map are refused.
 * When to use: `npm test`.
 * Expected outcome: Each file gets the sentence for the first check it fails.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { dbGetOne, EXPECTED_USER_VERSION } from '../gameDb';
import { getDbHandle } from '../gameDb/dbConnection';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import { SAVE_NOT_A_SAVE_MESSAGE, SAVE_UNKNOWN_MAP_MESSAGE, saveWrongVersionMessage } from './saveFileFormat';
import { inspectSaveFile } from './saveFileInspect';
import { writeSaveFileFromOpenDatabase } from './saveFileWrite';

/**
 * Runs one case against a global match and a separate temp directory.
 *
 * Purpose: Inspection reads files that must outlive the writes inside the match fixture.
 * When to use: Each test in this file.
 * Expected outcome: `runCase` receives the directory. It is removed afterward.
 * Exceptions: Propagates a case error after cleanup.
 */
function withInspectDir(runCase: (filesDir: string) => void): void {
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-save-inspect-'));
  try {
    withSeatedTempGameDb('aw-save-inspect-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      runCase(filesDir);
    });
  } finally {
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
}

test('a fresh save reports the map and turn', () => {
  withInspectDir((filesDir) => {
    const targetPath = path.join(filesDir, 'match.agentwars');
    writeSaveFileFromOpenDatabase({
      targetPath,
      stagingPath: path.join(filesDir, 'staging.agentwars'),
      appVersion: 'test-version',
    });
    const mapId = dbGetOne<{ value: string }>("SELECT value FROM game_config WHERE key = 'game_map_id'")?.value ?? 'global';
    const inspected = inspectSaveFile(targetPath, 'test-current');
    assert.deepEqual(inspected, { ok: true, gameMapId: mapId, turnNumber: 1 });
  });
});

test('a text file and a raw match database are not saves', () => {
  withInspectDir((filesDir) => {
    const textPath = path.join(filesDir, 'notes.txt');
    fs.writeFileSync(textPath, 'not a database');
    assert.deepEqual(inspectSaveFile(textPath, 'test-current'), { ok: false, message: SAVE_NOT_A_SAVE_MESSAGE });
    const rawPath = path.join(filesDir, 'raw.sqlite');
    const openPath = getDbHandle()?.name;
    assert.ok(openPath);
    fs.copyFileSync(openPath, rawPath);
    assert.deepEqual(inspectSaveFile(rawPath, 'test-current'), { ok: false, message: SAVE_NOT_A_SAVE_MESSAGE });
  });
});

test('an older database version names the app that wrote it', () => {
  withInspectDir((filesDir) => {
    const targetPath = path.join(filesDir, 'match.agentwars');
    writeSaveFileFromOpenDatabase({
      targetPath,
      stagingPath: path.join(filesDir, 'staging.agentwars'),
      appVersion: 'test-version',
    });
    const saved = new Database(targetPath);
    saved.pragma(`user_version = ${EXPECTED_USER_VERSION - 1}`);
    saved.close();
    assert.deepEqual(inspectSaveFile(targetPath, 'test-current'), {
      ok: false,
      message: saveWrongVersionMessage('test-version', 'test-current'),
    });
  });
});

test('an unknown map is refused', () => {
  withInspectDir((filesDir) => {
    const targetPath = path.join(filesDir, 'match.agentwars');
    writeSaveFileFromOpenDatabase({
      targetPath,
      stagingPath: path.join(filesDir, 'staging.agentwars'),
      appVersion: 'test-version',
    });
    const saved = new Database(targetPath);
    saved.prepare("UPDATE game_config SET value = 'no_such_map' WHERE key = 'game_map_id'").run();
    saved.close();
    assert.deepEqual(inspectSaveFile(targetPath, 'test-current'), { ok: false, message: SAVE_UNKNOWN_MAP_MESSAGE });
  });
});
