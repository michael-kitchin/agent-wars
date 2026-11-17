/**
 * The top bar's settings button opens Game Options as a modal dialog over the running match.
 *
 * Purpose: The player can see the match's settings at any time and change some of them while planning a turn on the world map.
 * When to use: `wireMatchOptionsDialog` once at start-up. The settings button calls `openMatchOptionsDialog`.
 * Expected outcome: The new-game popover, centered over a backdrop with `data-mode="match"`, filled from the live match. Apply stores the editable options through `setMatchOptions`. Every close puts the new-game controls back as they were.
 * Exceptions: None. A failed read or write is logged with `console.error`, and a failed write shows its reason in the dialog.
 */

import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { blockingDialogIsOpen } from '../chrome/blockingDialogGuards';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { fetchMatchSnapshot } from '../core/matchSnapshotClient';
import { rendererSharedState as S } from '../core/state';
import { replayActive } from '../replay/replayState';
import {
  captureOptionControls,
  fillOptionControlsFromMatch,
  lockOptionControls,
  readMatchOptionsUpdate,
  restoreOptionControls,
  type OptionControlsMemo,
} from './matchOptionsControls';
import { matchOptionsDialogIsOpen, registerMatchOptionsDialogCloser } from './matchOptionsDialogState';
import { newGameOverlayIsOpen } from './newGameDialogCollapse';
import { maybeObserveAutoAdvance } from './observeChrome';

/**
 * What the dialog needs from the renderer's entry wiring.
 *
 * Purpose: The snapshot applier lives in the entry module, which this module must not import.
 * When to use: The argument of `wireMatchOptionsDialog`.
 * Expected outcome: One function.
 * Exceptions: None.
 */
export interface MatchOptionsDialogDeps {
  /**
   * The renderer's snapshot applier.
   *
   * Contract: Applies `state` to the screen with `options`. The dialog passes `LIVE_SNAPSHOT_APPLY_OPTIONS`.
   * When to use: After Apply succeeds, so the top bar and the panels show the new settings.
   * Expected outcome: Resolves once the screen shows `state`.
   * Exceptions: May reject; the dialog logs it and still closes.
   */
  readonly applySnapshot: (state: GameStateSnapshot, options: typeof LIVE_SNAPSHOT_APPLY_OPTIONS) => Promise<void>;
}

/**
 * How Apply puts the re-read live match on screen.
 *
 * Purpose: The same options leaving replay uses, without the replay option, so the screen refreshes as it does after replay.
 * When to use: `applyMatchOptions`.
 * Expected outcome: Standing orders, the sidebar, the selection, and the Ready button refresh, and the map redraws. The new-game screen and the build popup are left alone.
 * Exceptions: None.
 */
const LIVE_SNAPSHOT_APPLY_OPTIONS = {
  refreshStandingOrders: true,
  updateGameStateSidebarUi: true,
  updateSelectionUi: true,
  updateGameOverUi: false,
  updateReadyButton: true,
  refreshBuildPopup: false,
  redraw: true,
} as const;

/** The sentence shown when the settings cannot be changed now. */
const READ_ONLY_NOTE = 'These are the settings in force. They can be changed while you plan a turn on the world map.';

/** The reason shown when Apply fails without one from the main process. */
const SAVE_FAILED_NOTE = 'The settings could not be saved.';

/** Ids of the victory and AI-only selects, whose own listeners rebuild the limit options. */
const LIMIT_DRIVER_IDS: readonly string[] = ['new-game-victory-select', 'new-game-ai-only-battles-select'];

/**
 * The injected entry wiring.
 *
 * Purpose: Apply reaches the snapshot applier through it.
 * When to use: Set once by `wireMatchOptionsDialog`.
 * Expected outcome: Null until wired.
 * Exceptions: None.
 */
let dialogDeps: MatchOptionsDialogDeps | null = null;

/**
 * The new-game controls as they were before the dialog opened.
 *
 * Purpose: Closing puts them back, so match edits never reach a new match.
 * When to use: Set on open, used and cleared on close.
 * Expected outcome: Null while the dialog is closed.
 * Exceptions: None.
 */
let savedControls: OptionControlsMemo | null = null;

/**
 * Whether the open dialog lets the player change settings.
 *
 * Purpose: Apply and the limit re-lock run only in the editable dialog.
 * When to use: Set on open.
 * Expected outcome: False for the read-only dialog.
 * Exceptions: None.
 */
