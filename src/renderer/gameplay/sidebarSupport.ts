import type { GameStateSnapshot, HumanStandingOrderSnapshot, RemovedUnitSnapshot } from '../../shared/ipcTypes';
import {
  formatPendingMovementSidebarTargetLabel,
  formatTacticalDraftMarchPendingOrderTargetLabel,
} from '../../shared/pendingMovementSidebarLabels';
import { buildUnitDisplayNameLookup, fallbackDisplayNameFromUnitId, type UnitDisplayIdentity } from '../../shared/unitDisplayNames';
import { formatPendingFerryOrderSidebarLabel } from './orderLabelFormatting';
import { UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';
import { withTacticalHumanDraftPrefetchInvalidation } from '../openRouter/openRouterRuntime';
import { rendererSharedState as S } from '../core/state';
import { shouldBlockEmbarkedLandUnitSelect } from '../core/selection';
import {
  shouldBlockSelectionReplaceDuringHoverPlanning,
  shouldBlockToggleSelectionDuringHoverPlanning,
} from '../rendering/canvasPreviewPolicy';

/**
 * Documents the `SelectionActionDeps` interface as a named contract surface (interface SelectionActionDeps).

 * Purpose: Supports maintainability by documenting why `SelectionActionDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface SelectionActionDeps {
    /**
   * Specifies the contract for the `toggleUnitSelection` member (toggleUnitSelection: (unitId: string) => void;).

   * Contract: Describes stable behavior for callers of `toggleUnitSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
toggleUnitSelection: (unitId: string) => void;
    /**
   * Specifies the contract for the `replaceSelection` member (replaceSelection: (unitIds: string[]) => void;).

   * Contract: Describes stable behavior for callers of `replaceSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
replaceSelection: (unitIds: string[]) => void;
    /**
   * Specifies the contract for the `syncUiAfterSelectionChange` member (syncUiAfterSelectionChange: () => void;).

   * Contract: Describes stable behavior for callers of `syncUiAfterSelectionChange` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
syncUiAfterSelectionChange: () => void;
}

/**
 * Documents the `SyncUiDeps` interface as a named contract surface (interface SyncUiDeps).

 * Purpose: Supports maintainability by documenting why `SyncUiDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface SyncUiDeps {
    /**
   * Specifies the contract for the `refreshHoverRoutePreview` member (refreshHoverRoutePreview: (options?: import('./tacticalOrders').RefreshHoverRoutePreviewOptions) => Promise<void>;).

   * Contract: Selection-driven refreshes omit options so blocking tooltips stay hover-only.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHoverRoutePreview: (
    options?: import('./tacticalOrders').RefreshHoverRoutePreviewOptions
  ) => Promise<void>;
    /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSidebar: () => void;
    /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatePendingOrdersSidebar: () => void;
    /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateRangedSidebar: () => void;
    /**
   * Specifies the contract for the `refreshStackCalloutIfOpen` member (refreshStackCalloutIfOpen: () => void;).

   * Contract: Describes stable behavior for callers of `refreshStackCalloutIfOpen` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshStackCalloutIfOpen: () => void;
    /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).

   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
redraw: () => void;
}

/**
 * Documents the `PendingOrdersDeps` interface as a named contract surface (interface PendingOrdersDeps).

 * Purpose: Supports maintainability by documenting why `PendingOrdersDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface PendingOrdersDeps {
    /**
   * Specifies the contract for the `isPendingMovementOrderForDisplay` member (isPendingMovementOrderForDisplay: (order: HumanStandingOrderSnapshot) => boolean;).

   * Contract: Describes stable behavior for callers of `isPendingMovementOrderForDisplay` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isPendingMovementOrderForDisplay: (order: HumanStandingOrderSnapshot) => boolean;
    /**
   * Specifies the contract for the `formatPendingOrderSidebarLabel` member (formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;).

   * Contract: Describes stable behavior for callers of `formatPendingOrderSidebarLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;
    /**
   * Specifies the contract for the `createSidebarOrderRow` member (createSidebarOrderRow: (args: { labelText: string; selected: boolean; onToggleSelect: (event: MouseEvent) => void; onCancel: () => void;).

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
   * Specifies the contract for the `applySelectionFromSidebarUnitButton` member (applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;).

   * Contract: Describes stable behavior for callers of `applySelectionFromSidebarUnitButton` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
    /**
   * Specifies the contract for the `cancelOrderForUnit` member (cancelOrderForUnit: (unitId: string) => Promise<void>;).

   * Contract: Describes stable behavior for callers of `cancelOrderForUnit` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelOrderForUnit: (unitId: string) => Promise<void>;
    /**
   * Specifies the contract for the `cancelFerryForUnit` member (cancelFerryForUnit: (unitId: string) => void;).

   * Contract: Describes stable behavior for callers of `cancelFerryForUnit` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
cancelFerryForUnit: (unitId: string) => void;
    /**
   * Specifies the contract for the `formatUnitArrowLabel` member (formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;).

   * Contract: Describes stable behavior for callers of `formatUnitArrowLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
    /**
   * Redraws the map after tactical draft rows change from sidebar cancel actions.
   *
   * Contract: Optional hook invoked after mutating `S.tacticalPendingMarches` from tactical pending-order cancel buttons.
   * When to use: Tactical pending sidebar rows only; omit when tests inject a minimal `PendingOrdersDeps` bundle.
   * Expected outcome: Canvas reflects removed draft destinations on the next draw pass.
   * Exceptions: None.
   */
redraw?: () => void;
    /**
   * Re-renders pending order rows after tactical draft cancellation mutates `S.tacticalPendingMarches`.
   *
   * Contract: Optional callback to avoid circular dependencies in test stubs.
   * When to use: Tactical pending row `onCancel` after deleting one draft.
   * Expected outcome: `#pending-orders-list` reflects the new list immediately.
   * Exceptions: None.
   */
updatePendingOrdersSidebar?: () => void;
    /**
   * Refreshes an open stack callout after tactical embark drafts change from the pending-orders sidebar.
   *
   * Contract: Optional hook so embark cancel can rebuild sealift `<select>` rows without a hard dependency on `renderer.ts`.
   * When to use: Tactical `pendingEmbarkOrders` cancel path only.
   * Expected outcome: Stack popup sealift section matches cleared drafts when the callout is visible.
   * Exceptions: None.
   */
refreshStackCalloutIfOpen?: () => void;
}

