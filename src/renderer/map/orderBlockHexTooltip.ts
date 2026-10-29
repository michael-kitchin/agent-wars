import { HEX_DETAILS_TOOLTIP_DELAY_MS, HEX_DETAILS_TOOLTIP_REST_PX, ORDER_BLOCK_HEX_TOOLTIP_TTL_MS } from '../core/constants';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';
import { rendererSharedState as S } from '../core/state';
import {
  blockingHoverMessageFromAirStrikeReason,
  blockingHoverMessageFromMarchInvalidReason,
  blockingHoverMessageFromRangedReason,
  blockingHoverMessageHtmlFromPlainMessage,
} from '../../shared/orderPreviewBlockingCopy';
import type { HumanOrderGroupPreviewResult } from '../../shared/ipc/humanOrderPreviewTypes';
import { createTransientPointerTooltip } from './createTransientPointerTooltip';

const orderBlockTooltip = createTransientPointerTooltip({
  elementId: 'order-block-tooltip',
  ttlMs: ORDER_BLOCK_HEX_TOOLTIP_TTL_MS,
});

/**
 * The world hex and detail cell the current blocked-tooltip wait belongs to.
 *
 * Purpose: A second preview for that same cell keeps the wait while the pointer rests. Travel starts another wait.
 * When to use: Set when a wait starts, and when the pointer moves to another cell. Cleared when the preview becomes legal or the pointer leaves.
 * Expected outcome: `showOrderBlockHexTooltip` keeps the open popup, or the pending wait, when the hover still matches.
 * Exceptions: None.
 */
let blockDwell: { hex: string | null; detail: string | null } | null = null;

/**
 * Pointer spot where the current blocked-tooltip wait began.
 *
 * Purpose: Travel inside a cell must not finish a wait that began at the edge.
 * When to use: Set when a wait starts. Compared on a later pointer move or preview for that same cell.
 * Expected outcome: Movement farther than the rest threshold starts the one-second wait again.
 * Exceptions: None.
 */
let blockDwellAnchorX = 0;
let blockDwellAnchorY = 0;

/**
 * Pending show timer for the blocked tooltip.
 *
 * Purpose: The popup waits one second after the pointer rests on a cell whose order is illegal.
 * When to use: Only inside this module.
 * Expected outcome: Null when nothing is waiting to appear. Travel before the popup opens clears this timer and starts another.
 * Exceptions: None.
 */
let blockShowTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Generation of the latest schedule, so a stale timer cannot show an older cell.
 *
 * Purpose: Clearing a timeout is not enough if the callback has already begun.
 * When to use: Bump when a wait is cancelled or replaced. A resting preview for the same cell does not bump it.
 * Expected outcome: A callback whose generation is not current returns without showing.
 * Exceptions: None.
 */
let blockShowGeneration = 0;

/**
 * Blocked message the pending timer will show.
 *
 * Purpose: Holds the copy the open wait will show. A resting pointer replaces this copy. Travel starts a new wait with the new copy.
 * When to use: Written when a wait starts or when a later preview keeps the current wait. Read when the timer fires.
 * Expected outcome: The popup shows the latest copy for the cell the pointer rested on.
 * Exceptions: None.
 */
let pendingBlockMessage: string | null = null;

/**
 * Hides `#order-block-tooltip` and clears its dismiss timer.
 *
 * Purpose: Central teardown for pointer-leave, mode changes, and successful preview clears.
 * When to use: Whenever the hovered order is no longer illegal, or the pointer leaves the map surface.
 * Expected outcome: The element is hidden, the pending show is cancelled, and the next illegal cell starts a full one-second wait.
 * Exceptions: None.
 */
export function hideOrderBlockHexTooltip(): void {
  cancelBlockShowTimer();
  pendingBlockMessage = null;
  blockDwell = null;
  orderBlockTooltip.hide();
}

/**
 * Returns whether `#order-block-tooltip` is currently shown (march / ranged / air invalid-hover hint).
 *
 * Purpose: Lets terrain / hex label tooltips defer while the blocking hint owns the pointer readout.
 * When to use: `shouldSuppressTerrainTooltip` in `renderer.ts` and any other gate that must not stack with `#hex-tooltip`.
 * Expected outcome: `true` only when the element exists and does not have the `hidden` class.
 * Exceptions: None.
 */
export function isOrderBlockHexTooltipVisible(): boolean {
  return orderBlockTooltip.isVisible();
}

