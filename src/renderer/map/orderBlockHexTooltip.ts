import { ORDER_BLOCK_HEX_TOOLTIP_TTL_MS, TOOLTIP_OFFSET_PX } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import {
  blockingHoverMessageFromAirStrikeReason,
  blockingHoverMessageFromMarchInvalidReason,
  blockingHoverMessageFromRangedReason,
  blockingHoverMessageHtmlFromPlainMessage,
} from '../../shared/orderPreviewBlockingCopy';
import type { HumanOrderGroupPreviewResult } from '../../shared/ipc/humanOrderPreviewTypes';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from './terrainTooltipRes1State';

let orderBlockHideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Clears the auto-dismiss timer for the order-blocking hover tooltip without hiding the element.
 *
 * Purpose: Lets `showOrderBlockHexTooltip` replace an existing transient without stacking timers.
 * When to use: Immediately before scheduling a new TTL or when tearing down hover state globally.
 * Expected outcome: `orderBlockHideTimer` is null after this returns.
 * Exceptions: None.
 */
function clearOrderBlockTooltipTimer(): void {
  if (orderBlockHideTimer !== null) {
    clearTimeout(orderBlockHideTimer);
    orderBlockHideTimer = null;
  }
}

/**
 * (Re)starts the auto-dismiss countdown for the visible order-blocking tooltip.
 *
 * Purpose: Pointer moves should extend the transient so it does not vanish mid-drag; idle still clears after `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS`.
 * When to use: After each `repositionOrderBlockHexTooltipIfVisible` and when first showing the element.
 * Expected outcome: A single pending timer; hiding clears it via `clearOrderBlockTooltipTimer`.
 * Exceptions: None.
 */
function scheduleOrderBlockTooltipTtl(): void {
  clearOrderBlockTooltipTimer();
  orderBlockHideTimer = setTimeout(() => {
    orderBlockHideTimer = null;
    hideOrderBlockHexTooltip();
  }, ORDER_BLOCK_HEX_TOOLTIP_TTL_MS);
}

/**
 * Hides `#order-block-tooltip` and clears its dismiss timer.
 *
 * Purpose: Central teardown for pointer-leave, mode changes, and successful preview clears.
 * When to use: Whenever march/ranged preview becomes valid or the pointer leaves the map surface.
 * Expected outcome: Element has `hidden` and `aria-hidden=true`.
 * Exceptions: None.
 */
export function hideOrderBlockHexTooltip(): void {
  clearOrderBlockTooltipTimer();
  const el = document.getElementById('order-block-tooltip');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
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
  const el = document.getElementById('order-block-tooltip');
  return !!el && !el.classList.contains('hidden');
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
  if (tb?.res4ChildH3Indexes?.includes(h3)) {
    const kind = tb.res4TerrainKindByH3?.[h3] ?? tb.strategicHexTerrainKind ?? tb.strategicHexTerrain;
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
  rangedMode: boolean,
  airStrikeMode: boolean,
  rangedValidationReason: string | null,
  airStrikeValidationReason: string | null
): string | null {
  if (rangedMode && !airStrikeMode && rangedValidationReason) {
    return blockingHoverMessageFromRangedReason(rangedValidationReason);
  }
  if (airStrikeMode && airStrikeValidationReason) {
    return blockingHoverMessageFromAirStrikeReason(airStrikeValidationReason);
  }
  if (!hoveredH3 || data.validForAll) return null;
  const marchReason = firstMarchInvalidReasonFromPreview(data);
  if (!marchReason) return null;
  const kind = terrainKindForHoveredHex(hoveredH3);
  return blockingHoverMessageFromMarchInvalidReason(marchReason, kind);
}

/**
 * Shows or hides `#order-block-tooltip` near the last pointer position, suppressing the terrain tooltip while visible.
 *
 * Purpose: Gives immediate “Blocked: …” feedback for invalid march/ranged hovers without waiting for the terrain dwell delay.
 * When to use: End of `refreshHoverRoutePreview` when `resolveOrderBlockHexTooltipMessage` returns non-null, or with `null` to clear.
 * Expected outcome: HTML tooltip (bold `Blocked:` only) follows `S.lastPointerClientX/Y`, auto-hides after `ORDER_BLOCK_HEX_TOOLTIP_TTL_MS`.
 * Exceptions: Missing DOM nodes no-op without throwing.
 */
export function showOrderBlockHexTooltip(message: string | null): void {
  clearOrderBlockTooltipTimer();
  if (!message) {
    hideOrderBlockHexTooltip();
    return;
  }
  clearTerrainTooltipTimer();
  hideTerrainTooltipVisual();
  const el = document.getElementById('order-block-tooltip');
  if (!el) return;
  el.innerHTML = blockingHoverMessageHtmlFromPlainMessage(message);
  el.style.left = `${S.lastPointerClientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${S.lastPointerClientY + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  scheduleOrderBlockTooltipTtl();
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
  const el = document.getElementById('order-block-tooltip');
  if (!el || el.classList.contains('hidden')) return;
  el.style.left = `${S.lastPointerClientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${S.lastPointerClientY + TOOLTIP_OFFSET_PX}px`;
  scheduleOrderBlockTooltipTtl();
}
