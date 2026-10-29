/**
 * Replacing the open match with a staged save.
 *
 * Purpose: Proves a save round-trips, a broken staging file restores the previous match, and a regional save loads its map.
 * When to use: `npm test`.
 * Expected outcome: The open database matches the case. The temporary directory is removed.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { resetActiveGameMap } from '../../shared/activeGameMap';
import { setLoadedStrategicFootprint } from '../../shared/loadedStrategicFootprint';
import {
  closeGameDatabaseForTests,
  dbGetAll,
  dbGetOne,
  dbRun,
  getGameState,
  openGameDatabaseAtPathForTests,
  resetGameForNewMatch,
} from '../gameDb';
import { clearLoadedGameMapForTests, loadedGameMapId } from '../gameMap/loadGameMap';
import { readRegionManifest, resolveGeneratedRegionsDirectory } from '../gameMap/regionManifestRead';
import { installSideGroupHomes } from '../regionScenario';
import { setActiveTerrainPackDirectory } from '../terrainMetadataPaths';
import { clearTacticalOriginAreas } from '../unitOrigin/tacticalOriginAreas';
import { writeSaveFileFromOpenDatabase } from '../saveGame/saveFileWrite';
import { BEFORE_LOAD_BACKUP_SUFFIX, replaceGameDatabaseWithStagedFile } from './databaseReplace';

/**
 * Reads the open match's unit ids in a stable order.
 *
 * Purpose: A restored match has the same units it had before the swap.
 * When to use: Before saving and after replacing.
 * Expected outcome: The `id` column, sorted.
 * Exceptions: None.
 */
function unitIds(): string[] {
  return dbGetAll<{ id: string }>('SELECT id FROM units ORDER BY id').map((row) => row.id);
}

/**
 * Reads the open match's turn number.
 *
 * Purpose: The round trip keeps the saved turn, and a failed replace keeps the later match's turn.
 * When to use: After a replace.
 * Expected outcome: `turn_state.turn_number` for row 1.
 * Exceptions: None.
 */
function turnNumber(): number {
  return dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number ?? 0;
}

test('a staged save replaces the open match', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-db-replace-'));
  const canonicalPath = path.join(dir, 'match.sqlite');
  openGameDatabaseAtPathForTests(canonicalPath);
  try {
    resetGameForNewMatch({ gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 1 });
    dbRun('UPDATE turn_state SET turn_number = 3 WHERE id = 1');
    const savedIds = unitIds();
    const savePath = path.join(dir, 'match.agentwars');
    writeSaveFileFromOpenDatabase({
      targetPath: savePath,
      stagingPath: path.join(dir, 'save-staging.agentwars'),
      appVersion: 'test-version',
    });
    resetGameForNewMatch({ gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 2 });
    const stagedPath = path.join(dir, 'load-staging.agentwars');
    fs.copyFileSync(savePath, stagedPath);
    assert.deepEqual(replaceGameDatabaseWithStagedFile(canonicalPath, stagedPath), { ok: true });
    assert.equal(turnNumber(), 3);
    assert.deepEqual(unitIds(), savedIds);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a staging file missing a required table restores the previous match', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-db-replace-bad-'));
  const canonicalPath = path.join(dir, 'match.sqlite');
  openGameDatabaseAtPathForTests(canonicalPath);
  try {
    resetGameForNewMatch({ gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 1 });
    const savePath = path.join(dir, 'match.agentwars');
    writeSaveFileFromOpenDatabase({
      targetPath: savePath,
      stagingPath: path.join(dir, 'save-staging.agentwars'),
      appVersion: 'test-version',
    });
    resetGameForNewMatch({ gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 2 });
    const matchBIds = unitIds();
    const stagedPath = path.join(dir, 'load-staging.agentwars');
    fs.copyFileSync(savePath, stagedPath);
    const staged = new Database(stagedPath);
    staged.exec('DROP TABLE units');
    staged.close();
    const replaced = replaceGameDatabaseWithStagedFile(canonicalPath, stagedPath);
    assert.equal(replaced.ok, false);
    assert.equal(turnNumber(), 1);
    assert.deepEqual(unitIds(), matchBIds);
    assert.equal(fs.existsSync(`${canonicalPath}${BEFORE_LOAD_BACKUP_SUFFIX}`), true);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a Maghreb save loads the Maghreb map over a global match', (t) => {
  const root = resolveGeneratedRegionsDirectory();
  const directory = root ? path.join(root, 'maghreb') : '';
  const manifestPath = directory ? path.join(directory, 'region_manifest.json') : '';
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    t.skip('maghreb JSON is not extracted. Run npm run regional:extract');
    return;
  }
  const manifest = readRegionManifest(manifestPath);
  const [human, ai] = manifest.sideGroups;
  if (!human || !ai) {
    t.skip('maghreb has fewer than two side groups');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-db-replace-maghreb-'));
  const canonicalPath = path.join(dir, 'match.sqlite');
  openGameDatabaseAtPathForTests(canonicalPath);
  try {
    resetGameForNewMatch({
      gameMapId: 'maghreb',
      fogOfWarEnabled: false,
      seats: [
        { kind: 'human', sideGroupId: human.id },
        { kind: 'ai', sideGroupId: ai.id },
      ],
    });
    const savePath = path.join(dir, 'match.agentwars');
    writeSaveFileFromOpenDatabase({
      targetPath: savePath,
      stagingPath: path.join(dir, 'save-staging.agentwars'),
      appVersion: 'test-version',
    });
    resetGameForNewMatch({ gameMapId: 'global', fogOfWarEnabled: false, gameSeed: 2 });
    const stagedPath = path.join(dir, 'load-staging.agentwars');
    fs.copyFileSync(savePath, stagedPath);
    assert.deepEqual(replaceGameDatabaseWithStagedFile(canonicalPath, stagedPath), { ok: true });
    assert.equal(loadedGameMapId(), 'maghreb');
    assert.equal(getGameState().hexes.length, manifest.hexes.length);
  } finally {
    closeGameDatabaseForTests();
    clearLoadedGameMapForTests();
    setActiveTerrainPackDirectory(null);
    setLoadedStrategicFootprint(null);
    installSideGroupHomes(null);
    clearTacticalOriginAreas();
    resetActiveGameMap();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
