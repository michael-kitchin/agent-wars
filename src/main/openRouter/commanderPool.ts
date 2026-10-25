/**
 * One in-flight consult per AI seat.
 *
 * Purpose: Several commanders plan at the same time. Each seat keeps its own status, plan, and cost.
 * When to use: The commander IPC, and later Ready. Nothing in the match screen calls this yet.
 * Expected outcome: Eligible seats start together. Database writes are queued. A timeout clears that seat's pending orders.
 * Exceptions: A missing consult runner logs and leaves the seat ready with no plan.
 */

import { AI_CONSULTATION_WAIT_TIMEOUT_MS, AI_CONSULTATION_WALL_CLOCK_MS } from '../../shared/aiConsultationLimits';
import type { CommanderAbsenceReason, CommanderDispatch, CommanderPoolSnapshot, CommanderStatus } from '../../shared/commanderStatus';
import { isAiSeatId, isNeutralOwnerId, type AiSeatId } from '../../shared/seatIds';
import { AI_SEAT_KIND, type SeatRecord } from '../../shared/seatRoster';
import type { TacticalOpponentPlanPayload } from '../../shared/ipc/consultationPushTypes';
import type { ModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { getGameState, getSeatRoster } from '../gameDb';
import { logDebug, logError, logTrace } from '../logger';
import { applyConsultOutcome, expireConsult, type ConsultSettleContext } from './commanderPoolSettle';
import {
  cancelSeatTimers,
  commanderStatusRow,
  consultErrorText,
  entryIsPlanning,
  idlePoolSeat,
  notifyWaiters,
  rosterBlocksConsult,
} from './commanderPoolRows';
import { cancelModelCalls } from './modelCallControl';
import {
  emptyConsultOutcome,
  tacticalDraftKey,
  type CommanderConsultOutcome,
  type CommanderConsultRequest,
} from './commanderPoolSupport';

/**
 * Runs one seat's consult.
 *
 * Purpose: Tests substitute a fake. Production registers the OpenRouter consult.
 * When to use: `startStrategicPlanning` and `startTacticalPlanning`.
 * Expected outcome: The promise resolves with a plan, a timeout, or a failure. The runner records its start before its first await.
 * Exceptions: A throw is treated as a failure with no plan.
 */
export type CommanderConsultRunner = (request: CommanderConsultRequest) => Promise<CommanderConsultOutcome>;

/**
 * Clock and timers the pool uses for the wall clock and the wait race.
 *
 * Purpose: Tests fire a short timeout without waiting for the real budget.
 * When to use: `setCommanderPoolTimingForTests`.
 * Expected outcome: `schedule` returns a handle that `cancel` makes inert.
 * Exceptions: None.
 */
type CommanderPoolTiming = {
  readonly nowMs: () => number;
  readonly wallClockMs: number;
  readonly waitTimeoutMs: number;
  readonly schedule: (fn: () => void, delayMs: number) => { cancel: () => void };
};

/**
 * In-memory state of one AI seat's commander.
 *
 * Purpose: Status survives between reads. The roster still decides `out` and `no_model` at read time.
 * When to use: Inside this module.
 * Expected outcome: `settled` stops a late result from storing a plan.
 * Exceptions: None.
 */
export type PoolSeat = {
  seatId: AiSeatId;
  status: CommanderStatus;
  planningStartedAt: number | null;
  timedOutTurn: number | null;
  turnNumber: number;
  theater: 'strategic' | 'tactical';
  battleId: string | null;
  controller: AbortController | null;
  settled: boolean;
  generation: number;
  launchId: number;
  timers: { cancel: () => void }[];
  /**
   * Why the last unfinished consult produced no prose.
   *
   * Purpose: The message dialog explains a skip without treating it as a model reply.
   * When to use: Set when a consult settles unfinished with no prose. Clear it when a launch starts, when a consult finishes or sends prose, and when a consult times out.
   * Expected outcome: Null while planning, after a finished consult, and after a timeout. A roster knockout is not stored here.
   * Exceptions: None.
   */
  absenceReason: CommanderAbsenceReason | null;
};

/**
 * Consult runner installed by tests. Null uses the production runner.
 *
 * Purpose: A suite can start three seats without calling OpenRouter.
 * When to use: `setCommanderConsultRunnerForTests`.
 * Expected outcome: Cleared by passing null.
 * Exceptions: None.
 */
let testRunner: CommanderConsultRunner | null = null;

/**
 * Consult runner used when no test runner is installed.
 *
 * Purpose: The IPC register path installs the real consult.
 * When to use: `setProductionCommanderConsultRunner`.
 * Expected outcome: Null until the process registers IPC.
 * Exceptions: None.
 */
let productionRunner: CommanderConsultRunner | null = null;

/**
 * Replaces the clock. Null restores the real timers.
 *
 * Purpose: The timeout test must not wait for the five-minute wall clock.
 * When to use: A test, before starting planning.
 * Expected outcome: The next start uses this clock. Null restores `Date.now` and the real budgets.
 * Exceptions: None.
 */
let timingOverride: CommanderPoolTiming | null = null;

/**
 * Bumped when the pool is reset so a consult from the previous match cannot store orders.
 *
 * Purpose: New Game replaces the database while a consult may still be resolving.
 * When to use: `resetCommanderPool` and each launch.
 * Expected outcome: A result whose generation does not match is ignored.
 * Exceptions: None.
 */
let generation = 0;

/**
 * Counts launches so a late reply from an older consult cannot store a plan.
 *
 * Purpose: Cancelling and starting again reuses the seat entry.
 * When to use: `launch`, `expire`, and `applyOutcome`.
 * Expected outcome: Each launch gets a new id. A result from another id is ignored.
 * Exceptions: None.
 */
let nextLaunchId = 0;

/**
 * Per-seat state, keyed by AI seat id.
 *
 * Purpose: Planning, timeout, and the abort controller live here between reads.
 * When to use: Start, stop, and snapshot.
 * Expected outcome: One entry per AI seat after a reset that was given a roster.
 * Exceptions: None.
 */
const entries = new Map<AiSeatId, PoolSeat>();

/**
 * Undrained prose from successful consults.
 *
 * Purpose: A peek leaves them. A drain returns them and clears the list.
 * When to use: `readCommanderPoolSnapshot`.
 * Expected outcome: Oldest first.
 * Exceptions: None.
 */
const dispatches: CommanderDispatch[] = [];

/**
 * Tactical plans keyed by seat id and battle id.
 *
 * Purpose: A battle consult must not write strategic pending orders.
 * When to use: `takeTacticalDraft`.
 * Expected outcome: `takeTacticalDraft` removes the plan.
 * Exceptions: None.
 */
const tacticalDrafts = new Map<string, TacticalOpponentPlanPayload>();

/**
 * Waiters told when a seat leaves `planning`.
 *
 * Purpose: `waitForSeatsSettled` resolves without polling.
 * When to use: `notify`.
 * Expected outcome: Copied before calling, so a waiter can remove itself.
 * Exceptions: None.
 */
const waiters: Array<() => void> = [];

/**
 * Installs a consult runner for tests.
 *
 * Purpose: The suite starts seats against a fake that records its start time.
 * When to use: A commander-pool test. Pass null when the test finishes.
 * Expected outcome: The next start uses this runner instead of the production one.
 * Exceptions: None.
 */
export function setCommanderConsultRunnerForTests(runner: CommanderConsultRunner | null): void {
  logDebug('commanderPool setCommanderConsultRunnerForTests', { installed: runner !== null });
  testRunner = runner;
}

/**
 * Installs the production consult runner.
 *
 * Purpose: The IPC module owns the OpenRouter call. The pool does not import it.
 * When to use: When the commander IPC handlers are registered.
 * Expected outcome: Used only while no test runner is installed.
 * Exceptions: None.
 */
export function setProductionCommanderConsultRunner(runner: CommanderConsultRunner | null): void {
  logDebug('commanderPool setProductionCommanderConsultRunner', { installed: runner !== null });
  productionRunner = runner;
}

/**
 * Replaces the pool clock for a test.
 *
 * Purpose: A hung consult can hit the wall clock immediately.
 * When to use: The timeout test. Pass null afterward.
 * Expected outcome: Later starts use this clock until it is cleared.
 * Exceptions: None.
 */
export function setCommanderPoolTimingForTests(timing: CommanderPoolTiming | null): void {
  logDebug('commanderPool setCommanderPoolTimingForTests', { override: timing !== null });
  timingOverride = timing;
}

/**
 * Drops in-flight work and rebuilds status from the roster.
 *
 * Purpose: A new match must not keep the previous match's plans or timers.
 * When to use: After the new-game reset has written the new roster.
 * Expected outcome: Controllers are aborted. Statuses match the given seats. Dispatches and tactical drafts are gone.
 * Exceptions: Does not write the database. A late consult result is ignored.
 */
export function resetCommanderPool(seats: readonly SeatRecord[]): void {
  logDebug('commanderPool resetCommanderPool', { seatCount: seats.length });
  generation += 1;
  for (const entry of entries.values()) {
    cancelSeatTimers(entry);
    entry.controller?.abort();
    entry.settled = true;
  }
  entries.clear();
  dispatches.length = 0;
  tacticalDrafts.clear();
  for (const seat of seats) {
    if (seat.kind !== AI_SEAT_KIND || !isAiSeatId(seat.seatId)) continue;
    entries.set(seat.seatId, idlePoolSeat(seat.seatId, rosterBlocksConsult(seat) ?? 'ready', generation));
  }
  notifyWaiters(waiters);
}

/**
 * Starts a strategic consult for every eligible AI seat that is not already planning.
 *
 * Purpose: The commanders plan at the same time. Ready will later wait on this.
 * When to use: `game:startCommanderPlanning` with mode `strategic`.
 * Expected outcome: Each active AI seat with a model starts before this function awaits. A seat with no model is `no_model`. A knocked-out seat is `out`. Pass `onlySeatIds` to start a subset.
 * Exceptions: Logs and returns when the game state cannot be read. A missing runner leaves the launched seats ready.
 */
export function startStrategicPlanning(onlySeatIds?: readonly AiSeatId[]): void {
  const turnNumber = readTurnNumber();
  if (turnNumber === null) return;
  const roster = getSeatRoster();
  logDebug('commanderPool startStrategicPlanning', { turnNumber, seatCount: roster.length, onlySeatIds: onlySeatIds?.length ?? null });
  for (const seat of roster) {
    if (!isAiSeatId(seat.seatId)) continue;
    if (onlySeatIds !== undefined && !onlySeatIds.includes(seat.seatId)) continue;
    rememberRosterStatus(seat);
    if (!canLaunch(seat)) continue;
    launch(seat.seatId, 'strategic', null, turnNumber);
  }
}

/**
 * Starts a tactical consult for the battle's opposing AI seat.
 *
 * Purpose: The battle plan stays in the pool until `takeTacticalDraft`.
 * When to use: `game:startCommanderPlanning` with mode `tactical`, and later the post-beat path.
 * Expected outcome: No consult when the other party is missing, Neutral, or not an eligible AI seat. A plan is not written to strategic pending orders.
 * Exceptions: Logs and returns when the game state cannot be read.
 */
export function startTacticalPlanning(battle: TacticalBattleSnapshot): void {
  const party = battle.opposingPartyId;
  logDebug('commanderPool startTacticalPlanning', { battleId: battle.battleId, opposingPartyId: party ?? null });
  if (party === undefined || isNeutralOwnerId(party) || !isAiSeatId(party)) return;
  const turnNumber = readTurnNumber();
  if (turnNumber === null) return;
  const seat = getSeatRoster().find((row) => row.seatId === party);
  if (!seat) return;
  rememberRosterStatus(seat);
  if (!canLaunch(seat)) return;
  launch(party, 'tactical', battle, turnNumber);
}

/**
 * Removes and returns the tactical plan for one seat and battle.
 *
 * Purpose: Tactical Ready consumes the buffered plan once.
 * When to use: When a battle commit has no draft of its own.
 * Expected outcome: The plan, or null when this seat and battle have none. A second take returns null.
 * Exceptions: None.
 */
export function takeTacticalDraft(seatId: AiSeatId, battleId: string): TacticalOpponentPlanPayload | null {
  const plan = tacticalDrafts.get(tacticalDraftKey(seatId, battleId)) ?? null;
  if (plan) tacticalDrafts.delete(tacticalDraftKey(seatId, battleId));
  logTrace('commanderPool takeTacticalDraft', { seatId, battleId, found: plan !== null });
  return plan;
}

/**
 * Resolves when none of the seats are still planning, or when the timeout elapses.
 *
 * Purpose: Ready waits for the consults that are already running. It does not start a second, shorter race.
 * When to use: After planning has been started for those seats.
 * Expected outcome: Resolves once every listed seat is out of `planning`, or when `timeoutMs` elapses, whichever is first.
 * Exceptions: Does not reject.
 */
export function waitForSeatsSettled(seatIds: readonly AiSeatId[], timeoutMs: number): Promise<void> {
  logDebug('commanderPool waitForSeatsSettled', { seatCount: seatIds.length, timeoutMs });
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      timer.cancel();
      const index = waiters.indexOf(check);
      if (index >= 0) waiters.splice(index, 1);
      resolve();
    };
    const check = (): void => {
      if (seatIds.every((seatId) => !entryIsPlanning(entries.get(seatId)))) finish();
    };
    const timer = currentTiming().schedule(finish, timeoutMs);
    waiters.push(check);
    check();
  });
}

