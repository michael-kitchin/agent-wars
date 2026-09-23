/**
 * Shared deferred single-click selection policy for human units on the main map (strategic + tactical).
 *
 * Purpose: Keeps 250ms debounce, second-click immediate select, and ctrl-toggle behavior identical across modes.
 * When to use: `mainMapInteractions` click handler when a human unit icon is hit-tested successfully.
 * Expected outcome: `S.pendingSelectTimeout` managed consistently; selection side effects delegated via `deps`.
 * Exceptions: None; callers must still wire tactical/strategic hit-testing and stack callouts.
 */

import { rendererSharedState as S } from '../core/state';
import {
  shouldBlockEmbarkedLandUnitSelect,
} from '../core/selection';
import { emitParityDiagnosticsBreadcrumb } from '../core/parityDiagnostics';
import { MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX } from '../../shared/mapPlanningGesture';
import {
  shouldBlockSelectionReplaceDuringHoverPlanning,
  shouldBlockToggleSelectionDuringHoverPlanning,
} from '../rendering/canvasPreviewPolicy';

/**
 * Milliseconds to wait before treating a single click as committed single-select (debounce for double-click planning).
 *
 * Purpose: Preserves legacy UX timing shared by strategic and tactical planning flows.
 * When to use: Only by `scheduleDeferredHumanUnitSingleSelect` in this module.
 * Expected outcome: Matches prior inline `250` ms timeout semantics.
 * Exceptions: None.
 */
export const HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS = 250;

/**
 * Clears any pending deferred single-select timer without applying selection.
 *
 * Purpose: Centralizes timeout teardown for ctrl-click, second-click, and empty-click paths.
 * When to use: Whenever selection policy must reset before applying a new selection action.
 * Expected outcome: `S.pendingSelectTimeout` becomes null.
 * Exceptions: None.
 */
export function clearDeferredHumanUnitSingleSelectTimer(): void {
  if (S.pendingSelectTimeout !== null) {
    emitParityDiagnosticsBreadcrumb('selection.clearDeferredSingleSelectTimer');
    clearTimeout(S.pendingSelectTimeout);
    S.pendingSelectTimeout = null;
  }
}

/**
 * Cancels a stack callout that has been scheduled but has not opened yet.
 *
 * Purpose: A right-click, an Escape, every existing hide path, and a double-click that plans an order must not leave a late popup to appear on its own.
 * When to use: From `hideStackCallout`, from gestures that supersede the popup, and before scheduling a new callout.
 * Expected outcome: `S.pendingStackCalloutTimeout` becomes null and the pending open never runs.
 * Exceptions: None.
 */
export function clearDeferredStackCalloutTimer(): void {
  if (S.pendingStackCalloutTimeout !== null) {
    clearTimeout(S.pendingStackCalloutTimeout);
    S.pendingStackCalloutTimeout = null;
  }
}

/**
 * Cancels a scheduled stack callout when a press lands away from where the callout would open.
 *
 * Purpose: A press somewhere else means the player moved on, so the popup must not appear over whatever
 * they went to. A press on the same spot is the second half of a double-click, which the double-click
 * handler resolves instead: it cancels the popup when it plans an order and leaves it when it has nothing
 * to plan, so double-clicking a stack still shows the same popup a single click would.
 * When to use: From the window-level press listener, before deciding whether to hide an open callout.
 * Expected outcome: No effect when nothing is scheduled or when the press is within the double-click pixel tolerance.
 * Exceptions: None.
 */
export function clearDeferredStackCalloutTimerForPressAway(clientX: number, clientY: number): void {
  if (S.pendingStackCalloutTimeout === null) return;
  const withinAnchor =
    Math.abs(clientX - S.pendingStackCalloutAnchorClientX) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX &&
    Math.abs(clientY - S.pendingStackCalloutAnchorClientY) <= MAP_DOUBLE_CLICK_ANCHOR_TOLERANCE_PX;
  if (withinAnchor) return;
  clearDeferredStackCalloutTimer();
}

/**
 * Opens a stack or lone-enemy callout after the same delay used for human single-select.
 *
 * Purpose: Keeps the popup from covering the cursor before a double-click can reach the map, while keeping single-click behavior recognisable.
 * When to use: From the main-map click handler for a stack or lone-enemy icon hit, only on the click that started a new gesture.
 * Expected outcome: `show` runs once after `HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS`, at the click point it was scheduled for, unless the timer is cleared first.
 * Exceptions: None. `show` owns its own DOM failure handling.
 */
