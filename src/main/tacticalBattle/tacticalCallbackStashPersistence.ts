/**
 * Persists the pre-battle opponent callback subscription stash in `game_config` for tactical session restart survival.
 *
 * Purpose: Mirrors transport-baseline durability so callback stash/restore survives main-process restart.
 * When to use: Written when stash is captured; read on hydrate/restore; cleared with tactical snapshot teardown.
 * Expected outcome: JSON `{ subscriptions: [...] }` under a dedicated key while a tactical session is active.
 * Exceptions: Logs at error on JSON/SQLite failures without throwing across IPC.
 */

import type { CallbackSubscription } from '../callbackSubscriptions';
import { dbGetOne, dbRun, isDbReady, saveDatabase } from '../gameDb';
import { logDebug, logError } from '../logger';

/**
 * `game_config` key for the JSON-serialized pre-battle opponent callback stash.
 *
 * Purpose: Keeps stash next to the tactical snapshot row without new tables.
 * When to use: All read/write/delete operations in this module.
 * Expected outcome: Value is `{ subscriptions: CallbackSubscription[] }` or the key is absent.
 * Exceptions: None.
 */
const TACTICAL_CALLBACK_STASH_CONFIG_KEY = 'tactical_callback_stash_json_v1';

/**
 * Writes opponent callback stash rows to `game_config`.
 *
 * Purpose: Durable companion to the in-memory stash for restart survival.
 * When to use: Immediately after capturing a pre-battle snapshot (including empty lists).
 * Expected outcome: One `game_config` row; overwrites any prior stash.
 * Exceptions: None when the DB handle is missing (early return).
 */
export function writeTacticalCallbackStashToGameConfig(subscriptions: readonly CallbackSubscription[]): void {
  logDebug('writeTacticalCallbackStashToGameConfig', { count: subscriptions.length });
  if (!isDbReady()) {
    logDebug('writeTacticalCallbackStashToGameConfig: database not ready', {});
    return;
  }
  try {
    const payload = {
      subscriptions: subscriptions.map((s) => ({
        event: s.event,
        params: { ...(s.params ?? {}) },
        subscribedTurn: s.subscribedTurn,
      })),
    };
    dbRun('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [
      TACTICAL_CALLBACK_STASH_CONFIG_KEY,
      JSON.stringify(payload),
    ]);
    saveDatabase();
  } catch (err) {
    logError('writeTacticalCallbackStashToGameConfig: persist failed', err);
  }
}

/**
 * Removes the tactical callback stash row from `game_config` without touching live subscriptions.
 *
 * Purpose: Prevents orphaned stash JSON after tactical snapshot clear or successful restore.
 * When to use: `clearTacticalBattleSnapshotFromGameConfig` and restore-complete cleanup.
 * Expected outcome: Key absent after successful delete.
 * Exceptions: Logs at error on SQLite failure.
 */
export function clearTacticalCallbackStashFromGameConfig(): void {
  logDebug('clearTacticalCallbackStashFromGameConfig', {});
  if (!isDbReady()) {
    logDebug('clearTacticalCallbackStashFromGameConfig: database not ready', {});
    return;
  }
  try {
    dbRun('DELETE FROM game_config WHERE key = ?', [TACTICAL_CALLBACK_STASH_CONFIG_KEY]);
    saveDatabase();
  } catch (err) {
    logError('clearTacticalCallbackStashFromGameConfig: delete failed', err);
  }
}

/**
 * Returns whether a tactical callback stash row is present in `game_config`.
 *
 * Purpose: Lets tests and restore paths distinguish missing-stash upgrade from empty captured stash.
 * When to use: After hydrate attempts or when asserting persistence.
 * Expected outcome: True when the key exists with non-empty value.
 * Exceptions: None.
 */
export function tacticalCallbackStashConfigExists(): boolean {
  if (!isDbReady()) return false;
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [
    TACTICAL_CALLBACK_STASH_CONFIG_KEY,
  ]);
  return !!(row?.value && row.value.trim().length > 0);
}

/**
 * Reads and parses the persisted callback stash, or returns null when absent/invalid.
 *
 * Purpose: Hydrate in-memory stash after process restart and support end-path restore when memory was cleared.
 * When to use: `hydrateOpponentCallbackStashFromGameConfig` and restore when memory stash is null.
 * Expected outcome: Cloned subscription array (possibly empty) or null when key missing/invalid (invalid clears the key).
 * Exceptions: None; parse failures log and clear the key.
 */
export function readTacticalCallbackStashFromGameConfig(): CallbackSubscription[] | null {
  if (!isDbReady()) return null;
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [
    TACTICAL_CALLBACK_STASH_CONFIG_KEY,
  ]);
  if (!row?.value?.trim()) return null;
  try {
    const parsed = JSON.parse(row.value) as { subscriptions?: unknown };
    if (!Array.isArray(parsed.subscriptions)) throw new Error('subscriptions is not an array');
    const subs: CallbackSubscription[] = [];
    for (const item of parsed.subscriptions) {
      if (!item || typeof item !== 'object') continue;
      const o = item as { event?: unknown; params?: unknown; subscribedTurn?: unknown };
      if (typeof o.event !== 'string' || !o.event) continue;
      const params =
        o.params && typeof o.params === 'object' && !Array.isArray(o.params)
          ? ({ ...(o.params as Record<string, unknown>) } as Record<string, unknown>)
          : {};
      const subscribedTurn = typeof o.subscribedTurn === 'number' ? o.subscribedTurn : undefined;
      subs.push({ event: o.event, params, subscribedTurn });
    }
    return subs;
  } catch (err) {
    logError('readTacticalCallbackStashFromGameConfig: invalid JSON', err);
    clearTacticalCallbackStashFromGameConfig();
    return null;
  }
}