/**
 * Defines the `estimateHexesLeftForOrder` function shape (export function estimateHexesLeftForOrder(order: HumanStandingOrderSnapshot): number).

 * Purpose: Supports maintainability by documenting why `estimateHexesLeftForOrder` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function estimateHexesLeftForOrder(order: HumanStandingOrderSnapshot): number {
  if (!Array.isArray(order.routeSegments) || order.routeSegments.length === 0) return 0;
  let total = 0;
  for (const segment of order.routeSegments) {
    if (!Array.isArray(segment.hexes) || segment.hexes.length < 2) continue;
    total += Math.max(0, segment.hexes.length - 1);
  }
  return total;
}

/**
 * Defines the `isPendingMovementOrderForDisplay` function shape (export function isPendingMovementOrderForDisplay(order: HumanStandingOrderSnapshot): boolean).

 * Purpose: Supports maintainability by documenting why `isPendingMovementOrderForDisplay` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isPendingMovementOrderForDisplay(order: HumanStandingOrderSnapshot): boolean {
  return estimateHexesLeftForOrder(order) > 0;
}

/**
 * Defines the `applySelectionFromSidebarUnitButton` function shape (export function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent, deps: SelectionActionDeps): void).

 * Purpose: Supports maintainability by documenting why `applySelectionFromSidebarUnitButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent, deps: SelectionActionDeps): void {
  if (shouldBlockEmbarkedLandUnitSelect(unitId)) return;
  const useMultiSelect = event.ctrlKey || S.ctrlKeyActive;
  if (useMultiSelect) {
    if (shouldBlockToggleSelectionDuringHoverPlanning(unitId)) return;
    deps.toggleUnitSelection(unitId);
  } else {
    if (shouldBlockSelectionReplaceDuringHoverPlanning([unitId])) return;
    deps.replaceSelection([unitId]);
  }
  deps.syncUiAfterSelectionChange();
}

/**
 * Defines the `formatUnitArrowLabel` function shape (export function formatUnitArrowLabel(unitId: string, targetLabel: string, formatUnitDisplayName: (unitId: string) => string): string).

 * Purpose: Supports maintainability by documenting why `formatUnitArrowLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatUnitArrowLabel(unitId: string, targetLabel: string, formatUnitDisplayName: (unitId: string) => string): string {
  return `${formatUnitDisplayName(unitId)} → ${targetLabel}`;
}

/**
 * Defines the `formatPendingOrderSidebarLabel` function shape (export function formatPendingOrderSidebarLabel( order: HumanStandingOrderSnapshot, formatUnitArrowLabelFn: (unitId: string, targetLabel: string) => string).

 * Purpose: Supports maintainability by documenting why `formatPendingOrderSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatPendingOrderSidebarLabel(
  order: HumanStandingOrderSnapshot,
  formatUnitArrowLabelFn: (unitId: string, targetLabel: string) => string
): string {
  return formatUnitArrowLabelFn(
    order.unitId,
    formatPendingMovementSidebarTargetLabel(estimateHexesLeftForOrder(order), order.status)
  );
}

/**
 * Defines the `formatKillToastLine` function shape (export function formatKillToastLine().

 * Purpose: Supports maintainability by documenting why `formatKillToastLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatKillToastLine(
  kill: { victimId: string; killerIds: string[] },
  formatDisplayUnitName: (unitId: string) => string
): string {
  const killers = kill.killerIds.map((unitId) => formatDisplayUnitName(unitId)).join(', ');
  return `${killers} destroyed ${formatDisplayUnitName(kill.victimId)}`;
}

/**
 * Merges tactical sub-unit display names from before commit, after commit, and casualty rows for kill toast resolution.
 *
 * Purpose: After tactical commit the live battle snapshot drops removed sub-units, but kill edges still reference those ids;
 * combining snapshots preserves the same Roman labels the player saw in the tactical UI, mirroring strategic roster names.
 * When to use: Only when calling `buildKillToastFormatterBundle` for post-commit tactical Ready toasts.
 * Expected outcome: Stable `{ id, displayName }` rows for every sub-unit id involved in formatting; removed-unit `displayName`
 * overrides earlier rows when the engine attached an explicit casualty label.
 * Exceptions: None.
 */
