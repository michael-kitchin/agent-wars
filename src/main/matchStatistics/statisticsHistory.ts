/**
 * Reads the recorded statistics series back from the match history.
 *
 * Purpose: Charts need one entry per strategic turn, and a turn with a battle has more than one recorded event.
 * When to use: From the charts channel.
 * Expected outcome: The last recorded entry for each turn, in turn order.
 * Exceptions: Propagates a SQLite error.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { logTrace } from '../logger';
import { listReadableMatchEventsOfType } from '../recorder/matchRecordStore';
import type { TurnStatistics } from '../../shared/matchStatistics';

/**
 * Reports whether a value is a list of objects that each carry the named string fields.
 *
 * Purpose: The chart series look entries up by seat id, so an entry without one would break a lookup or match nothing.
 * When to use: From `isTurnStatistics`, for the side, report, and hexes-taken lists.
 * Expected outcome: True for an array whose every entry is a non-null object with a string value under each key.
 * Exceptions: None.
 */
function isListOfEntriesWith(value: unknown, keys: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry !== null && typeof entry === 'object' && keys.every((key) => typeof (entry as Record<string, unknown>)[key] === 'string')
    )
  );
}

/**
 * The side fields every line chart reads as a number.
 *
 * Purpose: A chart value that is not a number breaks the tooltip's `toFixed`.
 * When to use: From `isSideStatistics`. `unitsLost` is checked apart, since it may be null.
 * Expected outcome: The numeric `SideStatistics` keys.
 * Exceptions: None.
 */
const NUMERIC_SIDE_KEYS = ['hexes', 'productionPerTurn', 'storedPoints', 'treasury', 'upkeepPerTurn', 'costUsd'] as const;

/**
 * Reports whether a value is a record of counts that a unit chart can index.
 *
 * Purpose: The built and mercenary unit charts use `in` and an index on the record, which throw on null or a string.
 * When to use: From `isSideStatistics`, for `builtUnits` and `mercenaryUnits`.
 * Expected outcome: True for a non-null object that is not an array.
 * Exceptions: None.
 */
function isCountRecord(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reports whether a side entry carries every field the charts read.
 *
 * Purpose: A side with only a seat id passes the seat lookup and then throws in the unit charts.
 * When to use: From `isTurnStatistics`, for each `sides` entry that already has a string `seatId`.
 * Expected outcome: True when `builtUnits` and `mercenaryUnits` are count records, each `NUMERIC_SIDE_KEYS` field is a number, and `unitsLost` is a number or null.
 * Exceptions: None.
 */
function isSideStatistics(entry: Record<string, unknown>): boolean {
  return (
    isCountRecord(entry.builtUnits) &&
    isCountRecord(entry.mercenaryUnits) &&
    NUMERIC_SIDE_KEYS.every((key) => typeof entry[key] === 'number') &&
    (entry.unitsLost === null || typeof entry.unitsLost === 'number')
  );
}

/**
 * Reports whether a decoded payload has the shape of a turn's statistics.
 *
 * Purpose: A damaged or foreign payload, such as one written before the statistics carried relationship reports, must not reach a chart, where a missing list throws.
 * When to use: Each recorded event, here and before the recorder refreshes the final statistics.
 * Expected outcome: True for an object with a numeric `turnNumber`, a `sides` array whose entries have a string `seatId` and the fields `isSideStatistics` checks, a `relationships` array whose entries have string `seatId` and `towardSeatId`, and a `hexesTaken` that is null or an array whose entries have string `bySeatId` and `fromSeatId`.
 * Exceptions: None.
 */
export function isTurnStatistics(value: unknown): value is TurnStatistics {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as {
    readonly turnNumber?: unknown;
    readonly sides?: unknown;
    readonly relationships?: unknown;
    readonly hexesTaken?: unknown;
  };
  return (
    typeof candidate.turnNumber === 'number' &&
    isListOfEntriesWith(candidate.sides, ['seatId']) &&
    (candidate.sides as Record<string, unknown>[]).every(isSideStatistics) &&
    isListOfEntriesWith(candidate.relationships, ['seatId', 'towardSeatId']) &&
    (candidate.hexesTaken === null || isListOfEntriesWith(candidate.hexesTaken, ['bySeatId', 'fromSeatId']))
  );
}

/**
 * Reads every recorded turn's statistics.
 *
 * Purpose: The charts channel serves the whole series with no fog filter.
 * When to use: When a chart view opens or refreshes.
 * Expected outcome: One entry per turn, the last event written for it, in turn order. A row of another format version, a payload that cannot be decoded, and a payload that is not a turn's statistics are skipped (`listReadableMatchEventsOfType`).
 * Exceptions: Propagates a SQLite error.
 */
export function readStatisticsHistory(ops: BasicDbOps): TurnStatistics[] {
  const latestByTurn = new Map<number, TurnStatistics>();
  for (const row of listReadableMatchEventsOfType(ops, 'side_statistics')) {
    if (isTurnStatistics(row.payload)) latestByTurn.set(row.payload.turnNumber, row.payload);
  }
  logTrace('statisticsHistory readStatisticsHistory', { turnCount: latestByTurn.size });
  return [...latestByTurn.values()].sort((left, right) => left.turnNumber - right.turnNumber);
}
