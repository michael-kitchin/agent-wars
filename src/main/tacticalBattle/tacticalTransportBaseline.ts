/**
 * Persists and restores `unit_transport_assignments` rows for strategic parents that participate in a tactical battle.
 *
 * Purpose: Allows tactical Ready commits to write sealift rows against parent unit ids while `endTacticalBattleSession`
 * restores the pre-battle SQLite transport graph so strategic planning stays unchanged until a future propagation pass.
 * When to use: Capture at tactical start (and restore install); restore on session end or when clearing inconsistent tactical persistence.
 * Expected outcome: Baseline JSON in `game_config` only while a tactical session is active; absent after `restoreTacticalTransportBaselineForParentUnitIds` completes.
 * Exceptions: Logs at error on JSON or SQLite failures without throwing across IPC boundaries.
 */

import { dbGetAll, dbGetOne, dbRun, isDbReady, saveDatabase } from '../gameDb';
import { logDebug, logError } from '../logger';

/**
 * `game_config` key for the JSON-serialized list of `unit_transport_assignments` rows captured at tactical session start.
 *
 * Purpose: Keeps transport rollback data next to the tactical snapshot row without new tables.
 * When to use: Written by `captureTacticalTransportBaselineForParentUnitIds`; read and deleted by `restoreTacticalTransportBaselineForParentUnitIds`.
 * Expected outcome: Value is a JSON array of `{ landUnitId, navalUnitId }` pairs (strategic parent ids).
 * Exceptions: None.
 */
const TACTICAL_TRANSPORT_BASELINE_CONFIG_KEY = 'tactical_transport_baseline_json_v1';

/**
 * One strategic sealift assignment row captured for tactical rollback.
 *
 * Purpose: Stable JSON shape for baseline persistence.
 * When to use: Elements of the array stored under `TACTICAL_TRANSPORT_BASELINE_CONFIG_KEY`.
 * Expected outcome: Both ids reference `units.id` parent rows.
 * Exceptions: None.
 */
export type TacticalTransportBaselineRow = { landUnitId: string; navalUnitId: string };

/**
 * Snapshots all transport assignment rows touching any tactical parent unit id into `game_config`.
 *
 * Purpose: Establishes the rollback set before tactical commits may mutate `unit_transport_assignments`.
 * When to use: Immediately after a tactical battle snapshot is installed (fresh start or consistent restore).
 * Expected outcome: One `game_config` row; overwrites any stale baseline from a prior partial teardown.
 * Exceptions: None when the DB handle is missing (early return).
 */
export function captureTacticalTransportBaselineForParentUnitIds(parentUnitIds: readonly string[]): void {
  logDebug('captureTacticalTransportBaselineForParentUnitIds', { parentCount: parentUnitIds.length });
  if (!isDbReady()) {
    logDebug('captureTacticalTransportBaselineForParentUnitIds: database not ready', {});
    return;
  }
  const ids = [...new Set(parentUnitIds.filter((id) => id.length > 0))];
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(', ');
  const rows = dbGetAll<{ landUnitId: string; navalUnitId: string }>(
    `SELECT land_unit_id AS landUnitId, naval_unit_id AS navalUnitId
     FROM unit_transport_assignments
     WHERE land_unit_id IN (${placeholders}) OR naval_unit_id IN (${placeholders})`,
    [...ids, ...ids]
  );
  try {
    const json = JSON.stringify(rows as TacticalTransportBaselineRow[]);
    dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [TACTICAL_TRANSPORT_BASELINE_CONFIG_KEY, json]);
    saveDatabase();
  } catch (err) {
    logError('captureTacticalTransportBaselineForParentUnitIds: persist failed', err);
  }
}

/**
 * Removes the tactical transport baseline row from `game_config` without touching `unit_transport_assignments`.
 *
 * Purpose: Keeps orphaned baseline JSON from surviving after tactical snapshot rows are cleared.
 * When to use: `clearTacticalBattleSnapshotFromGameConfig` and other tactical persistence invalidation paths.
 * Expected outcome: Key absent after successful delete.
 * Exceptions: Logs at error on SQLite failure.
 */
export function clearTacticalTransportBaselineFromGameConfig(): void {
  logDebug('clearTacticalTransportBaselineFromGameConfig', {});
  if (!isDbReady()) {
    logDebug('clearTacticalTransportBaselineFromGameConfig: database not ready', {});
    return;
  }
  try {
    dbRun('DELETE FROM game_config WHERE key = ?', [TACTICAL_TRANSPORT_BASELINE_CONFIG_KEY]);
    saveDatabase();
  } catch (err) {
    logError('clearTacticalTransportBaselineFromGameConfig: delete failed', err);
  }
}

/**
 * Returns whether a tactical transport baseline row is present in `game_config`.
 *
 * Purpose: Lets restore install capture a baseline when an older build persisted only the tactical snapshot JSON.
 * When to use: `restorePersistedTacticalBattleSession` after loading a consistent tactical snapshot.
 * Expected outcome: True when the baseline key exists with non-empty value.
 * Exceptions: None.
 */
export function tacticalTransportBaselineConfigExists(): boolean {
  if (!isDbReady()) return false;
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [TACTICAL_TRANSPORT_BASELINE_CONFIG_KEY]);
  return !!(row?.value && row.value.trim().length > 0);
}

/**
 * Deletes all transport rows involving tactical parents, replays the captured baseline, then removes the baseline key.
 *
 * Purpose: Undoes tactical-session sealift mutations so strategic `units`/`unit_transport_assignments` match pre-entry state for transport edges.
 * When to use: `endTacticalBattleSession` before clearing the tactical snapshot; optional safety when rejecting inconsistent persistence.
 * Expected outcome: `unit_transport_assignments` matches the captured snapshot for those parents; baseline key removed.
 * Exceptions: Logs at error when baseline JSON is invalid; clears the key without rewriting assignments.
 */
export function restoreTacticalTransportBaselineForParentUnitIds(parentUnitIds: readonly string[] | null): void {
  logDebug('restoreTacticalTransportBaselineForParentUnitIds', { parentCount: parentUnitIds?.length ?? 0 });
  if (!isDbReady()) {
    logDebug('restoreTacticalTransportBaselineForParentUnitIds: database not ready', {});
    return;
  }
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [TACTICAL_TRANSPORT_BASELINE_CONFIG_KEY]);
  if (!row?.value) {
    clearTacticalTransportBaselineFromGameConfig();
    return;
  }
  let baseline: TacticalTransportBaselineRow[];
  try {
    baseline = JSON.parse(row.value) as TacticalTransportBaselineRow[];
    if (!Array.isArray(baseline)) throw new Error('baseline is not an array');
  } catch (err) {
    logError('restoreTacticalTransportBaselineForParentUnitIds: invalid baseline JSON', err);
    clearTacticalTransportBaselineFromGameConfig();
    return;
  }
  const ids = parentUnitIds?.length ? [...new Set(parentUnitIds.filter((id) => id.length > 0))] : [];
  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(', ');
    dbRun(
      `DELETE FROM unit_transport_assignments
       WHERE land_unit_id IN (${placeholders}) OR naval_unit_id IN (${placeholders})`,
      [...ids, ...ids]
    );
    for (const b of baseline) {
      dbRun('INSERT OR REPLACE INTO unit_transport_assignments (land_unit_id, naval_unit_id) VALUES (?, ?)', [
        b.landUnitId,
        b.navalUnitId,
      ]);
    }
    logDebug('restoreTacticalTransportBaselineForParentUnitIds restored rows', { baselineRowCount: baseline.length });
  }
  clearTacticalTransportBaselineFromGameConfig();
}
