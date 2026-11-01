/**
 * Persists the pre-battle opponent callback subscription stash in `game_config` for tactical session restart survival.
 *
 * Purpose: Mirrors transport-baseline durability so callback stash/restore survives main-process restart.
 * When to use: Written when stash is captured; read on hydrate/restore; cleared with tactical snapshot teardown.
 * Expected outcome: JSON `{ seatId, subscriptions }` and, on an AI-only battle, `leadSeat`, under a dedicated key while a tactical session is active.
 * Exceptions: Logs at error on JSON/SQLite failures without throwing across IPC.
 */

import { AI_SEAT_IDS, isAiSeatId, type AiSeatId } from '../../shared/seatIds';
import { copyCallbackSubscriptions, type CallbackSubscription } from '../callbackSubscriptions';
import { dbGetOne, dbRun, isDbReady, saveDatabase } from '../gameDb';
import { logDebug, logError } from '../logger';

/**
 * One AI seat's pre-battle callback rows.
 *
 * Purpose: An AI-only battle stashes the other party and the lead seat separately so each commander's strategic callbacks survive the battle.
 * When to use: The optional `leadSeat` on `TacticalCallbackStash`, and the `leadSeat` object in the `game_config` payload.
 * Expected outcome: `seatId` is an AI seat and `subscriptions` is that seat's list at battle start.
 * Exceptions: None.
 */
export interface TacticalCallbackSeatStash {
  /**
   * The AI seat these rows belong to.
   *
   * Contract: An `AiSeatId`. A row that fails `isAiSeatId` is invalid and the reader clears the key.
   * When to use: Choosing which seat to restore.
   * Expected outcome: The lead seat on an AI-only battle.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * The callback rows captured for this seat before the battle.
   *
   * Contract: A copy of that seat's subscriptions.
   * When to use: Restore after the battle ends.
   * Expected outcome: Each row keeps its event, params, and subscribed turn.
   * Exceptions: None.
   */
  readonly subscriptions: readonly CallbackSubscription[];
}

/**
 * Pre-battle callback rows plus the AI seat they belong to.
 *
 * Purpose: A battle against a later AI seat must restore that seat, not the first one. An AI-only battle also keeps the lead seat.
 * When to use: The in-memory stash and the `game_config` payload.
 * Expected outcome: `seatId` null means the other party is not an AI seat, so restore leaves every seat's callbacks alone.
 * Exceptions: None.
 */
export interface TacticalCallbackStash {
  /**
   * The AI seat whose callbacks were stashed, or null when the other party is not an AI seat.
   *
   * Contract: Null means restore must leave every seat's callbacks alone.
   * When to use: Writing the stash and choosing which seat to restore.
   * Expected outcome: An `AiSeatId`, or null.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId | null;
  /**
   * The callback rows captured before the battle.
   *
   * Contract: A copy of that seat's subscriptions, or empty when `seatId` is null.
   * When to use: The `game_config` payload and the in-memory stash.
   * Expected outcome: Each row keeps its event, params, and subscribed turn.
   * Exceptions: None.
   */
  readonly subscriptions: readonly CallbackSubscription[];
  /**
   * The lead seat's pre-battle callbacks on an AI-only battle.
   *
   * Contract: Present only when the battle has a lead AI seat distinct from `seatId`. Older rows omit it and restore only `seatId`.
   * When to use: Writing and reading the stash for a two-AI battle.
   * Expected outcome: That seat's strategic callbacks are restored with the other party's.
   * Exceptions: None.
   */
  readonly leadSeat?: TacticalCallbackSeatStash;
}

