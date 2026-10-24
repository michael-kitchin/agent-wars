import type { KillEdge } from '../../shared/ipc/combatResultTypes';
import type { GameStateSnapshot, HumanStandingOrderSnapshot, RemovedUnitSnapshot } from '../../shared/ipcTypes';
import {
  formatPendingMovementSidebarTargetLabel,
  formatTacticalDraftMarchPendingOrderTargetLabel,
} from '../../shared/pendingMovementSidebarLabels';
import { formatUnitNameForViewer, viewerSeatIdForRoster } from '../../shared/sideLabels';
import { unitIdOwnerFromId } from '../../shared/unitIds';
import { buildUnitDisplayNameLookup, fallbackDisplayNameFromUnitId, type UnitDisplayIdentity } from '../../shared/unitDisplayNames';
import { formatPendingFerryOrderSidebarLabel } from './orderLabelFormatting';
import { rendererSharedState as S } from '../core/state';
import { renderSidebarOrderGroup, sidebarOrderRowArgs, type SidebarOrderRowArgs } from './sidebarOrderRow';
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
   * Builds the line under a strategic march row's unit name.
   *
   * Contract: Same behavior as the exported `formatPendingOrderSidebarLabel`.
   * When to use: For each standing movement order shown in the Movement group.
   * Expected outcome: For example `→ E5 · 1h`.
   * Exceptions: None.
   */
formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;
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
   * Returns a unit's display name.
   *
   * Contract: Same names the map and the stack callout show.
   * When to use: The first line of each Movement row.
   * Expected outcome: The name, or a fallback built from the id.
   * Exceptions: None.
   */
formatUnitDisplayName: (unitId: string) => string;
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
   * When to use: After a tactical ferry cancel. That cancel also clears a matching embark draft, and an open callout would otherwise keep the old sealift row.
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
  const useMultiSelect = event.shiftKey || S.shiftKeyActive;
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
 * Builds the line under a strategic march row's unit name.
 *
 * Purpose: A standing movement order names its destination hex and the hex steps its route has left.
 * When to use: For each standing movement order shown in the Movement group.
 * Expected outcome: For example `→ E5 · 3h`; a missing destination shows `?`.
 * Exceptions: None.
 */
export function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string {
  return formatPendingMovementSidebarTargetLabel(order.destinationH3Index, estimateHexesLeftForOrder(order));
}

/**
 * Defines the `formatKillToastLine` function shape (export function formatKillToastLine().

 * Purpose: Supports maintainability by documenting why `formatKillToastLine` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatKillToastLine(
  kill: KillEdge,
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
): { formatUnitName: (unitId: string) => string; formatKillLine: (kill: KillEdge) => string } {
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
      player: unit.player,
    });
  }
  for (const unit of rosterFromRemoved) {
    if (rosterById.has(unit.id)) continue;
    rosterById.set(unit.id, {
      id: unit.id,
      unitType: unit.unitType,
      displayOrder: unit.displayOrder,
      player: unit.player,
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
  const formatDisplayUnitName = (unitId: string): string => {
    const baseName = displayNameById.get(unitId) ?? S.unitDisplayNameById.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId);
    const ownerId = rosterForDisplay.find((unit) => unit.id === unitId)?.player ?? unitIdOwnerFromId(unitId);
    if (!ownerId) return baseName;
    return formatUnitNameForViewer({
      baseName,
      ownerId,
      viewerSeatId: viewerSeatIdForRoster(S.gameState?.seats ?? []),
      seats: S.gameState?.seats ?? [],
    });
  };
  const formatKillLine = (kill: KillEdge): string =>
    formatKillToastLine(kill, formatDisplayUnitName);
  return { formatUnitName: formatDisplayUnitName, formatKillLine };
}

/**
 * Defines the `syncUiAfterSelectionChange` function shape (export function syncUiAfterSelectionChange(deps: SyncUiDeps, options:).

 * Purpose: Supports maintainability by documenting why `syncUiAfterSelectionChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Sidebar, ranged, pending-order, and stack chrome stay aligned with the current selection. Pass `refreshStackCallout: false` when the caller already rebuilt the open stack popup so sealift does not render twice.
 * Exceptions: None.
 */
export function syncUiAfterSelectionChange(
  deps: SyncUiDeps,
  options: { refreshHoverPreview?: boolean; refreshStackCallout?: boolean } = {}
): void {
  if (options.refreshHoverPreview !== false) {
    void deps.refreshHoverRoutePreview();
  }
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  if (options.refreshStackCallout !== false) {
    deps.refreshStackCalloutIfOpen();
  }
  deps.redraw();
}

/**
 * Rebuilds the Movement group from the active theater's drafts.
 *
 * Purpose: Lists every march and ferry the next Ready will send, with each unit's destination code and distance.
 * When to use: After a march or ferry draft is added, cancelled, or cleared, and after the selection changes.
 * Expected outcome: One row per march and ferry, or "None". During a battle, battle marches and ferries are listed
 *   and sealift embark drafts are omitted. Rows for selected units are highlighted. The group's count and its
 *   published copy match. A missing list element leaves the document unchanged.
 * Exceptions: Selection and cancel callbacks may throw.
 */
export function updatePendingOrdersSidebar(deps: PendingOrdersDeps): void {
  const battle = S.tacticalBattleSnapshot;
  const rows: SidebarOrderRowArgs[] = [];
  const rowFor = (unitId: string, detail: string, onCancel: () => void): SidebarOrderRowArgs =>
    sidebarOrderRowArgs(unitId, detail, onCancel, deps);
  if (battle) {
    for (const row of S.tacticalPendingMarches) {
      const detail = formatTacticalDraftMarchPendingOrderTargetLabel(battle, row.subUnitId, row.destinationH3Index);
      rows.push(rowFor(row.subUnitId, detail, () => {
        S.tacticalPendingMarches = S.tacticalPendingMarches.filter((r) => r.subUnitId !== row.subUnitId);
        deps.updatePendingOrdersSidebar?.();
        deps.redraw?.();
      }));
    }
    for (const ferry of S.pendingFerryOrders) {
      rows.push(rowFor(ferry.unitId, formatPendingFerryOrderSidebarLabel(S.gameState, ferry, battle), () => {
        deps.cancelFerryForUnit(ferry.unitId);
        deps.refreshStackCalloutIfOpen?.();
      }));
    }
  } else {
    for (const order of S.humanStandingOrders.filter((o) => deps.isPendingMovementOrderForDisplay(o))) {
      rows.push(rowFor(order.unitId, deps.formatPendingOrderSidebarLabel(order), () => {
        void deps.cancelOrderForUnit(order.unitId);
      }));
    }
    for (const ferry of S.pendingFerryOrders) {
      rows.push(rowFor(ferry.unitId, formatPendingFerryOrderSidebarLabel(S.gameState, ferry), () => deps.cancelFerryForUnit(ferry.unitId)));
    }
  }
  renderSidebarOrderGroup('movement', rows);
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
