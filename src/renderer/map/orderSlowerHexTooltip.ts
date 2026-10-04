import { ORDER_BLOCK_HEX_TOOLTIP_TTL_MS } from '../core/constants';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { createTransientPointerTooltip } from './createTransientPointerTooltip';

const orderSlowerTooltip = createTransientPointerTooltip({
  elementId: 'order-slower-tooltip',
  ttlMs: ORDER_BLOCK_HEX_TOOLTIP_TTL_MS,
});

/**
 * Hides `#order-slower-tooltip` and clears its dismiss timer.
 *
 * Purpose: Central teardown for pointer-leave, invalid previews, and blocking tooltip takeover.
 * When to use: Whenever a march preview is blocked or the pointer leaves the map surface.
 * Expected outcome: Element has `hidden` and `aria-hidden=true`.
 * Exceptions: None.
 */
export function hideOrderSlowerHexTooltip(): void {
  orderSlowerTooltip.hide();
}

/**
 * Returns whether `#order-slower-tooltip` is currently shown (valid tactical march terrain throttle hint).
 *
 * Purpose: Lets `#hex-tooltip` defer while the slower hint owns the pointer readout.
 * When to use: `shouldSuppressTerrainTooltip` in `renderer.ts`.
 * Expected outcome: `true` only when the element exists and does not have the `hidden` class.
 * Exceptions: None.
 */
export function isOrderSlowerHexTooltipVisible(): boolean {
  return orderSlowerTooltip.isVisible();
}

/**
 * Shows or hides `#order-slower-tooltip` near the last pointer position, suppressing the terrain tooltip while visible.
 *
 * Purpose: Gives immediate “Slower: …” or “Using: Road/Rail” feedback for terrain-throttled valid tactical marches without waiting for the terrain dwell delay.
 * When to use: After `publishHoverRoutePreview` when no blocking message applies and a tactical march slowdown is present.
 * Expected outcome: HTML tooltip follows pointer; auto-hides after `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS` (caller supplies escaped game-built markup).
 * Exceptions: Missing DOM nodes no-op without throwing.
 */
export function showOrderSlowerHexTooltip(tooltipHtml: string | null): void {
  if (!tooltipHtml) {
    hideOrderSlowerHexTooltip();
    return;
  }
  orderSlowerTooltip.show((el) => {
    el.innerHTML = tooltipHtml;
    paintTerrainSwatches(el);
  });
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
  orderSlowerTooltip.repositionIfVisible();
}
