import { HEX_DETAILS_TOOLTIP_DELAY_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { createTransientPointerTooltip } from './createTransientPointerTooltip';

const orderSlowerTooltip = createTransientPointerTooltip({
  elementId: 'order-slower-tooltip',
  persistent: true,
});

/**
 * The world hex and detail cell the current effects wait belongs to.
 *
 * Purpose: A second preview for that same cell must not start another one-second wait.
 * When to use: Set when a wait starts, and when the pointer moves to another cell. Cleared when planning ends or the pointer leaves.
 * Expected outcome: `scheduleOrderEffectsTooltip` keeps the open popup, or the pending wait, when the hover still matches.
 * Exceptions: None.
 */
let effectsDwell: { hex: string | null; detail: string | null } | null = null;

/**
 * Pending show timer for the effects tooltip.
 *
 * Purpose: The popup waits one second after the effect for a cell is known, then stays until the cell changes.
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
 * Effects HTML the pending timer will show.
 *
 * Purpose: A newer preview for the same cell must replace the copy without restarting the one-second wait.
 * When to use: Written by `scheduleOrderEffectsTooltip` and read when the timer fires.
 * Expected outcome: The popup shows the latest copy for the cell that started the wait.
 * Exceptions: None.
 */
let pendingEffectsHtml: string | null = null;

/**
 * Drops a pending effects show without hiding a popup that is already visible.
 *
 * Purpose: A cell change or a hide must not let the previous timer finish. A newer preview for the same cell leaves this timer running.
 * When to use: From hide, from a null schedule, and when a wait starts for a cell that does not already have one.
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
 * When to use: Whenever the effects popup must disappear. This leaves the cell anchor in place. A later legal preview on that cell waits one second again.
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
 * Hides the effects popup when the pointer moves to another cell.
 *
 * Purpose: The popup for the previous cell must not stay up, and the next preview for the new cell waits one second.
 * When to use: From the map pointer-move handler when order planning is armed and the hit or detail cell changed.
 * Expected outcome: The popup is hidden. The next `scheduleOrderEffectsTooltip` for this cell waits one second.
 * Exceptions: None.
 */
export function noteOrderEffectsTooltipCellChange(hex: string | null, detail: string | null): void {
  hideOrderSlowerHexTooltip();
  effectsDwell = { hex, detail };
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
 * Purpose: Paints terrain swatches on effects HTML that is ready to show.
 * When to use: From `scheduleOrderEffectsTooltip` when the one-second wait has elapsed, or when the popup is already open for this cell. Pass null to hide.
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
 * Shows the effects popup one second after the effect for this cell is known.
 *
 * Purpose: The popup waits one second after the effect for this cell is known. A later preview for that same cell keeps the wait that is already running, or updates the copy if the popup is already open.
 * When to use: `publishHoverRoutePreview` when the hover is a legal armed order and the effects HTML is known. Pass null to hide.
 * Expected outcome: The popup shows one second later, and only if the pointer is still on the cell that was current when this schedule ran.
 * Exceptions: None.
 */
export function scheduleOrderEffectsTooltip(tooltipHtml: string | null): void {
  if (!tooltipHtml) {
    cancelEffectsShowTimer();
    pendingEffectsHtml = null;
    orderSlowerTooltip.hide();
    return;
  }
  const hex = S.hoveredHexH3;
  const detail = S.hoveredDetailHexH3;
  const sameCell = effectsDwell !== null && effectsDwell.hex === hex && effectsDwell.detail === detail;
  if (sameCell && orderSlowerTooltip.isVisible()) {
    pendingEffectsHtml = tooltipHtml;
    showOrderSlowerHexTooltip(tooltipHtml);
    return;
  }
  if (sameCell && effectsShowTimer !== null) {
    pendingEffectsHtml = tooltipHtml;
    return;
  }
  cancelEffectsShowTimer();
  effectsDwell = { hex, detail };
  pendingEffectsHtml = tooltipHtml;
  const generation = effectsShowGeneration;
  effectsShowTimer = setTimeout(() => {
    if (generation !== effectsShowGeneration) return;
    effectsShowTimer = null;
    if (S.hoveredHexH3 !== hex || S.hoveredDetailHexH3 !== detail) return;
    showOrderSlowerHexTooltip(pendingEffectsHtml);
  }, HEX_DETAILS_TOOLTIP_DELAY_MS);
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