let editable = false;

/**
 * The live match's turn when the dialog opened.
 *
 * Purpose: Turn limits not after this turn stay disabled after the rule changes.
 * When to use: Set on open, read by the limit re-lock.
 * Expected outcome: A turn number.
 * Exceptions: None.
 */
let liveTurn = 0;

/**
 * The renderer match epoch captured when the dialog opened.
 *
 * Purpose: A new match or a loaded save must not receive settings chosen for the old one.
 * When to use: Checked at Apply.
 * Expected outcome: An epoch number.
 * Exceptions: None.
 */
let openEpoch = 0;

/**
 * Counts openings and closings, so a late reply cannot act on a closed or reopened dialog.
 *
 * Purpose: Open and Apply compare it before and after each await.
 * When to use: Open, Apply, and close.
 * Expected outcome: Moves on every open attempt and every close.
 * Exceptions: None.
 */
let openCounter = 0;

/**
 * Whether the last press on the backdrop started there.
 *
 * Purpose: A text selection dragged out of the dialog must not close it.
 * When to use: Set by the backdrop's `pointerdown`, read and cleared by its `click`.
 * Expected outcome: True between a press on the backdrop and the click that follows.
 * Exceptions: None.
 */
let pressStartedOnBackdrop = false;

/**
 * Finds one element of the dialog by id.
 *
 * Purpose: Every function reaches the dialog's parts the same way.
 * When to use: Inside this module.
 * Expected outcome: The element, or null when the markup lacks it.
 * Exceptions: None.
 */
function part(id: string): HTMLElement | null {
  return document.getElementById(id);
}

/**
 * Reports whether the charts dialog is showing.
 *
 * Purpose: The dialog must not open under the charts. Reading the overlay avoids importing the charts module.
 * When to use: `openMatchOptionsDialog`.
 * Expected outcome: True when `#charts-overlay` is present and not hidden.
 * Exceptions: None.
 */
function chartsOverlayShowing(): boolean {
  const overlay = part('charts-overlay');
  return overlay !== null && !overlay.hidden;
}

/**
 * Reports whether another screen keeps the dialog from opening.
 *
 * Purpose: Open checks before and after it reads the match.
 * When to use: `openMatchOptionsDialog`.
 * Expected outcome: True while the dialog is open, the new-game screen shows, another blocking dialog shows, or the charts show.
 * Exceptions: None.
 */
function openIsRefused(): boolean {
  return matchOptionsDialogIsOpen() || newGameOverlayIsOpen() || blockingDialogIsOpen() || chartsOverlayShowing();
}

/**
 * Shows a sentence under the sections, or hides the note.
 *
 * Purpose: The read-only explanation and an Apply failure share one line.
 * When to use: Open and Apply.
 * Expected outcome: The note shows `text`, or is hidden and empty for null.
 * Exceptions: None.
 */
function setNote(text: string | null): void {
  const note = part('match-options-note');
  if (!note) return;
  note.textContent = text ?? '';
  note.hidden = text === null;
}

/**
 * The enabled, visible controls of the popover a key can reach.
 *
 * Purpose: The Tab trap and the first focus use the same list.
 * When to use: `trapTabKey` and `openMatchOptionsDialog`.
 * Expected outcome: Buttons, selects, and inputs in document order.
 * Exceptions: None.
 */
function focusableControls(popover: HTMLElement): HTMLElement[] {
  return Array.from(popover.querySelectorAll<HTMLElement>('button, select, input, [tabindex]')).filter(
    (element) => !(element as HTMLButtonElement).disabled && element.tabIndex >= 0 && element.getClientRects().length > 0
  );
}

/**
 * Keeps Tab inside the dialog.
 *
 * Purpose: From the last control Tab returns to the first, and Shift+Tab from the first goes to the last. Focus outside the dialog comes back in.
 * When to use: The dialog's key handling.
 * Expected outcome: Focus never leaves the dialog while it is open.
 * Exceptions: None.
 */
function trapTabKey(event: KeyboardEvent, popover: HTMLElement): void {
  const focusable = focusableControls(popover);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !popover.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !popover.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Handles one key while the dialog is open.
 *
 * Purpose: Escape closes, Tab stays inside, and no key reaches the map's window handler.
 * When to use: The popover's `keydown` listener, and the window capture listener for keys aimed outside the popover.
 * Expected outcome: The event stops propagating. Escape also closes the dialog and prevents its default.
 * Exceptions: None.
 */
function handleDialogKey(event: KeyboardEvent, popover: HTMLElement): void {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMatchOptionsDialog();
  } else if (event.key === 'Tab') {
    trapTabKey(event, popover);
  }
}

