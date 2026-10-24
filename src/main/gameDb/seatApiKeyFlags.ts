/**
 * Plain boolean flags for which AI seats have an OpenRouter key.
 *
 * Purpose: Ready and the commander snapshot can see that a key exists without decrypting it.
 * When to use: From the commander memory store, and from snapshot building.
 * Expected outcome: A missing flag is false. The secret itself is not stored here.
 * Exceptions: None.
 */

import { logDebug, logError, logTrace } from '../logger';
import { getOne, run } from './dbConnection';

/**
 * `game_config` key for the seat-key flags.
 *
 * Purpose: The flag row has one name, shared with the writer that stores the encrypted keys.
 * When to use: Reading and writing this row.
 * Expected outcome: The string `openrouter_seat_api_key_flags`.
 * Exceptions: None.
 */
export const SEAT_API_KEY_FLAGS_CONFIG_KEY = 'openrouter_seat_api_key_flags';

/**
 * Reads the stored flag object.
 *
 * Purpose: Callers merge one seat without dropping the others.
 * When to use: `readSeatHasApiKey` and the seat-key writer.
 * Expected outcome: Seat id to boolean. A missing or unreadable row returns an empty object.
 * Exceptions: None. A bad JSON row is logged.
 */
export function readSeatApiKeyFlagMap(): Readonly<Record<string, boolean>> {
  logTrace('seatApiKeyFlags readSeatApiKeyFlagMap');
  const row = getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [SEAT_API_KEY_FLAGS_CONFIG_KEY]);
  if (typeof row?.value !== 'string' || row.value.length === 0) return {};
  try {
    const parsed = JSON.parse(row.value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('seatApiKeyFlags readSeatApiKeyFlagMap: stored flags are not an object');
      return {};
    }
    const flags: Record<string, boolean> = {};
    for (const [seatId, value] of Object.entries(parsed)) flags[seatId] = value === true;
    return flags;
  } catch (err) {
    logError('seatApiKeyFlags readSeatApiKeyFlagMap: failed to parse flags', err);
    return {};
  }
}

/**
 * Replaces the flag object.
 *
 * Purpose: The encrypted seat-key write and this row change together.
 * When to use: From the commander memory store after it has built the next flag object.
 * Expected outcome: The row holds JSON booleans. An empty object is still stored.
 * Exceptions: None. A closed database does not write.
 */
export function writeSeatApiKeyFlags(flags: Readonly<Record<string, boolean>>): void {
  logDebug('seatApiKeyFlags writeSeatApiKeyFlags', { count: Object.keys(flags).length, flagsKey: SEAT_API_KEY_FLAGS_CONFIG_KEY });
  run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [
    SEAT_API_KEY_FLAGS_CONFIG_KEY,
    JSON.stringify(flags),
  ]);
}

/**
 * Reports whether one seat has a stored key.
 *
 * Purpose: Snapshots and the global key check need a boolean, not the secret.
 * When to use: While building a seat snapshot, and from `hasKey`.
 * Expected outcome: True only when that seat's flag is true. A missing flag is false.
 * Exceptions: None.
 */
export function readSeatHasApiKey(seatId: string): boolean {
  const hasApiKey = readSeatApiKeyFlagMap()[seatId] === true;
  logTrace('seatApiKeyFlags readSeatHasApiKey', { seatId, hasApiKey });
  return hasApiKey;
}
