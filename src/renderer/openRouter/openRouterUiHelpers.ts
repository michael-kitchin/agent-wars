import type { GameApi, GameReadyIpcPayload } from '../../shared/ipcTypes';
import {
  buildAiStrategyToastSections,
  hasAiStrategyToastContent,
  type AiStrategyToastFields,
} from '../../shared/aiStrategyToastContent';
import { READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { createAbsentUnitOriginFlagImage, type LossFlagIdentity } from '../core/unitOriginFlags';
import { splitLossCauseLineForUnitFlags } from '../../shared/lossToastUnitSegments';
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
import { activeAiSeats, shortSideName } from '../../shared/seatRoster';
import { commanderFooterLabel, commanderPlanningSentence, modelNameFromOptionLabel, commanderPlanningStatus } from '../../shared/commanderPlanningStatus';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Defines the `updateReadyButtonState` function shape (export function updateReadyButtonState(): void).

 * Purpose: Supports maintainability by documenting why `updateReadyButtonState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Disables the control while the game is over, while any commander is still planning, while
 * deferred post-resolution / post-beat consultation is outstanding (`isDeferredResolutionPlaybackConsultPending`), or
 * while `readyRequestInFlight` is true. The "AI:" label uses the longest planning seat's elapsed time. Before that
 * seat is planning, a deferred consult that has been notified uses a local clock. During the playback that precedes
 * a deferred consultation, the label stays "Ready". Turning Run off returns the label to "Ready".
 * Exceptions: None.
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
 * Writes the opponent's planning status: the Opponent tab's sentence and the footer line above Ready.
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
  const observing = seats.length > 0 && !seats.some((seat) => seat.kind === HUMAN_SEAT_ID && seat.outTurn === null);
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
 * Defines the `updateOpenRouterToolCountLabels` function shape (export function updateOpenRouterToolCountLabels(): void).

 * Purpose: Supports maintainability by documenting why `updateOpenRouterToolCountLabels` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Defines the `formatOpenRouterCost` function shape (export function formatOpenRouterCost(dollars: number): string).

 * Purpose: Supports maintainability by documenting why `formatOpenRouterCost` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Defines the `updateOpenRouterCostLabel` function shape (export function updateOpenRouterCostLabel(): void).

 * Purpose: Supports maintainability by documenting why `updateOpenRouterCostLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 *   The footer status line shows the same cost.
 * Exceptions: None.
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
 * When to use: After a line is appended, and each time the console's Opponent tab is shown.
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

/** Left margin applied to sub-bullets under a `##` section header in `#map-toast`. */
export const MAP_TOAST_SECTION_BULLET_INDENT = '1.25em';

/**
 * Options for `showMapToast`.
 *
 * Purpose: One shared shape for the toast's styling and optional unit-flag decoration.
 * When to use: When calling `showMapToast` or declaring a dependency that forwards these options.
 * Expected outcome: Omitted fields keep the default error styling and plain-text bullets.
 * Exceptions: None.
 */
export type MapToastOptions = {
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
   * Birth origins keyed by victim display name, for flags in loss bullets.
   *
   * Contract: Optional; when present and non-empty, named victims in loss-cause bullets get their country flag.
   * When to use: For toasts built from a turn loss summary.
   * Expected outcome: Matching names gain a flag; all other text renders exactly as without this map.
   * Exceptions: None.
   */
  readonly unitOriginByDisplayName?: ReadonlyMap<string, LossFlagIdentity>;
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
 * Appends one bullet line, optionally indented and with flags before named loss victims.
 *
 * Purpose: Implements the indented sub-bullet layout under Human/AI/Other headers.
 * When to use: From `appendMapToastMessageBody` for non-header lines.
 * Expected outcome: Block-level row with left margin when `indent` is true. With a non-empty
 *   `unitOriginByDisplayName`, victim names on loss-cause lines are preceded by their flags; otherwise the row
 *   is a single text node.
 * Exceptions: None.
 */
function appendMapToastBulletLine(
  target: HTMLElement,
  line: string,
  indent: boolean,
  unitOriginByDisplayName?: ReadonlyMap<string, LossFlagIdentity>
): void {
  const text = line.startsWith('•') ? line : `• ${line}`;
  const span = document.createElement('span');
  span.style.display = 'block';
  if (indent) {
    span.style.marginLeft = MAP_TOAST_SECTION_BULLET_INDENT;
  }
  if (unitOriginByDisplayName && unitOriginByDisplayName.size > 0) {
    for (const segment of splitLossCauseLineForUnitFlags(text, new Set(unitOriginByDisplayName.keys()))) {
      const flag = segment.unitDisplayName ? unitOriginByDisplayName.get(segment.unitDisplayName) : undefined;
      if (flag && segment.unitDisplayName) span.appendChild(createAbsentUnitOriginFlagImage(flag, segment.unitDisplayName));
      span.appendChild(document.createTextNode(segment.text));
    }
  } else {
    span.textContent = text;
  }
  target.appendChild(span);
}

/**
 * Appends a bold block section title with a trailing colon, matching lower-right map-toast headers.
 *
 * Purpose: Shared title styling for `#map-toast` and `#ai-strategy-toast`.
 * When to use: From `appendMapToastMessageBody` and `showAiStrategyToast`.
 * Expected outcome: A `display:block` `<strong>` whose text ends with `:`.
 * Exceptions: None.
 */
export function appendMapToastSectionHeader(target: HTMLElement, title: string): void {
  const strong = document.createElement('strong');
  strong.style.display = 'block';
  strong.textContent = title.endsWith(':') ? title : `${title}:`;
  target.appendChild(strong);
}

/**
 * Appends consolidated map toast body lines to a DOM parent, rendering `##` lines as bold section headers.
 *
 * Purpose: Supports Human Losses / AI Losses / Updates section layout in `#map-toast`.
 * When to use: From `showMapToast` instead of plain text bulletization.
 * Expected outcome: Section headers render with a trailing colon; a blank line separates each section after the first.
 *   When `unitOriginByDisplayName` is given, named loss victims get flags (see `appendMapToastBulletLine`).
 * Exceptions: None.
 */
export function appendMapToastMessageBody(
  target: HTMLElement,
  message: string,
  unitOriginByDisplayName?: ReadonlyMap<string, LossFlagIdentity>
): void {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  let inSection = false;
  let isFirstSection = true;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      inSection = true;
      if (!isFirstSection) {
        target.appendChild(document.createElement('br'));
      }
      isFirstSection = false;
      appendMapToastSectionHeader(target, line.slice(3));
      continue;
    }
    appendMapToastBulletLine(target, line, inSection, unitOriginByDisplayName);
  }
}

