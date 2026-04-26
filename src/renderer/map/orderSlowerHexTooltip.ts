import { ORDER_BLOCK_HEX_TOOLTIP_TTL_MS, TOOLTIP_OFFSET_PX } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { formatSlowerHoverTooltipMessage } from '../../shared/orderPreviewSlowTerrainTooltip';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from './terrainTooltipRes1State';

let slowerHideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Clears the auto-dismiss timer for the “Slower: …” hover tooltip without hiding the element.
 *
 * Purpose: Prevents stacked timers when the transient message changes between pointer moves.
 * When to use: Before scheduling a new TTL or when tearing down hover state globally.
 * Expected outcome: `slowerHideTimer` is null after this returns.
 * Exceptions: None.
 */
function clearSlowerTooltipTimer(): void {
  if (slowerHideTimer !== null) {
    clearTimeout(slowerHideTimer);
    slowerHideTimer = null;
  }
}

/**
 * (Re)starts the auto-dismiss countdown for the visible slower-terrain hover tooltip.
 *
 * Purpose: Pointer moves extend the transient so it stays readable while scrubbing the map.
 * When to use: After each reposition and when first showing `#order-slower-tooltip`.
 * Expected outcome: Single pending timer using the same TTL as `#order-block-tooltip` (`ORDER_BLOCK_HEX_TOOLTIP_TTL_MS`).
 * Exceptions: None.
 */
function scheduleSlowerTooltipTtl(): void {
  clearSlowerTooltipTimer();
  slowerHideTimer = setTimeout(() => {
    slowerHideTimer = null;
    hideOrderSlowerHexTooltip();
  }, ORDER_BLOCK_HEX_TOOLTIP_TTL_MS);
}

/**
 * Hides `#order-slower-tooltip` and clears its dismiss timer.
 *
 * Purpose: Central teardown for pointer-leave, invalid previews, and blocking tooltip takeover.
 * When to use: Whenever march/ranged preview is blocked or the pointer leaves the map surface.
 * Expected outcome: Element has `hidden` and `aria-hidden=true`.
 * Exceptions: None.
 */
export function hideOrderSlowerHexTooltip(): void {
  clearSlowerTooltipTimer();
  const el = document.getElementById('order-slower-tooltip');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Returns whether `#order-slower-tooltip` is currently shown (valid march / ranged terrain throttle hint).
 *
 * Purpose: Lets `#hex-tooltip` defer while the slower hint owns the pointer readout.
 * When to use: `shouldSuppressTerrainTooltip` in `renderer.ts`.
 * Expected outcome: `true` only when the element exists and does not have the `hidden` class.
 * Exceptions: None.
 */
export function isOrderSlowerHexTooltipVisible(): boolean {
  const el = document.getElementById('order-slower-tooltip');
  return !!el && !el.classList.contains('hidden');
}

/**
 * Shows or hides `#order-slower-tooltip` near the last pointer position, suppressing the terrain tooltip while visible.
 *
 * Purpose: Gives immediate “Slower: …” or “Using: Road/Rail” feedback for terrain-throttled valid hovers without waiting for the terrain dwell delay.
 * When to use: After `publishHoverRoutePreview` when no blocking message applies and a slow terrain title is present.
 * Expected outcome: Plain-text tooltip follows `S.lastPointerClientX/Y`; auto-hides after `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS`.
 * Exceptions: Missing DOM nodes no-op without throwing.
 */
export function showOrderSlowerHexTooltip(displayTerrainTitle: string | null): void {
  clearSlowerTooltipTimer();
  if (!displayTerrainTitle) {
    hideOrderSlowerHexTooltip();
    return;
  }
  clearTerrainTooltipTimer();
  hideTerrainTooltipVisual();
  const el = document.getElementById('order-slower-tooltip');
  if (!el) return;
  el.textContent = formatSlowerHoverTooltipMessage(displayTerrainTitle);
  el.style.left = `${S.lastPointerClientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${S.lastPointerClientY + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  scheduleSlowerTooltipTtl();
}

/**
 * Repositions `#order-slower-tooltip` when the pointer moves while the transient is visible.
 *
 * Purpose: Keeps the “follows the mouse” contract for the short-lived slower hint.
 * When to use: `mainMapInteractions` `pointermove` after updating `S.lastPointerClient*`.
 * Expected outcome: No-op when the element is hidden.
 * Exceptions: None.
 */
export function repositionOrderSlowerHexTooltipIfVisible(): void {
  const el = document.getElementById('order-slower-tooltip');
  if (!el || el.classList.contains('hidden')) return;
  el.style.left = `${S.lastPointerClientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${S.lastPointerClientY + TOOLTIP_OFFSET_PX}px`;
  scheduleSlowerTooltipTtl();
}
