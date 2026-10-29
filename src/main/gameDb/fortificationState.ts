/**
 * Reads and writes the fortification flag on one tactical cell.
 *
 * Purpose: Callers fortify or strip a cell without assembling the other feature flags.
 * When to use: Production, combat, and tests. Strategic counts update through the sync triggers.
 * Expected outcome: Lists are sorted by cell index. A missing cell throws from the setter.
 * Exceptions: The setter throws when the cell has no override row, and SQLite throws when the check rejects the write.
 */

import { logDebug, logError, logTrace } from '../logger';
import type { BasicDbOps } from './dbOps';

/**
 * Lists fortified cells in one strategic hex.
 *
 * Purpose: Combat picks one fortified cell to strip.
 * When to use: When a hit or a siege roll removes a fortification.
 * Expected outcome: Cell indexes with `is_fortified = 1`, sorted.
 * Exceptions: Propagates SQLite errors.
 */
export function listFortifiedCellsForHex(ops: BasicDbOps, h3Index: string): string[] {
  logTrace('gameDb listFortifiedCellsForHex', { h3Index });
  const rows = ops.getAll<{ h3Index: string }>(
    `SELECT h3_index AS h3Index
     FROM res_t_feature_overrides
     WHERE parent_h3_index = ? AND is_fortified = 1
     ORDER BY h3_index ASC`,
    [h3Index]
  );
  return rows.map((row) => row.h3Index);
}

/**
 * Lists intact city cells that are not yet fortified.
 *
 * Purpose: Production chooses among cells that can still take a fortification.
 * When to use: Before placing fortifications for one hex.
 * Expected outcome: Urban, non-rubble, unfortified cell indexes, sorted.
 * Exceptions: Propagates SQLite errors.
 */
export function listFortifiableCellsForHex(ops: BasicDbOps, h3Index: string): string[] {
  logTrace('gameDb listFortifiableCellsForHex', { h3Index });
  const rows = ops.getAll<{ h3Index: string }>(
    `SELECT h3_index AS h3Index
     FROM res_t_feature_overrides
     WHERE parent_h3_index = ? AND is_urban = 1 AND is_rubble = 0 AND is_fortified = 0
     ORDER BY h3_index ASC`,
    [h3Index]
  );
  return rows.map((row) => row.h3Index);
}

/**
 * Reports whether one tactical cell is fortified.
 *
 * Purpose: Battle soak checks the cell a sub-unit is standing on.
 * When to use: When a hit names a cell rather than a strategic hex.
 * Expected outcome: True only when the row exists and `is_fortified` is 1.
 * Exceptions: Propagates SQLite errors.
 */
export function isTacticalCellFortified(ops: BasicDbOps, cellH3Index: string): boolean {
  logTrace('gameDb isTacticalCellFortified', { cellH3Index });
  const row = ops.getOne<{ isFortified: number }>(
    'SELECT is_fortified AS isFortified FROM res_t_feature_overrides WHERE h3_index = ?',
    [cellH3Index]
  );
  return row?.isFortified === 1;
}

/**
 * Sets or clears the fortification flag on one existing tactical cell.
 *
 * Purpose: Production and combat change the flag without rewriting the other feature columns.
 * When to use: After choosing a city cell, or after a hit strips one.
 * Expected outcome: The row's `is_fortified` matches `fortified`. Triggers refresh the strategic counts.
 * Exceptions: Throws when the cell has no override row. SQLite throws when the check rejects a non-urban or rubble cell.
 */
export function setTacticalCellFortified(ops: BasicDbOps, cellH3Index: string, fortified: boolean): void {
  logDebug('gameDb setTacticalCellFortified', { cellH3Index, fortified });
  const row = ops.getOne<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res_t_feature_overrides WHERE h3_index = ?',
    [cellH3Index]
  );
  if (!row) {
    const error = new Error(`No tactical feature row for ${cellH3Index}`);
    logError('gameDb setTacticalCellFortified: missing row', error);
    throw error;
  }
  ops.run('UPDATE res_t_feature_overrides SET is_fortified = ? WHERE h3_index = ?', [
    fortified ? 1 : 0,
    cellH3Index,
  ]);
}
