import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { RANGED_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import {
  formatPendingAirStrikeSidebarLabel,
  formatPendingRangedAttackSidebarLabel,
} from './orderLabelFormatting';
import { rendererSharedState as S } from '../core/state';

interface TacticalOrderDeps {
  clearSelection: () => void;
  requestRedraw: () => void;
  redraw: () => void;
  updateSidebar: () => void;
  updatePendingOrdersSidebar: () => void;
  updateRangedSidebar: () => void;
  refreshStackCalloutIfOpen: () => void;
  refreshHumanStandingOrders: () => Promise<void>;
  showMapToast: (message: string, options?: { isError?: boolean }) => void;
  createSidebarOrderRow: (args: {
    labelText: string;
    selected: boolean;
    onToggleSelect: (event: MouseEvent) => void;
    onCancel: () => void;
    compactBlueButtons?: boolean;
  }) => HTMLElement;
  formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
  applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
}

export function getRepresentativeSelectedUnitIdsByOrigin(): string[] {
  if (!S.gameState) return [...S.selectedUnitIds];
  const byId = new Map(S.gameState.units.map((u) => [u.id, u]));
  const seenOrigins = new Set<string>();
  const representatives: string[] = [];
  for (const unitId of S.selectedUnitIds) {
    const unit = byId.get(unitId);
    if (!unit || unit.player !== 'human') continue;
    if (seenOrigins.has(unit.h3Index)) continue;
    seenOrigins.add(unit.h3Index);
    representatives.push(unitId);
  }
  return representatives;
}

export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void {
  S.pendingRangedAttacks = S.pendingRangedAttacks.filter((row) => !selectedIds.includes(row.unitId));
  for (const unitId of selectedIds) {
    S.pendingRangedAttacks.push({ unitId, targetH3Index });
  }
}

export function replacePendingAirStrikesForSelected(
  selectedIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): void {
  S.pendingAirStrikes = S.pendingAirStrikes.filter((row) => !selectedIds.includes(row.unitId));
  for (const unitId of selectedIds) {
    S.pendingAirStrikes.push({ unitId, targetH3Index, targetType });
  }
}

export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  S.pendingFerryOrders = S.pendingFerryOrders.filter((row) => !selectedIds.includes(row.unitId));
  for (const unitId of selectedIds) {
    S.pendingFerryOrders.push({ unitId, destinationH3Index });
  }
}

export function clearPendingTacticalOrders(): void {
  S.pendingRangedAttacks = [];
  S.rangedModeActive = false;
  S.pendingAirStrikes = [];
  S.airStrikeModeActive = false;
  S.pendingFerryOrders = [];
}

export function clearCommittedOrderDraftState(deps: TacticalOrderDeps): void {
  deps.clearSelection();
  S.selectedUnitIdsAtMouseDown = [];
  S.selectedHexIndex = null;
  S.hideCommittedOrderLinesAfterReady = false;
  S.hoverRoutePreview = null;
}

export async function refreshHoverRoutePreview(deps: TacticalOrderDeps): Promise<void> {
  const unitIds = [...S.selectedUnitIds];
  const hoveredH3 = S.hoveredHexH3;
  const seq = ++S.hoverPreviewRequestSeq;
  if (
    S.rangedModeActive ||
    S.airStrikeModeActive ||
    !window.gameApi?.previewHumanMarchOrders ||
    unitIds.length === 0 ||
    !hoveredH3 ||
    !S.gameState
  ) {
    S.hoverRoutePreview = null;
    deps.requestRedraw();
    return;
  }
  const data = await window.gameApi.previewHumanMarchOrders({ unitIds, hoveredH3Index: hoveredH3 });
  if (seq !== S.hoverPreviewRequestSeq) return;
  if (S.hoveredHexH3 !== hoveredH3) return;
  const currentSelected = [...S.selectedUnitIds].sort().join('|');
  const requestedSelected = [...unitIds].sort().join('|');
  if (currentSelected !== requestedSelected) return;
  S.hoverRoutePreview = { hoveredH3Index: hoveredH3, data };
  deps.requestRedraw();
}