/**
 * Stops in-flight consults. Leaving a battle stops only a tactical consult.
 *
 * Purpose: Run off, New Game, and teardown stop every commander. A battle exit leaves a strategic consult running.
 * When to use: `game:stopCommanderPlanning`.
 * Expected outcome: Matching planning seats return to `ready`. Their controllers abort. Stored orders stay.
 * Exceptions: None.
 */
export function stopAllPlanning(reason: ModelCallCancelReason): void {
  const tacticalOnly = reason === 'battle_exit';
  logDebug('commanderPool stopAllPlanning', { reason, tacticalOnly });
  cancelModelCalls(reason, tacticalOnly ? 'tactical' : 'all', 'all');
  for (const [seatId, entry] of entries) {
    if (tacticalOnly && entry.theater !== 'tactical') continue;
    abandon(entry, seatId, reason);
  }
  notifyWaiters(waiters);
}

/**
 * Stops one seat's consult.
 *
 * Purpose: Changing that seat's model must not abort the other commanders.
 * When to use: A model or effort change for one seat.
 * Expected outcome: That seat's controller is aborted. Other seats keep planning. The seat returns to `ready` with no new plan.
 * Exceptions: None.
 */
export function cancelSeatPlanning(seatId: AiSeatId, reason: ModelCallCancelReason): void {
  logDebug('commanderPool cancelSeatPlanning', { seatId, reason });
  cancelModelCalls(reason, 'all', seatId);
  const entry = entries.get(seatId);
  if (entry) abandon(entry, seatId, reason);
  notifyWaiters(waiters);
}