/**
 * Defines the `showToast` function shape (function showToast().

 * Purpose: Supports maintainability by documenting why `showToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 *   duration. `options.unitOriginByDisplayName` adds flags before named loss victims. An informational toast
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
        appendMapToastMessageBody(target, message, options?.unitOriginByDisplayName);
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
 * Defines the `hideMapToast` function shape (export function hideMapToast(): void).

 * Purpose: Supports maintainability by documenting why `hideMapToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Purpose: Ready's one-consult toast and the pool's Messages toast share the timer.
 * When to use: `showAiStrategyToast` and `showCommanderMessagesToast`.
 * Expected outcome: The toast shows. `fileReport` copies it onto the Reports tab as a Message.
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
    if (fileReport) recordConsoleReport('message', currentConsoleReportTag(), textEl);
  }
  S.aiStrategyToastHideTimer = setTimeout(() => {
    S.aiStrategyToastHideTimer = null;
    hideAiStrategyToast();
  }, TOAST_DURATION_MS);
}

/**
 * Shows the AI strategy toast with Message then Strategy sections, or hides it when both are empty.
 *
 * Purpose: Surfaces one consult's message after Ready or a tactical commit.
 * When to use: After Ready, tactical commit, or a deferred consult push. Pool dispatches use `showCommanderMessagesToast`.
 * Expected outcome: Bold section titles; empty sections omitted. A shown toast is filed on the Reports tab as a Message.
 * Exceptions: None.
 */
export function showAiStrategyToast(content: AiStrategyToastFields): void {
  if (!hasAiStrategyToastContent(content)) {
    hideAiStrategyToast();
    return;
  }
  showFilledAiStrategyToast((target) => {
    const sections = buildAiStrategyToastSections(content);
    sections.forEach((section, index) => {
      if (index > 0) target.appendChild(document.createElement('br'));
      appendMapToastSectionHeader(target, section.title);
      const span = document.createElement('span');
      span.style.display = 'block';
      span.textContent = section.body;
      target.appendChild(span);
    });
  }, true);
}

/**
 * Defines the `hideAiStrategyToast` function shape (export function hideAiStrategyToast(): void).

 * Purpose: Supports maintainability by documenting why `hideAiStrategyToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hideAiStrategyToast(): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Dismisses the map toast and the AI strategy toast together.
 *
 * Purpose: Gives planning entry points one call that clears both chrome toasts without
 * suppressing later `showMapToast` / `showAiStrategyToast` traffic.
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
 * Defines the `callReadyWithTimeout` function shape (export async function callReadyWithTimeout().

 * Purpose: Supports maintainability by documenting why `callReadyWithTimeout` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
