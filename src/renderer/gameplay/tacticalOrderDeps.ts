/**
 * Documents the `TacticalOrderDeps` interface as a named contract surface (interface TacticalOrderDeps).
 *
 * Purpose: Bundles renderer callbacks order flows need so `tacticalOrders` and hover-preview refresh stay testable and decoupled from `renderer.ts`.
 * When to use: Parameters for `clearCommittedOrderDraftState`, `refreshHoverRoutePreview`, cancel/update sidebar helpers, and similar tactical UI orchestration.
 * Expected outcome: Implementations supply redraw/sidebar/toast hooks consistent with the main renderer wiring.
 * Exceptions: None.
 */
export interface TacticalOrderDeps {
  /**
   * Specifies the contract for the `clearSelection` member (clearSelection: () => void;).
   *
   * Contract: Describes stable behavior for callers of `clearSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  clearSelection: () => void;
  /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).
   *
   * Contract: Describes stable behavior for callers of `requestRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  requestRedraw: () => void;
  /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).
   *
   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  redraw: () => void;
  /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).
   *
   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  updateSidebar: () => void;
  /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).
   *
   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  updatePendingOrdersSidebar: () => void;
  /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).
   *
   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  updateRangedSidebar: () => void;
  /**
   * Specifies the contract for the `refreshStackCalloutIfOpen` member (refreshStackCalloutIfOpen: () => void;).
   *
   * Contract: Describes stable behavior for callers of `refreshStackCalloutIfOpen` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  refreshStackCalloutIfOpen: () => void;
  /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).
   *
   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  refreshHumanStandingOrders: () => Promise<void>;
  /**
   * Specifies the contract for the `showMapToast` member (showMapToast: (message: string, options?: { isError?: boolean }) => void;).
   *
   * Contract: Describes stable behavior for callers of `showMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  showMapToast: (message: string, options?: { isError?: boolean }) => void;
  /**
   * Specifies the contract for the `createSidebarOrderRow` member (createSidebarOrderRow: (args: { labelText: string; selected: boolean; onToggleSelect: (event: MouseEvent) => void; onCancel: () => void;).
   *
   * Contract: Describes stable behavior for callers of `createSidebarOrderRow` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  createSidebarOrderRow: (args: {
    labelText: string;
    selected: boolean;
    onToggleSelect: (event: MouseEvent) => void;
    onCancel: () => void;
    compactBlueButtons?: boolean;
  }) => HTMLElement;
  /**
   * Specifies the contract for the `formatUnitArrowLabel` member (formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;).
   *
   * Contract: Describes stable behavior for callers of `formatUnitArrowLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
  /**
   * Specifies the contract for the `applySelectionFromSidebarUnitButton` member (applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;).
   *
   * Contract: Describes stable behavior for callers of `applySelectionFromSidebarUnitButton` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
}
