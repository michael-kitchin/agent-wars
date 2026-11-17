/**
 * Map toast and AI strategy toast chrome.
 *
 * Purpose: Owns the two transient toasts and their hide timers in a module that imports no planning or map code, so the selection and basemap modules can dismiss or show a toast without an import cycle.
 * When to use: Any module that shows or hides the map toast or the strategy toast. `openRouterUiHelpers` re-exports these names for older callers.
 * Expected outcome: The names below behave exactly as they did in `openRouterUiHelpers`.
 * Exceptions: None.
 */

import { TOAST_DURATION_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { appendMapToastMessageBody, type MapToastBodyOptions } from '../openRouter/mapToastBody';
import { currentConsoleReportTag, recordConsoleReport } from './consoleReports';
import { syncChatPanelVisibility } from '../chat/chatPanelVisibility';
import { layoutMapChrome } from '../map/mapChromeLayout';

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
  syncChatPanelVisibility();
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
  syncChatPanelVisibility();
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
