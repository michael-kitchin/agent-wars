/**
 * Each AI side keeps a list of other sides its units do not fire at on their own, between consults and across a save and load.
 *
 * Purpose: A commander is not consulted every turn or beat, so the list it last sent has to be stored. Each listed side
 * also keeps the first world-map turn it was listed for, so the briefing reports only attacks made since then.
 * When to use: Read when the engine is about to choose a target on its own, and when a briefing shows the list. Replace when a reply changes it. A new match deletes the row, and a knockout removes that seat.
 * Expected outcome: One stored list per seat. A missing row, a bad entry, or a failed read means an empty list, so the seat's units fire on their own at every side.
 * Exceptions: A parse error is logged and treated as no lists. The two readers catch a database error and return an empty result. A database error from a write propagates.
 */

import { gameDbOps } from './dbConnection';
import type { GameConfigKvDbOps } from './gameConfigKv';
import { selectGameConfigValue, upsertGameConfigValue } from './gameConfigRows';
import { logDebug, logError, logTrace } from '../logger';

/**
 * The `game_config` key for the automatic-fire lists.
 *
 * Purpose: One row holds every AI seat's list, as a JSON object from seat id to that seat's listed seats, each with the
 * first world-map turn it was listed for.
 * When to use: Reading, writing, and deleting that row. It is not a machine-local key, so a save copies it.
 * Expected outcome: The string `hold_automatic_fire_against`.
 * Exceptions: None.
 */
export const HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY = 'hold_automatic_fire_against';

/**
 * Whether a parsed JSON value is an object with named entries.
 *
 * Purpose: The stored row and each seat's list are both objects.
 * When to use: While reading the stored row.
 * Expected outcome: True for an object that is not an array or null.
 * Exceptions: None.
 */
function isEntryObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parses the entries of one stored list.
 *
 * Purpose: One bad entry does not cost the seat its whole list.
 * When to use: While reading the stored row.
 * Expected outcome: Listed seat id to first listed turn, for the entries with a non-empty id and a whole turn number.
 * Exceptions: None.
 */
function parseStoredList(entries: Readonly<Record<string, unknown>>): ReadonlyMap<string, number> {
  return new Map(
    Object.entries(entries).filter((entry): entry is [string, number] => entry[0].length > 0 && Number.isInteger(entry[1])),
  );
}

/**
 * Reads every seat's stored list.
 *
 * Purpose: A write replaces one seat and keeps the others.
 * When to use: The readers and both writers in this module.
 * Expected outcome: Seat id to list. An entry that is not an object is dropped. A missing row is an empty map.
 * Exceptions: None. A value that is not JSON, or not an object, is logged and returns an empty map. A database error propagates.
 */
function readLists(ops: Pick<GameConfigKvDbOps, 'getOne'>): Map<string, ReadonlyMap<string, number>> {
  logTrace('readHoldAutomaticFireAgainstLists');
  const lists = new Map<string, ReadonlyMap<string, number>>();
  const raw = selectGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY);
  if (raw == null) return lists;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isEntryObject(parsed)) {
      logError('readHoldAutomaticFireAgainstLists: stored value is not an object', { rawLength: raw.length });
      return lists;
    }
    for (const [seatId, value] of Object.entries(parsed)) {
      if (isEntryObject(value)) lists.set(seatId, parseStoredList(value));
      else logDebug('readHoldAutomaticFireAgainstLists: dropped invalid entry', { seatId });
    }
    return lists;
  } catch (err) {
    logError('readHoldAutomaticFireAgainstLists: could not parse stored value', { rawLength: raw.length }, err);
    return lists;
  }
}

/**
 * Stores the whole document in one write.
 *
 * Purpose: The stored text is the same for the same lists, whatever order they were written in.
 * When to use: After a writer has changed the map.
 * Expected outcome: Sorted seat keys, and each list's seats sorted and without the owning seat. An empty list has no key.
 * Exceptions: Propagates a database error.
 */
