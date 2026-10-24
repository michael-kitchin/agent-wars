/**
 * View as, the auto-advance checkbox, and the press that follows a finished watch turn.
 *
 * Purpose: A match with no active human seat is watched from the top bar and the console footer.
 * When to use: Once at startup, and again whenever the top bar is redrawn.
 * Expected outcome: View as lists every side. The checkbox starts off, and Watch the rest turns it on.
 *   Ready is pressed only after playback, with no commander still planning. A failed Ready turns it off.
 * Exceptions: A missing control is skipped. A failed snapshot read is logged.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { observeModeControls } from '../../shared/observeModeControls';
import { paletteForOwner } from '../../shared/seatPalette';
import { isSeatId, type SeatId } from '../../shared/seatIds';
import { sortSeatsByOrder } from '../../shared/seatRoster';
import { rendererSharedState as S } from '../core/state';
import { fetchMatchSnapshot } from '../core/matchSnapshotClient';
import { newGameOverlayIsOpen } from './newGameDialogCollapse';
import { isDeferredResolutionPlaybackConsultPending } from '../openRouter/aiPlanningState';
import { anyCommanderIsPlanning, commanderStartIsSettling, subscribeCommanderPool } from '../openRouter/commanderPoolClient';
import { onResolutionPlaybackFinished } from '../openRouter/resolutionPlaybackDeferral';

/**
 * Applies a freshly read snapshot after View as changes.
 *
 * Purpose: The top bar does not own the snapshot pipeline.
 * When to use: `wireObserveMode`.
 * Expected outcome: The map and the readouts show that view.
 * Exceptions: The applier's own failures.
 */
type SnapshotApplier = (state: GameStateSnapshot) => Promise<void>;

let applySnapshot: SnapshotApplier | null = null;
let pressReady: (() => Promise<void>) | null = null;
let wired = false;
let pressing = false;
let viewSeq = 0;

/**
 * True when the watch may press Ready now.
 *
 * Purpose: Playback, a consult, and an open dialog all have to finish first.
 * When to use: `maybeObserveAutoAdvance`.
 * Expected outcome: False unless the checkbox is on, the roster is a watch, and nothing is in the way.
 * Exceptions: None.
 */
function autoAdvanceReady(): boolean {
  if (!S.autoAdvance || pressing || S.readyRequestInFlight) return false;
  if (!observeModeControls(S.gameState?.seats ?? []).observing) return false;
  if (S.gameState?.gameOver || S.gameState?.phase !== 'planning') return false;
  if (S.resolutionMoveAnimation || S.tacticalBattleSnapshot) return false;
  if (isDeferredResolutionPlaybackConsultPending() || anyCommanderIsPlanning() || commanderStartIsSettling()) return false;
  if (newGameOverlayIsOpen()) return false;
  const knockout = document.getElementById('knockout-dialog');
  if (knockout && !knockout.classList.contains('hidden')) return false;
  const annihilation = document.getElementById('tactical-annihilation-overlay');
  if (annihilation && !annihilation.classList.contains('hidden')) return false;
  return true;
}

/**
 * Presses Ready when the watch asked for the next turn and the turn is free.
 *
 * Purpose: The checkbox and Watch the rest share this press.
 * When to use: After playback, after the commander pool changes, and when the checkbox is turned on.
 * Expected outcome: One Ready press. A later failure clears the checkbox.
 * Exceptions: A missing press handler does nothing.
 */
export async function maybeObserveAutoAdvance(): Promise<void> {
  if (!autoAdvanceReady() || !pressReady) return;
  pressing = true;
  try {
    await pressReady();
  } finally {
    pressing = false;
  }
}

/**
 * Turns auto-advance off and writes the reason.
 *
 * Purpose: A failed Ready must not keep pressing.
 * When to use: Ready, submit, and melee-resolve failures while the checkbox is on.
 * Expected outcome: The checkbox clears. The reason is logged and passed to `log`.
 * Exceptions: None.
 */
export function stopObserveAutoAdvance(reason: string, log: (line: string) => void): void {
  if (!S.autoAdvance) return;
  S.autoAdvance = false;
  const box = document.getElementById('observe-auto-advance-input');
  if (box instanceof HTMLInputElement) box.checked = false;
  console.error('observe auto-advance stopped', reason);
  log(`Auto-advance stopped: ${reason}`);
}

