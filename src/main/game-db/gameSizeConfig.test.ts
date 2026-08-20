import * as assert from 'assert';
import { withTempGameDb } from '../testSupport/withTempGameDb';
import { dbGetOne, dbRun, getGameStateForPlayer, resetGameForNewMatch } from '../gameDb';
import { GAME_SIZE_CONFIG_KEY, persistGameSize, readPersistedGameSize } from './gameSizeConfig';

/**
 * Builds `game_config` ops for persist/read helpers in this test file.
 *
 * Purpose: Matches production call sites that pass `run`/`getOne` without importing the gameDb façade into gameSizeConfig.
 * When to use: Inside `withTempGameDb` cases.
 * Expected outcome: Helpers read and write the temp SQLite file.
 * Exceptions: None.
 */
function kvOps(): { run: typeof dbRun; getOne: typeof dbGetOne; hasDb: () => boolean } {
  return { run: dbRun, getOne: dbGetOne, hasDb: () => true };
}

/**
 * Locks persist-on-reset, snapshot exposure, invalid-value fallback, and overwrite of a previous Medium match.
 *
 * Purpose: New matches must not inherit leftover sizes; snapshots must match `game_config`.
 * When to use: After changing `resetGameForNewMatch` or snapshot assembly.
 * Expected outcome: Medium persists; omit/invalid/missing become small; a following reset without size writes small.
 * Exceptions: None.
 */
function testPersistedGameSizeOnResetAndSnapshot(): void {
  withTempGameDb('aw-gamesize-', () => {
    resetGameForNewMatch({ gameSize: 'medium' });
    const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [GAME_SIZE_CONFIG_KEY]);
    assert.strictEqual(row?.value, 'medium');
    assert.strictEqual(getGameStateForPlayer('human').gameSize, 'medium');
    assert.strictEqual(getGameStateForPlayer('opponent').gameSize, 'medium');

    resetGameForNewMatch();
    const afterOmit = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [GAME_SIZE_CONFIG_KEY]);
    assert.strictEqual(afterOmit?.value, 'small');
    assert.strictEqual(getGameStateForPlayer('human').gameSize, 'small');

    dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [GAME_SIZE_CONFIG_KEY, 'nope']);
    assert.strictEqual(getGameStateForPlayer('human').gameSize, 'small');
    assert.strictEqual(readPersistedGameSize(kvOps()), 'small');

    dbRun('DELETE FROM game_config WHERE key = ?', [GAME_SIZE_CONFIG_KEY]);
    assert.strictEqual(
      dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [GAME_SIZE_CONFIG_KEY]),
      undefined
    );
    assert.strictEqual(getGameStateForPlayer('human').gameSize, 'small');
    assert.strictEqual(readPersistedGameSize(kvOps()), 'small');

    persistGameSize(kvOps(), 'large');
    resetGameForNewMatch({});
    assert.strictEqual(getGameStateForPlayer('human').gameSize, 'small');
  });
}

function run(): void {
  testPersistedGameSizeOnResetAndSnapshot();
  console.log('gameSizeConfig.test.ts passed');
}

run();