/**
 * Catches keys aimed outside the popover while the dialog is open.
 *
 * Purpose: A click on the dialog's padding moves focus to the page body, and a key from there must not zoom, pan, or open replay or the charts.
 * When to use: Added in the capture phase on open and removed on close.
 * Expected outcome: Such a key is handled as if it came from the dialog. Keys inside the popover are left to its own listener.
 * Exceptions: None.
 */
function onWindowKeydown(event: KeyboardEvent): void {
  const popover = part('new-game-options-popover');
  if (!popover || !matchOptionsDialogIsOpen()) return;
  if (event.target instanceof Node && popover.contains(event.target)) return;
  handleDialogKey(event, popover);
}

/**
 * Opens the dialog over the running match.
 *
 * Purpose: Shows the live match's settings, editable only while the player plans a turn on the world map.
 * When to use: The settings button's click.
 * Expected outcome: Refuses while the dialog is open, the new-game screen shows, another blocking dialog or the charts show, or the match changes while it reads. Otherwise the controls are saved, filled from the live match, and locked; the read-only dialog shows a note, hides Apply, and labels Cancel "Close". The popover is centered over the backdrop, and focus moves to the first enabled control or to Cancel.
 * Exceptions: None. A failed read is logged and nothing opens.
 */
export async function openMatchOptionsDialog(): Promise<void> {
  if (openIsRefused()) return;
  openCounter += 1;
  const counter = openCounter;
  const epoch = currentRendererMatchEpoch();
  let live: GameStateSnapshot;
  try {
    live = await fetchMatchSnapshot();
  } catch (error) {
    console.error('Game Options could not read the live match', error);
    return;
  }
  const popover = part('new-game-options-popover');
  if (!popover || counter !== openCounter || !rendererMatchEpochCurrent(epoch) || openIsRefused() || live.hexes.length === 0) return;
  openEpoch = epoch;
  savedControls = captureOptionControls();
  fillOptionControlsFromMatch(live, S.runButtonOn);
  editable = !replayActive() && live.phase === 'planning' && !S.tacticalBattleSnapshot && !S.readyRequestInFlight && !live.gameOver;
  liveTurn = live.turnNumber;
  lockOptionControls(editable, liveTurn);
  setNote(editable ? null : READ_ONLY_NOTE);
  const apply = part('match-options-apply');
  if (apply instanceof HTMLButtonElement) {
    apply.hidden = !editable;
    apply.disabled = false;
  }
  const cancel = part('match-options-cancel');
  if (cancel) cancel.textContent = editable ? 'Cancel' : 'Close';
  popover.dataset.mode = 'match';
  popover.setAttribute('aria-modal', 'true');
  for (const side of ['left', 'top', 'right', 'bottom']) popover.style.removeProperty(side);
  for (const id of ['match-options-backdrop', 'match-options-footer']) {
    const element = part(id);
    if (element) element.hidden = false;
  }
  popover.hidden = false;
  window.addEventListener('keydown', onWindowKeydown, true);
  const firstControl = focusableControls(popover).find((element) => element.matches('select, input'));
  (firstControl ?? cancel)?.focus();
}

/**
 * Closes the dialog and puts the new-game controls back.
 *
 * Purpose: Cancel, Close, the ×, Escape, the backdrop, a successful Apply, and the new-game screen share one exit.
 * When to use: Those actions. A call while the dialog is not open does nothing.
 * Expected outcome: The saved controls are restored, `data-mode` is removed, the backdrop, footer, note, and popover are hidden, focus returns to the settings button, and auto-advance may press Ready again.
 * Exceptions: None.
 */
export function closeMatchOptionsDialog(): void {
  const popover = part('new-game-options-popover');
  if (!popover || popover.dataset.mode !== 'match') return;
  openCounter += 1;
  window.removeEventListener('keydown', onWindowKeydown, true);
  if (savedControls) restoreOptionControls(savedControls);
  savedControls = null;
  editable = false;
  delete popover.dataset.mode;
  popover.removeAttribute('aria-modal');
  for (const id of ['match-options-backdrop', 'match-options-footer']) {
    const element = part(id);
    if (element) element.hidden = true;
  }
  setNote(null);
  popover.hidden = true;
  part('topbar-settings-btn')?.focus();
  void maybeObserveAutoAdvance();
}