export function scheduleDeferredStackCallout(
  clientX: number,
  clientY: number,
  show: (calloutClientX: number, calloutClientY: number) => void
): void {
  clearDeferredStackCalloutTimer();
  S.pendingStackCalloutAnchorClientX = clientX;
  S.pendingStackCalloutAnchorClientY = clientY;
  S.pendingStackCalloutTimeout = setTimeout(() => {
    S.pendingStackCalloutTimeout = null;
    show(clientX, clientY);
  }, HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS);
}

/**
 * Dependencies invoked by human unit icon selection policy (sidebar + hover refresh parity).
 *
 * Purpose: Avoids importing renderer composition root while still performing the same side effects as before extraction.
 * When to use: Passed from `wireMainMapInteractions` closures into selection policy helpers.
 * Expected outcome: Callers supply the same functions previously invoked inline in the click handler.
 * Exceptions: None.
 */
export type HumanUnitIconSelectionSideEffects = {
  replaceSelection: (unitIds: string[]) => void;
  toggleUnitSelection: (unitId: string) => void;
  refreshHoverRoutePreview: (
    options?: import('../gameplay/tacticalOrders').RefreshHoverRoutePreviewOptions
  ) => Promise<void>;
  updateSidebar: () => void;
  updateRangedSidebar: () => void;
  redraw: () => void;
};

/**
 * Applies human unit icon click selection rules for non-shift clicks (debounced single-select + second-click flush).
 *
 * Purpose: Extracted from `mainMapInteractions` to keep tactical/strategic selection drift-proof.
 * When to use: After confirming `unit.player === 'human'` and icon pixel hit-test success.
 * Expected outcome: Shift path is handled by the caller; non-shift path schedules or flushes deferred selection.
 * Exceptions: None.
 */
export function applyHumanUnitIconClickSelectionPolicy(args: {
  shiftKey: boolean;
  unitId: string;
  /**
   * True when this click is the second press of a double-click, so it must neither replace the
   * selection nor schedule a deferred replace; the pending order is planned for the gesture-start units.
   */
  suppressSelectionRetarget: boolean;
  deps: HumanUnitIconSelectionSideEffects;
}): void {
  if (shouldBlockEmbarkedLandUnitSelect(args.unitId)) {
    return;
  }
  if (args.suppressSelectionRetarget) {
    clearDeferredHumanUnitSingleSelectTimer();
    return;
  }
  if (args.shiftKey) {
    if (shouldBlockToggleSelectionDuringHoverPlanning(args.unitId)) {
      return;
    }
    clearDeferredHumanUnitSingleSelectTimer();
    emitParityDiagnosticsBreadcrumb('selection.shiftToggle', {
      unitId: args.unitId,
    });
    args.deps.toggleUnitSelection(args.unitId);
    void args.deps.refreshHoverRoutePreview();
    return;
  }
  if (S.pendingSelectTimeout !== null) {
    if (shouldBlockSelectionReplaceDuringHoverPlanning([args.unitId])) {
      clearDeferredHumanUnitSingleSelectTimer();
      return;
    }
    clearDeferredHumanUnitSingleSelectTimer();
    emitParityDiagnosticsBreadcrumb('selection.doubleClickFlushToSingleSelect', {
      unitId: args.unitId,
    });
    args.deps.replaceSelection([args.unitId]);
    void args.deps.refreshHoverRoutePreview();
    return;
  }
  const unitIdToSelect = args.unitId;
  if (shouldBlockSelectionReplaceDuringHoverPlanning([unitIdToSelect])) {
    return;
  }
  emitParityDiagnosticsBreadcrumb('selection.deferSingleSelect', {
    unitId: unitIdToSelect,
    delayMs: HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS,
  });
  S.pendingSelectTimeout = setTimeout(() => {
    args.deps.replaceSelection([unitIdToSelect]);
    void args.deps.refreshHoverRoutePreview();
    S.pendingSelectTimeout = null;
    emitParityDiagnosticsBreadcrumb('selection.applyDeferredSingleSelect', {
      unitId: unitIdToSelect,
    });
    args.deps.updateSidebar();
    args.deps.updateRangedSidebar();
    args.deps.redraw();
  }, HUMAN_UNIT_SINGLE_SELECT_DEBOUNCE_MS);
}