/**
 * `game_config` key for the JSON-serialized pre-battle opponent callback stash.
 *
 * Purpose: Keeps stash next to the tactical snapshot row without new tables.
 * When to use: All read/write/delete operations in this module.
 * Expected outcome: Value is `{ seatId, subscriptions }`, optionally with `leadSeat`, or `{ noAiParty: true, subscriptions: [] }`, or the key is absent. Older rows without `seatId` belong to the first AI seat. A row without `leadSeat` restores only the one seat.
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
export function writeTacticalCallbackStashToGameConfig(stash: TacticalCallbackStash): void {
  logDebug('writeTacticalCallbackStashToGameConfig', {
    seatId: stash.seatId,
    count: stash.subscriptions.length,
    leadSeatId: stash.leadSeat?.seatId ?? null,
    leadCount: stash.leadSeat?.subscriptions.length ?? 0,
  });
  if (!isDbReady()) {
    logDebug('writeTacticalCallbackStashToGameConfig: database not ready', {});
    return;
  }
  try {
    const payload = stash.seatId === null
      ? { noAiParty: true, subscriptions: [] }
      : {
        seatId: stash.seatId,
        subscriptions: copyCallbackSubscriptions(stash.subscriptions),
        ...(stash.leadSeat
          ? {
            leadSeat: {
              seatId: stash.leadSeat.seatId,
              subscriptions: copyCallbackSubscriptions(stash.leadSeat.subscriptions),
            },
          }
          : {}),
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
 * Expected outcome: Stash for one AI seat, a no-AI-party marker, or null when the key is missing or invalid (invalid clears the key).
 * Exceptions: None; parse failures log and clear the key.
 */
export function readTacticalCallbackStashFromGameConfig(): TacticalCallbackStash | null {
  if (!isDbReady()) return null;
  const row = dbGetOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [
    TACTICAL_CALLBACK_STASH_CONFIG_KEY,
  ]);
  if (!row?.value?.trim()) return null;
  try {
    const parsed = JSON.parse(row.value) as {
      subscriptions?: unknown;
      seatId?: unknown;
      noAiParty?: unknown;
      leadSeat?: unknown;
    };
    if (parsed.noAiParty === true) return { seatId: null, subscriptions: [] };
    if (!Array.isArray(parsed.subscriptions)) throw new Error('subscriptions is not an array');
    const subs = parseStashedSubscriptionRows(parsed.subscriptions);
    const seatId = typeof parsed.seatId === 'string' ? parsed.seatId : AI_SEAT_IDS[0];
    if (!isAiSeatId(seatId)) throw new Error('seatId is not an AI seat');
    const leadSeat = parseLeadSeatStash(parsed.leadSeat);
    return leadSeat ? { seatId, subscriptions: subs, leadSeat } : { seatId, subscriptions: subs };
  } catch (err) {
    logError('readTacticalCallbackStashFromGameConfig: invalid JSON', err);
    clearTacticalCallbackStashFromGameConfig();
    return null;
  }
}

/**
 * Copies subscription objects out of a persisted array, skipping rows that are not subscriptions.
 *
 * Purpose: The other party and the lead seat share one parser so a bad row is dropped the same way for both.
 * When to use: `readTacticalCallbackStashFromGameConfig` for `subscriptions` and for `leadSeat.subscriptions`.
 * Expected outcome: One `CallbackSubscription` per row that has a non-empty event string.
 * Exceptions: None.
 */
function parseStashedSubscriptionRows(rows: readonly unknown[]): CallbackSubscription[] {
  const subs: CallbackSubscription[] = [];
  for (const item of rows) {
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
}

/**
 * Reads the optional lead-seat object, or throws when it is present but not a seat stash.
 *
 * Purpose: A missing `leadSeat` is a one-seat stash. A present but malformed `leadSeat` must not restore the wrong seat.
 * When to use: After the other party's rows parse.
 * Expected outcome: Undefined when the field is absent. A seat stash when it is a valid object. Throws otherwise so the caller clears the key.
 * Exceptions: Throws when `leadSeat` is present and is not an object, its seat is not an AI seat, or its subscriptions are not an array.
 */
function parseLeadSeatStash(value: unknown): TacticalCallbackSeatStash | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('leadSeat is not an object');
  const row = value as { seatId?: unknown; subscriptions?: unknown };
  if (typeof row.seatId !== 'string' || !isAiSeatId(row.seatId)) throw new Error('leadSeat.seatId is not an AI seat');
  if (!Array.isArray(row.subscriptions)) throw new Error('leadSeat.subscriptions is not an array');
  return { seatId: row.seatId, subscriptions: parseStashedSubscriptionRows(row.subscriptions) };
}
