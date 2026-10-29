/**
 * Manual save and load through the pipeline, with fake dialogs.
 *
 * Purpose: Proves a saved match comes back, Ready in flight blocks both calls, and a text file is refused.
 * When to use: `npm test`.
 * Expected outcome: The open match matches the case, and no staging file remains.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { dbGetAll, dbGetOne, dbRun, resetGameForNewMatch } from '../gameDb';
import { getDbHandle } from '../gameDb/dbConnection';
import { withSeatedTempGameDbAsync } from '../testSupport/withSeatedTempGameDb';
import { LOAD_BUSY_MESSAGE, SAVE_BUSY_MESSAGE, SAVE_NOT_A_SAVE_MESSAGE } from './saveFileFormat';
import { loadStagingPath, saveStagingPath } from './saveGamePaths';
import { runLoadGame, runSaveGame, type SaveLoadDeps } from './saveLoadPipeline';

/**
 * Reads the open match's unit ids in a stable order.
 *
 * Purpose: A loaded match has the units the save was made from.
 * When to use: Before saving and after loading.
 * Expected outcome: The `id` column, sorted.
 * Exceptions: None.
 */
function unitIds(): string[] {
  return dbGetAll<{ id: string }>('SELECT id FROM units ORDER BY id').map((row) => row.id);
}

/**
 * Builds pipeline dependencies around one open match.
 *
 * Purpose: The tests choose the dialog results and whether Ready counts as in flight.
 * When to use: Each case in this file.
 * Expected outcome: Deps whose dialogs return the given paths.
 * Exceptions: None.
 */
function depsFor(args: {
  readonly userDataDir: string;
  readonly canonicalDbPath: string;
  readonly savePath: string | null;
  readonly openPath: string | null;
  readonly ready: boolean;
  readonly saveCalls: { count: number };
  readonly openCalls: { count: number };
}): SaveLoadDeps {
  return {
    userDataDir: args.userDataDir,
    documentsDir: args.userDataDir,
    appVersion: 'test-version',
    canonicalDbPath: args.canonicalDbPath,
    showSaveDialog: async () => {
      args.saveCalls.count += 1;
      return args.savePath;
    },
    showOpenDialog: async () => {
      args.openCalls.count += 1;
      return args.openPath;
    },
    stopModelWorkForLoad: () => undefined,
    isReadyInFlight: () => args.ready,
  };
}

test('a saved match loads back over a new match', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pipeline-'));
  try {
    await withSeatedTempGameDbAsync('aw-pipeline-', { gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 1 }, async () => {
      const canonicalDbPath = getDbHandle()?.name;
      assert.ok(canonicalDbPath);
      const savedIds = unitIds();
      const savePath = path.join(userDataDir, 'match.agentwars');
      const calls = { saveCalls: { count: 0 }, openCalls: { count: 0 } };
      const saved = await runSaveGame(depsFor({
        userDataDir,
        canonicalDbPath,
        savePath,
        openPath: savePath,
        ready: false,
        ...calls,
      }));
      assert.equal(saved.status, 'saved');
      resetGameForNewMatch({ gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 2 });
      dbRun('UPDATE turn_state SET turn_number = 4 WHERE id = 1');
      const loaded = await runLoadGame(depsFor({
        userDataDir,
        canonicalDbPath,
        savePath,
        openPath: savePath,
        ready: false,
        ...calls,
      }));
      assert.deepEqual(loaded, { status: 'loaded', fileName: 'match.agentwars' });
      assert.equal(dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number, 1);
      assert.deepEqual(unitIds(), savedIds);
      assert.equal(fs.existsSync(saveStagingPath(userDataDir)), false);
      assert.equal(fs.existsSync(loadStagingPath(userDataDir)), false);
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('Ready in flight refuses save and load before any dialog', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pipeline-ready-'));
  try {
    await withSeatedTempGameDbAsync('aw-pipeline-ready-', { gameMapId: 'global', fogOfWarEnabled: false }, async () => {
      const canonicalDbPath = getDbHandle()?.name;
      assert.ok(canonicalDbPath);
      const saveCalls = { count: 0 };
      const openCalls = { count: 0 };
      const deps = depsFor({
        userDataDir,
        canonicalDbPath,
        savePath: path.join(userDataDir, 'match.agentwars'),
        openPath: path.join(userDataDir, 'match.agentwars'),
        ready: true,
        saveCalls,
        openCalls,
      });
      assert.deepEqual(await runSaveGame(deps), { status: 'failed', message: SAVE_BUSY_MESSAGE });
      assert.deepEqual(await runLoadGame(deps), { status: 'failed', message: LOAD_BUSY_MESSAGE });
      assert.equal(saveCalls.count, 0);
      assert.equal(openCalls.count, 0);
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('a text file is not loaded and the open match stays', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-pipeline-text-'));
  try {
    await withSeatedTempGameDbAsync('aw-pipeline-text-', { gameMapId: 'global', fogOfWarEnabled: false }, async () => {
      const canonicalDbPath = getDbHandle()?.name;
      assert.ok(canonicalDbPath);
      dbRun('UPDATE turn_state SET turn_number = 4 WHERE id = 1');
      const textPath = path.join(userDataDir, 'notes.txt');
      fs.writeFileSync(textPath, 'not a database');
      const loaded = await runLoadGame(depsFor({
        userDataDir,
        canonicalDbPath,
        savePath: null,
        openPath: textPath,
        ready: false,
        saveCalls: { count: 0 },
        openCalls: { count: 0 },
      }));
      assert.deepEqual(loaded, { status: 'failed', message: SAVE_NOT_A_SAVE_MESSAGE });
      assert.equal(dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number, 4);
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