/**
 * Resolves `terrain_kind` (or coarse `terrain`) for a hovered strategic or tactical cell from renderer snapshots.
 *
 * Purpose: Supplies `blockingHoverMessageFromMarchInvalidReason` with a stable terrain token for generic “no route” copy.
 * When to use: Only from `resolveOrderBlockHexTooltipMessage` while the map has `S.gameState` or an active tactical battle.
 * Expected outcome: Lowercase pipeline token such as `plains` / `mountain`, or `null` when the hex is unknown to snapshots.
 * Exceptions: None.
 */
function terrainKindForHoveredHex(h3: string | null): string | null {
  if (!h3) return null;
  const tb = S.tacticalBattleSnapshot;
  if (tb?.tacticalChildH3Indexes?.includes(h3)) {
    const kind = tb.tacticalTerrainKindByH3?.[h3] ?? tb.strategicHexTerrainKind ?? tb.strategicHexTerrain;
    return kind ? String(kind).toLowerCase() : null;
  }
  const hx = S.gameState?.hexes.find((h) => h.h3Index === h3);
  if (!hx) return null;
  return (hx.terrainKind ?? hx.terrain ?? null) as string | null;
}

/**
 * Chooses the first representative `invalidReason` from a grouped march preview when any unit shows an invalid marker.
 *
 * Purpose: Grouped envelopes surface one aggregate `invalidReason` or per-row reasons; the hover hint uses the first
 * concrete failure for consistency with path drawing.
 * When to use: March hover only (`renderAsSupportTargeting` unset, ranged/air modes off).
 * Expected outcome: A single string suitable for `blockingHoverMessageFromMarchInvalidReason`, or `null` when none apply.
 * Exceptions: None.
 */
function firstMarchInvalidReasonFromPreview(data: HumanOrderGroupPreviewResult): string | null {
  if (data.invalidReason) return data.invalidReason;
  for (const row of data.previews) {
    const p = row.preview;
    if (!p.valid && p.showInvalidMarker && p.invalidReason) return p.invalidReason;
  }
  return null;
}

/**
 * Computes the transient “Blocked: …” line for the current hover preview, if any.
 *
 * Purpose: Single entry used by `refreshHoverRoutePreview` so tactical and strategic share classification rules.
 * When to use: After `S.hoverRoutePreview` is assigned for march, ranged, or air-strike line preview modes.
 * Expected outcome: `null` when preview is valid, unrelated, or modes do not apply.
 * Exceptions: None.
 */
export function resolveOrderBlockHexTooltipMessage(
  hoveredH3: string | null,
  data: HumanOrderGroupPreviewResult,
  support: { readonly kind: 'ranged' | 'air' | 'missile'; readonly reason: string | null } | null
): string | null {
  if (support?.reason) {
    if (support.kind === 'ranged') return blockingHoverMessageFromRangedReason(support.reason);
    if (support.kind === 'air') return blockingHoverMessageFromAirStrikeReason(support.reason);
    return support.reason;
  }
  if (!hoveredH3 || data.validForAll) return null;
  const marchReason = firstMarchInvalidReasonFromPreview(data);
  if (!marchReason) return null;
  const kind = terrainKindForHoveredHex(hoveredH3);
  return blockingHoverMessageFromMarchInvalidReason(marchReason, kind);
}

/**
 * Drops a pending blocked-tooltip show without hiding a popup that is already visible.
 *
 * Purpose: A cell change, a hide, or travel inside the cell must not let the previous timer finish.
 * When to use: From hide, from a null schedule, and when a wait starts again.
 * Expected outcome: No timer remains, and an in-flight callback sees a new generation.
 * Exceptions: None.
 */
function cancelBlockShowTimer(): void {
  blockShowGeneration += 1;
  if (blockShowTimer !== null) {
    clearTimeout(blockShowTimer);
    blockShowTimer = null;
  }
}

/**
 * Reports whether the pointer has left the spot where this blocked-tooltip wait started.
 *
 * Purpose: An illegal march, shot, or strike preview keeps refreshing while the pointer travels.
 * When to use: Before keeping a wait that is already running for the same cell.
 * Expected outcome: True when the pointer is farther than the rest threshold from the dwell anchor.
 * Exceptions: None.
 */
function pointerLeftBlockDwellAnchor(): boolean {
  const dx = S.lastPointerClientX - blockDwellAnchorX;
  const dy = S.lastPointerClientY - blockDwellAnchorY;
  return dx * dx + dy * dy > HEX_DETAILS_TOOLTIP_REST_PX * HEX_DETAILS_TOOLTIP_REST_PX;
}

