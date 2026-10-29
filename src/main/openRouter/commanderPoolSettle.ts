/**
 * Stores or clears one seat's consult result.
 *
 * Purpose: Keeps the pool's start and stop path separate from the database write.
 * When to use: When a consult resolves, or when its wall clock or wait timer fires.
 * Expected outcome: A success stores orders, cost, and one dispatch. A timeout clears that seat's pending orders.
 * Exceptions: A database error is logged by the write queue. A stale launch is ignored.
 */

import type { CommanderDispatch } from '../../shared/commanderStatus';
import { formatModelOptionLabel } from '../../shared/openRouterModelDisplay';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import { clearAiPendingOrders, setAiPendingOrders } from '../gameDb';
import { gameDbOps } from '../gameDb/dbConnection';
import { recordSeatConsultation } from '../gameDb/seatRosterStore';
import { logDebug, logError } from '../logger';
import type { PoolSeat } from './commanderPool';
import { enqueueCommanderPoolWrite, tacticalDraftKey, type CommanderConsultOutcome } from './commanderPoolSupport';
import { cancelModelCalls } from './modelCallControl';
import { getOpenRouterModelCapabilities } from './openRouterModelCapabilities';

/**
 * Shared pieces the settle path needs from the pool.
 *
 * Purpose: The write can see dispatches and the match generation without owning them.
 * When to use: `expireConsult` and `applyConsultOutcome`.
 * Expected outcome: `currentGeneration` is the generation at the moment it is called.
 * Exceptions: None.
 */
export type ConsultSettleContext = {
  /**
   * The match generation the pool is on.
   *
   * Contract: Increases when the pool is reset.
   * When to use: Dropping a write from the previous match.
   * Expected outcome: The current generation.
   * Exceptions: None.
   */
  readonly currentGeneration: () => number;
  /**
   * Prose waiting for a draining read.
   *
   * Contract: The pool's dispatch list.
   * When to use: A successful consult.
   * Expected outcome: One new dispatch appended.
   * Exceptions: None.
   */
  readonly dispatches: CommanderDispatch[];
  /**
   * Tactical plans keyed by seat and battle.
   *
   * Contract: The pool's draft map.
   * When to use: A finished tactical consult.
   * Expected outcome: The plan is stored under `tacticalDraftKey`.
   * Exceptions: None.
   */
  readonly tacticalDrafts: Map<string, TacticalOpponentPlanPayload>;
  /**
   * Cancels the seat's wall-clock and wait timers.
   *
   * Contract: Safe to call more than once.
   * When to use: Before storing or timing out.
   * Expected outcome: Those timers do not fire.
   * Exceptions: None.
   */
  readonly cancelTimers: (entry: PoolSeat) => void;
  /**
   * Wakes seats waiting on planning to finish.
   *
   * Contract: Called after the status change.
   * When to use: The end of the database write.
   * Expected outcome: `waitForSeatsSettled` looks again.
   * Exceptions: None.
   */
  readonly notify: () => void;
};

/**
 * Marks a still-running consult timed out and clears that seat's pending orders.
 *
 * Purpose: The wall clock and the wait race share one ending.
 * When to use: The seat's own timers.
 * Expected outcome: Status `timed_out`, `timedOutTurn` set, pending orders cleared. Other seats are untouched.
 * Exceptions: Ignored when the seat already settled or the match generation changed.
 */
export function expireConsult(
  entry: PoolSeat,
  launchId: number,
  launchedGeneration: number,
  context: ConsultSettleContext
): void {
  if (!isCurrentLaunch(entry, launchId, launchedGeneration, context)) return;
  const seatId = entry.seatId;
  entry.settled = true;
  context.cancelTimers(entry);
  entry.controller?.abort();
  cancelModelCalls('teardown', entry.theater, seatId);
  logDebug('commanderPool consult timed out', { seatId, turnNumber: entry.turnNumber });
  enqueueCommanderPoolWrite(() => {
    if (!sameLaunch(entry, launchId, launchedGeneration, context)) return;
    clearAiPendingOrders(seatId);
    entry.status = 'timed_out';
    entry.timedOutTurn = entry.turnNumber;
    entry.absenceReason = null;
    entry.planningStartedAt = null;
    entry.controller = null;
    context.notify();
  });
}

/**
 * Stores a finished consult, or records a failure, when the seat is still waiting.
 *
 * Purpose: A timeout or a cancel that already settled the seat must win over a late reply.
 * When to use: The runner's resolve and reject handlers.
 * Expected outcome: Success stores orders, cost, and one dispatch. A timeout clears orders. An unfinished consult stores a dispatch when it sent prose, and leaves the seat ready.
 * Exceptions: A database error is logged by the write queue.
 */
