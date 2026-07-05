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
 * Applies human unit icon click selection rules for non-ctrl clicks (debounced single-select + second-click flush).
 *
 * Purpose: Extracted from `mainMapInteractions` to keep tactical/strategic selection drift-proof.
 * When to use: After confirming `unit.player === 'human'` and icon pixel hit-test success.
 * Expected outcome: Ctrl path is handled by the caller; non-ctrl path schedules or flushes deferred selection.
 * Exceptions: None.
 */
export function applyHumanUnitIconClickSelectionPolicy(args: {
  ctrlKey: boolean;
  unitId: string;
  deps: HumanUnitIconSelectionSideEffects;
}): void {
  if (shouldBlockEmbarkedLandUnitSelect(args.unitId)) {
    return;
  }
  if (args.ctrlKey) {
    if (shouldBlockToggleSelectionDuringHoverPlanning(args.unitId)) {
      return;
    }
    clearDeferredHumanUnitSingleSelectTimer();
    emitParityDiagnosticsBreadcrumb('selection.ctrlToggle', {
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
