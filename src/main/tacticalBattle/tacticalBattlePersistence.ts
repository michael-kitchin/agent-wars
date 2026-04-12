/**
 * Persists the active tactical battle snapshot in `game_config` so a tactical session survives main-process restarts.
 *
 * Purpose: Milestone 2.1 tactical mode is otherwise in-memory only; this bridges app restarts until the player exits tactical.
 * When to use: After every successful tactical session mutation and when clearing the session on exit or invalid restore.
 * Expected outcome: JSON round-trip restores the same `TacticalBattleSnapshot` when turn/phase and parent units still match.
 * Exceptions: Parse/validation failures are logged at error and clear stored state without throwing across IPC boundaries.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetOne, dbRun, isDbReady, saveDatabase } from '../gameDb';
import { logDebug, logError } from '../logger';

/**
 * Game-config key that stores the serialized active tactical battle session payload.
 *
 * Purpose: Keeps persistence schema-free by using `game_config` instead of creating dedicated tactical tables.
 * When to use: All tactical persistence read/write/delete operations in this module.
 * Expected outcome: Single row keyed by this value contains JSON for one active tactical battle.
 * Exceptions: None.
 */
const TACTICAL_BATTLE_SNAPSHOT_CONFIG_KEY = 'tactical_battle_snapshot_json_v1';

/**
 * Persists the given tactical snapshot to SQLite `game_config` and flushes the database file.
 *
 * Purpose: Durable tactical progress after start, AI order application, or tactical turn advance.
 * When to use: Immediately after the in-memory tactical snapshot is updated successfully.
 * Expected outcome: A single `game_config` row holds JSON-serialized `TacticalBattleSnapshot`.
 * Exceptions: Logs at error and returns early when the DB handle is unavailable.
 */
export function writeTacticalBattleSnapshotToGameConfig(snapshot: TacticalBattleSnapshot): void {
  logDebug('writeTacticalBattleSnapshotToGameConfig', { battleId: snapshot.battleId, subUnitCount: snapshot.subUnits.length });
  if (!isDbReady()) {
    logDebug('writeTacticalBattleSnapshotToGameConfig: database not ready', {});
    return;
  }
  try {
    const json = JSON.stringify(snapshot);
    dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [TACTICAL_BATTLE_SNAPSHOT_CONFIG_KEY, json]);
    saveDatabase();
  } catch (err) {
    logError('writeTacticalBattleSnapshotToGameConfig: persist failed', err);
  }
}

/**
 * Removes any persisted tactical snapshot row from `game_config` and flushes the database file.
 *
 * Purpose: Tactical exit, new game, or failed restore must not leave stale JSON that could resurrect dead sessions.
 * When to use: After `endTacticalBattleSession` and when validation rejects stored JSON.
 * Expected outcome: Key absent or overwritten to empty state; subsequent loads return null.
 * Exceptions: Logs at error on unexpected SQLite failures.
 */
export function clearTacticalBattleSnapshotFromGameConfig(): void {
  logDebug('clearTacticalBattleSnapshotFromGameConfig', {});
  if (!isDbReady()) {
    logDebug('clearTacticalBattleSnapshotFromGameConfig: database not ready', {});
    return;
  }
  try {
    dbRun('DELETE FROM game_config WHERE key = ?', [TACTICAL_BATTLE_SNAPSHOT_CONFIG_KEY]);
    saveDatabase();
  } catch (err) {
    logError('clearTacticalBattleSnapshotFromGameConfig: delete failed', err);
  }
}

/**
 * Reads and parses a persisted tactical snapshot from `game_config`, or returns null when absent/invalid.
 *
 * Purpose: Restore path after `initDatabase` before the renderer first calls `getGameState`.
 * When to use: Only from `loadPersistedTacticalBattleSnapshotIfConsistent`.
 * Expected outcome: Valid `TacticalBattleSnapshot` object or null.
 * Exceptions: JSON errors are logged at error; stored row is cleared when parse fails.
 */
function readTacticalBattleSnapshotFromGameConfig(): TacticalBattleSnapshot | null {
  if (!isDbReady()) return null;
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [TACTICAL_BATTLE_SNAPSHOT_CONFIG_KEY]);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as TacticalBattleSnapshot;
  } catch (err) {
    logError('readTacticalBattleSnapshotFromGameConfig: JSON parse failed, clearing', err);
    clearTacticalBattleSnapshotFromGameConfig();
    return null;
  }
}

/**
 * Returns true when the snapshot's strategic anchor matches DB turn state and all parent strategic units still exist.
 *
 * Purpose: Avoid resurrecting tactical mode after a manual DB edit, cheat, or corrupted save.
 * When to use: Immediately before installing a restored snapshot into the active ref.
 * Expected outcome: False when any check fails (caller clears persistence).
 * Exceptions: None; relies on `dbGetOne` returning undefined for missing rows.
 */
function isRestoredTacticalSnapshotConsistentWithStrategicDb(snapshot: TacticalBattleSnapshot): boolean {
  const turnRow = dbGetOne<{ phase: string; turn_number: number }>('SELECT phase, turn_number FROM turn_state WHERE id = 1');
  if (!turnRow || turnRow.phase !== 'planning' || turnRow.turn_number !== snapshot.strategicTurnNumber) {
    logDebug('isRestoredTacticalSnapshotConsistentWithStrategicDb: turn mismatch', {
      dbPhase: turnRow?.phase,
      dbTurn: turnRow?.turn_number,
      snapTurn: snapshot.strategicTurnNumber,
    });
    return false;
  }
  const parentIds = new Set(snapshot.subUnits.map((u) => u.parentUnitId));
  for (const parentId of parentIds) {
    const unitRow = dbGetOne<{ id: string }>('SELECT id FROM units WHERE id = ?', [parentId]);
    if (!unitRow) {
      logDebug('isRestoredTacticalSnapshotConsistentWithStrategicDb: missing parent unit', { parentId });
      return false;
    }
  }
  return true;
}

/**
 * Reads a persisted tactical snapshot when it is still consistent with strategic DB state; otherwise clears stale JSON.
 *
 * Purpose: Lets `tacticalBattleSession` own ref installation while persistence stays read/validate/delete only.
 * When to use: From `restorePersistedTacticalBattleSession` in `tacticalBattleSession` after `initDatabase`.
 * Expected outcome: Returns a validated `TacticalBattleSnapshot`, or null after clearing inconsistent rows.
 * Exceptions: JSON parse failures are logged at error inside `readTacticalBattleSnapshotFromGameConfig`.
 */
export function loadPersistedTacticalBattleSnapshotIfConsistent(): TacticalBattleSnapshot | null {
  logDebug('loadPersistedTacticalBattleSnapshotIfConsistent', {});
  if (!isDbReady()) {
    logDebug('loadPersistedTacticalBattleSnapshotIfConsistent: database not ready', {});
    return null;
  }
  const snap = readTacticalBattleSnapshotFromGameConfig();
  if (!snap) return null;
  if (!isRestoredTacticalSnapshotConsistentWithStrategicDb(snap)) {
    logDebug('loadPersistedTacticalBattleSnapshotIfConsistent: rejecting inconsistent snapshot', {
      battleId: snap.battleId,
    });
    clearTacticalBattleSnapshotFromGameConfig();
    return null;
  }
  return snap;
}