/**
 * Starts a one-second wait for the blocked popup at the current pointer spot.
 *
 * Purpose: Strategic and tactical planning previews share one rest before the blocked popup opens.
 * When to use: A new cell, or travel inside the cell before the popup is open.
 * Expected outcome: The popup shows one second later if the pointer is still on this cell. A newer wait cancels this one.
 * Exceptions: None.
 */
function armBlockDwell(hex: string | null, detail: string | null, message: string): void {
  cancelBlockShowTimer();
  blockDwell = { hex, detail };
  blockDwellAnchorX = S.lastPointerClientX;
  blockDwellAnchorY = S.lastPointerClientY;
  pendingBlockMessage = message;
  const generation = blockShowGeneration;
  blockShowTimer = setTimeout(() => {
    if (generation !== blockShowGeneration) return;
    blockShowTimer = null;
    if (S.hoveredHexH3 !== hex || S.hoveredDetailHexH3 !== detail) return;
    const text = pendingBlockMessage;
    if (!text) return;
    orderBlockTooltip.show((el) => {
      el.innerHTML = blockingHoverMessageHtmlFromPlainMessage(text);
      paintTerrainSwatches(el);
    });
  }, HEX_DETAILS_TOOLTIP_DELAY_MS);
}

/**
 * Hides the blocked popup when the pointer moves to another cell.
 *
 * Purpose: The popup for the previous cell must not stay up, and the next illegal preview for the new cell waits one second.
 * When to use: From the map pointer-move handler when order planning is armed and the hit or detail cell changed.
 * Expected outcome: The popup is hidden. The next `showOrderBlockHexTooltip` for this cell waits one second.
 * Exceptions: None.
 */
export function noteOrderBlockTooltipCellChange(hex: string | null, detail: string | null): void {
  hideOrderBlockHexTooltip();
  blockDwell = { hex, detail };
}

/**
 * Shows or hides `#order-block-tooltip` near the last pointer position.
 *
 * Purpose: March, ferry, ranged, and air-strike aiming in both theaters use this wait when the hovered order is illegal. A later preview for that same cell keeps the wait while the pointer rests, or updates the copy if the popup is already open.
 * When to use: End of `refreshHoverRoutePreview` when the hover is an illegal armed order. Pass null to hide.
 * Expected outcome: The popup shows one second after the pointer rests, then hides itself after `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS`. Travel before it opens starts the wait again.
 * Exceptions: Missing DOM nodes no-op without throwing.
 */
export function showOrderBlockHexTooltip(message: string | null): void {
  if (!message) {
    hideOrderBlockHexTooltip();
    return;
  }
  const hex = S.hoveredHexH3;
  const detail = S.hoveredDetailHexH3;
  const sameCell = blockDwell !== null && blockDwell.hex === hex && blockDwell.detail === detail;
  if (sameCell && orderBlockTooltip.isVisible()) {
    pendingBlockMessage = message;
    orderBlockTooltip.show((el) => {
      el.innerHTML = blockingHoverMessageHtmlFromPlainMessage(message);
      paintTerrainSwatches(el);
    });
    return;
  }
  if (sameCell && blockShowTimer !== null && !pointerLeftBlockDwellAnchor()) {
    pendingBlockMessage = message;
    return;
  }
  armBlockDwell(hex, detail, message);
}

/**
 * Starts the blocked-tooltip wait again when the pointer travels before the popup is open.
 *
 * Purpose: Aiming inside one cell refreshes the preview without a cell change, and that refresh may not run on every move.
 * When to use: A planning pointer move that stays on the same world hex and detail cell.
 * Expected outcome: No effect once the popup is open, or when the pointer has only jittered. Otherwise the one-second wait starts again at the current spot.
 * Exceptions: None.
 */
export function restartOrderBlockDwellIfPointerMoved(): void {
  if (orderBlockTooltip.isVisible()) return;
  if (blockShowTimer === null || pendingBlockMessage === null || blockDwell === null) return;
  if (!pointerLeftBlockDwellAnchor()) return;
  armBlockDwell(blockDwell.hex, blockDwell.detail, pendingBlockMessage);
}

/**
 * Repositions `#order-block-tooltip` when the pointer moves while the transient is visible.
 *
 * Purpose: Keeps the “follows the mouse” contract for the short-lived blocking hint.
 * When to use: `mainMapInteractions` `pointermove` after updating `S.lastPointerClient*`.
 * Expected outcome: No-op when the element is hidden.
 * Exceptions: None.
 */
export function repositionOrderBlockHexTooltipIfVisible(): void {
  orderBlockTooltip.repositionIfVisible();
}
