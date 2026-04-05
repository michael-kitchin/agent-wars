import type { GameStateSnapshot, HumanStandingOrderSnapshot, RemovedUnitSnapshot } from '../../shared/ipcTypes';
import { buildUnitDisplayNameLookup, fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { formatPendingFerryOrderSidebarLabel } from './orderLabelFormatting';
import { UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';

interface SelectionActionDeps {
  toggleUnitSelection: (unitId: string) => void;
  replaceSelection: (unitIds: string[]) => void;
  syncUiAfterSelectionChange: () => void;
}

interface SyncUiDeps {
  refreshHoverRoutePreview: () => Promise<void>;
  updateSidebar: () => void;
  updatePendingOrdersSidebar: () => void;
  updateRangedSidebar: () => void;
  refreshStackCalloutIfOpen: () => void;
  redraw: () => void;
}

interface PendingOrdersDeps {
  isPendingMovementOrderForDisplay: (order: HumanStandingOrderSnapshot) => boolean;
  formatPendingOrderSidebarLabel: (order: HumanStandingOrderSnapshot) => string;
  createSidebarOrderRow: (args: {
    labelText: string;
    selected: boolean;
    onToggleSelect: (event: MouseEvent) => void;
    onCancel: () => void;
    compactBlueButtons?: boolean;
  }) => HTMLElement;
  applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
  cancelOrderForUnit: (unitId: string) => Promise<void>;
  cancelFerryForUnit: (unitId: string) => void;
  formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
}

export function estimateHexesLeftForOrder(order: HumanStandingOrderSnapshot): number {
  if (!Array.isArray(order.routeSegments) || order.routeSegments.length === 0) return 0;
  let total = 0;
  for (const segment of order.routeSegments) {
    if (!Array.isArray(segment.hexes) || segment.hexes.length < 2) continue;
    total += Math.max(0, segment.hexes.length - 1);
  }
  return total;
}

export function isPendingMovementOrderForDisplay(order: HumanStandingOrderSnapshot): boolean {
  return estimateHexesLeftForOrder(order) > 0;
}

export function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent, deps: SelectionActionDeps): void {
  const useMultiSelect = event.ctrlKey || S.ctrlKeyActive;
  if (useMultiSelect) {
    deps.toggleUnitSelection(unitId);
  } else {
    deps.replaceSelection([unitId]);
  }
  deps.syncUiAfterSelectionChange();
}

export function formatUnitArrowLabel(unitId: string, targetLabel: string, formatUnitDisplayName: (unitId: string) => string): string {
  return `${formatUnitDisplayName(unitId)} → ${targetLabel}`;
}

export function formatPendingOrderSidebarLabel(
  order: HumanStandingOrderSnapshot,
  formatUnitArrowLabelFn: (unitId: string, targetLabel: string) => string
): string {
  return formatUnitArrowLabelFn(order.unitId, `${estimateHexesLeftForOrder(order)}h (${order.status})`);
}

export function formatKillToastLine(
  kill: { victimId: string; killerIds: string[] },
  formatDisplayUnitName: (unitId: string) => string
): string {
  const killers = kill.killerIds.map((unitId) => formatDisplayUnitName(unitId)).join(', ');
  return `${killers} destroyed ${formatDisplayUnitName(kill.victimId)}`;
}

export function buildKillToastFormatterBundle(
  state: GameStateSnapshot,
  removedUnits: RemovedUnitSnapshot[] | undefined
): { formatUnitName: (unitId: string) => string; formatKillLine: (kill: { victimId: string; killerIds: string[] }) => string } {
  const removedUnitsForDisplay = removedUnits ?? [];
  const rosterForDisplay = [
    ...(state.units ?? []),
    ...removedUnitsForDisplay.map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      displayOrder: u.displayOrder,
    })),
  ];
  const displayNameById = buildUnitDisplayNameLookup(rosterForDisplay);
  const formatDisplayUnitName = (unitId: string) =>
    displayNameById.get(unitId) ?? S.unitDisplayNameById.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId);
  const formatKillLine = (kill: { victimId: string; killerIds: string[] }): string =>
    formatKillToastLine(kill, formatDisplayUnitName);
  return { formatUnitName: formatDisplayUnitName, formatKillLine };
}

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

export function updatePendingOrdersSidebar(deps: PendingOrdersDeps): void {
  const container = document.getElementById('pending-orders-list');
  if (!container) return;
  container.innerHTML = '';
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

export function showSidebarError(message: string, showMapToast: (message: string, options?: { isError?: boolean }) => void, clearSidebarError: () => void): void {
  showMapToast(message, { isError: true });
  clearSidebarError();
}

export function clearSidebarError(): void {
  const el = document.getElementById('sidebar-error');
  if (el) el.style.display = 'none';
}
