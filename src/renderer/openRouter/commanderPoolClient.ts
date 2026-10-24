/**
 * The match screen's view of the commander pool.
 *
 * Purpose: The screen starts and stops planning, and reads statuses and toasts. It does not run consultations.
 * When to use: Run, Ready, a new match, and a model change.
 * Expected outcome: Statuses stay current while Run is on during planning. A drained dispatch becomes a toast.
 * Exceptions: A failed IPC call is logged and leaves the last snapshot in place.
 */

import type { CommanderDispatch } from '../../shared/commanderStatus';
import type { CommanderPlanningMode, CommanderPoolSnapshot } from '../../shared/commanderStatus';
import type { ModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { fetchMatchSnapshot } from '../core/matchSnapshotClient';
import { rendererSharedState as S } from '../core/state';
import { isNewGameOverlayOpen } from '../gameplay/newGameBanner';
import { isMatchWaitingUnderNewGame } from '../gameplay/newGameReturn';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

const POLL_MS = 1000;

/**
 * The last pool read.
 *
 * Purpose: Ready and the footer read this between polls.
 * When to use: Status and elapsed-time helpers.
 * Expected outcome: Empty until the first successful read.
 * Exceptions: None.
 */
let snapshot: CommanderPoolSnapshot = { statuses: [], dispatches: [] };

/**
 * The one-second poll, or null when the screen is not watching the pool.
 *
 * Purpose: Status and toasts update while a consult can still be running.
 * When to use: `syncCommanderPoolPolling`.
 * Expected outcome: One interval, cleared when polling should stop.
 * Exceptions: None.
 */
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Shows a finished consult's prose.
 *
 * Purpose: The pool stores the prose. The screen shows it.
 * When to use: A draining read.
 * Expected outcome: One toast per dispatch that has text.
 * Exceptions: None.
 */
let showToast: ((lines: readonly string[]) => void) | null = null;
let fileMessage: ((dispatch: CommanderDispatch) => void) | null = null;

/**
 * Refreshes Ready and the footer after a pool read.
 *
 * Purpose: The label and the status line follow the snapshot.
 * When to use: After a start, a stop, or a poll.
 * Expected outcome: The button and the footer match the snapshot.
 * Exceptions: None.
 */
let onPoolChanged: (() => void) | null = null;

/**
 * Extra listeners for a pool change.
 *
 * Purpose: The top bar watches statuses without replacing the Ready refresh.
 * When to use: `subscribeCommanderPool`.
 * Expected outcome: Each listener runs after Ready's refresh.
 * Exceptions: None.
 */
const poolListeners = new Set<() => void>();

/**
 * Tells Ready and every other listener that the snapshot changed.
 *
 * Purpose: One pool read refreshes the button and the side chips.
 * When to use: After a start or a read that still belongs to this match.
 * Expected outcome: Ready's callback runs, then each subscriber.
 * Exceptions: None.
 */
function notifyPoolChanged(): void {
  onPoolChanged?.();
  for (const listener of poolListeners) listener();
}

/**
 * Remembers how the screen shows a toast and refreshes Ready.
 *
 * Purpose: The poll has no other way to reach those controls.
 * When to use: Once, when the Opponent tab is wired.
 * Expected outcome: Later reads can toast and refresh.
 * Exceptions: None.
 */
export function bindCommanderPoolScreen(deps: {
  showCommanderMessages: (lines: readonly string[]) => void;
  fileCommanderMessage: (dispatch: CommanderDispatch) => void;
  updateReadyButtonState: () => void;
}): void {
  showToast = deps.showCommanderMessages;
  fileMessage = deps.fileCommanderMessage;
  onPoolChanged = deps.updateReadyButtonState;
}

/**
 * True when any AI seat is still being consulted.
 *
 * Purpose: Ready waits, and the footer says planning, while that is true.
 * When to use: The Ready button and the status line.
 * Expected outcome: True when the last snapshot has a `planning` row.
 * Exceptions: None.
 */
export function anyCommanderIsPlanning(): boolean {
  return snapshot.statuses.some((row) => row.status === 'planning');
}

/**
 * How many start calls are still inside `startCommanderPlanningIfAllowed`.
 *
 * Purpose: A watch must not press Ready in the gap before the new consult shows up as planning.
 * When to use: `commanderStartIsSettling`.
 * Expected outcome: Greater than zero from the call until its pool notify has run.
 * Exceptions: None.
 */
let commanderStartDepth = 0;

/**
 * True while a planning start has been requested and has not notified yet.
 *
 * Purpose: Auto-advance waits out that gap.
 * When to use: Before pressing Ready on the player's behalf.
 * Expected outcome: True until `startCommanderPlanningIfAllowed` notifies listeners.
 * Exceptions: None.
 */
export function commanderStartIsSettling(): boolean {
  return commanderStartDepth > 0;
}

/**
 * The longest current consult, in milliseconds.
 *
 * Purpose: The Ready "AI:" label uses one clock for every seat.
 * When to use: While any seat is planning.
 * Expected outcome: The largest `planningElapsedMs`, or 0 when none is planning.
 * Exceptions: None.
 */
export function longestPlanningElapsedMs(): number {
  let longest = 0;
  for (const row of snapshot.statuses) {
    if (row.status !== 'planning' || row.planningElapsedMs == null) continue;
    if (row.planningElapsedMs > longest) longest = row.planningElapsedMs;
  }
  return longest;
}

/**
 * The match cost stored on the seats.
 *
 * Purpose: The footer and the Opponent tab show one total.
 * When to use: When drawing the cost.
 * Expected outcome: The sum of `costUsd` on the current snapshot's seats. Zero when the snapshot has none.
 * Exceptions: None.
 */
export function commanderSeatCostUsd(): number {
  const seats = S.gameState?.seats ?? [];
  return seats.reduce((sum, seat) => sum + (Number.isFinite(seat.costUsd) ? seat.costUsd : 0), 0);
}

/**
 * Starts planning when Run is on and the match can take a consult.
 *
 * Purpose: Run on, a new match, and a model change share one start.
 * When to use: Those actions, and after a deferred consult releases a battle.
 * Expected outcome: Strategic planning for a world-map turn. Tactical planning inside a battle. No start while a deferred consult is still pending, the annihilation dialog is open, or the new-game screen has no match under it.
 * Exceptions: A rejected IPC is logged and does not throw. A reply that arrives after Start does not change the snapshot.
 */
export async function startCommanderPlanningIfAllowed(): Promise<void> {
  commanderStartDepth += 1;
  try {
    if (!S.runButtonOn) return;
    if (S.tacticalAnnihilationOutcomeDialog != null) return;
    if (isNewGameOverlayOpen()) return;
    if (S.pendingDeferredStrategicPostResolutionConsult || S.pendingDeferredTacticalPostBeatConsult) return;
    if (!window.gameApi?.startCommanderPlanning) return;
    const tactical = S.tacticalBattleSnapshot != null && S.tacticalPhasePlanning;
    if (S.gameState?.phase !== 'planning' && !tactical) return;
    const mode: CommanderPlanningMode = tactical ? 'tactical' : 'strategic';
    const matchEpoch = currentRendererMatchEpoch();
    try {
      const next = await window.gameApi.startCommanderPlanning({ mode });
      if (!poolReplyIsCurrent(matchEpoch)) return;
      snapshot = next;
    } catch (err) {
      console.error('startCommanderPlanning failed', err);
    }
    if (!poolReplyIsCurrent(matchEpoch)) return;
    syncCommanderPoolPolling();
    notifyPoolChanged();
  } finally {
    commanderStartDepth -= 1;
    notifyPoolChanged();
  }
}

/**
 * Stops every consult the player asked to stop.
 *
 * Purpose: Run off, a new match, and a model change share one stop. Leaving a battle stops the tactical consult only.
 * When to use: Those actions.
 * Expected outcome: The pool aborts the matching consults and the snapshot is read again.
 * Exceptions: A rejected IPC is logged and does not throw.
 */
export async function stopCommanderPlanningFromScreen(reason: ModelCallCancelReason): Promise<void> {
  try {
    await window.gameApi?.stopCommanderPlanning?.(reason);
    await readCommanderPoolAndApply(true);
  } catch (err) {
    console.error('stopCommanderPlanning failed', reason, err);
  }
}

/**
 * Files each kept dispatch and returns the toast lines.
 *
 * Purpose: A message is a toast line and a Reports entry. Strategy is a Reports line only while observing, and never a toast line.
 * When to use: A draining pool read.
 * Expected outcome: Lines are "{full name}: {message}". A dispatch with neither a message nor an observed strategy is skipped.
 * Exceptions: None.
 */
function messageLines(dispatches: readonly CommanderDispatch[]): string[] {
  const observing = matchIsObserving();
  const lines: string[] = [];
  for (const dispatch of dispatches) {
    const keep = Boolean(dispatch.message) || (observing && Boolean(dispatch.strategy));
    if (!keep) continue;
    fileMessage?.(dispatch);
    if (dispatch.message) lines.push(`${dispatchSeatName(dispatch.seatId)}: ${dispatch.message}`);
  }
  return lines;
}

/**
 * True when no human seat is still in the match.
 *
 * Purpose: Strategy prose is shown only while observing.
 * When to use: `messageLines`.
 * Expected outcome: True when the roster has seats and none is an active human.
 * Exceptions: None.
 */
function matchIsObserving(): boolean {
  const seats = S.gameState?.seats ?? [];
  return seats.length > 0 && !seats.some((row) => row.kind === HUMAN_SEAT_ID && row.outTurn === null);
}

/**
 * The full name of a dispatch's seat.
 *
 * Purpose: The Messages toast names the side, not the seat id.
 * When to use: `messageLines`.
 * Expected outcome: `homeRegion`, or the seat id when the roster has no row.
 * Exceptions: None.
 */
function dispatchSeatName(seatId: string): string {
  return S.gameState?.seats?.find((row) => row.seatId === seatId)?.homeRegion ?? seatId;
}

/**
 * Reads the pool once and shows any drained prose.
 *
 * Purpose: Ready needs a fresh status when it returns, and the poll needs the same read.
 * When to use: The one-second poll, and once after Ready returns.
 * Expected outcome: The snapshot updates. A draining read files one Reports entry per kept message and shows one Messages toast. Seat cost refreshes when a dispatch arrives or the last planning seat finishes.
 * Exceptions: A rejected IPC is logged and does not throw. A reply that arrives after Start is ignored.
 */
export async function readCommanderPoolAndApply(drain: boolean): Promise<void> {
  if (!window.gameApi?.readCommanderPool) return;
  const matchEpoch = currentRendererMatchEpoch();
  const wasPlanning = anyCommanderIsPlanning();
  try {
    const next = await window.gameApi.readCommanderPool(drain);
    if (!poolReplyIsCurrent(matchEpoch)) return;
    snapshot = next;
    const consultFinished = wasPlanning && !anyCommanderIsPlanning();
    if (drain && (next.dispatches.length > 0 || consultFinished)) {
      const lines = messageLines(next.dispatches);
      if (lines.length > 0) showToast?.(lines);
      await refreshSeatCosts();
    }
  } catch (err) {
    console.error('readCommanderPool failed', err);
  }
  if (!poolReplyIsCurrent(matchEpoch)) return;
  notifyPoolChanged();
  syncCommanderPoolPolling();
}

/**
 * The statuses from the last pool read.
 *
 * Purpose: The top bar paints planning and ready without a second IPC call.
 * When to use: While drawing the side chips.
 * Expected outcome: The current rows, or an empty list before the first read.
 * Exceptions: None.
 */
export function commanderPoolStatuses(): CommanderPoolSnapshot['statuses'] {
  return snapshot.statuses;
}

/**
 * Runs after each pool change.
 *
 * Purpose: A second listener can refresh the top bar. Ready keeps the callback from `bindCommanderPoolScreen`.
 * When to use: Once, when the top bar is wired.
 * Expected outcome: The listener runs after later reads. It is not called immediately.
 * Exceptions: None.
 */
export function subscribeCommanderPool(listener: () => void): void {
  poolListeners.add(listener);
}

/**
 * Starts or stops the one-second read.
 *
 * Purpose: The screen watches the pool while a consult can change what Ready shows.
 * When to use: After Run changes, and after each read.
 * Expected outcome: An interval while Run is on during planning, a battle, a deferred consult, or an in-flight consult. No interval otherwise.
 * Exceptions: None.
 */
export function syncCommanderPoolPolling(): void {
  if (!shouldPoll()) {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    return;
  }
  if (pollTimer !== null) return;
  pollTimer = setInterval(() => {
    void readCommanderPoolAndApply(true);
  }, POLL_MS);
}

/**
 * Whether the one-second read should be running.
 *
 * Purpose: A consult can finish during planning, inside a battle, or after playback asks for one.
 * When to use: `syncCommanderPoolPolling`.
 * Expected outcome: False when Run is off or the match is over.
 * Exceptions: None.
 */
function shouldPoll(): boolean {
  if (!S.runButtonOn || S.gameState?.gameOver) return false;
  if (S.gameState?.phase === 'planning') return true;
  if (S.tacticalBattleSnapshot != null && S.tacticalPhasePlanning) return true;
  if (anyCommanderIsPlanning()) return true;
  return S.pendingDeferredStrategicPostResolutionConsult || S.pendingDeferredTacticalPostBeatConsult;
}

/**
 * Copies seat costs onto the game state the screen already shows.
 *
 * Purpose: A consult records cost on the seat. The footer reads that sum.
 * When to use: After a consultation push, or after a draining read whose consult just finished.
 * Expected outcome: `S.gameState.seats` matches the database when a snapshot is already showing.
 * Exceptions: A rejected read is logged and does not throw. A reply that arrives after Start does not replace seats.
 */
export async function refreshCommanderSeatCosts(): Promise<void> {
  await refreshSeatCosts();
}

/**
 * Loads seat rows and copies them onto the snapshot already on screen.
 *
 * Purpose: Cost is stored on the seat, and the footer reads the snapshot the player is looking at.
 * When to use: From `refreshCommanderSeatCosts`, and after a draining pool read.
 * Expected outcome: `S.gameState.seats` matches the database for this match.
 * Exceptions: A rejected read is logged. A reply after Start is left unused.
 */
async function refreshSeatCosts(): Promise<void> {
  if (!window.gameApi?.getGameState || !S.gameState) return;
  const matchEpoch = currentRendererMatchEpoch();
  try {
    const next = await fetchMatchSnapshot();
    if (!poolReplyIsCurrent(matchEpoch) || !S.gameState || !next?.seats) return;
    S.gameState.seats = next.seats;
  } catch (err) {
    console.error('commander pool cost refresh failed', err);
  }
}

/**
 * Whether a pool reply still belongs to the match on screen.
 *
 * Purpose: New leaves the current match running under the screen. Start retires it.
 * When to use: After an await in this module.
 * Expected outcome: True for this match, including while it waits under New. False after Start.
 * Exceptions: None.
 */
function poolReplyIsCurrent(matchEpoch: number): boolean {
  return rendererMatchEpochCurrent(matchEpoch) || isMatchWaitingUnderNewGame();
}
