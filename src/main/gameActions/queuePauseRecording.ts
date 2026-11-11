/**
 * The production pass collects paused queues, decides how many points a hex keeps, and picks out the ones that paused this pass.
 *
 * Purpose: The turn report names a queue on the turn it pauses, with every reason that applies. A paused queue keeps no points.
 * When to use: From `processProductionAfterControlResolution`.
 * Expected outcome: Per-seat lists of pauses, and the subset that is new this pass.
 * Exceptions: None.
 */

import type { BuildUnitType } from '../../shared/ipc/productionTypes';
import type { QueuePause, QueuePauseReason } from '../../shared/queuePauseTypes';
import type { SeatId } from '../../shared/seatIds';
import { logDebug, logTrace } from '../logger';
import { DEPLOYMENT_CAP_TYPE_ORDER } from '../productionCaps';

/**
 * Records one paused hex for a seat.
 *
 * Purpose: The pass gathers every pause before it decides which ones are new.
 * When to use: When a hex with something queued is not spending.
 * Expected outcome: The hex is appended for that seat. An empty reason list is ignored.
 * Exceptions: None.
 */
export function recordQueuePause(
  byPlayer: Map<SeatId, QueuePause[]>,
  seatId: SeatId,
  h3Index: string,
  reasons: readonly QueuePauseReason[]
): void {
  logDebug('queuePauseRecording recordQueuePause', { seatId, h3Index, reasonCount: reasons.length });
  if (reasons.length === 0) return;
  const list = byPlayer.get(seatId) ?? [];
  list.push({ h3Index, reasons: [...reasons] });
  byPlayer.set(seatId, list);
}

/**
 * Production points a hex keeps after one pass.
 *
 * Purpose: A paused queue starts the next turn from nothing. A queue that is still building keeps what it could not spend.
 * When to use: At the end of a hex's production pass, with that hex's pause reasons. An empty list means the queue is not paused.
 * Expected outcome: 0 when any reason applies. Otherwise the points, truncated at 0. Points already spent this pass are not in `points`.
 * Exceptions: None.
 */
export function pointsKeptAfterPass(
  h3Index: string,
  points: number,
  reasons: readonly QueuePauseReason[]
): number {
  const kept = reasons.length > 0 ? 0 : Math.max(0, Math.trunc(points));
  logDebug('queuePauseRecording pointsKeptAfterPass', {
    h3Index,
    points,
    reasonCount: reasons.length,
    kept,
  });
  return kept;
}

/**
 * Unit types the seat already has at its deployment cap.
 *
 * Purpose: A queued unit type at the cap is a pause reason. The counts are the same ones the spend loop uses, keyed `` `${seatId}:${unitType}` ``, which leave mercenaries out.
 * When to use: While recording a pause for one hex.
 * Expected outcome: The capped unit types for that seat.
 * Exceptions: None.
 */
export function maxedUnitTypesFor(
  seatId: SeatId,
  countsByPlayerType: ReadonlyMap<string, number>,
  caps: Readonly<Record<BuildUnitType, number>>
): Set<string> {
  logTrace('queuePauseRecording maxedUnitTypesFor', { seatId });
  return new Set(
    DEPLOYMENT_CAP_TYPE_ORDER.filter((unitType) => (countsByPlayerType.get(`${seatId}:${unitType}`) ?? 0) >= caps[unitType])
  );
}

/**
 * Keeps the pauses whose hex was not paused for that seat last pass.
 *
 * Purpose: The turn report names a queue only on the turn it pauses.
 * When to use: After the pass has recorded every current pause and before it returns.
 * Expected outcome: For each seat, the pauses whose hex was not in that seat's previous set, with their current reasons. Seats with none are omitted.
 * Exceptions: None.
 */
export function selectNewlyPausedQueues(
  previous: ReadonlyMap<string, ReadonlySet<string>>,
  current: ReadonlyMap<SeatId, readonly QueuePause[]>
): Map<SeatId, QueuePause[]> {
  logTrace('queuePauseRecording selectNewlyPausedQueues', { seatCount: current.size });
  const fresh = new Map<SeatId, QueuePause[]>();
  for (const [seatId, pauses] of current) {
    const before = previous.get(seatId);
    const added = pauses.filter((pause) => !before?.has(pause.h3Index));
    if (added.length > 0) fresh.set(seatId, added);
  }
  return fresh;
}
