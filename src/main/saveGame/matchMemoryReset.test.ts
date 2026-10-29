/**
 * Restoring a tactical battle from a save after the in-memory battle was ended.
 *
 * Purpose: Proves a mid-battle save comes back as the same battle after the match file is replaced.
 * When to use: `npm test`.
 * Expected outcome: The restored snapshot has the saved battle id, tactical turn, and sub-unit count.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { getDbHandle } from '../gameDb/dbConnection';
import { replaceGameDatabaseWithStagedFile } from '../gameDb/databaseReplace';
import {
  endTacticalBattleSession,
  getActiveTacticalBattleSnapshot,
  isTacticalBattleActive,
  startTacticalBattleForEnclosingHex,
} from '../tacticalBattle/tacticalBattleSession';
import {
  tacticalDbFixtureRegisterDefaultAfterEach,
  tacticalDbFixtureWithTempDbContestedPlanning,
} from '../tacticalBattle/testSupport/tacticalDbFixture';
import { stageSaveFileForLoad } from './loadStaging';
import { resetMatchMemoryAfterDatabaseReplace } from './matchMemoryReset';
import { matchSaveBlocker } from './saveFileWrite';
import { writeSaveFileFromOpenDatabase } from './saveFileWrite';

tacticalDbFixtureRegisterDefaultAfterEach();

test('a save made during a tactical battle restores that battle', () => {
  const filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-battle-save-'));
  try {
    tacticalDbFixtureWithTempDbContestedPlanning('aw-battle-save-', ({ targetStrategicH3 }) => {
      const started = startTacticalBattleForEnclosingHex(targetStrategicH3);
      assert.equal(started.success, true, started.success ? '' : started.reason);
      const before = getActiveTacticalBattleSnapshot();
      assert.ok(before);
      const battleId = before.battleId;
      const tacticalTurnNumber = before.tacticalTurnNumber;
      const subUnitCount = before.subUnits.length;
      assert.equal(matchSaveBlocker(), null);
      const savePath = path.join(filesDir, 'match.agentwars');
      const loadStagingPath = path.join(filesDir, 'load-staging.agentwars');
      writeSaveFileFromOpenDatabase({
        targetPath: savePath,
        stagingPath: path.join(filesDir, 'save-staging.agentwars'),
        appVersion: 'test-version',
      });
      endTacticalBattleSession();
      assert.equal(isTacticalBattleActive(), false);
      const staged = stageSaveFileForLoad(savePath, loadStagingPath, 'test-current');
      assert.equal(staged.ok, true);
      const canonicalPath = getDbHandle()?.name;
      assert.ok(canonicalPath);
      assert.deepEqual(replaceGameDatabaseWithStagedFile(canonicalPath, loadStagingPath), { ok: true });
      resetMatchMemoryAfterDatabaseReplace();
      assert.equal(isTacticalBattleActive(), true);
      const restored = getActiveTacticalBattleSnapshot();
      assert.ok(restored);
      assert.equal(restored.battleId, battleId);
      assert.equal(restored.tacticalTurnNumber, tacticalTurnNumber);
      assert.equal(restored.subUnits.length, subUnitCount);
    });
  } finally {
    fs.rmSync(filesDir, { recursive: true, force: true });
  }
});
