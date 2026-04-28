import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import assert from 'node:assert/strict';
import {
  openGameDatabaseAtPathForTests,
  closeGameDatabaseForTests,
  resetGameForNewMatch,
  listScenarioHomeRegions,
} from '../gameDb';

/**
 * Opens a temporary SQLite game DB and resets a two-region `region_vs_region` match for integration tests.
 *
 * Purpose: Shares mkdtemp/open/`resetGameForNewMatch`/cleanup for scenarios that require distinct human and AI home regions.
 * When to use: Tests that assert behavior after `resetGameForNewMatch` with the first two entries from `listScenarioHomeRegions`.
 * Expected outcome: Callback runs with DB open and scenario state initialized; temp directory removed afterward.
 * Exceptions: Assertion fails when fewer than two named regions exist in fixture terrain data.
 */
export function withRegionVsRegionTempGameDb(runCase: () => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-region-vs-region-'));
  try {
    openGameDatabaseAtPathForTests(path.join(dir, 't.sqlite'));
    const regions = listScenarioHomeRegions();
    assert.ok(regions.length >= 2, 'tests require at least two distinct scenario home regions');
    resetGameForNewMatch({ humanHomeRegion: regions[0]!, aiHomeRegion: regions[1]! });
    runCase();
  } finally {
    closeGameDatabaseForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
