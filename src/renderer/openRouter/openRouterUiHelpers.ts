import type { GameApi, GameReadyIpcPayload } from '../../shared/ipcTypes';
import {
  buildAiStrategyToastSections,
  hasAiStrategyToastContent,
  type AiStrategyToastFields,
} from '../../shared/aiStrategyToastContent';
import { READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { createAbsentUnitOriginFlagImage } from '../core/unitOriginFlags';
import { splitLossCauseLineForUnitFlags } from '../../shared/lossToastUnitSegments';
import type { UnitOrigin } from '../../shared/unitOriginTypes';
import {
  isDeferredResolutionConsultRunning,
  isDeferredResolutionPlaybackConsultPending,
  isWaitingForPrecomputedAiOrders,
} from './aiPlanningState';
import { resolveToolInvocationCountsAfterReady } from '../../shared/openRouterToolInvocationCounts';

/**
 * Defines the `formatElapsedMmSs` function shape (export function formatElapsedMmSs(ms: number): string).

 * Purpose: Supports maintainability by documenting why `formatElapsedMmSs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatElapsedMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Defines the `setReadyButtonLabelReady` function shape (export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void).

 * Purpose: Supports maintainability by documenting why `setReadyButtonLabelReady` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void {
  readyBtn.textContent = 'Ready';
}

/**
 * Defines the `setReadyButtonLabelAiWait` function shape (export function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number): void).

 * Purpose: Supports maintainability by documenting why `setReadyButtonLabelAiWait` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number): void {
  readyBtn.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = 'AI: ';
  readyBtn.appendChild(strong);
  readyBtn.appendChild(document.createTextNode(formatElapsedMmSs(elapsedMs)));
}

/**
 * Defines the `updateReadyButtonState` function shape (export function updateReadyButtonState(): void).

 * Purpose: Supports maintainability by documenting why `updateReadyButtonState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Disables the control while the game is over, while precomputed AI orders are still loading, while
 * deferred post-resolution / post-beat consultation is outstanding (`isDeferredResolutionPlaybackConsultPending`), or
 * while `readyRequestInFlight` is true for an in-progress strategic `game:ready` / melee-resolve IPC. Runs the "AI:"
 * elapsed timer while opponent planning is outstanding: prefetch waits, and deferred consultations from their
 * playback-complete notify until their push arrives. During the playback that precedes a deferred consultation, the
 * label stays "Ready". Log lines, including error lines, never affect the timer.
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

  if (waitingOnAi || isDeferredResolutionConsultRunning()) {
    const now = Date.now();
    if (S.readyBtnAiWaitStartTime === null) {
      S.readyBtnAiWaitStartTime = now;
      S.readyBtnAiWaitIntervalId = setInterval(() => {
        if (S.readyBtnAiWaitStartTime === null) return;
        const btn = document.getElementById('ready-btn') as HTMLButtonElement | null;
        if (btn) setReadyButtonLabelAiWait(btn, Date.now() - S.readyBtnAiWaitStartTime);
      }, 1000);
    }
    setReadyButtonLabelAiWait(readyBtn, now - (S.readyBtnAiWaitStartTime ?? now));
  } else {
    if (S.readyBtnAiWaitIntervalId !== null) {
      clearInterval(S.readyBtnAiWaitIntervalId);
      S.readyBtnAiWaitIntervalId = null;
    }
    S.readyBtnAiWaitStartTime = null;
    setReadyButtonLabelReady(readyBtn);
  }
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
 * Exceptions: None.
 */
export function updateOpenRouterCostLabel(): void {
  const el = document.getElementById('openrouter-cost');
  if (el) el.textContent = formatOpenRouterCost(S.openRouterGameCost);
}

/**
 * Defines the `appendOpenRouterLog` function shape (export function appendOpenRouterLog(line: string, isError = false): void).

 * Purpose: Supports maintainability by documenting why `appendOpenRouterLog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function appendOpenRouterLog(line: string, isError = false): void {
  const el = document.getElementById('openrouter-log');
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const span = document.createElement('div');
  span.textContent = `${time} ${line}`;
  if (isError) span.className = 'chrome-error';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

/**
 * Empties the AI activity log so a new match does not keep lines from the previous one.
 *
 * When to use: After a successful new game resets `S.openRouterGameCost`, before the cost label refresh.
 * Expected outcome: `#openrouter-log` has no child nodes. A missing node is a no-op.
 * Exceptions: None.
 */
export function clearOpenRouterLog(): void {
  const el = document.getElementById('openrouter-log');
  if (el) el.textContent = '';
}

/**
 * Defines the `bulletizeToastLines` function shape (export function bulletizeToastLines(message: string): string).

 * Purpose: Supports maintainability by documenting why `bulletizeToastLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function bulletizeToastLines(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return '•';
  let inSection = false;
  return lines
    .map((line) => {
      if (line.startsWith('## ')) {
        inSection = true;
        return line.slice(3);
      }
      const bullet = line.startsWith('•') ? line : `• ${line}`;
      return inSection ? `  ${bullet}` : bullet;
    })
    .join('\n');
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
  readonly unitOriginByDisplayName?: ReadonlyMap<string, UnitOrigin>;
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
  unitOriginByDisplayName?: ReadonlyMap<string, UnitOrigin>
): void {
  const text = line.startsWith('•') ? line : `• ${line}`;
  const span = document.createElement('span');
  span.style.display = 'block';
  if (indent) {
    span.style.marginLeft = MAP_TOAST_SECTION_BULLET_INDENT;
  }
  if (unitOriginByDisplayName && unitOriginByDisplayName.size > 0) {
    for (const segment of splitLossCauseLineForUnitFlags(text, new Set(unitOriginByDisplayName.keys()))) {
      const origin = segment.unitDisplayName ? unitOriginByDisplayName.get(segment.unitDisplayName) : undefined;
      if (origin && segment.unitDisplayName) span.appendChild(createAbsentUnitOriginFlagImage(origin));
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
  unitOriginByDisplayName?: ReadonlyMap<string, UnitOrigin>
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
 * Shows the lower-right map toast with a sectioned, bulleted message, replacing any toast already shown.
 *
 * Purpose: The single entry point for turn updates, validation messages, and other map notices.
 * When to use: Whenever the player needs a transient notice on the map.
 * Expected outcome: The toast shows `message` (see `appendMapToastMessageBody`) and hides after the standard
 *   duration. `options.unitOriginByDisplayName` adds flags before named loss victims.
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
 * Shows the upper-right toast with Message then Strategy sections, or hides it when both are empty.
 *
 * Purpose: Surfaces the opponent's taunt/threat and plan summary after consultation.
 * When to use: After Ready, tactical commit, deferred consult push, or tactical prefetch.
 * Expected outcome: Bold section titles matching the lower-right toast; plain (non-bulleted) body text; empty sections omitted; both empty hides a stale toast.
 * Exceptions: None.
 */
export function showAiStrategyToast(content: AiStrategyToastFields): void {
  if (!hasAiStrategyToastContent(content)) {
    hideAiStrategyToast();
    return;
  }
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  const textEl = document.getElementById('ai-strategy-toast-text');
  if (el && textEl) {
    showToast(
      el,
      textEl,
      (target) => {
        const sections = buildAiStrategyToastSections(content);
        sections.forEach((section, index) => {
          if (index > 0) target.appendChild(document.createElement('br'));
          appendMapToastSectionHeader(target, section.title);
          const span = document.createElement('span');
          span.style.display = 'block';
          span.textContent = section.body;
          target.appendChild(span);
        });
      },
      true
    );
  }
  S.aiStrategyToastHideTimer = setTimeout(() => {
    S.aiStrategyToastHideTimer = null;
    hideAiStrategyToast();
  }, TOAST_DURATION_MS);
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
 * Dismisses the lower-right map toast and upper-right AI strategy toast together.
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
