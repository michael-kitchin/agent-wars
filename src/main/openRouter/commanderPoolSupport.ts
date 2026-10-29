/**
 * Types and the write queue for the commander pool.
 *
 * Purpose: Keeps the pool module on the seat state machine. Consult results and database writes live here.
 * When to use: The pool and the production consult runner.
 * Expected outcome: Writes run one at a time and never span an await. Consults are not queued.
 * Exceptions: A write that throws is logged and the queue continues.
 */

import type { MissileLaunchOrder } from '../../shared/ipc/missileTypes';
import type { AirStrikeOrder, EmbarkOrder, FerryOrder, MovementOrder, RangedAttackOrder } from '../../shared/ipc/ordersTypes';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import type { CommanderAbsenceReason } from '../../shared/commanderStatus';
import type { AiSeatId } from '../../shared/seatIds';
import { logError } from '../logger';

/**
 * What one seat consult is asked to do.
 *
 * Purpose: The pool starts the consult. The runner performs it.
 * When to use: `CommanderConsultRunner`.
 * Expected outcome: The runner starts work before its first await.
 * Exceptions: None.
 */
export type CommanderConsultRequest = {
  /**
   * The AI seat being consulted.
   *
   * Contract: An active AI seat that has a model.
   * When to use: State, orders, and the model call.
   * Expected outcome: That seat id.
   * Exceptions: None.
   */
  readonly seatId: AiSeatId;
  /**
   * Strategic planning or one tactical battle.
   *
   * Contract: `'strategic'` or `'tactical'`.
   * When to use: Choosing the prompt and where the plan is stored.
   * Expected outcome: The theater passed to the model call.
   * Exceptions: None.
   */
  readonly theater: 'strategic' | 'tactical';
  /**
   * Aborts this seat's consult.
   *
   * Contract: Aborting it does not abort another seat.
   * When to use: A per-seat stop or the pool's own timeout.
   * Expected outcome: The runner observes `aborted` on this signal.
   * Exceptions: None.
   */
  readonly signal: AbortSignal;
  /**
   * The match turn when planning started.
   *
   * Contract: The turn from the game state at the start.
   * When to use: The dispatch and a timeout's turn.
   * Expected outcome: That turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
  /**
   * How long the runner may wait for this consult, in milliseconds.
   *
   * Contract: The pool's current wait budget.
   * When to use: The runner's own race.
   * Expected outcome: A positive number.
   * Exceptions: None.
   */
  readonly waitTimeoutMs: number;
  /**
   * The battle being planned, when the theater is tactical.
   *
   * Contract: Null for a strategic consult. The active battle for a tactical one.
   * When to use: The tactical prompt and draft key.
   * Expected outcome: The battle snapshot, or null.
   * Exceptions: None.
   */
  readonly battle: TacticalBattleSnapshot | null;
};

/**
 * What a consult runner returns to the pool.
 *
 * Purpose: The pool stores orders, cost, and prose from this and does not inspect the model call.
 * When to use: The runner's resolve value.
 * Expected outcome: `finished` is true only when a plan should be stored.
 * Exceptions: None.
 */