/**
 * Reads every AI seat's status and the queued dispatches.
 *
 * Purpose: The IPC read and tests share one snapshot.
 * When to use: `game:readCommanderPool`. Pass true to take the dispatches.
 * Expected outcome: Statuses in seat order. `planningElapsedMs` is set only while planning. A drain clears dispatches after copying them.
 * Exceptions: None.
 */
export function readCommanderPoolSnapshot(drain: boolean): CommanderPoolSnapshot {
  const statuses = getSeatRoster()
    .filter((seat) => isAiSeatId(seat.seatId))
    .map((seat) => commanderStatusRow(seat, isAiSeatId(seat.seatId) ? entries.get(seat.seatId) : undefined, currentTiming().nowMs()));
  const copy = dispatches.slice();
  if (drain) dispatches.length = 0;
  logTrace('commanderPool readCommanderPoolSnapshot', { drain, statusCount: statuses.length, dispatchCount: copy.length });
  return { statuses, dispatches: copy };
}

/**
 * The runner that the next launch will call.
 *
 * Purpose: Tests override production without removing it.
 * When to use: `launch`.
 * Expected outcome: The test runner when one is installed, otherwise the production runner, otherwise null.
 * Exceptions: None.
 */
function activeRunner(): CommanderConsultRunner | null {
  return testRunner ?? productionRunner;
}

