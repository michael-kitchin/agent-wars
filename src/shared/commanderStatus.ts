/**
 * Per-seat commander status shared by the main process and the match screen.
 *
 * Purpose: The pool and the IPC snapshot use one set of status names.
 * When to use: Reading the commander pool, and later the commander strip.
 * Expected outcome: Status names stay stable across the IPC boundary.
 * Exceptions: None. This module does not import the main-process logger.
 */

import type { AiSeatId } from './seatIds';

/**
 * Status of one AI seat's commander.
 *
 * Purpose: The pool reports one of these for every AI seat, in seat order.
 * When to use: Snapshot rows and any later status label.
 * Expected outcome: `planning` while a consult is in flight, `timed_out` after the wait expires,
 * `no_model` when the seat has no model, `out` after a knockout, otherwise `ready`.
 * Exceptions: None.
 */
export type CommanderStatus = 'planning' | 'ready' | 'timed_out' | 'no_model' | 'out';

/**
 * Which consult a start request asks for.
 *
 * Purpose: Strategic planning and a tactical battle plan are different consults.
 * When to use: `game:startCommanderPlanning`.
 * Expected outcome: `'strategic'` or `'tactical'`.
 * Exceptions: None.
 */
export type CommanderPlanningMode = 'strategic' | 'tactical';

/**
 * One AI seat's commander status for a snapshot.
 *
 * Purpose: The match screen and tests read the same row the pool stores.
 * When to use: `CommanderPoolSnapshot.statuses`.
 * Expected outcome: AI seats only, in seat order.
 * Exceptions: None.
 */
export type CommanderStatusRow = {
  /**
   * The AI seat this row describes.
   *
   * Contract: An `AiSeatId` that is on the roster.
   * When to use: Matching a row to a side.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * What that seat's commander is doing.
   *
   * Contract: One of `CommanderStatus`.
   * When to use: Labels and the Ready wait.
   * Expected outcome: The status at the moment of the read.
   * Exceptions: None.
   */
  readonly status: CommanderStatus;
  /**
   * How long the current consult has been running, in milliseconds.
   *
   * Contract: A non-negative number while `status` is `planning`. Null otherwise.
   * When to use: A planning indicator.
   * Expected outcome: Milliseconds since that consult started, or null.
   * Exceptions: None.
   */
  readonly planningElapsedMs: number | null;
  /**
   * The turn whose consult timed out.
   *
   * Contract: The match turn when `status` is `timed_out`. Null otherwise.
   * When to use: Showing which turn ran on standing orders.
   * Expected outcome: The turn number, or null.
   * Exceptions: None.
   */
  readonly timedOutTurn: number | null;
};

/**
 * Prose from one consult, for the player-facing toast.
 *
 * Purpose: The pending-order table stores orders, not this prose.
 * When to use: A drained or peeked snapshot.
 * Expected outcome: One dispatch per consult that sent a message or a strategy, until a draining read.
 * Exceptions: None.
 */
export type CommanderDispatch = {
  /**
   * The AI seat that produced the prose.
   *
   * Contract: An `AiSeatId`.
   * When to use: Matching the toast to a side.
   * Expected outcome: The seat that was consulted.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * The model's one-line message, when it sent one.
   *
   * Contract: Trimmed text, or null when the model sent none.
   * When to use: The toast message.
   * Expected outcome: The message, or null.
   * Exceptions: None.
   */
  readonly message: string | null;
  /**
   * The model's strategy prose, when it sent one.
   *
   * Contract: Trimmed text, or null when the model sent none.
   * When to use: The toast strategy section.
   * Expected outcome: The prose, or null. It is not written into `ai_pending_orders.strategy_text`.
   * Exceptions: None.
   */
  readonly strategy: string | null;
  /**
   * Label of the model that answered.
   *
   * Contract: `formatModelOptionLabel` when that model is known, otherwise the model id.
   * When to use: The toast's model line.
   * Expected outcome: A display string. Empty when the consult had no model id.
   * Exceptions: None.
   */
  readonly modelLabel: string;
  /**
   * The match turn the consult planned.
   *
   * Contract: The turn number captured when planning started.
   * When to use: Dropping a dispatch from an older turn.
   * Expected outcome: That turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
};

/**
 * A read of every AI seat's status and any undrained dispatches.
 *
 * Purpose: One IPC payload for `game:readCommanderPool`.
 * When to use: After a start, a stop, or a poll.
 * Expected outcome: Statuses for every AI seat. Dispatches are removed only when the read drains.
 * Exceptions: None.
 */
export type CommanderPoolSnapshot = {
  /**
   * One row per AI seat, in seat order.
   *
   * Contract: Human seats are omitted. Knocked-out seats are included with status `out`.
   * When to use: Rendering commander status.
   * Expected outcome: The rows at the moment of the read.
   * Exceptions: None.
   */
  readonly statuses: readonly CommanderStatusRow[];
  /**
   * Successful consults whose prose has not been drained.
   *
   * Contract: A draining read returns these and clears them. A peek leaves them stored.
   * When to use: Toasts after a consult.
   * Expected outcome: The queued dispatches.
   * Exceptions: None.
   */
  readonly dispatches: readonly CommanderDispatch[];
};
