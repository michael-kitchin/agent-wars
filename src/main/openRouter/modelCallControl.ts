/**
 * In-flight opponent model calls, and the cancel epoch that tells a later consult the player stopped one.
 *
 * Purpose: Run off, a model change, New, and leaving a battle abort the matching calls. A transport timeout aborts
 * only its own controller, so it does not look like a model change.
 * When to use: Around every opponent model call, and from `stopModelWork`.
 * Expected outcome: `cancelModelCalls` aborts matching scopes and advances the epoch. `beginModelCall` does not.
 * Exceptions: None.
 */

import type { ModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import type { AiSeatId } from '../../shared/seatIds';
import { logDebug, logTrace } from '../logger';

/**
 * Which theater a model call belongs to.
 *
 * Purpose: Leaving a battle aborts tactical calls and leaves a strategic post-resolution consult running.
 * When to use: `beginModelCall` and `cancelModelCalls`.
 * Expected outcome: `strategic` or `tactical`.
 * Exceptions: None.
 */
export type ModelCallTheater = 'strategic' | 'tactical';

type ModelCallScope = {
  controller: AbortController;
  theater: ModelCallTheater;
  seatId: AiSeatId;
  ended: boolean;
};

/**
 * A model call the owner must finish with `end`, and may abort locally without counting as a player cancel.
 *
 * Purpose: The consultation waiter aborts this controller on its own deadline. That abort must not advance the epoch.
 * When to use: The return value of `beginModelCall`.
 * Expected outcome: `signal` aborts when `abort` or `cancelModelCalls` runs. `end` drops the scope and is safe to call twice.
 * Exceptions: None.
 */
export type BegunModelCall = {
  readonly signal: AbortSignal;
  readonly controller: AbortController;
  end: () => void;
  abort: () => void;
};

const scopes = new Set<ModelCallScope>();
const seatCancelEpoch = new Map<AiSeatId, number>();
let cancelEpochAll = 0;
let lastCancelReason: ModelCallCancelReason | null = null;
let begunCount = 0;

/**
 * Registers one in-flight model call.
 *
 * Purpose: A later `cancelModelCalls` can abort it by theater. The caller passes `signal` into the order request.
 * When to use: Immediately before a background request, an inline Ready consult, or a deferred consult attempt.
 * Expected outcome: A live scope. `end` removes it. `abort` aborts the controller and does not change the cancel epoch.
 * Exceptions: None.
 */
export function beginModelCall(label: string, theater: ModelCallTheater, seatId: AiSeatId): BegunModelCall {
  logDebug('modelCallControl beginModelCall', { label, theater, seatId });
  begunCount += 1;
  const controller = new AbortController();
  const scope: ModelCallScope = { controller, theater, seatId, ended: false };
  scopes.add(scope);
  return {
    signal: controller.signal,
    controller,
    end: () => {
      if (scope.ended) return;
      scope.ended = true;
      scopes.delete(scope);
    },
    abort: () => {
      if (!scope.ended) controller.abort();
    },
  };
}

/**
 * Aborts in-flight model calls and records why.
 *
 * Purpose: Player stops share one epoch so a consult that has not started can skip, and one that already started
 * can retry only after a model change.
 * When to use: `stopModelWork`. Do not call this from the transport timeout.
 * Expected outcome: The epoch advances by one even when nothing is in flight. Scopes whose theater matches are aborted.
 * `all` aborts both theaters. Returns how many signals this call aborted.
 * Exceptions: None.
 */
export function cancelModelCalls(
  reason: ModelCallCancelReason,
  theater: ModelCallTheater | 'all',
  seatId: AiSeatId | 'all'
): number {
  lastCancelReason = reason;
  if (seatId === 'all') cancelEpochAll += 1;
  else seatCancelEpoch.set(seatId, (seatCancelEpoch.get(seatId) ?? 0) + 1);
  let aborted = 0;
  for (const scope of scopes) {
    if (theater !== 'all' && scope.theater !== theater) continue;
    if (seatId !== 'all' && scope.seatId !== seatId) continue;
    if (scope.ended || scope.controller.signal.aborted) continue;
    scope.controller.abort();
    aborted += 1;
  }
  logDebug('modelCallControl cancelModelCalls', {
    reason,
    theater,
    seatId,
    abortedCount: aborted,
    epoch: seatId === 'all' ? cancelEpochAll : seatCancelEpoch.get(seatId),
  });
  return aborted;
}

/**
 * The reason from the most recent `cancelModelCalls`, if any.
 *
 * Purpose: A deferred consult retries only when the abort was a model change.
 * When to use: After an attempt's signal is aborted.
 * Expected outcome: The last reason, or null before any cancel.
 * Exceptions: None.
 */
export function getLastModelCallCancelReason(): ModelCallCancelReason | null {
  logTrace('modelCallControl getLastModelCallCancelReason', { reason: lastCancelReason });
  return lastCancelReason;
}

/**
 * How many times `cancelModelCalls` has run in this process.
 *
 * Purpose: A consult captures this before it starts and later asks whether a player stop happened during the wait.
 * When to use: Before a deferred consult, and when deciding a model-change retry.
 * Expected outcome: A count that starts at 0 and increases by one per `cancelModelCalls` call.
 * Exceptions: None.
 */
export function getModelCallCancelEpoch(seatId: AiSeatId): number {
  const epoch = cancelEpochAll + (seatCancelEpoch.get(seatId) ?? 0);
  logTrace('modelCallControl getModelCallCancelEpoch', { seatId, epoch });
  return epoch;
}

/**
 * True when `cancelModelCalls` has run since `epochAtStart`.
 *
 * Purpose: Separates a player stop during this consult from an older stop, and from a timeout abort that does not move the epoch.
 * When to use: Before starting a deferred consult, and after an attempt whose signal aborted.
 * Expected outcome: True when the current epoch differs from `epochAtStart`.
 * Exceptions: None.
 */
export function hasModelCallCancelSince(epochAtStart: number, seatId: AiSeatId): boolean {
  const changed = getModelCallCancelEpoch(seatId) !== epochAtStart;
  logTrace('modelCallControl hasModelCallCancelSince', { epochAtStart, seatId, changed });
  return changed;
}

/**
 * How many scopes `beginModelCall` has opened in this process.
 *
 * Purpose: A notify test can prove a cancelled consult never started.
 * When to use: Tests that cancel before `handleNotifyResolutionPlaybackComplete` runs the consult.
 * Expected outcome: A count that increases once per `beginModelCall`.
 * Exceptions: None.
 */
export function modelCallsBegun(): number {
  logTrace('modelCallControl modelCallsBegun', { begunCount });
  return begunCount;
}
