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
 * Why an opponent's message tab has a one-line explanation instead of a consult.
 *
 * Purpose: The dialog can say why a seat was not consulted without inventing a strategy.
 * When to use: The pool stores a reason after an unfinished consult. Knockout, a missing model, and a timeout are read from status instead.
 * Expected outcome: One of the seven reasons the message dialog formats.
 * Exceptions: None.
 */
export type CommanderAbsenceReason =
  | 'knocked_out'
  | 'no_model'
  | 'timed_out'
  | 'consult_failed'
  | 'no_new_consult'
  | 'not_in_battle'
  | 'no_units_in_battle';

/**
 * The absence reason for a consult whose own roster is empty.
 *
 * Purpose: A strategic seat with no units is still in the match and must be consulted. A tactical seat with no units left in the battle is not.
 * When to use: `requestOrdersFlow` after the key and model checks, before the model call.
 * Expected outcome: `no_units_in_battle` when `tactical` is true and `ownUnitCount` is 0. Null for a strategic consult, and for a tactical consult that still has units.
 * Exceptions: None.
 */
export function emptyRosterAbsenceReason(tactical: boolean, ownUnitCount: number): CommanderAbsenceReason | null {
  if (tactical && ownUnitCount === 0) return 'no_units_in_battle';
  return null;
}

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
 * Which map a seat's latest consult belongs to.
 *
 * Purpose: The message dialog must not treat a strategic consult as a battle consult just because a battle is open.
 * When to use: `CommanderStatusRow.theater`.
 * Expected outcome: `tactical` after a battle consult starts, until a later strategic launch replaces it.
 * Exceptions: None.
 */
export type CommanderConsultTheater = 'strategic' | 'tactical';

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
  /**
   * Why the last unfinished consult produced no prose.
   *
   * Contract: Set only while `status` is `ready`. Null while planning, after a timeout, after prose, and when the roster forces `out` or `no_model`.
   * When to use: The message dialog, after roster status, a timeout, and a tactical seat that is not in the battle.
   * Expected outcome: A `CommanderAbsenceReason`, or null.
   * Exceptions: None.
   */
  readonly absenceReason: CommanderAbsenceReason | null;
  /**
   * The map of this seat's latest consult.
   *
   * Contract: `tactical` after that seat's battle consult starts. `strategic` after a strategic launch, and when the seat has no pool entry.
   * When to use: Deciding whether the other commanders were left out of the battle consult.
   * Expected outcome: The theater stored on the pool seat.
   * Exceptions: None.
   */
  readonly theater: CommanderConsultTheater;
};

/**
 * Prose from one consult, for the player-facing toast.
 *
 * Purpose: The pending-order table stores orders, not this prose.
 * When to use: A drained or peeked snapshot.
 * Expected outcome: One dispatch per finished consult, including a consult that sent no prose, and one per unfinished consult that sent prose. A draining read takes them. An absence line is not a dispatch.
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
