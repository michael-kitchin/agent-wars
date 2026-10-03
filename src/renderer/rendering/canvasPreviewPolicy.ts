/**
 * Canvas overlay policy for committed march lines vs hover path preview (strategic + tactical).
 *
 * Purpose: Centralizes shift/selection/hover gating so `drawGameScene` and hover preview stay aligned.
 * When to use: From `renderer.ts` and any draw path that must match sidebar selection semantics.
 * Expected outcome: Boolean helpers reflect `rendererSharedState` only; no DOM or canvas side effects.
 * Exceptions: None.
 */

import { rendererSharedState as S } from '../core/state';

/**
 * Whether standing-order / committed paths should be drawn on the overlay canvas.
 *
 * Purpose: Hides committed paths while Shift is held so stack-selection mode stays readable.
 * When to use: Inside `drawGameScene` before `drawStandingOrderLines`.
 * Expected outcome: `false` when Shift is held; otherwise `true`.
 * Exceptions: None.
 */
export function shouldDrawCommittedOrderPaths(): boolean {
  return !S.shiftKeyActive;
}

/**
 * Whether the hovered march preview polyline should be drawn for the current selection.
 *
 * Purpose: Suppresses preview when Shift is held or nothing is selected.
 * When to use: `drawGameScene` and `drawHoverRoutePreview` entry.
 * Expected outcome: `true` only when Shift is up and at least one unit is selected.
 * Exceptions: None.
 */
export function shouldDrawHoveredPathPreview(): boolean {
  return !S.shiftKeyActive && S.selectedUnitIds.length > 0;
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

/**
 * Whether hover order planning is active for the current pointer, selection, and preview payload.
 *
 * Purpose: Gates UI that must not interrupt in-progress march/ferry/ranged/air-strike hover planning.
 * When to use: Selection mutations, tactical entry, and build-queue open handlers while the pointer targets a hex.
 * Expected outcome: `true` when preview lines or invalid markers would draw for the current hover target; false while Shift suppresses preview drawing.
 * Exceptions: None.
 */
export function isHoverOrderPlanningActive(): boolean {
  return (
    shouldDrawHoveredPathPreview() &&
    S.hoverRoutePreview !== null &&
    S.hoveredHexH3 !== null
  );
}

/**
 * Whether hover planning should close or refuse the stack callout.
 *
 * Purpose: Clicking a unit selects it and opens the callout while the pointer is still on that unit's hex, and the selection refresh then publishes a preview of that same hex. Treating that preview as destination planning cancels the callout the click just asked for.
 * When to use: Before `hideStackCallout` or before returning from `showStackCallout` / `refreshStackCalloutIfOpen` on account of hover planning.
 * Expected outcome: `false` when planning is inactive, and when every selected unit already occupies the hovered hex. `true` when planning is aimed at any other hex.
 * Exceptions: None.
 */
export function shouldDismissStackCalloutForHoverPlanning(): boolean {
  if (!isHoverOrderPlanningActive()) return false;
  return !everySelectedUnitOccupiesHoveredHex();
}

/**
 * Whether every selected unit is already on the hex under the pointer.
 *
 * Purpose: Distinguishes a preview of the unit the player just clicked from a preview aimed at a march or attack destination.
 * When to use: Only from `shouldDismissStackCalloutForHoverPlanning`.
 * Expected outcome: `true` only when the hovered hex is set and each selected id occupies it, using battle sub-units during a tactical battle and strategic units otherwise. A missing id or an empty selection returns `false`.
 * Exceptions: None.
 */
function everySelectedUnitOccupiesHoveredHex(): boolean {
  const hovered = S.hoveredHexH3;
  if (!hovered || S.selectedUnitIds.length === 0) return false;
  const tactical = S.tacticalBattleSnapshot;
  if (tactical) {
    return S.selectedUnitIds.every((id) =>
      tactical.subUnits.some((unit) => unit.id === id && unit.h3Index === hovered)
    );
  }
  const units = S.gameState?.units;
  if (!units) return false;
  return S.selectedUnitIds.every((id) => units.some((unit) => unit.id === id && unit.h3Index === hovered));
}

/**
 * Returns whether a proposed `replaceSelection` would add units not already selected during hover planning.
 *
 * Purpose: Allows deselect and subset removal while blocking exclusive swaps and multi-select expansion.
 * When to use: Map, sidebar, and stack callout selection handlers before calling `replaceSelection`.
 * Expected outcome: `false` for `[]` or subset-only proposals; `true` when any new unit id would be added.
 * Exceptions: None.
 */
export function shouldBlockSelectionReplaceDuringHoverPlanning(proposedUnitIds: string[]): boolean {
  if (!isHoverOrderPlanningActive()) return false;
  if (proposedUnitIds.length === 0) return false;
  const current = new Set(S.selectedUnitIds);
  return proposedUnitIds.some((id) => !current.has(id));
}

/**
 * Returns whether toggling a unit into the selection should be blocked during hover planning.
 *
 * Purpose: Blocks Shift-toggle adds while allowing toggle-off deselect of units already in the selection.
 * When to use: Before `toggleUnitSelection` from map or sidebar handlers.
 * Expected outcome: `true` when the unit is not currently selected and hover planning is active.
 * Exceptions: None.
 */
export function shouldBlockToggleSelectionDuringHoverPlanning(unitId: string): boolean {
  if (!isHoverOrderPlanningActive()) return false;
  return !S.selectedUnitIds.includes(unitId);
}
