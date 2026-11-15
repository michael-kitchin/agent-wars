/**
 * Builds a frame payload from the open match.
 *
 * Purpose: A frame is a full snapshot of the classified tables, without secrets.
 * When to use: A step boundary, the final-frame refresh, and the human order event.
 * Expected outcome: Column-ordered rows. `game_config` omits the excluded keys. `hexes` is absent.
 * Exceptions: Throws when a table or column name is not a plain identifier, or when a query fails.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { logTrace } from '../logger';
import type { MatchTableSnapshot } from '../../shared/matchRecording';
import { FRAME_EXCLUDED_CONFIG_KEYS, MATCH_TABLE_RECORDING_POLICY } from './matchFramePolicy';

/**
 * The tables inside a frame payload.
 *
 * Contract: One entry per table whose policy is `frame`, in policy order. `hexes` is not included.
 * When to use: `buildFramePayload` and the human order event.
 * Expected outcome: The snapshot stored on a frame.
 * Exceptions: None.
 */
export interface FramePayload {
  /**
   * The classified tables.
   *
   * Contract: Keys are table names from the policy.
   * When to use: Reading a frame.
   * Expected outcome: Each value is columns and rows.
   * Exceptions: None.
   */
  readonly tables: Readonly<Record<string, MatchTableSnapshot>>;
}

/**
 * The six tables that hold the human's queued strategic orders.
 *
 * Purpose: The order event copies these tables before resolution clears them.
 * When to use: `readHumanOrderTables`.
 * Expected outcome: The pending order tables, in this order.
 * Exceptions: None.
 */
const HUMAN_ORDER_TABLES = [
  'pending_orders',
  'pending_ranged_orders',
  'pending_air_orders',
  'pending_missile_launches',
  'pending_ferry_orders',
  'pending_air_drop_orders',
] as const;

/**
 * Quotes a table or column name.
 *
 * Purpose: Names from the policy and from `PRAGMA table_info` are still quoted, and a surprising name is refused.
 * When to use: Building a `SELECT` or `PRAGMA` for a frame.
 * Expected outcome: A double-quoted identifier.
 * Exceptions: Throws `Error` when the name is not letters, digits, and underscores.
 */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('Unexpected table or column name.');
  return `"${name}"`;
}

/**
 * Reads one table in column order.
 *
 * Purpose: Frames, the human order event, and the hex line of a recording share this read.
 * When to use: When the table name comes from this module, not from outside input.
 * Expected outcome: Columns from `PRAGMA table_info` and rows in `rowid` order.
 * Exceptions: Throws when the name is not a plain identifier or the query fails.
 */
export function readMatchTable(ops: BasicDbOps, table: string): MatchTableSnapshot {
  const info = ops.getAll<{ name: string }>(`PRAGMA table_info(${quoteIdent(table)})`);
  const columns = info.map((column) => column.name);
  const selected = columns.map(quoteIdent).join(', ');
  const records = ops.getAll<Record<string, unknown>>(
    `SELECT ${selected} FROM ${quoteIdent(table)} ORDER BY rowid`
  );
  const rows = records.map((record) => columns.map((column) => record[column] ?? null));
  logTrace('matchFrameCapture readMatchTable', { table, rowCount: rows.length });
  return { columns, rows };
}

/**
 * Builds the frame payload for the open match.
 *
 * Purpose: The boundary stores this object, compressed, as the frame.
 * When to use: When the step has changed, and when a finished match refreshes its last frame.
 * Expected outcome: One entry per frame table. `game_config` omits `FRAME_EXCLUDED_CONFIG_KEYS`. The log has counts only.
 * Exceptions: Throws when a query fails or a name is not a plain identifier.
 */
export function buildFramePayload(ops: BasicDbOps): FramePayload {
  const tables: Record<string, MatchTableSnapshot> = {};
  let rowCount = 0;
  const excluded = new Set<string>(FRAME_EXCLUDED_CONFIG_KEYS);
  for (const [table, policy] of Object.entries(MATCH_TABLE_RECORDING_POLICY)) {
    if (policy.mode !== 'frame') continue;
    const snapshot = readMatchTable(ops, table);
    const rows =
      table === 'game_config' ? withoutExcludedConfigRows(snapshot, excluded) : snapshot.rows;
    tables[table] = { columns: snapshot.columns, rows };
    rowCount += rows.length;
  }
  logTrace('matchFrameCapture buildFramePayload', { tableCount: Object.keys(tables).length, rowCount });
  return { tables };
}

/**
 * Reads the human's queued strategic orders.
 *
 * Purpose: The order event has to be written before resolution clears these tables.
 * When to use: Immediately before `ready` resolves the turn.
 * Expected outcome: The six pending tables, in `HUMAN_ORDER_TABLES` order, using the same shape as a frame.
 * Exceptions: Throws when a query fails.
 */
export function readHumanOrderTables(ops: BasicDbOps): FramePayload['tables'] {
  const tables: Record<string, MatchTableSnapshot> = {};
  for (const table of HUMAN_ORDER_TABLES) tables[table] = readMatchTable(ops, table);
  logTrace('matchFrameCapture readHumanOrderTables', { tableCount: HUMAN_ORDER_TABLES.length });
  return tables;
}

/**
 * Drops config rows whose key is excluded.
 *
 * Purpose: A frame must not carry an API key or a save stamp.
 * When to use: From `buildFramePayload` for `game_config` only.
 * Expected outcome: The same columns, without the excluded keys. A table with no `key` column is unchanged.
 * Exceptions: None.
 */
function withoutExcludedConfigRows(
  snapshot: MatchTableSnapshot,
  excluded: ReadonlySet<string>
): readonly (readonly unknown[])[] {
  const keyIndex = snapshot.columns.indexOf('key');
  if (keyIndex < 0) return snapshot.rows;
  return snapshot.rows.filter((row) => !excluded.has(String(row[keyIndex])));
}
