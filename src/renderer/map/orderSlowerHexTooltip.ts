import { HEX_DETAILS_TOOLTIP_DELAY_MS, HEX_DETAILS_TOOLTIP_REST_PX } from '../core/constants';
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
 * Purpose: A second preview for that same cell keeps the wait while the pointer rests. Travel starts another wait.
 * When to use: Set when a wait starts, and when the pointer moves to another cell. Cleared when planning ends or the pointer leaves.
 * Expected outcome: `scheduleOrderEffectsTooltip` keeps the open popup, or the pending wait, when the hover still matches.
 * Exceptions: None.
 */
let effectsDwell: { hex: string | null; detail: string | null } | null = null;

/**
 * Pointer spot where the current effects wait began.
 *
 * Purpose: Travel inside a cell must not finish a wait that began at the edge.
 * When to use: Set when a wait starts. Compared on a later pointer move or preview for that same cell.
 * Expected outcome: Movement farther than the rest threshold starts the one-second wait again.
 * Exceptions: None.
 */
let effectsDwellAnchorX = 0;
let effectsDwellAnchorY = 0;

/**
 * Pending show timer for the effects tooltip.
 *
 * Purpose: The popup waits one second after the pointer rests on a cell whose effect is known.
 * When to use: Only inside this module.
 * Expected outcome: Null when nothing is waiting to appear. Travel before the popup opens clears this timer and starts another.
 * Exceptions: None.
 */
let effectsShowTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Generation of the latest schedule, so a stale timer cannot show an older cell.
 *
 * Purpose: Clearing a timeout is not enough if the callback has already begun.
 * When to use: Bump when a wait is cancelled or replaced. A resting preview for the same cell does not bump it.
 * Expected outcome: A callback whose generation is not current returns without showing.
 * Exceptions: None.
 */
let effectsShowGeneration = 0;

/**
 * Effects HTML the pending timer will show.
 *
 * Purpose: Holds the copy the open wait will show. A resting pointer replaces this copy. Travel starts a new wait with the new copy.
 * When to use: Written when a wait starts or when a later preview keeps the current wait. Read when the timer fires.
 * Expected outcome: The popup shows the latest copy for the cell the pointer rested on.
 * Exceptions: None.
 */
let pendingEffectsHtml: string | null = null;

/**
 * Drops a pending effects show without hiding a popup that is already visible.
 *
 * Purpose: A cell change, a hide, or travel inside the cell must not let the previous timer finish.
 * When to use: From hide, from a null schedule, and when a wait starts again.
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
 * Forgets which cell the effects wait belongs to and hides the popup.
 *
 * Purpose: Leaving the map, or leaving order planning, must not keep the previous cell's wait.
 * When to use: Pointer leave, and a pointer move that is not an armed planning gesture.
 * Expected outcome: The next armed preview starts a full one-second wait. The pointer spot is recorded again when that wait starts.
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
 * Reports whether the pointer has left the spot where this effects wait started.
 *
 * Purpose: A march, ferry, shot, or strike preview keeps refreshing while the pointer travels.
 * When to use: Before keeping a wait that is already running for the same cell.
 * Expected outcome: True when the pointer is farther than the rest threshold from the dwell anchor.
 * Exceptions: None.
 */
function pointerLeftEffectsDwellAnchor(): boolean {
  const dx = S.lastPointerClientX - effectsDwellAnchorX;
  const dy = S.lastPointerClientY - effectsDwellAnchorY;
  return dx * dx + dy * dy > HEX_DETAILS_TOOLTIP_REST_PX * HEX_DETAILS_TOOLTIP_REST_PX;
}

/**
 * Starts a one-second wait for the effects popup at the current pointer spot.
 *
 * Purpose: Strategic and tactical planning previews share one rest before the effects popup opens.
 * When to use: A new cell, or travel inside the cell before the popup is open.
 * Expected outcome: The popup shows one second later if the pointer is still on this cell. A newer wait cancels this one.
 * Exceptions: None.
 */
function armEffectsDwell(hex: string | null, detail: string | null, tooltipHtml: string): void {
  cancelEffectsShowTimer();
  effectsDwell = { hex, detail };
  effectsDwellAnchorX = S.lastPointerClientX;
  effectsDwellAnchorY = S.lastPointerClientY;
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
 * Shows the effects popup one second after the pointer rests on a cell whose order is changed by terrain, weather, or cover.
 *
 * Purpose: March, ferry, ranged, and air-strike aiming in both theaters use this wait. A later preview for that same cell keeps the wait while the pointer rests, or updates the copy if the popup is already open.
 * When to use: `publishHoverRoutePreview` when the hover is a legal armed order and the effects HTML is known. Pass null to hide.
 * Expected outcome: The popup shows one second after the pointer rests, and only if the pointer is still on that cell. Travel before it opens starts the wait again.
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
  if (sameCell && effectsShowTimer !== null && !pointerLeftEffectsDwellAnchor()) {
    pendingEffectsHtml = tooltipHtml;
    return;
  }
  armEffectsDwell(hex, detail, tooltipHtml);
}

/**
 * Starts the effects wait again when the pointer travels before the popup is open.
 *
 * Purpose: Aiming inside one cell refreshes the preview without a cell change, and that refresh may not run on every move.
 * When to use: A planning pointer move that stays on the same world hex and detail cell.
 * Expected outcome: No effect once the popup is open, or when the pointer has only jittered. Otherwise the one-second wait starts again at the current spot.
 * Exceptions: None.
 */
export function restartOrderEffectsDwellIfPointerMoved(): void {
  if (orderSlowerTooltip.isVisible()) return;
  if (effectsShowTimer === null || pendingEffectsHtml === null || effectsDwell === null) return;
  if (!pointerLeftEffectsDwellAnchor()) return;
  armEffectsDwell(effectsDwell.hex, effectsDwell.detail, pendingEffectsHtml);
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
