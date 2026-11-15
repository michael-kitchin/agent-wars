/**
 * `match_records` and the match id.
 *
 * Purpose: The history table is created on open, and a new match does not keep the previous id or rows.
 * When to use: `npm run build:main`, then `node dist/main/gameDb/matchRecordsTable.test.js`.
 * Expected outcome: The table has the history columns, a bad kind is rejected, and reset replaces the id.
 * Exceptions: None. The temporary directory is removed afterward.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resetGameForNewMatch } from '../gameDb';
import { gameDbOps } from './dbConnection';
import { ensureMatchId, MATCH_ID_CONFIG_KEY, readMatchId } from './gameConfigKv';
import { ensureMatchRecordsTable } from './matchRecordsTable';
import { withTempGameDb } from '../testSupport/withTempGameDb';

test('match_records is created on open and reset replaces the match id', () => {
  withTempGameDb('aw-match-records-', () => {
    const columns = gameDbOps.getAll<{ name: string }>('PRAGMA table_info(match_records)');
    assert.equal(columns.length, 13);
    assert.equal(gameDbOps.getOne<{ user_version: number }>('PRAGMA user_version')?.user_version, 26);
    assert.throws(() =>
      gameDbOps.run(
        `INSERT INTO match_records (kind, record_type, format_version, step_key, scope, turn_number, visibility, recorded_at, payload)
         VALUES ('other', 'state', 1, 's1', 'strategic', 1, 'engine', '2026-01-01T00:00:00.000Z', X'00')`
      )
    );
    gameDbOps.run('DROP TABLE match_records');
    ensureMatchRecordsTable((sql) => gameDbOps.run(sql));
    ensureMatchRecordsTable((sql) => gameDbOps.run(sql));
    assert.equal(gameDbOps.getAll('PRAGMA table_info(match_records)').length, 13);

    const firstId = readMatchId(gameDbOps);
    assert.ok(firstId);
    gameDbOps.run(
      `INSERT INTO match_records (kind, record_type, format_version, step_key, scope, turn_number, visibility, recorded_at, payload)
       VALUES ('event', 'match_started', 1, 's1', 'strategic', 1, 'everyone', '2026-01-01T00:00:00.000Z', X'00')`
    );
    resetGameForNewMatch();
    const secondId = readMatchId(gameDbOps);
    assert.ok(secondId);
    assert.notEqual(secondId, firstId);
    assert.equal(gameDbOps.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM match_records')?.n, 0);

    gameDbOps.run('DELETE FROM game_config WHERE key = ?', [MATCH_ID_CONFIG_KEY]);
    assert.equal(readMatchId(gameDbOps), null);
    const created = ensureMatchId(gameDbOps);
    assert.ok(created.length > 0);
    assert.equal(ensureMatchId(gameDbOps), created);
    assert.equal(readMatchId(gameDbOps), created);
  });
});