/**
 * Stores the editable settings and closes the dialog.
 *
 * Purpose: The main process checks and stores the choices; the screen then re-reads the live match.
 * When to use: The Apply button.
 * Expected outcome: A match that changed since opening closes the dialog without writing. Success applies a fresh snapshot, then closes. A refusal or a failed call shows the reason, re-enables Apply, and keeps the dialog open.
 * Exceptions: None. A thrown call is logged with `console.error`.
 */
async function applyMatchOptions(): Promise<void> {
  if (!matchOptionsDialogIsOpen() || !editable) return;
  if (!rendererMatchEpochCurrent(openEpoch)) {
    closeMatchOptionsDialog();
    return;
  }
  const apply = part('match-options-apply');
  if (apply instanceof HTMLButtonElement) apply.disabled = true;
  const counter = openCounter;
  const showFailure = (reason: string): void => {
    if (counter !== openCounter) return;
    setNote(reason);
    if (apply instanceof HTMLButtonElement) apply.disabled = false;
  };
  try {
    const api = window.gameApi;
    if (!api?.setMatchOptions) throw new Error('setMatchOptions is unavailable');
    const result = await api.setMatchOptions(readMatchOptionsUpdate());
    if (!result.ok) {
      showFailure(result.reason);
      return;
    }
  } catch (error) {
    console.error('Game Options could not be applied', error);
    showFailure(SAVE_FAILED_NOTE);
    return;
  }
  try {
    const live = await fetchMatchSnapshot();
    if (counter === openCounter && rendererMatchEpochCurrent(openEpoch)) await dialogDeps?.applySnapshot(live, LIVE_SNAPSHOT_APPLY_OPTIONS);
  } catch (error) {
    console.error('Game Options could not show the new settings', error);
  }
  if (counter === openCounter) closeMatchOptionsDialog();
}

/**
 * Wires the settings button, the dialog's buttons, its keys, and the backdrop.
 *
 * Purpose: One setup point, after the page markup exists.
 * When to use: Once from renderer start-up, next to the game menu's wiring.
 * Expected outcome: The closer is registered for the new-game screen. The settings button opens the dialog. Apply, Cancel, the ×, Escape, and a press and release on the backdrop act only in match mode. A victory or AI-only change re-locks the turn limits after those selects' own listeners rebuild them.
 * Exceptions: None. A missing element is skipped.
 */
export function wireMatchOptionsDialog(deps: MatchOptionsDialogDeps): void {
  dialogDeps = deps;
  registerMatchOptionsDialogCloser(closeMatchOptionsDialog);
  part('topbar-settings-btn')?.addEventListener('click', () => {
    void openMatchOptionsDialog();
  });
  part('match-options-apply')?.addEventListener('click', () => {
    void applyMatchOptions();
  });
  part('match-options-cancel')?.addEventListener('click', closeMatchOptionsDialog);
  const popover = part('new-game-options-popover');
  popover?.querySelector('.commander-popover-close')?.addEventListener('click', () => {
    if (matchOptionsDialogIsOpen()) closeMatchOptionsDialog();
  });
  popover?.addEventListener('keydown', (event) => {
    if (matchOptionsDialogIsOpen()) handleDialogKey(event, popover);
  });
  // Bubbles up after the selects' own listeners have rebuilt the limit options.
  popover?.addEventListener('change', (event) => {
    if (!matchOptionsDialogIsOpen() || !editable) return;
    if (event.target instanceof HTMLElement && LIMIT_DRIVER_IDS.includes(event.target.id)) lockOptionControls(true, liveTurn);
  });
  const backdrop = part('match-options-backdrop');
  if (!backdrop) return;
  backdrop.addEventListener('pointerdown', (event) => {
    pressStartedOnBackdrop = event.target === backdrop;
  });
  backdrop.addEventListener('click', (event) => {
    event.stopPropagation();
    const fromBackdrop = pressStartedOnBackdrop;
    pressStartedOnBackdrop = false;
    if (event.target === backdrop && fromBackdrop) closeMatchOptionsDialog();
  });
  for (const type of ['pointerdown', 'mousedown', 'dblclick', 'wheel']) {
    backdrop.addEventListener(type, (event) => event.stopPropagation());
  }
}
