/**
 * The turn report names a paused queue only on the turn it pauses.
 *
 * Purpose: This row remembers the previous production pass, including across a save and load.
 * When to use: Read at the start of the production pass and replaced at its end. A new match deletes the row.
 * Expected outcome: Seat id to the H3 indexes that were paused.
 * Exceptions: A parse error is logged and treated as an empty memory. A database error from the write propagates.
 */

import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

/**
 * The `game_config` key for paused-queue memory.
 *
 * Purpose: One row remembers which queues were paused after the previous production pass.
 * When to use: Reading, writing, and deleting that row.
 * Expected outcome: The string `queue_paused_hexes`.
 * Exceptions: None.
 */
export const QUEUE_PAUSED_HEXES_CONFIG_KEY = 'queue_paused_hexes';

/**
 * Reads the queues that were paused after the previous production pass.
 *
 * Purpose: A pause is reported only when the hex was not in this set.
 * When to use: At the start of the production pass.
 * Expected outcome: Seat id to the H3 indexes that were paused. Invalid entries are dropped. A missing row, which is what a save from before this row existed has, is an empty map.
 * Exceptions: None. A parse error is logged and returns an empty map.
 */
export function readPausedQueueHexes(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, Set<string>> {
  logTrace('readPausedQueueHexes');
  const paused = new Map<string, Set<string>>();
  const raw = selectGameConfigValue(ops, QUEUE_PAUSED_HEXES_CONFIG_KEY);
  if (raw == null) return paused;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      logError('readPausedQueueHexes: stored value is not an object', { rawLength: raw.length });
      return paused;
    }
    for (const [seatId, hexes] of Object.entries(parsed)) {
      if (Array.isArray(hexes) && hexes.every((hex) => typeof hex === 'string')) paused.set(seatId, new Set(hexes));
    }
    return paused;
  } catch (err) {
    logError('readPausedQueueHexes: could not parse stored value', { rawLength: raw.length }, err);
    return paused;
  }
}

/**
 * Replaces the paused-queue memory with this pass's result.
 *
 * Purpose: The next pass can tell a new pause from one that is still paused.
 * When to use: At the end of every production pass, including a pass that paused nothing.
 * Expected outcome: One `game_config` row. An empty map writes `{}`, which clears every seat.
 * Exceptions: Propagates a database error to the caller.
 */
export function writePausedQueueHexes(
  ops: Pick<GameConfigKvDbOps, 'run'>,
  pausedBySeat: ReadonlyMap<string, readonly string[]>
): void {
  const record: Record<string, string[]> = {};
  for (const [seatId, hexes] of pausedBySeat) {
    if (hexes.length > 0) record[seatId] = [...hexes].sort();
  }
  logDebug('writePausedQueueHexes', { seatCount: Object.keys(record).length });
  upsertGameConfigValue(ops, QUEUE_PAUSED_HEXES_CONFIG_KEY, JSON.stringify(record));
}
