import { HEX_DETAILS_TOOLTIP_DELAY_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { orderEffectsTooltipRemainingWaitMs } from '../../shared/orderPreviewEffectsTooltip';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { createTransientPointerTooltip } from './createTransientPointerTooltip';

const orderSlowerTooltip = createTransientPointerTooltip({
  elementId: 'order-slower-tooltip',
  persistent: true,
});

/**
 * The cell that started the effects dwell, and when that dwell began.
 *
 * Purpose: A preview that arrives later must finish the same wait instead of starting another one.
 * When to use: Set on a world-hex or detail-cell change while order planning is armed. Cleared when planning ends or the pointer leaves.
 * Expected outcome: `scheduleOrderEffectsTooltip` reads it. A mismatch with the live hover starts a new dwell.
 * Exceptions: None.
 */
let effectsDwell: { hex: string | null; detail: string | null; startedAtMs: number } | null = null;

/**
 * Pending show timer for the effects tooltip.
 *
 * Purpose: The popup waits out the remainder of the hex dwell, then stays until the cell changes.
 * When to use: Only inside this module.
 * Expected outcome: Null when nothing is waiting to appear.
 * Exceptions: None.
 */
let effectsShowTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Generation of the latest schedule, so a stale timer cannot show an older cell.
 *
 * Purpose: Clearing a timeout is not enough if the callback has already begun.
 * When to use: Bump on every schedule, hide, and cell change.
 * Expected outcome: A callback whose generation is not current returns without showing.
 * Exceptions: None.
 */
let effectsShowGeneration = 0;

/**
 * Drops a pending effects show without hiding a popup that is already visible.
 *
 * Purpose: A new cell or a new preview must not let the previous timer finish.
 * When to use: Before scheduling, hiding, or noting a cell change.
 * Expected outcome: No timer remains, and an in-flight callback sees a new generation.
 * Exceptions: None.
 */
function cancelEffectsShowTimer(): void {
  effectsShowGeneration += 1;
  if (effectsShowTimer !== null) {
    clearTimeout(effectsShowTimer);
    effectsShowTimer = null;
  }
}

/**
 * Hides `#order-slower-tooltip` and cancels a show that has not fired yet.
 *
 * Purpose: Central teardown for an illegal preview, an empty effects line, and blocking-tooltip takeover.
 * When to use: Whenever the effects popup must disappear. This leaves the dwell anchor in place so a later legal preview on the same cell can finish the original wait.
 * Expected outcome: Element has `hidden` and `aria-hidden=true`.
 * Exceptions: None.
 */
export function hideOrderSlowerHexTooltip(): void {
  cancelEffectsShowTimer();
  orderSlowerTooltip.hide();
}

/**
 * Forgets the dwell anchor and hides the effects popup.
 *
 * Purpose: Leaving the map, or leaving order planning, must not reuse a stale cell time.
 * When to use: Pointer leave, and a pointer move that is not an armed planning gesture.
 * Expected outcome: The next armed cell change starts a full dwell.
 * Exceptions: None.
 */
export function clearOrderEffectsTooltipDwell(): void {
  effectsDwell = null;
  hideOrderSlowerHexTooltip();
}

/**
 * Hides the effects popup and starts the hex dwell for a newly hovered cell.
 *
 * Purpose: Moving to another world hex, zoomed cell, or battle cell restarts the same wait the hex tooltip uses.
 * When to use: From the map pointer-move handler when order planning is armed and the hit or detail cell changed.
 * Expected outcome: The popup is hidden. `scheduleOrderEffectsTooltip` for this cell waits the remainder of `HEX_DETAILS_TOOLTIP_DELAY_MS`.
 * Exceptions: None.
 */
export function noteOrderEffectsTooltipCellChange(hex: string | null, detail: string | null): void {
  hideOrderSlowerHexTooltip();
  effectsDwell = { hex, detail, startedAtMs: Date.now() };
}

/**
 * Returns whether `#order-slower-tooltip` is currently shown.
 *
 * Purpose: Lets `#hex-tooltip` defer while the effects hint owns the pointer readout.
 * When to use: `shouldSuppressTerrainTooltip` in `renderer.ts`.
 * Expected outcome: `true` only when the element exists and does not have the `hidden` class.
 * Exceptions: None.
 */
export function isOrderSlowerHexTooltipVisible(): boolean {
  return orderSlowerTooltip.isVisible();
}

/**
 * Shows or hides `#order-slower-tooltip` near the last pointer position.
 *
 * Purpose: Paints terrain swatches on effects HTML that has already waited out the dwell.
 * When to use: From `scheduleOrderEffectsTooltip` when the remaining wait is zero. Pass null to hide.
 * Expected outcome: A visible popup stays until the caller hides it. It does not auto-hide.
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
 * Shows the effects popup after the remainder of the hex dwell for the current cell.
 *
 * Purpose: A preview that is already late shows immediately. A preview that arrives during the dwell waits out the rest. Motion inside the cell does not restart the wait.
 * When to use: `publishHoverRoutePreview` when the hover is a legal armed order and the effects HTML is known. Pass null to hide.
 * Expected outcome: The popup shows only if the pointer is still on the cell that was current when this schedule ran.
 * Exceptions: None.
 */
export function scheduleOrderEffectsTooltip(tooltipHtml: string | null): void {
  cancelEffectsShowTimer();
  if (!tooltipHtml) {
    orderSlowerTooltip.hide();
    return;
  }
  const hex = S.hoveredHexH3;
  const detail = S.hoveredDetailHexH3;
  if (!effectsDwell || effectsDwell.hex !== hex || effectsDwell.detail !== detail) {
    effectsDwell = { hex, detail, startedAtMs: Date.now() };
  }
  const wait = orderEffectsTooltipRemainingWaitMs(
    effectsDwell.startedAtMs,
    Date.now(),
    HEX_DETAILS_TOOLTIP_DELAY_MS
  );
  const generation = effectsShowGeneration;
  const showIfCurrent = (): void => {
    if (generation !== effectsShowGeneration) return;
    effectsShowTimer = null;
    if (S.hoveredHexH3 !== hex || S.hoveredDetailHexH3 !== detail) return;
    showOrderSlowerHexTooltip(tooltipHtml);
  };
  if (wait === 0) {
    showIfCurrent();
    return;
  }
  effectsShowTimer = setTimeout(showIfCurrent, wait);
}

/**
 * Repositions `#order-slower-tooltip` when the pointer moves while it is visible.
 *
 * Purpose: Keeps the popup under the pointer without restarting the dwell or hiding it.
 * When to use: `mainMapInteractions` `pointermove` after updating `S.lastPointerClient*`.
 * Expected outcome: No-op when the element is hidden.
 * Exceptions: None.
 */
export function repositionOrderSlowerHexTooltipIfVisible(): void {
  orderSlowerTooltip.repositionIfVisible();
}