export type CommanderConsultOutcome = {
  /**
   * Whether a plan was produced.
   *
   * Contract: True only for a consult that returned orders. False for a failure or a timeout.
   * When to use: Deciding whether to store pending orders.
   * Expected outcome: True stores a plan and a dispatch.
   * Exceptions: None.
   */
  readonly finished: boolean;
  /**
   * Whether the consult ran out of time.
   *
   * Contract: True for the wait race or the wall clock. A player stop is not a timeout.
   * When to use: Status `timed_out` and clearing that seat's pending orders.
   * Expected outcome: True clears stored orders and sets the timeout turn.
   * Exceptions: None.
   */
  readonly timedOut: boolean;
  /**
   * Movement orders to store for a strategic consult.
   *
   * Contract: Empty when `finished` is false.
   * When to use: `setAiPendingOrders`.
   * Expected outcome: The validated movement rows.
   * Exceptions: None.
   */
  readonly movementOrders: readonly MovementOrder[];
  /**
   * Ranged orders to store for a strategic consult.
   *
   * Contract: Empty when `finished` is false.
   * When to use: `setAiPendingOrders`.
   * Expected outcome: The validated ranged rows.
   * Exceptions: None.
   */
  readonly rangedOrders: readonly RangedAttackOrder[];
  /**
   * Air strike orders to store for a strategic consult.
   *
   * Contract: Empty when `finished` is false. Encoded into `strategy_text` with the other extra orders.
   * When to use: `setAiPendingOrders`.
   * Expected outcome: The validated air strikes.
   * Exceptions: None.
   */
  readonly airStrikeOrders: readonly AirStrikeOrder[];
  /**
   * Ferry orders to store for a strategic consult.
   *
   * Contract: Empty when `finished` is false.
   * When to use: `setAiPendingOrders`.
   * Expected outcome: The validated ferry rows.
   * Exceptions: None.
   */
  readonly ferryOrders: readonly FerryOrder[];
  /**
   * Embark orders to store for a strategic consult.
   *
   * Contract: Empty when `finished` is false.
   * When to use: `setAiPendingOrders`.
   * Expected outcome: The validated embark rows.
   * Exceptions: None.
   */
  readonly embarkOrders: readonly EmbarkOrder[];
  /**
   * Missile launches to store for a strategic consult.
   *
   * Contract: Empty when `finished` is false. Encoded into `strategy_text` with the other extra orders.
   * When to use: `setAiPendingOrders`.
   * Expected outcome: The validated launches. A battle consult stores none.
   * Exceptions: None.
   */
  readonly missileLaunchOrders: readonly MissileLaunchOrder[];
  /**
   * Player-facing message prose.
   *
   * Contract: Trimmed text, or null.
   * When to use: The dispatch only.
   * Expected outcome: Not written into the pending-order table.
   * Exceptions: None.
   */
  readonly message: string | null;
  /**
   * Player-facing strategy prose.
   *
   * Contract: Trimmed text, or null.
   * When to use: The dispatch only.
   * Expected outcome: Not written into the pending-order table.
   * Exceptions: None.
   */
  readonly strategy: string | null;
  /**
   * Dollars this consult spent.
   *
   * Contract: A finite number. Zero when the call reported none.
   * When to use: `recordSeatConsultation`.
   * Expected outcome: Added to the seat even when the consult failed after spending.
   * Exceptions: None.
   */
  readonly costUsd: number;
  /**
   * Model id that answered, when one did.
   *
   * Contract: The id passed to the model call, or null.
   * When to use: The dispatch label.
   * Expected outcome: The id, or null.
   * Exceptions: None.
   */
  readonly modelId: string | null;
  /**
   * Tactical plan to keep in the pool.
   *
   * Contract: Null for a strategic consult. The five tactical lists when a battle consult finished.
   * When to use: `takeTacticalDraft`.
   * Expected outcome: Stored under the seat and battle id. Not written to strategic pending orders.
   * Exceptions: None.
   */
  readonly tacticalPlan: TacticalOpponentPlanPayload | null;
  /**
   * Failure text for the log.
   *
   * Contract: Null when the consult finished or timed out without an error string.
   * When to use: The pool's error log.
   * Expected outcome: Logged once. Not shown as a dispatch.
   * Exceptions: None.
   */
  readonly errorMessage: string | null;
  /**
   * Why this consult produced no plan and no prose.
   *
   * Contract: Null when the consult finished, timed out, or failed without a classified reason. `errorMessage` still means `consult_failed` when this is null.
   * When to use: An unfinished consult that the message dialog should explain.
   * Expected outcome: A `CommanderAbsenceReason`, or null. Not a player-facing sentence.
   * Exceptions: None.
   */
  readonly absenceReason: CommanderAbsenceReason | null;
};

/**
 * A consult that produced nothing.
 *
 * Purpose: Failure and timeout paths share one empty order set.
 * When to use: When the runner has no plan to store.
 * Expected outcome: `finished` is false and every order list is empty.
 * Exceptions: None.
 */
export function emptyConsultOutcome(
  overrides: Partial<CommanderConsultOutcome> = {}
): CommanderConsultOutcome {
  return {
    finished: false,
    timedOut: false,
    movementOrders: [],
    rangedOrders: [],
    airStrikeOrders: [],
    ferryOrders: [],
    embarkOrders: [],
    missileLaunchOrders: [],
    message: null,
    strategy: null,
    costUsd: 0,
    modelId: null,
    tacticalPlan: null,
    errorMessage: null,
    absenceReason: null,
    ...overrides,
  };
}

/**
 * Runs database work one callback at a time.
 *
 * Purpose: Concurrent consults must not interleave SQLite writes. The consult itself stays outside this queue.
 * When to use: Storing a plan, recording cost, or clearing pending orders.
 * Expected outcome: `work` runs after the previous write callback. A throw is logged and later writes still run.
 * Exceptions: Does not reject. Failures are logged.
 */
export function enqueueCommanderPoolWrite(work: () => void): void {
  writeTail = writeTail.then(() => {
    try {
      work();
    } catch (err) {
      logError('commanderPool write failed', err);
    }
  });
}

/**
 * The tail of the write queue.
 *
 * Purpose: Each write waits for the previous callback to finish.
 * When to use: `enqueueCommanderPoolWrite` only.
 * Expected outcome: Starts resolved, so the first write runs on the next microtask.
 * Exceptions: None.
 */
let writeTail: Promise<void> = Promise.resolve();

/**
 * Key for one seat's tactical plan in one battle.
 *
 * Purpose: Two seats can hold plans, and one seat replaces its plan for the same battle.
 * When to use: Storing a tactical draft and taking it.
 * Expected outcome: A string unique to that seat and battle.
 * Exceptions: None.
 */
export function tacticalDraftKey(seatId: AiSeatId, battleId: string): string {
  return `${seatId}:${battleId}`;
}