function storeLists(
  ops: Pick<GameConfigKvDbOps, 'run'>,
  lists: ReadonlyMap<string, ReadonlyMap<string, number>>,
): void {
  const record: Record<string, Record<string, number>> = {};
  for (const [seatId, list] of [...lists].sort(([a], [b]) => a.localeCompare(b))) {
    const entries = [...list].filter(([listed]) => listed !== seatId).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length > 0) record[seatId] = Object.fromEntries(entries);
  }
  upsertGameConfigValue(ops, HOLD_AUTOMATIC_FIRE_AGAINST_CONFIG_KEY, JSON.stringify(record));
}

/**
 * Reads one owner's listed sides, each with the first world-map turn it was listed for.
 *
 * Purpose: The briefing reports a listed side's attacks only from that turn on.
 * When to use: When a briefing shows the list. Any owner id may be asked; the human and Neutral have no list.
 * Expected outcome: Listed seat id to turn, or an empty map when the owner has no entry.
 * Exceptions: None; it never throws. A failure is logged and returns an empty map.
 */
export function readHoldAutomaticFireAgainstListedTurns(
  seatId: string,
  ops: Pick<GameConfigKvDbOps, 'getOne'> = gameDbOps,
): ReadonlyMap<string, number> {
  try {
    const list: ReadonlyMap<string, number> = readLists(ops).get(seatId) ?? new Map<string, number>();
    logTrace('readHoldAutomaticFireAgainstListedTurns', { seatId, sparedCount: list.size });
    return list;
  } catch (err) {
    logError('readHoldAutomaticFireAgainstListedTurns', { seatId }, err);
    return new Map<string, number>();
  }
}

/**
 * Reads the sides one owner's units do not fire at on their own.
 *
 * Purpose: What the engine asks before it chooses a target.
 * When to use: Before the engine chooses targets for an owner. Any owner id may be asked; the human and Neutral have no list.
 * Expected outcome: The stored seat ids, or an empty set when the owner has no entry.
 * Exceptions: None; it never throws. A failed read is logged and returns an empty set, so units fire on their own at every side.
 */
export function readHoldAutomaticFireAgainstSeatIds(
  seatId: string,
  ops: Pick<GameConfigKvDbOps, 'getOne'> = gameDbOps,
): ReadonlySet<string> {
  const spared = new Set(readHoldAutomaticFireAgainstListedTurns(seatId, ops).keys());
  logTrace('readHoldAutomaticFireAgainstSeatIds', { seatId, sparedCount: spared.size });
  return spared;
}

/**
 * Replaces one seat's stored list.
 *
 * Purpose: The list survives until the next change, including across a save and load.
 * When to use: When a reply changes the list.
 * Expected outcome: This seat's entry replaced, or removed when `sparedSeatIds` is empty. A side already listed keeps
 * its turn, and a newly listed side gets `listedTurn`. Other seats are kept.
 * Exceptions: Propagates a database error.
 */
export function writeHoldAutomaticFireAgainstSeatIds(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
  sparedSeatIds: readonly string[],
  listedTurn: number,
): void {
  logDebug('writeHoldAutomaticFireAgainstSeatIds', { seatId, sparedCount: sparedSeatIds.length, listedTurn });
  const lists = readLists(ops);
  const previous = lists.get(seatId);
  lists.set(seatId, new Map(sparedSeatIds.map((listed) => [listed, previous?.get(listed) ?? listedTurn] as const)));
  storeLists(ops, lists);
}

/**
 * Takes a seat out of the stored lists.
 *
 * Purpose: A seat that left the match keeps no list, and no other list names it.
 * When to use: When a knockout removes the seat.
 * Expected outcome: The seat's own entry is gone and its id is gone from every other entry, in one write. A list that becomes empty loses its key. Nothing is written when nothing changes.
 * Exceptions: Propagates a database error.
 */
export function removeSeatFromHoldAutomaticFireAgainst(
  ops: Pick<GameConfigKvDbOps, 'getOne' | 'run'>,
  seatId: string,
): void {
  const lists = readLists(ops);
  let changed = lists.delete(seatId);
  for (const [owner, list] of lists) {
    if (!list.has(seatId)) continue;
    lists.set(owner, new Map([...list].filter(([listed]) => listed !== seatId)));
    changed = true;
  }
  logDebug('removeSeatFromHoldAutomaticFireAgainst', { seatId, changed });
  if (changed) storeLists(ops, lists);
}
