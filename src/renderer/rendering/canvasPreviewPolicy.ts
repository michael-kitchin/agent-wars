/**
 * Canvas overlay policy for committed march lines vs hover path preview (strategic + tactical).
 *
 * Purpose: Centralizes ctrl/selection/hover gating so `drawGameScene` and hover preview stay aligned.
 * When to use: From `renderer.ts` and any draw path that must match sidebar selection semantics.
 * Expected outcome: Boolean helpers reflect `rendererSharedState` only; no DOM or canvas side effects.
 * Exceptions: None.
 */

import { rendererSharedState as S } from '../core/state';

/**
 * Whether standing-order / committed paths should be drawn on the overlay canvas.
 *
 * Purpose: Hides committed paths while ctrl is held so stack-selection mode stays readable.
 * When to use: Inside `drawGameScene` before `drawStandingOrderLines`.
 * Expected outcome: `false` when ctrl is held; otherwise `true`.
 * Exceptions: None.
 */
export function shouldDrawCommittedOrderPaths(): boolean {
  return !S.ctrlKeyActive;
}

/**
 * Whether the hovered march preview polyline should be drawn for the current selection.
 *
 * Purpose: Suppresses preview when ctrl is held or nothing is selected.
 * When to use: `drawGameScene` and `drawHoverRoutePreview` entry.
 * Expected outcome: `true` only when ctrl is up and at least one unit is selected.
 * Exceptions: None.
 */
export function shouldDrawHoveredPathPreview(): boolean {
  return !S.ctrlKeyActive && S.selectedUnitIds.length > 0;
}

/**
 * Unit ids whose committed standing-order segments should be hidden while a hover preview is shown.
 *
 * Purpose: Avoid double-drawing the same unit as both committed and preview when replanning selection.
 * When to use: After computing `shouldDrawPathPreview` in `drawGameScene`.
 * Expected outcome: `null` when no preview or no active hover route; otherwise selected unit ids.
 * Exceptions: None.
 */
export function getCommittedOrderUnitsHiddenDuringPreview(
  shouldDrawPathPreview: boolean
): ReadonlySet<string> | null {
  if (!shouldDrawPathPreview || !S.hoverRoutePreview) return null;
  return new Set(S.selectedUnitIds);
}
