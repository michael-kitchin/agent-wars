import { TOOLTIP_OFFSET_PX } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from './terrainTooltipRes1State';
import { createTransientPointerTooltipTtl } from './transientPointerTooltipTtl';

/**
 * Options for a pointer-follow transient tooltip bound to a fixed DOM element id.
 *
 * Purpose: Configures shared show/hide/reposition/TTL plumbing for Blocked and Slower order hints.
 * When to use: Module-scope factory construction for `#order-block-tooltip` / `#order-slower-tooltip`.
 * Expected outcome: Stable element id + TTL; content applied via `applyContent` on each show.
 * Exceptions: None.
 */
export type TransientPointerTooltipOptions = {
  /**
   * DOM id of the tooltip element (without `#`).
   *
   * Purpose: Locates the element for show/hide/reposition.
   * When to use: Must match the static HTML id.
   * Expected outcome: `document.getElementById` target.
   * Exceptions: Missing nodes no-op without throwing.
   */
  elementId: string;
  /**
   * Auto-dismiss duration in milliseconds.
   *
   * Purpose: Matches prior `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS` semantics.
   * When to use: Pass the shared constant used by both order tooltips.
   * Expected outcome: Timer fires hide after idle.
   * Exceptions: None.
   */
  ttlMs: number;
};

/**
 * Controller for one pointer-follow transient tooltip element.
 *
 * Purpose: Exposes the stable public operations previously duplicated across order tooltip modules.
 * When to use: Hold one instance per element id at module scope.
 * Expected outcome: show/hide/isVisible/repositionIfVisible with shared TTL and terrain-tooltip suppression.
 * Exceptions: None.
 */
export type TransientPointerTooltip = {
  hide: () => void;
  isVisible: () => boolean;
  show: (applyContent: (el: HTMLElement) => void) => void;
  repositionIfVisible: () => void;
};

/**
 * Creates show/hide/reposition helpers for a pointer-follow transient tooltip element.
 *
 * Purpose: Deduplicates DOM/TTL plumbing between Blocked and Slower order hover tooltips.
 * When to use: Module init for each order tooltip kind; keep message-resolution logic in the caller module.
 * Expected outcome: Controllers that suppress terrain tooltips on show and auto-dismiss after `ttlMs`.
 * Exceptions: Missing DOM nodes no-op without throwing.
 */
export function createTransientPointerTooltip(options: TransientPointerTooltipOptions): TransientPointerTooltip {
  const ttl = createTransientPointerTooltipTtl(options.ttlMs);

  /**
   * Hides the tooltip element and clears its dismiss timer.
   *
   * Purpose: Central teardown for pointer-leave and successful preview clears.
   * When to use: Whenever the transient must disappear.
   * Expected outcome: Element has `hidden` and `aria-hidden=true` when present.
   * Exceptions: None.
   */
  function hide(): void {
    ttl.clear();
    const el = document.getElementById(options.elementId);
    if (el) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Returns whether the tooltip element is currently shown.
   *
   * Purpose: Lets terrain / hex label tooltips defer while this hint owns the pointer readout.
   * When to use: Suppression gates such as `shouldSuppressTerrainTooltip`.
   * Expected outcome: `true` only when the element exists and does not have the `hidden` class.
   * Exceptions: None.
   */
  function isVisible(): boolean {
    const el = document.getElementById(options.elementId);
    return !!el && !el.classList.contains('hidden');
  }

  /**
   * Shows the tooltip near the last pointer position after applying caller-supplied content.
   *
   * Purpose: Shared show path that suppresses terrain tooltips and (re)starts TTL.
   * When to use: After the caller decides content is non-null; pass a content writer for HTML/text policy.
   * Expected outcome: Element visible at `S.lastPointerClient*` + offset; terrain tooltip cleared.
   * Exceptions: Missing DOM nodes no-op without throwing.
   */
  function show(applyContent: (el: HTMLElement) => void): void {
    ttl.clear();
    clearTerrainTooltipTimer();
    hideTerrainTooltipVisual();
    const el = document.getElementById(options.elementId);
    if (!el) return;
    applyContent(el);
    el.style.left = `${S.lastPointerClientX + TOOLTIP_OFFSET_PX}px`;
    el.style.top = `${S.lastPointerClientY + TOOLTIP_OFFSET_PX}px`;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    ttl.schedule(() => hide());
  }

  /**
   * Repositions the tooltip when the pointer moves while it is visible.
   *
   * Purpose: Keeps the “follows the mouse” contract for the short-lived hint.
   * When to use: Map `pointermove` after updating `S.lastPointerClient*`.
   * Expected outcome: No-op when hidden; otherwise updates left/top and reschedules TTL.
   * Exceptions: None.
   */
  function repositionIfVisible(): void {
    const el = document.getElementById(options.elementId);
    if (!el || el.classList.contains('hidden')) return;
    el.style.left = `${S.lastPointerClientX + TOOLTIP_OFFSET_PX}px`;
    el.style.top = `${S.lastPointerClientY + TOOLTIP_OFFSET_PX}px`;
    ttl.schedule(() => hide());
  }

  return { hide, isVisible, show, repositionIfVisible };
}