/**
 * Clock used by launches and snapshots.
 *
 * Purpose: Production uses the real budgets. A test may replace them.
 * When to use: Every timer and elapsed-time read.
 * Expected outcome: The override, or the real wall clock and wait budget.
 * Exceptions: None.
 */
function currentTiming(): CommanderPoolTiming {
  if (timingOverride) return timingOverride;
  return {
    nowMs: () => Date.now(),
    wallClockMs: AI_CONSULTATION_WALL_CLOCK_MS,
    waitTimeoutMs: AI_CONSULTATION_WAIT_TIMEOUT_MS,
    schedule: (fn, delayMs) => {
      const id = setTimeout(fn, delayMs);
      return { cancel: () => clearTimeout(id) };
    },
  };
}

/**
 * Reads the match turn, or null when the database cannot be read.
 *
 * Purpose: A consult records the turn it started on.
 * When to use: Before launching.
 * Expected outcome: The current turn, or null after an error log.
 * Exceptions: Logs and returns null. Does not throw.
 */
function readTurnNumber(): number | null {
  try {
    return getGameState().turnNumber;
  } catch (err) {
    logError('commanderPool could not read the match turn', err);
    return null;
  }
}

/**
 * Stores `out` or `no_model` for a seat that must not be consulted.
 *
 * Purpose: A snapshot still has a row when planning was never started.
 * When to use: At the start of a planning pass, for each AI seat.
 * Expected outcome: An active seat with a model is left to `launch` or to its current planning entry.
 * Exceptions: None.
 */
