import { HEX_DETAILS_TOOLTIP_DELAY_MS, TOOLTIP_OFFSET_PX } from '../core/constants';

/**
 * Options for attaching the selected-model description tooltip to a `<select>`.

 * Purpose: Keeps wiring small and testable without reaching into OpenRouter control state.
 * When to use: Construct once when the Model tab select is available.
 * Expected outcome: Tooltip shows trimmed descriptions after the hex-details dwell delay.
 * Exceptions: None.
 */
export type ModelDescriptionTooltipOptions = {
  /**
   * The Model-tab `<select>` that owns the hover dwell behavior.

   * Contract: Closed-control target only; native open-list options are not individually tipped.
   * When to use: Pass `#openrouter-model`.
   * Expected outcome: Pointer/keyboard handlers attach to this element.
   * Exceptions: None.
   */
  select: HTMLSelectElement;
  /**
   * Resolves the trimmed description for the currently selected model id.

   * Contract: Return a non-empty string to show; `null`/empty means no tooltip.
   * When to use: Look up the refresh-time model map by `select.value`.
   * Expected outcome: Tooltip content updates when selection or map changes.
   * Exceptions: None.
   */
  getDescriptionForModelId: (modelId: string) => string | null;
};

/**
 * Controller returned by `attachModelDescriptionTooltip`.

 * Purpose: Lets callers clear the tip on model refresh or teardown.
 * When to use: From OpenRouter Model-tab control wiring.
 * Expected outcome: `clear` hides the tip and cancels any pending dwell timer.
 * Exceptions: None.
 */
export type ModelDescriptionTooltipHandler = {
  /**
   * Hides the tooltip and cancels any pending show timer.

   * Purpose: Prevents stale descriptions after refresh, selection clear, or tab changes.
   * When to use: On models refresh start/success/error and when selection becomes empty.
   * Expected outcome: `#model-description-tooltip` is hidden; timers cleared.
   * Exceptions: None.
   */
  clear: () => void;
};

/**
 * Returns the model description tooltip element when present in the DOM.

 * Purpose: Shared lookup for show/hide paths.
 * When to use: Inside this module only.
 * Expected outcome: The element or `null` if markup is missing.
 * Exceptions: None.
 */
function getTooltipEl(): HTMLElement | null {
  return document.getElementById('model-description-tooltip');
}

/**
 * Hides `#model-description-tooltip` and marks it inert for assistive tech.

 * Purpose: Single hide path for leave/blur/suppress/clear.
 * When to use: Whenever the tip must not be visible.
 * Expected outcome: `hidden` class applied; `aria-hidden` true.
 * Exceptions: None.
 */
function hideTooltipVisual(): void {
  const el = getTooltipEl();
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '';
}

/**
 * Shows the tooltip near the pointer with plain-text content.

 * Purpose: Hex-parity chrome for the selected model description.
 * When to use: After the dwell timer fires with a non-empty description.
 * Expected outcome: Element visible at client + offset; `role="tooltip"`.
 * Exceptions: None.
 */
function showTooltipAt(clientX: number, clientY: number, text: string): void {
  const el = getTooltipEl();
  if (!el) return;
  el.textContent = text;
  el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'tooltip');
}

/**
 * True when a keyboard event is likely to open the native select list.

 * Purpose: Suppress the floating tip so it does not cover the open option list.
 * When to use: `keydown` on the model select.
 * Expected outcome: Space, Enter, Alt+ArrowDown, and ArrowUp/Down while focused.
 * Exceptions: None.
 */
