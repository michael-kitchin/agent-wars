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
 * Reports whether a decoded payload has the shape of a turn's statistics.
 *
 * Purpose: A damaged or foreign payload must not reach a chart.
 * When to use: Each recorded event.
 * Expected outcome: True for an object with a numeric `turnNumber` and a `sides` array.
 * Exceptions: None.
 */
function isTurnStatistics(value: unknown): value is TurnStatistics {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { readonly turnNumber?: unknown; readonly sides?: unknown };
  return typeof candidate.turnNumber === 'number' && Array.isArray(candidate.sides);
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