export function applyConsultOutcome(
  entry: PoolSeat,
  outcome: CommanderConsultOutcome,
  launchId: number,
  launchedGeneration: number,
  context: ConsultSettleContext
): void {
  if (!isCurrentLaunch(entry, launchId, launchedGeneration, context)) return;
  const seatId = entry.seatId;
  entry.settled = true;
  context.cancelTimers(entry);
  entry.controller = null;
  enqueueCommanderPoolWrite(() => {
    if (!sameLaunch(entry, launchId, launchedGeneration, context)) return;
    if (outcome.timedOut) {
      clearAiPendingOrders(seatId);
      if (outcome.costUsd > 0) recordSeatConsultation(gameDbOps, seatId, outcome.costUsd);
      entry.status = 'timed_out';
      entry.timedOutTurn = entry.turnNumber;
      entry.absenceReason = null;
      entry.planningStartedAt = null;
      context.notify();
      return;
    }
    if (!outcome.finished) {
      if (outcome.errorMessage) logError('commanderPool consult failed', new Error(outcome.errorMessage));
      if (outcome.costUsd > 0) recordSeatConsultation(gameDbOps, seatId, outcome.costUsd);
      const message = outcome.message?.trim() ? outcome.message.trim() : null;
      const strategy = outcome.strategy?.trim() ? outcome.strategy.trim() : null;
      if (message || strategy) {
        context.dispatches.push({
          seatId,
          message,
          strategy,
          modelLabel: modelLabel(outcome.modelId),
          turnNumber: entry.turnNumber,
        });
        entry.absenceReason = null;
      } else {
        entry.absenceReason = outcome.absenceReason ?? (outcome.errorMessage ? 'consult_failed' : null);
        if (entry.absenceReason) {
          logDebug('commanderPool recorded consult absence', { seatId, absenceReason: entry.absenceReason });
        }
      }
      entry.status = 'ready';
      entry.planningStartedAt = null;
      context.notify();
      return;
    }
    if (entry.theater === 'tactical' && entry.battleId && outcome.tacticalPlan) {
      context.tacticalDrafts.set(tacticalDraftKey(seatId, entry.battleId), outcome.tacticalPlan);
    } else if (entry.theater === 'strategic') {
      setAiPendingOrders(seatId, {
        movementOrders: [...outcome.movementOrders],
        rangedOrders: [...outcome.rangedOrders],
        airStrikeOrders: [...outcome.airStrikeOrders],
        ferryOrders: [...outcome.ferryOrders],
        embarkOrders: [...outcome.embarkOrders],
        missileLaunchOrders: [...outcome.missileLaunchOrders],
      });
    }
    recordSeatConsultation(gameDbOps, seatId, outcome.costUsd);
    context.dispatches.push({
      seatId,
      message: outcome.message,
      strategy: outcome.strategy,
      modelLabel: modelLabel(outcome.modelId),
      turnNumber: entry.turnNumber,
    });
    entry.absenceReason = null;
    entry.status = 'ready';
    entry.planningStartedAt = null;
    context.notify();
  });
}

/**
 * Whether this result still belongs to the consult that is waiting.
 *
 * Purpose: A newer launch, a cancel, or a new match must ignore a late reply.
 * When to use: Before storing or timing out.
 * Expected outcome: True only for the unsettled launch that started this result.
 * Exceptions: None.
 */
function isCurrentLaunch(
  entry: PoolSeat,
  launchId: number,
  launchedGeneration: number,
  context: ConsultSettleContext
): boolean {
  return !entry.settled && sameLaunch(entry, launchId, launchedGeneration, context);
}

/**
 * Whether the entry is still the launch that queued this write.
 *
 * Purpose: The write runs on a later turn, after a new launch may have reused the entry.
 * When to use: The database callback.
 * Expected outcome: True when the launch id and match generation are unchanged.
 * Exceptions: None.
 */
function sameLaunch(
  entry: PoolSeat,
  launchId: number,
  launchedGeneration: number,
  context: ConsultSettleContext
): boolean {
  return entry.launchId === launchId && entry.generation === launchedGeneration && launchedGeneration === context.currentGeneration();
}

/**
 * Display label for the model that answered.
 *
 * Purpose: The dispatch uses the same label as the model list.
 * When to use: A successful consult.
 * Expected outcome: `formatModelOptionLabel` when the model is cached. Otherwise the id. Empty when the id is missing.
 * Exceptions: None.
 */
function modelLabel(modelId: string | null): string {
  if (!modelId) return '';
  const model = getOpenRouterModelCapabilities(modelId);
  return model ? formatModelOptionLabel(model) : modelId;
}