function keyOpensNativeList(ev: KeyboardEvent): boolean {
  if (ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter') return true;
  if (ev.key === 'ArrowDown' && ev.altKey) return true;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') return true;
  return false;
}

/**
 * Attaches hex-style delayed description tooltip behavior to the model select.

 * Purpose: Shows the selected model’s OpenRouter description after the same dwell as hex details.
 * When to use: Once during Model-tab control initialization.
 * Expected outcome: Tip appears after the hex-details dwell on the closed select; suppressed while the native list is open.
 * Exceptions: None.
 */
export function attachModelDescriptionTooltip(
  options: ModelDescriptionTooltipOptions
): ModelDescriptionTooltipHandler {
  const { select, getDescriptionForModelId } = options;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let pointerInside = false;
  let suppressedUntilClosed = false;
  let lastClientX = 0;
  let lastClientY = 0;

  /**
   * Cancels any pending dwell timer without hiding a visible tip.

   * Purpose: Shared timer clear for reschedule and suppress paths.
   * When to use: Before starting a new dwell or when leaving/suppressing.
   * Expected outcome: `delayTimer` is null.
   * Exceptions: None.
   */
  function clearDelayTimer(): void {
    if (delayTimer !== null) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
  }

  /**
   * Resolves the current selected model’s trimmed description, if any.

   * Purpose: Single eligibility check for schedule/show paths.
   * When to use: Before scheduling or refreshing tip content.
   * Expected outcome: Non-empty string or `null`.
   * Exceptions: None.
   */
  function resolveDescription(): string | null {
    const id = select.value.trim();
    if (!id) return null;
    const raw = getDescriptionForModelId(id);
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return trimmed || null;
  }

  /**
   * Hides the tip and cancels the dwell timer.

   * Purpose: Public/internal clear used on refresh and suppress.
   * When to use: Leave, blur, open-list suppression, and caller `clear()`.
   * Expected outcome: Tip hidden; timer cleared.
   * Exceptions: None.
   */
  function clear(): void {
    clearDelayTimer();
    hideTooltipVisual();
  }

  /**
   * Schedules showing the tip after the hex-details dwell delay.

   * Purpose: Matches `HEX_DETAILS_TOOLTIP_DELAY_MS` behavior for the closed select.
   * When to use: Pointer enter while hovered and not suppressed.
   * Expected outcome: Tip appears after the hex-details dwell if still eligible; no-op when suppressed/empty.
   * Exceptions: None.
   */
  function scheduleShow(): void {
    clearDelayTimer();
    if (suppressedUntilClosed || !pointerInside) return;
    const text = resolveDescription();
    if (!text) {
      hideTooltipVisual();
      return;
    }
    delayTimer = setTimeout(() => {
      delayTimer = null;
      if (suppressedUntilClosed || !pointerInside) return;
      const next = resolveDescription();
      if (!next) {
        hideTooltipVisual();
        return;
      }
      showTooltipAt(lastClientX, lastClientY, next);
    }, HEX_DETAILS_TOOLTIP_DELAY_MS);
  }

  /**
   * Marks the native list as open and hides any tip immediately.

   * Purpose: Prevents the floating description from covering option rows.
   * When to use: `mousedown` and list-opening `keydown` on the select.
   * Expected outcome: Tip cleared; dwell blocked until a fresh close/hover cycle.
   * Exceptions: None.
   */
  function suppressForOpenList(): void {
    suppressedUntilClosed = true;
    clear();
  }

  select.addEventListener('pointerenter', (ev) => {
    pointerInside = true;
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    if (!suppressedUntilClosed) scheduleShow();
  });

  select.addEventListener('pointerleave', () => {
    pointerInside = false;
    suppressedUntilClosed = false;
    clear();
  });

  select.addEventListener('pointermove', (ev) => {
    lastClientX = ev.clientX;
    lastClientY = ev.clientY;
    const el = getTooltipEl();
    if (el && !el.classList.contains('hidden')) {
      el.style.left = `${lastClientX + TOOLTIP_OFFSET_PX}px`;
      el.style.top = `${lastClientY + TOOLTIP_OFFSET_PX}px`;
    }
  });

  select.addEventListener('mousedown', () => {
    suppressForOpenList();
  });

  select.addEventListener('keydown', (ev) => {
    if (keyOpensNativeList(ev)) suppressForOpenList();
  });

  select.addEventListener('blur', () => {
    suppressedUntilClosed = false;
    pointerInside = false;
    clear();
  });

  select.addEventListener('change', () => {
    // Native list has closed after a selection; require a fresh dwell (leave/re-enter or blur cycle).
    suppressedUntilClosed = true;
    clear();
  });

  return { clear };
}