function rememberRosterStatus(seat: SeatRecord): void {
  if (!isAiSeatId(seat.seatId)) return;
  const next = rosterBlocksConsult(seat);
  if (next === null) return;
  const entry = entries.get(seat.seatId) ?? idlePoolSeat(seat.seatId, next, generation);
  if (entry.status === 'planning' && !entry.settled) return;
  entry.status = next;
  entry.planningStartedAt = null;
  entries.set(seat.seatId, entry);
}

/**
 * Whether this seat should start a consult now.
 *
 * Purpose: Human seats, knocked-out seats, seats with no model, and seats already planning are skipped.
 * When to use: The planning loops.
 * Expected outcome: True only for an active AI seat with a model that is not already in flight.
 * Exceptions: None.
 */
function canLaunch(seat: SeatRecord): seat is SeatRecord & { seatId: AiSeatId } {
  if (!isAiSeatId(seat.seatId)) return false;
  if (rosterBlocksConsult(seat) !== null) return false;
  const entry = entries.get(seat.seatId);
  return entry === undefined || entry.settled || entry.status !== 'planning';
}

/**
 * Starts one consult with a caller-supplied runner.
 *
 * Purpose: A post-resolution or post-beat consult uses this pool's status and timeout without replacing the planning runner.
 * When to use: Once per active AI seat after a turn, and once for the opposing seat after a tactical beat.
 * Expected outcome: The seat stays `planning` until the runner settles. False when the turn cannot be read, or the seat is out, has no model, or is already planning.
 * Exceptions: Logs and returns false when the match turn cannot be read.
 */
export function launchCommanderConsult(
  seatId: AiSeatId,
  theater: 'strategic' | 'tactical',
  battle: TacticalBattleSnapshot | null,
  runner: CommanderConsultRunner
): boolean {
  const turnNumber = readTurnNumber();
  if (turnNumber === null) return false;
  const seat = getSeatRoster().find((row) => row.seatId === seatId);
  logDebug('commanderPool launchCommanderConsult', { seatId, theater, battleId: battle?.battleId ?? null, found: Boolean(seat) });
  if (!seat || !canLaunch(seat)) return false;
  launch(seatId, theater, battle, turnNumber, runner);
  return true;
}

/**
 * Starts one consult and returns without waiting for it.
 *
 * Purpose: The caller loops every eligible seat before any of them resolves.
 * When to use: Strategic and tactical starts, and `launchCommanderConsult`.
 * Expected outcome: The runner is invoked before this function returns. Timers cover the wall clock and the wait budget.
 * Exceptions: A missing runner logs and leaves the seat ready.
 */