export function buildTacticalSubUnitKillLabelOverlay(args: {
  subUnitsBeforeCommit?: readonly { id: string; displayName: string }[];
  subUnitsAfterCommit?: readonly { id: string; displayName: string }[];
  removedUnits?: readonly RemovedUnitSnapshot[];
}): { id: string; displayName: string }[] {
  const byId = new Map<string, string>();
  for (const row of args.subUnitsBeforeCommit ?? []) {
    byId.set(row.id, row.displayName);
  }
  for (const row of args.subUnitsAfterCommit ?? []) {
    byId.set(row.id, row.displayName);
  }
  for (const u of args.removedUnits ?? []) {
    if (u.displayName) byId.set(u.id, u.displayName);
  }
  return [...byId.entries()].map(([id, displayName]) => ({ id, displayName }));
}

/**
 * Defines the `buildKillToastFormatterBundle` function shape (export function buildKillToastFormatterBundle( state: GameStateSnapshot, removedUnits: RemovedUnitSnapshot[] | undefined, tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[] ): { formatUnitName: (unitId: st).

 * Purpose: Supports maintainability by documenting why `buildKillToastFormatterBundle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildKillToastFormatterBundle(
  state: GameStateSnapshot,
  removedUnits: RemovedUnitSnapshot[] | undefined,
  tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[],
  killLabelUnits?: readonly UnitDisplayIdentity[]
): { formatUnitName: (unitId: string) => string; formatKillLine: (kill: { victimId: string; killerIds: string[] }) => string } {
  const removedUnitsForDisplay = removedUnits ?? [];
  const rosterFromRemoved = removedUnitsForDisplay
    .filter((u) => !u.displayName)
    .map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      displayOrder: u.displayOrder,
    }));
  const rosterById = new Map<string, UnitDisplayIdentity>();
  for (const unit of state.units ?? []) {
    rosterById.set(unit.id, {
      id: unit.id,
      unitType: unit.unitType,
      displayOrder: unit.displayOrder,
    });
  }
  for (const unit of rosterFromRemoved) {
    if (rosterById.has(unit.id)) continue;
    rosterById.set(unit.id, {
      id: unit.id,
      unitType: unit.unitType,
      displayOrder: unit.displayOrder,
    });
  }
  for (const unit of killLabelUnits ?? []) {
    if (rosterById.has(unit.id)) continue;
    rosterById.set(unit.id, unit);
  }
  const rosterForDisplay = [...rosterById.values()];
  const displayNameById = buildUnitDisplayNameLookup(rosterForDisplay);
  for (const u of removedUnitsForDisplay) {
    if (u.displayName) displayNameById.set(u.id, u.displayName);
  }
  for (const row of tacticalSubUnitsForKillLabels ?? []) {
    displayNameById.set(row.id, row.displayName);
  }
  const formatDisplayUnitName = (unitId: string) =>
    displayNameById.get(unitId) ?? S.unitDisplayNameById.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId);
  const formatKillLine = (kill: { victimId: string; killerIds: string[] }): string =>
    formatKillToastLine(kill, formatDisplayUnitName);
  return { formatUnitName: formatDisplayUnitName, formatKillLine };
}

/**
 * Defines the `syncUiAfterSelectionChange` function shape (export function syncUiAfterSelectionChange(deps: SyncUiDeps, options:).

 * Purpose: Supports maintainability by documenting why `syncUiAfterSelectionChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function syncUiAfterSelectionChange(deps: SyncUiDeps, options: { refreshHoverPreview?: boolean } = {}): void {
  if (options.refreshHoverPreview !== false) {
    void deps.refreshHoverRoutePreview();
  }
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

/**
 * Defines the `createSidebarOrderRow` function shape (export function createSidebarOrderRow(args: { labelText: string; selected: boolean; onToggleSelect: (event: MouseEvent) => void; onCancel: () => voi).

 * Purpose: Supports maintainability by documenting why `createSidebarOrderRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createSidebarOrderRow(args: {
  labelText: string;
  selected: boolean;
  onToggleSelect: (event: MouseEvent) => void;
  onCancel: () => void;
  compactBlueButtons?: boolean;
}): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '0.5rem';
  row.style.marginBottom = '0.35rem';
  const label = document.createElement('span');
  label.textContent = args.labelText;
  label.style.flex = '1';
  label.style.fontSize = '0.9em';
  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = args.compactBlueButtons ? 'unit-select compact-blue-btn compact-square-btn' : 'unit-select';
  selectBtn.textContent = args.selected ? UNIT_DESELECT_GLYPH : UNIT_SELECT_GLYPH;
  selectBtn.style.flexShrink = '0';
  selectBtn.style.fontSize = '0.8em';
  selectBtn.addEventListener('click', (event) => {
    args.onToggleSelect(event as MouseEvent);
  });
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = args.compactBlueButtons ? 'unit-select compact-blue-btn compact-square-btn' : 'unit-select';
  cancelBtn.textContent = '×';
  cancelBtn.style.flexShrink = '0';
  cancelBtn.style.fontSize = '0.8em';
  cancelBtn.addEventListener('click', args.onCancel);
  row.appendChild(label);
  row.appendChild(selectBtn);
  row.appendChild(cancelBtn);
  return row;
}

/**
 * Defines the `updatePendingOrdersSidebar` function shape (export function updatePendingOrdersSidebar(deps: PendingOrdersDeps): void).

 * Purpose: Supports maintainability by documenting why `updatePendingOrdersSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updatePendingOrdersSidebar(deps: PendingOrdersDeps): void {
  const container = document.getElementById('pending-orders-list');
  if (!container) return;
  container.innerHTML = '';
  if (S.tacticalBattleSnapshot) {
    if (S.tacticalPendingMarches.length === 0 && S.pendingEmbarkOrders.length === 0) {
      const span = document.createElement('span');
      span.textContent = 'None';
      span.style.color = '#666';
      container.appendChild(span);
      return;
    }
    for (const row of S.tacticalPendingMarches) {
      const rowEl = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          row.subUnitId,
          formatTacticalDraftMarchPendingOrderTargetLabel(S.tacticalBattleSnapshot, row.subUnitId, row.destinationH3Index)
        ),
        selected: S.selectedUnitIds.includes(row.subUnitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(row.subUnitId, event),
        onCancel: () => {
          withTacticalHumanDraftPrefetchInvalidation(() => {
            S.tacticalPendingMarches = S.tacticalPendingMarches.filter((r) => r.subUnitId !== row.subUnitId);
          });
          deps.updatePendingOrdersSidebar?.();
          deps.redraw?.();
        },
        compactBlueButtons: true,
      });
      container.appendChild(rowEl);
    }
    for (const emb of S.pendingEmbarkOrders) {
      const rowEl = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(emb.unitId, fallbackDisplayNameFromUnitId(emb.navalUnitId)),
        selected: S.selectedUnitIds.includes(emb.unitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(emb.unitId, event),
        onCancel: () => {
          withTacticalHumanDraftPrefetchInvalidation(() => {
            S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== emb.unitId);
          });
          deps.updatePendingOrdersSidebar?.();
          deps.refreshStackCalloutIfOpen?.();
          deps.redraw?.();
        },
        compactBlueButtons: true,
      });
      container.appendChild(rowEl);
    }
    return;
  }
  const pendingOrders = S.humanStandingOrders.filter((order) => deps.isPendingMovementOrderForDisplay(order));
  if (pendingOrders.length === 0 && S.pendingFerryOrders.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    container.appendChild(span);
    return;
  }
  for (const order of pendingOrders) {
    const row = deps.createSidebarOrderRow({
      labelText: deps.formatPendingOrderSidebarLabel(order),
      selected: S.selectedUnitIds.includes(order.unitId),
      onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(order.unitId, event),
      onCancel: () => {
        void deps.cancelOrderForUnit(order.unitId);
      },
      compactBlueButtons: true,
    });
    container.appendChild(row);
  }
  for (const ferry of S.pendingFerryOrders) {
    const row = deps.createSidebarOrderRow({
      labelText: deps.formatUnitArrowLabel(ferry.unitId, formatPendingFerryOrderSidebarLabel(S.gameState, ferry)),
      selected: S.selectedUnitIds.includes(ferry.unitId),
      onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(ferry.unitId, event),
      onCancel: () => deps.cancelFerryForUnit(ferry.unitId),
      compactBlueButtons: true,
    });
    container.appendChild(row);
  }
}

/**
 * Defines the `showSidebarError` function shape (export function showSidebarError(message: string, showMapToast: (message: string, options?: { isError?: boolean }) => void, clearSidebarError: () => void): void).

 * Purpose: Supports maintainability by documenting why `showSidebarError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function showSidebarError(message: string, showMapToast: (message: string, options?: { isError?: boolean }) => void, clearSidebarError: () => void): void {
  showMapToast(message, { isError: true });
  clearSidebarError();
}

/**
 * Defines the `clearSidebarError` function shape (export function clearSidebarError(): void).

 * Purpose: Supports maintainability by documenting why `clearSidebarError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearSidebarError(): void {
  const el = document.getElementById('sidebar-error');
  if (el) el.style.display = 'none';
}
