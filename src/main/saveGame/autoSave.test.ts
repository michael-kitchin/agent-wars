/**
 * Automatic saves at the start of a turn.
 *
 * Purpose: Proves rotation, one file per turn, and a failed write that does not throw.
 * When to use: `npm test`.
 * Expected outcome: The automatic-save folder matches the case.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { dbRun } from '../gameDb';
import { withSeatedTempGameDb } from '../testSupport/withSeatedTempGameDb';
import {
  forgetAutoSaveTurnKey,
  maybeWriteTurnStartAutoSave,
  pruneAutoSaves,
  rememberCurrentAutoSaveTurnKey,
  type AutoSaveDeps,
} from './autoSave';
import { autosaveDirectory } from './saveGamePaths';

test('prune keeps the five newest automatic saves and other files', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-autosave-prune-'));
  try {
    for (let day = 1; day <= 7; day += 1) {
      const stamp = `2026010${day}`;
      fs.writeFileSync(path.join(directory, `autosave-${stamp}-000000-000-turn-1.agentwars`), '');
    }
    fs.writeFileSync(path.join(directory, 'notes.txt'), '');
    pruneAutoSaves(directory, 5);
    assert.deepEqual(fs.readdirSync(directory).sort(), [
      'autosave-20260103-000000-000-turn-1.agentwars',
      'autosave-20260104-000000-000-turn-1.agentwars',
      'autosave-20260105-000000-000-turn-1.agentwars',
      'autosave-20260106-000000-000-turn-1.agentwars',
      'autosave-20260107-000000-000-turn-1.agentwars',
      'notes.txt',
    ]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an automatic save is written once per turn and a blocked folder does not throw', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-autosave-write-'));
  let tick = 0;
  const deps: AutoSaveDeps = {
    userDataDir,
    appVersion: 'test-version',
    now: () => new Date(2026, 0, 1, 0, 0, tick++),
  };
  try {
    withSeatedTempGameDb('aw-autosave-write-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      forgetAutoSaveTurnKey();
      maybeWriteTurnStartAutoSave(deps);
      assert.equal(fs.readdirSync(autosaveDirectory(userDataDir)).length, 1);
      maybeWriteTurnStartAutoSave(deps);
      assert.equal(fs.readdirSync(autosaveDirectory(userDataDir)).length, 1);
      dbRun('UPDATE turn_state SET turn_number = 2 WHERE id = 1');
      maybeWriteTurnStartAutoSave(deps);
      assert.equal(fs.readdirSync(autosaveDirectory(userDataDir)).length, 2);
      dbRun("UPDATE turn_state SET phase = 'resolution' WHERE id = 1");
      maybeWriteTurnStartAutoSave(deps);
      assert.equal(fs.readdirSync(autosaveDirectory(userDataDir)).length, 2);
      dbRun("UPDATE turn_state SET phase = 'planning', turn_number = 3 WHERE id = 1");
      fs.rmSync(autosaveDirectory(userDataDir), { recursive: true, force: true });
      fs.writeFileSync(autosaveDirectory(userDataDir), 'not a directory');
      assert.doesNotThrow(() => maybeWriteTurnStartAutoSave(deps));
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test('remembering the open turn skips the automatic save', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-autosave-remember-'));
  const deps: AutoSaveDeps = {
    userDataDir,
    appVersion: 'test-version',
    now: () => new Date(2026, 0, 2, 0, 0, 0),
  };
  try {
    withSeatedTempGameDb('aw-autosave-remember-', { gameMapId: 'global', fogOfWarEnabled: false }, () => {
      forgetAutoSaveTurnKey();
      rememberCurrentAutoSaveTurnKey();
      maybeWriteTurnStartAutoSave(deps);
      assert.equal(fs.existsSync(autosaveDirectory(userDataDir)), false);
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