function launch(
  seatId: AiSeatId,
  theater: 'strategic' | 'tactical',
  battle: TacticalBattleSnapshot | null,
  turnNumber: number,
  runnerOverride?: CommanderConsultRunner
): void {
  const runner = runnerOverride ?? activeRunner();
  const timing = currentTiming();
  const entry = entries.get(seatId) ?? idlePoolSeat(seatId, 'ready', generation);
  cancelSeatTimers(entry);
  entry.controller?.abort();
  const controller = new AbortController();
  const launchedGeneration = generation;
  const launchId = nextLaunchId + 1;
  nextLaunchId = launchId;
  entry.status = 'planning';
  entry.settled = false;
  entry.planningStartedAt = timing.nowMs();
  entry.timedOutTurn = null;
  entry.absenceReason = null;
  entry.turnNumber = turnNumber;
  entry.theater = theater;
  entry.battleId = battle?.battleId ?? null;
  entry.controller = controller;
  entry.generation = launchedGeneration;
  entry.launchId = launchId;
  entry.timers = [];
  entries.set(seatId, entry);
  if (!runner) {
    logError('commanderPool has no consult runner', new Error(`no consult runner for ${seatId}`));
    entry.settled = true;
    entry.status = 'ready';
    entry.planningStartedAt = null;
    entry.controller = null;
    entry.absenceReason = 'consult_failed';
    notifyWaiters(waiters);
    return;
  }
  const request: CommanderConsultRequest = {
    seatId,
    theater,
    signal: controller.signal,
    turnNumber,
    waitTimeoutMs: timing.waitTimeoutMs,
    battle,
  };
  let pending: Promise<CommanderConsultOutcome>;
  try {
    pending = Promise.resolve(runner(request));
  } catch (err) {
    logError('commanderPool consult threw', err);
    pending = Promise.resolve(emptyConsultOutcome({ errorMessage: consultErrorText(err) }));
  }
  const context = settleContext();
  entry.timers.push(timing.schedule(() => expireConsult(entry, launchId, launchedGeneration, context), timing.wallClockMs));
  entry.timers.push(timing.schedule(() => expireConsult(entry, launchId, launchedGeneration, context), timing.waitTimeoutMs));
  void pending.then(
    (outcome) => applyConsultOutcome(entry, outcome, launchId, launchedGeneration, context),
    (err: unknown) => {
      logError('commanderPool consult threw', err);
      applyConsultOutcome(
        entry,
        emptyConsultOutcome({ timedOut: controller.signal.aborted, errorMessage: consultErrorText(err) }),
        launchId,
        launchedGeneration,
        context
      );
    }
  );
}

/**
 * The settle path's view of this pool.
 *
 * Purpose: Timeout and success writes update the same lists the snapshot reads.
 * When to use: Each launch, so the timers close over this match's generation.
 * Expected outcome: A context whose generation read stays current.
 * Exceptions: None.
 */
function settleContext(): ConsultSettleContext {
  return {
    currentGeneration: () => generation,
    dispatches,
    tacticalDrafts,
    cancelTimers: cancelSeatTimers,
    notify: () => notifyWaiters(waiters),
  };
}

/**
 * Stops one planning seat without treating it as a timeout.
 *
 * Purpose: A player stop leaves any orders already stored and does not write a new plan.
 * When to use: `stopAllPlanning` and `cancelSeatPlanning`.
 * Expected outcome: The controller is aborted and the seat is `ready` when `settle` is false and it was planning.
 * Exceptions: None. `reason` is logged by the caller via `cancelModelCalls`.
 */
function abandon(entry: PoolSeat, seatId: AiSeatId, reason: ModelCallCancelReason): void {
  if (entry.settled || entry.status !== 'planning') return;
  entry.settled = true;
  cancelSeatTimers(entry);
  entry.controller?.abort();
  entry.controller = null;
  entry.planningStartedAt = null;
  entry.status = 'ready';
  logDebug('commanderPool abandon', { seatId, reason });
}
