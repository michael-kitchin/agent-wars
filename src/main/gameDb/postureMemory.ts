/**
 * An AI side keeps one posture, and the turn it was set, between consults and across a save and load.
 *
 * Purpose: The next consult continues the same posture instead of treating every reply as the first choice.
 * When to use: Read when a decision needs the seat's settings. Replace when the commander declares a new posture. A new match deletes the row, and a knockout removes that seat.
 * Expected outcome: One stored posture per seat. A missing row, a bad entry, or a failed read means `overland`.
 * Exceptions: A parse error is logged and treated as no posture. `postureSettingsForSeat` catches a database error and returns `overland`. A database error from the write propagates.
 */

import {
  DEFAULT_POSTURE,
  POSTURE_SETTINGS,
  isPosture,
  type Posture,
  type PostureSettings,
} from '../../shared/postureTypes';
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

/**
 * The `game_config` key for postures.
 *
 * Purpose: One row holds every AI seat's current posture.
 * When to use: Reading, writing, and deleting that row. It is not a machine-local key, so a save copies it.
 * Expected outcome: The string `postures`.
 * Exceptions: None.
 */
export const POSTURES_CONFIG_KEY = 'postures';

/**
 * One seat's stored posture.
 *
 * Purpose: The hold is counted from `sinceTurn`, so the name and the turn stay together.
 * When to use: The value `readPosture` returns and `writePosture` stores.
 * Expected outcome: A posture name and the turn it was stored.
 * Exceptions: None.
 */
export interface StoredPosture {
  /**
   * The posture the seat declared.
   *
   * Contract: A member of `POSTURES`. A stored string that fails `isPosture` is dropped.
   * When to use: Looking up `POSTURE_SETTINGS`.
   * Expected outcome: The name written by the last accepted choice.
   * Exceptions: None.
   */
  readonly posture: Posture;
  /**
   * The turn the posture was stored.
   *
   * Contract: An integer. The seat may change it once `turnNumber - sinceTurn` is at least `POSTURE_MIN_HOLD_TURNS`.
   * When to use: The hold check and the briefing's change sentence.
   * Expected outcome: The turn number passed to the accepted choice.
   * Exceptions: None.
   */
  readonly sinceTurn: number;
}

/**
 * Parses one stored posture.
 *
 * Purpose: A bad seat entry is dropped without dropping the other seats.
 * When to use: While reading the postures row.
 * Expected outcome: The posture, or null when the name is not a posture or `sinceTurn` is not an integer.
 * Exceptions: None.
 */
function parseStoredPosture(value: unknown): StoredPosture | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isPosture(row.posture)) return null;
  if (typeof row.sinceTurn !== 'number' || !Number.isInteger(row.sinceTurn)) return null;
  return { posture: row.posture, sinceTurn: row.sinceTurn };
}

/**
 * Reads every seat's stored posture.
 *
 * Purpose: A write replaces one seat and keeps the others.
 * When to use: `readPosture` and `writePosture`.
 * Expected outcome: Seat id to posture. Invalid entries are dropped. A missing row is an empty map.
 * Exceptions: None. A value that is not JSON is logged and returns an empty map. A database error propagates.
 */
function readPostures(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, StoredPosture> {
  logTrace('readPostures');
  const postures = new Map<string, StoredPosture>();
  const raw = selectGameConfigValue(ops, POSTURES_CONFIG_KEY);
  if (raw == null) return postures;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('readPostures: stored value is not an object', { rawLength: raw.length });
      return postures;
    }
    for (const [seatId, value] of Object.entries(parsed)) {
      const stored = parseStoredPosture(value);
      if (stored) postures.set(seatId, stored);
      else logDebug('readPostures: dropped invalid entry', { seatId });
    }
    return postures;
  } catch (err) {
    logError('readPostures: could not parse stored value', { rawLength: raw.length }, err);
    return postures;
  }
}

/**
 * Reads one seat's stored posture.
 *
 * Purpose: Decisions and the briefing ask for one seat.
 * When to use: Once per consult or turn for that seat.
 * Expected outcome: The stored posture, or null when the seat has no row or its entry is invalid.
 * Exceptions: None for a bad document. A database error propagates to `postureSettingsForSeat`, which returns `overland`.
 */
export function readPosture(ops: Pick<GameConfigKvDbOps, 'getOne'>, seatId: string): StoredPosture | null {
  const stored = readPostures(ops).get(seatId) ?? null;
  logTrace('readPosture', { seatId, posture: stored?.posture ?? null, sinceTurn: stored?.sinceTurn ?? null });
  return stored;
}

/**
 * Replaces one seat's stored posture.
 *
 * Purpose: The choice survives until the next accepted change, including across a save and load.
 * When to use: When a reply sets a new posture, and when a knockout clears the seat.
 * Expected outcome: The row with this seat's entry replaced, or removed when `stored` is null. Other seats are kept.
 * Exceptions: Propagates a database error.
 */
export function writePosture(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  stored: StoredPosture | null,
): void {
  const all = readPostures(ops);
  if (stored === null) all.delete(seatId);
  else all.set(seatId, stored);
  const record: Record<string, StoredPosture> = {};
  for (const key of [...all.keys()].sort()) {
    const row = all.get(key);
    if (row) record[key] = row;
  }
  logDebug('writePosture', { seatId, cleared: stored === null, posture: stored?.posture ?? null, seatCount: all.size });
  upsertGameConfigValue(ops, POSTURES_CONFIG_KEY, JSON.stringify(record));
}

/**
 * Reads one config value without a static import cycle through the database barrel.
 *
 * Purpose: Reset imports this module, and this module must not import the barrel that imports reset.
 * When to use: `postureSettingsForSeat` when the caller passes no reader.
 * Expected outcome: The same `dbGetOne` the rest of the main process uses.
 * Exceptions: Propagates a failure to load the database module.
 */
function dbGetOneLazy(): GameConfigKvDbOps['getOne'] {
  // Deferred so this file does not import the database barrel that imports reset, which imports this file.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would cycle through the database barrel
  const loaded = require('../gameDb') as { dbGetOne: GameConfigKvDbOps['getOne'] };
  return loaded.dbGetOne;
}

/**
 * Returns the settings for one seat's posture.
 *
 * Purpose: Callers pass a seat and read a field. They do not parse the row.
 * When to use: Every decision this posture changes, and the briefing. Callers pass only `seatId`.
 * Expected outcome: The row for the stored posture, or the `overland` row when the seat has none.
 * Exceptions: A database error is logged and returns the `overland` row. The second argument exists so a test can pass a reader that throws.
 */
export function postureSettingsForSeat(
  seatId: string,
  ops: Pick<GameConfigKvDbOps, 'getOne'> = { getOne: dbGetOneLazy() },
): PostureSettings {
  try {
    const stored = readPosture(ops, seatId);
    const posture = stored?.posture ?? DEFAULT_POSTURE;
    logTrace('postureSettingsForSeat', { seatId, posture });
    return POSTURE_SETTINGS[posture];
  } catch (err) {
    logError('postureSettingsForSeat', { seatId }, err);
    return POSTURE_SETTINGS[DEFAULT_POSTURE];
  }
}
