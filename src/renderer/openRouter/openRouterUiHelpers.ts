import type { GameApi, GameReadyIpcPayload } from '../../shared/ipcTypes';
import { READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import {
  MAP_TOAST_SECTION_BULLET_INDENT,
  appendMapToastMessageBody,
  appendMapToastSectionHeader,
  type MapToastBodyOptions,
} from './mapToastBody';
import {
  isDeferredResolutionConsultRunning,
  isDeferredResolutionPlaybackConsultPending,
  isWaitingForPrecomputedAiOrders,
} from './aiPlanningState';
import { commanderSeatCostUsd, commanderPoolStatuses, longestPlanningElapsedMs } from './commanderPoolClient';
import { markCommanderLogLine, renderCommanderCards } from './commanderCardsUi';
import { setReadyButtonLabelAiWait, setReadyButtonLabelReady } from './readyButtonLabel';
import { resolveToolInvocationCountsAfterReady } from '../../shared/openRouterToolInvocationCounts';
import { currentConsoleReportTag, recordConsoleReport } from '../chrome/consoleReports';
import { layoutMapChrome } from '../map/mapChromeLayout';
import { isObservingRoster } from '../../shared/observeModeControls';
import { activeAiSeats, shortSideName } from '../../shared/seatRoster';
import { commanderFooterLabel, commanderPlanningSentence, modelNameFromOptionLabel, commanderPlanningStatus } from '../../shared/commanderPlanningStatus';

/**
 * Enables Ready and sets its label from the match and the commander pool.
 *
 * Purpose: The button stays disabled until the player can advance, and the label shows whose consult is running.
 * When to use: After Ready, Run, a consult, or a tactical annihilation dialog changes.
 * Expected outcome: Disables the control while the game is over, while any commander is still planning, while
 * deferred post-resolution / post-beat consultation is outstanding (`isDeferredResolutionPlaybackConsultPending`), or
 * while `readyRequestInFlight` is true. The "AI:" label uses the longest planning seat's elapsed time. Before that
 * seat is planning, a deferred consult that has been notified uses a local clock. During the playback that precedes
 * a deferred consultation, the label stays "Ready". Turning Run off returns the label to "Ready".
 * Exceptions: None. A missing button is skipped.
 */
export function updateReadyButtonState(): void {
  const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
  if (!readyBtn) return;
  const gameOver = S.gameState?.gameOver ?? false;
  const deferredConsult = isDeferredResolutionPlaybackConsultPending();
  const waitingOnAi = isWaitingForPrecomputedAiOrders();
  const tacticalAnnihilationDialogOpen = S.tacticalAnnihilationOutcomeDialog != null;
  readyBtn.disabled =
    gameOver || waitingOnAi || deferredConsult || S.readyRequestInFlight || tacticalAnnihilationDialogOpen;
  const deferredClock = S.runButtonOn && isDeferredResolutionConsultRunning() && !waitingOnAi;

  if (waitingOnAi) {
    clearReadyAiWaitClock();
    setReadyButtonLabelAiWait(readyBtn, longestPlanningElapsedMs(), planningCommanderCount());
  } else if (deferredClock) {
    const now = Date.now();
    if (S.readyBtnAiWaitStartTime === null) {
      S.readyBtnAiWaitStartTime = now;
      S.readyBtnAiWaitIntervalId = setInterval(() => {
        if (S.readyBtnAiWaitStartTime === null) return;
        const btn = document.getElementById('ready-btn') as HTMLButtonElement | null;
        if (btn) setReadyButtonLabelAiWait(btn, Date.now() - S.readyBtnAiWaitStartTime, planningCommanderCount());
      }, 1000);
    }
    setReadyButtonLabelAiWait(readyBtn, now - (S.readyBtnAiWaitStartTime ?? now), planningCommanderCount());
  } else {
    clearReadyAiWaitClock();
    setReadyButtonLabelReady(readyBtn);
  }
  renderOpponentStatus();
}

/**
 * Stops the local clock used before a deferred consult shows up in the pool.
 *
 * Purpose: The pool's elapsed time replaces that clock once a seat is planning.
 * When to use: When the label switches to the pool clock, or back to "Ready".
 * Expected outcome: The interval is cleared and the start time is null.
 * Exceptions: None.
 */
function clearReadyAiWaitClock(): void {
  if (S.readyBtnAiWaitIntervalId !== null) {
    clearInterval(S.readyBtnAiWaitIntervalId);
    S.readyBtnAiWaitIntervalId = null;
  }
  S.readyBtnAiWaitStartTime = null;
}

/**
 * Writes the opponent's planning status: the Commanders tab's sentence and the footer line above Ready.
 *
 * Purpose: Shows whether opponent planning is on, which model plans, and what this match has cost, from any tab.
 * When to use: After Run, the opponent's wait, the selected model, or the match cost changes. `updateReadyButtonState`
 *   and `updateOpenRouterCostLabel` call it.
 * Expected outcome: `#commander-status-text` reads "Opponent planning is on." or "... is off." The footer line's
 *   `data-status` is `off`, `on`, or `planning`, with the matching label, the selected model's name (or "No model"),
 *   and the match cost. The wait is the one Ready's "AI:" timer shows.
 * Exceptions: None; missing elements are skipped.
 */
export function renderOpponentStatus(): void {
  const seats = S.gameState?.seats ?? [];
  const active = seats.length === 0 ? [] : activeAiSeats(seats);
  const statuses = commanderPoolStatuses();
  const ready = active.filter((seat) => statuses.find((row) => row.seatId === seat.seatId)?.status === 'ready').length;
  const status = commanderPlanningStatus(S.runButtonOn, isWaitingForPrecomputedAiOrders());
  const observing = isObservingRoster(seats);
  const sentence = document.getElementById('commander-status-text');
  if (sentence) sentence.textContent = commanderPlanningSentence(S.runButtonOn, active.length || 1);
  document.getElementById('commander-status-line')?.setAttribute('data-status', status);
  const label = document.getElementById('commander-status-label');
  if (label) label.textContent = commanderFooterLabel({ status, ready, active: active.length, observing });
  renderCommanderCards();
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const selectedOption = modelSelect && modelSelect.value ? modelSelect.selectedOptions[0] : undefined;
  const model = document.getElementById('commander-status-model');
  if (model) model.textContent = modelNameFromOptionLabel(selectedOption?.textContent ?? '');
  const cost = document.getElementById('commander-status-cost');
  if (cost) cost.textContent = formatOpenRouterCost(commanderSeatCostUsd());
}

/**
 * Writes each tool group's invocation count onto its toggle.
 *
 * Purpose: The Commanders tab shows how often each tool group ran this consult.
 * When to use: After counts are replaced, and when the toggles are first painted.
 * Expected outcome: Each toggle shows that group's count, or 0 when the group has none. A missing toggle is skipped.
 * Exceptions: None.
 */
export function updateOpenRouterToolCountLabels(): void {
  for (const group of S.openRouterToolGroups) {
    const btn = document.querySelector(`.openrouter-tool-toggle[data-tool-group="${group.id}"]`);
    if (btn) btn.textContent = String(S.toolInvocationCounts[group.id] ?? 0);
  }
}

/**
 * Applies tool-group counts after strategic Ready or tactical commit, with precomputed fallback.
 *
 * Purpose: Ready zeros the UI counters at click time; strategic Ready restores from the IPC result or cached
 * precomputed counts. Tactical commit must use the same rule so prefetch tool usage is not wiped when post-beat
 * consultation omits or defers `toolInvocationCounts`.
 * When to use: After a successful strategic `ready` / melee resolve, or after a successful tactical draft commit.
 * Expected outcome: Replaces `S.toolInvocationCounts` from `fromResult` when present; otherwise restores
 * `cachedPrecomputed` when `allowPrecomputedFallback` is true; always clears `S.precomputedToolInvocationCounts`.
 * Exceptions: None.
 */
export function applyToolInvocationCountsAfterReady(args: {
  fromResult?: Record<string, number>;
  cachedPrecomputed: Record<string, number> | null;
  allowPrecomputedFallback: boolean;
}): void {
  const next = resolveToolInvocationCountsAfterReady(args);
  if (next) {
    S.toolInvocationCounts = next;
    updateOpenRouterToolCountLabels();
  }
  S.precomputedToolInvocationCounts = null;
}

/**
 * Formats a dollar amount for the match cost labels.
 *
 * Purpose: The footer and the cost readout share one currency format.
 * When to use: Any label that shows commander spend.
 * Expected outcome: A USD string with two fraction digits, for example "$0.00".
 * Exceptions: None.
 */
export function formatOpenRouterCost(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Writes the match cost onto the cost readout and the footer status line.
 *
 * Purpose: Both labels stay on the sum of commander spend.
 * When to use: After a consult records a cost, and when the footer is refreshed.
 * Expected outcome: `#openrouter-cost` shows the formatted sum. The footer status line shows the same cost.
 * Exceptions: None. A missing cost element is skipped.
 */
export function updateOpenRouterCostLabel(): void {
  const el = document.getElementById('openrouter-cost');
  if (el) el.textContent = formatOpenRouterCost(commanderSeatCostUsd());
  renderOpponentStatus();
}

/**
 * Adds one timestamped line to the AI activity log and scrolls to it.
 *
 * Purpose: The player reads model calls, retries, and errors in one running list.
 * When to use: For every AI interaction or error line the renderer reports.
 * Expected outcome: A new line with the local time and `line`, styled as an error when `isError` is true. The log
 *   scrolls to that line while it is shown. A missing log is a no-op.
 * Exceptions: None.
 */
export function appendOpenRouterLog(line: string, isError = false, seatId?: string): void {
  const el = document.getElementById('openrouter-log');
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const span = document.createElement('div');
  if (seatId) span.dataset.seatId = seatId;
  span.textContent = `${time} ${activitySeatPrefix(seatId)}${line}`;
  if (isError) span.className = 'chrome-error';
  markCommanderLogLine(span);
  el.appendChild(span);
  scrollOpenRouterLogToEnd();
}

/**
 * The turn tag and short name in front of a consult line.
 *
 * Purpose: The activity log says which commander the line belongs to.
 * When to use: `appendOpenRouterLog` when the line carries a seat.
 * Expected outcome: "T7 E. Turkey " or an empty string when the line has no seat.
 * Exceptions: None.
 */
function activitySeatPrefix(seatId: string | undefined): string {
  if (!seatId) return '';
  const seat = S.gameState?.seats?.find((row) => row.seatId === seatId);
  const name = seat ? shortSideName(seat.homeRegion) : seatId;
  const turn = S.gameState?.turnNumber;
  return `${turn ? `T${turn} ` : ''}${name} `;
}

/**
 * How many commanders are planning right now.
 *
 * Purpose: Ready's wait label counts them.
 * When to use: `updateReadyButtonState`.
 * Expected outcome: The number of pool rows whose status is `planning`.
 * Exceptions: None.
 */
function planningCommanderCount(): number {
  return commanderPoolStatuses().filter((row) => row.status === 'planning').length;
}

/**
 * Scrolls the AI activity log to its newest line.
 *
 * Purpose: A line added while the log is hidden cannot scroll it, so the log is scrolled again when it is shown.
 * When to use: After a line is appended, and each time the console's Commanders tab is shown.
 * Expected outcome: `#openrouter-log` shows its last line. A missing log is a no-op; a hidden log keeps its position.
 * Exceptions: None.
 */
export function scrollOpenRouterLogToEnd(): void {
  const el = document.getElementById('openrouter-log');
  if (el) el.scrollTop = el.scrollHeight;
}

/**
 * Empties the AI activity log so a new match does not keep lines from the previous one.
 *
 * When to use: After a new match replaces the seats, before the cost label refresh.
 * Expected outcome: `#openrouter-log` has no child nodes. A missing node is a no-op.
 * Exceptions: None.
 */
export function clearOpenRouterLog(): void {
  const el = document.getElementById('openrouter-log');
  if (el) el.textContent = '';
}

export { MAP_TOAST_SECTION_BULLET_INDENT, appendMapToastMessageBody, appendMapToastSectionHeader };

/**
 * Options for `showMapToast`.
 *
 * Purpose: One shared shape for the toast's styling and optional unit-flag decoration.
 * When to use: When calling `showMapToast` or declaring a dependency that forwards these options.
 * Expected outcome: Omitted fields keep the default error styling and plain-text bullets.
 * Exceptions: None.
 */
export type MapToastOptions = MapToastBodyOptions & {
  /**
   * Whether the toast uses error styling.
   *
   * Contract: Only an explicit `false` selects the informational style.
   * When to use: Pass `false` for routine turn updates.
   * Expected outcome: The `toast-info` class is toggled accordingly.
   * Exceptions: None.
   */
  readonly isError?: boolean;
  /**
   * How the Reports tab files this toast.
   *
   * Contract: Read only when `isError` is false; error toasts are never filed.
   * When to use: Pass `{ kind: 'turn', tag }` for a turn or beat update, with the tag of the turn or beat it reports
   *   on. Pass a notice with a tag to file a notice under a turn other than the current one.
   * Expected outcome: Omitted, an informational toast is filed as a Notice tagged with the current turn or beat.
   * Exceptions: None.
   */
  readonly report?: { readonly kind: 'turn' | 'notice'; readonly tag: string };
  /**
   * When true, an informational toast is not copied onto the Reports tab.
   *
   * Contract: Read only when `isError` is false.
   * When to use: A notice whose Reports entry was already filed.
   * Expected outcome: The toast still shows. No second entry is filed.
   * Exceptions: None.
   */
  readonly skipReport?: boolean;
};

/**
 * Fills one toast element and shows it.
 *
 * Purpose: The map toast and the strategy toast share the fill and the info class.
 * When to use: `showMapToast` and `showFilledAiStrategyToast`.
 * Expected outcome: The text element is rebuilt by `textContentBuilder`. `toast-info` is on when `isInfo` is true. `hidden` is removed.
 * Exceptions: None.
 */
function showToast(
  el: HTMLElement,
  textEl: HTMLElement,
  textContentBuilder: (target: HTMLElement) => void,
  isInfo: boolean
): void {
  textEl.textContent = '';
  textContentBuilder(textEl);
  el.classList.toggle('toast-info', isInfo);
  el.classList.remove('hidden');
}

/**
 * Shows the map toast with a sectioned, bulleted message, replacing any toast already shown.
 *
 * Purpose: The single entry point for turn updates, validation messages, and other map notices.
 * When to use: Whenever the player needs a transient notice on the map.
 * Expected outcome: The toast shows `message` (see `appendMapToastMessageBody`) and hides after the standard
 *   duration. `options.unitOriginByDisplayName`, `options.seats`, and `options.viewerSeatId` add origin flags,
 *   type icons, and opponent number flags. An informational toast
 *   (`isError: false`) is also filed on the Reports tab, as `options.report` says.
 * Exceptions: None.
 */
export function showMapToast(message: string, options?: MapToastOptions): void {
  if (S.toastHideTimer !== null) {
    clearTimeout(S.toastHideTimer);
    S.toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  const textEl = document.getElementById('map-toast-text');
  if (el && textEl) {
    showToast(
      el,
      textEl,
      (target) => {
        appendMapToastMessageBody(target, message, options);
      },
      options?.isError === false
    );
    if (options?.isError === false && options.skipReport !== true) {
      recordConsoleReport(options.report?.kind ?? 'notice', options.report?.tag ?? currentConsoleReportTag(), textEl);
    }
  }
  S.toastHideTimer = setTimeout(() => {
    S.toastHideTimer = null;
    hideMapToast();
  }, TOAST_DURATION_MS);
}

/**
 * Hides the map toast and cancels its auto-hide timer.
 *
 * Purpose: A new toast and the planning-chrome clear both start from a hidden map toast.
 * When to use: When the timer fires, and from `hidePlanningChromeToasts`.
 * Expected outcome: `#map-toast` has `hidden`. The timer id is null.
 * Exceptions: None. A missing element is skipped.
 */
export function hideMapToast(): void {
  if (S.toastHideTimer !== null) {
    clearTimeout(S.toastHideTimer);
    S.toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Shows the strategy toast from a builder.
 *
 * Purpose: The opponent message dialog uses this timer.
 * When to use: After a dispatch enables a tab.
 * Expected outcome: The toast shows and the timer restarts. The band is measured after the toast is visible, so the tab row can widen it. `fileReport` copies it onto the Reports tab. The dialog passes false.
 * Exceptions: None.
 */
export function showFilledAiStrategyToast(build: (target: HTMLElement) => void, fileReport: boolean): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  const textEl = document.getElementById('ai-strategy-toast-text');
  if (el && textEl) {
    showToast(el, textEl, build, true);
    layoutMapChrome();
    if (fileReport) recordConsoleReport('message', currentConsoleReportTag(), textEl);
  }
  scheduleAiStrategyToastHide();
}

/**
 * Starts the strategy toast's hide timer over.
 *
 * Purpose: A new message and a click on an enabled tab both give the dialog another full interval.
 * When to use: `showFilledAiStrategyToast`, and `restartAiStrategyToastTimer` when the dialog is on screen.
 * Expected outcome: Any pending hide is cancelled. The toast hides after `TOAST_DURATION_MS`.
 * Exceptions: None.
 */
function scheduleAiStrategyToastHide(): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  S.aiStrategyToastHideTimer = setTimeout(() => {
    S.aiStrategyToastHideTimer = null;
    hideAiStrategyToast();
  }, TOAST_DURATION_MS);
}

/**
 * Gives the open message dialog another full interval.
 *
 * Purpose: Switching tabs, including back to the tab that is already selected, should not leave the remaining time.
 * When to use: The click handler on an enabled message tab.
 * Expected outcome: The hide timer restarts. A missing or hidden dialog is left alone. Tabs are not rebuilt and no Reports entry is filed.
 * Exceptions: None.
 */
export function restartAiStrategyToastTimer(): void {
  const el = document.getElementById('ai-strategy-toast');
  if (!(el instanceof HTMLElement) || el.classList.contains('hidden')) return;
  scheduleAiStrategyToastHide();
}

/**
 * Clears the message tabs when the dialog hides.
 *
 * Purpose: The next appearance must start with every tab disabled.
 * When to use: `bindCommanderMessageTabs`, once.
 * Expected outcome: `hideAiStrategyToast` calls this listener after the element is hidden.
 * Exceptions: None.
 */
let onStrategyToastHidden: (() => void) | null = null;

/**
 * Remembers the listener that drops the message tabs.
 *
 * Purpose: The tab module must not be imported from this file.
 * When to use: `bindCommanderMessageTabs`.
 * Expected outcome: The previous listener is replaced.
 * Exceptions: None.
 */
export function setAiStrategyToastHiddenListener(listener: () => void): void {
  onStrategyToastHidden = listener;
}

/**
 * Hides the strategy toast and cancels its auto-hide timer.
 *
 * Purpose: An empty consult and the planning-chrome clear both start from a hidden strategy toast.
 * When to use: When the timer fires, when a consult has nothing to show, and from `hidePlanningChromeToasts`.
 * Expected outcome: `#ai-strategy-toast` has `hidden`. The timer id is null. The message tabs are dropped.
 * Exceptions: None. A missing element is skipped.
 */
export function hideAiStrategyToast(): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  if (el) el.classList.add('hidden');
  onStrategyToastHidden?.();
}

/**
 * Dismisses the map toast and the AI strategy toast together.
 *
 * Purpose: Gives planning entry points one call that clears both chrome toasts without
 * suppressing later `showMapToast` or message-dialog traffic.
 * When to use: At the start of human planning initiations (unit selection change, build
 * popup open, ranged/air targeting arm, tactical zoom-in entry).
 * Expected outcome: Both toast elements are hidden and their auto-hide timers are cleared;
 * subsequent show helpers still display normally.
 * Exceptions: None.
 */
export function hidePlanningChromeToasts(): void {
  hideMapToast();
  hideAiStrategyToast();
}

/**
 * Calls Ready and rejects when the IPC does not settle in time.
 *
 * Purpose: A hung Ready must not leave the button disabled forever.
 * When to use: The Ready click handler.
 * Expected outcome: The Ready result, or a rejection when `ready` is missing or the wait exceeds `READY_REQUEST_TIMEOUT_MS`.
 * Exceptions: Throws `Ready action unavailable.` when the bridge has no `ready`. Rejects with a timeout error when the IPC does not settle.
 */
export async function callReadyWithTimeout(
  payload: GameReadyIpcPayload
): Promise<Awaited<ReturnType<NonNullable<GameApi['ready']>>>> {
  if (!window.gameApi?.ready) {
    throw new Error('Ready action unavailable.');
  }
  return Promise.race([
    window.gameApi.ready(payload as never),
    new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Ready request timed out after ${READY_REQUEST_TIMEOUT_MS}ms`)),
        READY_REQUEST_TIMEOUT_MS
      );
    }),
  ]);
}
