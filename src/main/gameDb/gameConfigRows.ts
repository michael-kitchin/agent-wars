/**
 * Plain `game_config` row reads and writes.
 *
 * Purpose: Callers share the three statements that select, replace, or delete one key.
 * When to use: When the SQL is exactly one key and one value, with `?` placeholders.
 * Expected outcome: The stored string, unchanged. This module does not parse JSON.
 * Exceptions: Propagates SQLite errors. Values are never logged, because some keys hold secrets.
 */

import { logDebug, logTrace } from '../logger';
import type { DbReadOps, DbWriteOps } from './dbOps';

/**
 * Reads one `game_config` value.
 *
 * Purpose: Callers keep their own parsing. This only fetches the stored text.
 * When to use: When the key is a bound parameter, not a literal in the SQL.
 * Expected outcome: The stored string, or undefined when the key is absent. The text is not trimmed or defaulted.
 * Exceptions: Propagates SQLite errors.
 */
export function selectGameConfigValue(ops: Pick<DbReadOps, 'getOne'>, key: string): string | undefined {
  const row = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [key]);
  logTrace('gameConfigRows selectGameConfigValue', { key, found: row !== undefined });
  return row?.value;
}

/**
 * Inserts or replaces one `game_config` value.
 *
 * Purpose: Callers share the replace statement.
 * When to use: When both the key and the value are bound parameters.
 * Expected outcome: The row holds `value`. A second write for the same key replaces it.
 * Exceptions: Propagates SQLite errors.
 */
export function upsertGameConfigValue(ops: Pick<DbWriteOps, 'run'>, key: string, value: string): void {
  logDebug('gameConfigRows upsertGameConfigValue', { key, length: value.length });
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [key, value]);
}

/**
 * Deletes one `game_config` row.
 *
 * Purpose: Callers share the single-key delete.
 * When to use: When the key is a bound parameter. A `LIKE` or `IN` delete stays with its caller.
 * Expected outcome: The row is gone. A missing key is not an error.
 * Exceptions: Propagates SQLite errors.
 */
export function deleteGameConfigRow(ops: Pick<DbWriteOps, 'run'>, key: string): void {
  logDebug('gameConfigRows deleteGameConfigRow', { key });
  ops.run('DELETE FROM game_config WHERE key = ?', [key]);
}
