/**
 * Snapshot rows and idle seat entries for the commander pool.
 *
 * Purpose: Keeps the pool module on starting and stopping consults.
 * When to use: Reads, resets, and the wait.
 * Expected outcome: A row follows the roster for knockout and a missing model.
 * Exceptions: None.
 */

import type { CommanderStatus, CommanderStatusRow } from '../../shared/commanderStatus';
import { isAiSeatId, type AiSeatId } from '../../shared/seatIds';
import type { SeatRecord } from '../../shared/seatRoster';
import type { PoolSeat } from './commanderPool';

/**
 * Status forced by the roster, or null when the seat may be consulted.
 *
 * Purpose: Knockout and a missing model win over an old ready or timeout flag.
 * When to use: Before a launch, and when building a snapshot row.
 * Expected outcome: `out`, `no_model`, or null.
 * Exceptions: None.
 */
export function rosterBlocksConsult(seat: SeatRecord): 'out' | 'no_model' | null {
  if (seat.outTurn !== null) return 'out';
  if (!seat.commander?.modelId?.trim()) return 'no_model';
  return null;
}

/**
 * Cancels the seat's wall-clock and wait timers.
 *
 * Purpose: A finished consult must not be expired afterward.
 * When to use: Settle, expire, reset, and a new launch.
 * Expected outcome: Each handle's `cancel` runs once.
 * Exceptions: None.
 */
export function cancelSeatTimers(entry: PoolSeat): void {
  for (const timer of entry.timers) timer.cancel();
  entry.timers = [];
}

/**
 * Tells every waiter to look again.
 *
 * Purpose: A seat that left `planning` unblocks `waitForSeatsSettled`.
 * When to use: After a settle.
 * Expected outcome: Waiters run on a copy of the list.
 * Exceptions: None.
 */
export function notifyWaiters(waiters: Array<() => void>): void {
  for (const waiter of [...waiters]) waiter();
}

/**
 * Whether the entry is still planning.
 *
 * Purpose: The wait stays open while a queued database write has not changed the status.
 * When to use: `waitForSeatsSettled`.
 * Expected outcome: True while the status is `planning`.
 * Exceptions: None.
 */
export function entryIsPlanning(entry: PoolSeat | undefined): boolean {
  return entry !== undefined && entry.status === 'planning';
}

/**
 * One snapshot row from the live roster and the in-memory entry.
 *
 * Purpose: Knockout and a cleared model show even if the memory still says ready.
 * When to use: `readCommanderPoolSnapshot`.
 * Expected outcome: Elapsed time is set only while the visible status is `planning`.
 * Exceptions: None.
 */
export function commanderStatusRow(seat: SeatRecord, entry: PoolSeat | undefined, nowMs: number): CommanderStatusRow {
  const seatId = isAiSeatId(seat.seatId) ? seat.seatId : null;
  const forced = rosterBlocksConsult(seat);
  const status = forced ?? entry?.status ?? 'ready';
  const planning = status === 'planning' && entry?.planningStartedAt !== null && entry?.planningStartedAt !== undefined;
  return {
    seatId: seatId ?? (seat.seatId as AiSeatId),
    status,
    planningElapsedMs: planning && entry?.planningStartedAt != null ? Math.max(0, nowMs - entry.planningStartedAt) : null,
    timedOutTurn: status === 'timed_out' ? entry?.timedOutTurn ?? null : null,
  };
}

/**
 * A seat entry that is not planning.
 *
 * Purpose: Reset and the first launch share one shape.
 * When to use: `resetCommanderPool` and `launch`.
 * Expected outcome: Settled, with the given status and match generation.
 * Exceptions: None.
 */
export function idlePoolSeat(seatId: AiSeatId, status: CommanderStatus, generation: number): PoolSeat {
  return {
    seatId,
    status,
    planningStartedAt: null,
    timedOutTurn: null,
    turnNumber: 0,
    theater: 'strategic',
    battleId: null,
    controller: null,
    settled: true,
    generation,
    launchId: 0,
    timers: [],
  };
}

/**
 * A short error string for the consult log.
 *
 * Purpose: A thrown value may not be an Error.
 * When to use: The runner's rejection path.
 * Expected outcome: The error message, or the value's string form.
 * Exceptions: None.
 */
export function consultErrorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
