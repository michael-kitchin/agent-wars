import type { GameConfigKvDbOps } from '../gameDb/gameConfigKv';
import { SIGHT_CUE_SEEN_UNITS_CONFIG_KEY } from '../../shared/sightCueSettings';
import { logDebug, logError, logTrace } from '../logger';

/**
 * Whether a parsed JSON value is a list of strings.
 *
 * Purpose: A damaged memory entry is dropped instead of failing the whole row.
 * When to use: While copying one seat's list out of the stored object.
 * Expected outcome: True only for an array whose every entry is a string.
 * Exceptions: None.
 */
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * The units each AI seat saw at the previous planning.
 *
 * Purpose: A beam is ongoing only when every target unit is in this list.
 * When to use: Before computing beams. A missing or unreadable row means every beam is new.
 * Expected outcome: Seat id to unit ids. Invalid entries are dropped. A missing row is `{}`.
 * Exceptions: None. A parse error is logged and returns `{}`.
 */
export function readSightCueSeenUnits(ops: Pick<GameConfigKvDbOps, 'getOne'>): Record<string, string[]> {
  logTrace('readSightCueSeenUnits');
  const raw = ops.getOne<{ value: string }>('SELECT value FROM game_config WHERE key = ?', [SIGHT_CUE_SEEN_UNITS_CONFIG_KEY])?.value;
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('readSightCueSeenUnits: stored value is not an object', { rawLength: raw.length });
      return {};
    }
    const seen: Record<string, string[]> = {};
    for (const [seatId, ids] of Object.entries(parsed)) {
      if (isStringList(ids)) seen[seatId] = ids;
    }
    return seen;
  } catch (err) {
    logError('readSightCueSeenUnits: could not parse stored value', { rawLength: raw.length }, err);
    return {};
  }
}

/**
 * Stores the units each AI seat saw this planning.
 *
 * Purpose: The next turn compares against this row, including after a save and load.
 * When to use: After a successful beam computation, whether or not a human is still playing.
 * Expected outcome: One `game_config` row whose value is the JSON object.
 * Exceptions: Propagates a database error to the caller.
 */
export function writeSightCueSeenUnits(
  ops: Pick<GameConfigKvDbOps, 'run'>,
  seenBySeat: Readonly<Record<string, readonly string[]>>
): void {
  const seatIds = Object.keys(seenBySeat);
  const idCount = seatIds.reduce((sum, seatId) => sum + (seenBySeat[seatId]?.length ?? 0), 0);
  logDebug('writeSightCueSeenUnits', { seatCount: seatIds.length, idCount });
  ops.run('INSERT OR REPLACE INTO game_config (key, value) VALUES (?, ?)', [
    SIGHT_CUE_SEEN_UNITS_CONFIG_KEY,
    JSON.stringify(seenBySeat),
  ]);
}
