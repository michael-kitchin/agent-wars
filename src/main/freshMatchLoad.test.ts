import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
  clearLoadedGameMapForTests,
} from './gameMap/loadGameMap';
import { closeGameDatabaseForTests, dbGetOne, openGameDatabaseAtPathForTests, resetGameForNewMatch } from './gameDb';
import {
  clearTerrainClassificationCacheForTests,
  isTerrainClassificationCacheLoaded,
} from './terrainClassificationCache';

/**
 * Opens a new empty database in a temp directory.
 *
 * Purpose: The fresh-match cases must not touch the player's saved match.
 * When to use: At the start of each test in this file.
 * Expected outcome: The path of a database that did not exist before the call.
 * Exceptions: None.
 */
function openFreshDatabase(): { directory: string; filePath: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-fresh-match-'));
  const filePath = path.join(directory, 'match.sqlite');
  openGameDatabaseAtPathForTests(filePath);
  return { directory, filePath };
}

test('a fresh database does not load terrain', () => {
  clearTerrainClassificationCacheForTests();
  clearLoadedGameMapForTests();
  const { directory } = openFreshDatabase();
  try {
    assert.equal(isTerrainClassificationCacheLoaded(), false);
    const count = dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes')?.c ?? 0;
    assert.equal(count, 0);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a global start seeds 842 hexes', () => {
  const { directory } = openFreshDatabase();
  try {
    resetGameForNewMatch();
    const count = dbGetOne<{ c: number }>('SELECT COUNT(*) AS c FROM hexes')?.c ?? 0;
    assert.equal(count, 842);
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