export async function cancelOrderForUnit(unitId: string, deps: TacticalOrderDeps): Promise<void> {
  if (!window.gameApi?.cancelHumanStandingOrder) return;
  const result = await window.gameApi.cancelHumanStandingOrder({ unitId });
  if (!result.success) {
    deps.showMapToast(result.reason ?? 'Failed to cancel order.', { isError: true });
  }
  await deps.refreshHumanStandingOrders();
  deps.updatePendingOrdersSidebar();
  deps.redraw();
}

export function cancelRangedForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingRangedAttacks = S.pendingRangedAttacks.filter((r) => r.unitId !== unitId);
  S.rangedModeActive = false;
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

export function cancelAirStrikeForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingAirStrikes = S.pendingAirStrikes.filter((r) => r.unitId !== unitId);
  S.airStrikeModeActive = false;
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

export function cancelFerryForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingFerryOrders = S.pendingFerryOrders.filter((r) => r.unitId !== unitId);
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.redraw();
}

export function updateRangedSidebar(deps: TacticalOrderDeps): void {
  const listEl = document.getElementById('ranged-attacks-list');
  const strikeListEl = document.getElementById('air-strikes-list');
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  const strikeTypeEl = document.getElementById('air-strike-target-type') as HTMLSelectElement | null;
  const strikeCancelEl = document.getElementById('air-strike-cancel-btn') as HTMLButtonElement | null;
  if (!listEl) return;

  listEl.innerHTML = '';
  if (S.pendingRangedAttacks.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    listEl.appendChild(span);
  } else {
    for (const r of S.pendingRangedAttacks) {
      const row = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(r.unitId, formatPendingRangedAttackSidebarLabel(S.gameState, r)),
        selected: S.selectedUnitIds.includes(r.unitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(r.unitId, event),
        onCancel: () => cancelRangedForUnit(r.unitId, deps),
        compactBlueButtons: true,
      });
      listEl.appendChild(row);
    }
  }
  if (strikeListEl) {
    strikeListEl.innerHTML = '';
    if (S.pendingAirStrikes.length === 0) {
      const span = document.createElement('span');
      span.textContent = 'None';
      span.style.color = '#666';
      strikeListEl.appendChild(span);
    } else {
      for (const strike of S.pendingAirStrikes) {
        const row = deps.createSidebarOrderRow({
          labelText: deps.formatUnitArrowLabel(strike.unitId, formatPendingAirStrikeSidebarLabel(S.gameState, strike)),
          selected: S.selectedUnitIds.includes(strike.unitId),
          onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(strike.unitId, event),
          onCancel: () => cancelAirStrikeForUnit(strike.unitId, deps),
          compactBlueButtons: true,
        });
        strikeListEl.appendChild(row);
      }
    }
  }

  if (btnEl) {
    const selectedUnits = S.selectedUnitIds
      .map((id) => S.gameState?.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit);
    const allAir = selectedUnits.length > 0 && selectedUnits.every((unit) => unit.unitType === 'air');
    const allHaveRanged =
      selectedUnits.length > 0 && selectedUnits.every((unit) => (RANGED_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 0) >= 1);
    if (allAir) {
      btnEl.textContent = 'Strike';
      btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';
      if (strikeTypeEl) {
        strikeTypeEl.style.display = S.airStrikeModeActive ? 'inline-block' : 'none';
        strikeTypeEl.value = S.airStrikeTargetType;
      }
      if (strikeCancelEl) {
        strikeCancelEl.style.display = S.airStrikeModeActive ? 'inline-block' : 'none';
      }
    } else if (allHaveRanged) {
      btnEl.style.display = 'inline-block';
      btnEl.textContent = S.rangedModeActive ? 'Cancel' : 'Ranged';
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    } else {
      btnEl.style.display = 'none';
      S.rangedModeActive = false;
      S.airStrikeModeActive = false;
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    }
  }
}