/**
 * The view that is still a living seat, or every side.
 *
 * Purpose: A knocked-out seat is not a view.
 * When to use: While painting View as.
 * Expected outcome: `'all'` when the chosen seat is missing or out.
 * Exceptions: None.
 */
function currentViewAs(): 'all' | SeatId {
  if (S.viewAs === 'all') return 'all';
  const seat = (S.gameState?.seats ?? []).find((row) => row.seatId === S.viewAs);
  if (!seat || seat.outTurn != null) return 'all';
  return S.viewAs;
}

/**
 * Reloads the match for the current view.
 *
 * Purpose: Changing View as has to replace fog on the map.
 * When to use: The select's change, and when the chosen seat is knocked out.
 * Expected outcome: A newer request wins. The applier paints the snapshot.
 * Exceptions: Logs a rejected read and leaves the map as it was.
 */
async function refreshObservedSnapshot(): Promise<void> {
  const seq = ++viewSeq;
  try {
    const next = await fetchMatchSnapshot();
    if (seq !== viewSeq || !applySnapshot) return;
    await applySnapshot(next);
  } catch (err) {
    console.error('observe view refresh failed', err);
  }
}

/**
 * Paints View as and the auto-advance checkbox for this roster.
 *
 * Purpose: Both controls exist only while watching, and they follow the roster.
 * When to use: From `renderTopBarStatus`.
 * Expected outcome: Hidden while a human seat is playing. The select lists All sides, then each seat's full name.
 *   A knocked-out seat is disabled. The checkbox matches `S.autoAdvance`.
 * Exceptions: None. Missing elements are skipped.
 */
export function syncObserveChrome(): void {
  const seats = S.gameState?.seats ?? [];
  const observing = observeModeControls(seats).observing;
  const host = document.getElementById('topbar-view-as');
  const select = document.getElementById('topbar-view-as-select');
  const dot = document.getElementById('topbar-view-as-dot');
  if (host) host.hidden = !observing;
  const checkbox = document.getElementById('observe-auto-advance');
  const input = document.getElementById('observe-auto-advance-input');
  if (checkbox) checkbox.hidden = !observing;
  if (input instanceof HTMLInputElement && document.activeElement !== input) input.checked = S.autoAdvance;
  if (!(select instanceof HTMLSelectElement)) return;
  if (!observing) return;
  const view = currentViewAs();
  if (view !== S.viewAs) {
    S.viewAs = view;
    void refreshObservedSnapshot();
  }
  const ordered = sortSeatsByOrder(seats);
  const key = ordered.map((seat) => `${seat.seatId}:${seat.outTurn ?? ''}:${seat.homeRegion}`).join('|');
  if (select.dataset.seats !== key) {
    select.dataset.seats = key;
    const all = document.createElement('option');
    all.value = 'all';
    all.textContent = 'All sides, no fog';
    const options = ordered.map((seat) => {
      const option = document.createElement('option');
      option.value = seat.seatId;
      option.textContent = seat.homeRegion;
      option.disabled = seat.outTurn != null;
      return option;
    });
    select.replaceChildren(all, ...options);
  }
  if (document.activeElement !== select) select.value = S.viewAs;
  if (dot) {
    const palette = S.viewAs === 'all' ? null : paletteForOwner(S.viewAs, seats);
    dot.hidden = palette == null;
    if (palette) dot.style.background = palette.map;
  }
}

/**
 * Wires View as, the checkbox, and the two moments that can press Ready.
 *
 * Purpose: One startup for the watch.
 * When to use: After the page markup exists.
 * Expected outcome: Changing the select reloads fog. Checking the box can press Ready.
 *   Playback finishing and a pool change can press it too. A second call does not bind twice.
 * Exceptions: None.
 */
export function wireObserveMode(deps: {
  applySnapshot: SnapshotApplier;
  pressReady: () => Promise<void>;
}): void {
  applySnapshot = deps.applySnapshot;
  pressReady = deps.pressReady;
  if (wired) return;
  wired = true;
  document.getElementById('topbar-view-as-select')?.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const value = select.value;
    S.viewAs = value !== 'all' && isSeatId(value) ? value : 'all';
    void refreshObservedSnapshot();
  });
  document.getElementById('observe-auto-advance-input')?.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    S.autoAdvance = input.checked;
    if (input.checked) void maybeObserveAutoAdvance();
  });
  subscribeCommanderPool(() => { void maybeObserveAutoAdvance(); });
  onResolutionPlaybackFinished(() => { void maybeObserveAutoAdvance(); });
}
