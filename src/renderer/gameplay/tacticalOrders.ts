import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { unitHasTacticalRangedBaseline } from '../../shared/tacticalRanges';
import {
  formatPendingAirStrikeSidebarLabel,
  formatPendingRangedAttackSidebarLabel,
} from './orderLabelFormatting';
import { withTacticalHumanDraftPrefetchInvalidation } from '../openRouter/openRouterRuntime';
import { rendererSharedState as S } from '../core/state';
import { showOrderBlockHexTooltip } from '../map/orderBlockHexTooltip';
import { hideOrderSlowerHexTooltip } from '../map/orderSlowerHexTooltip';
import type { TacticalOrderDeps } from './tacticalOrderDeps';
export type { TacticalOrderDeps } from './tacticalOrderDeps';
export type { RefreshHoverRoutePreviewOptions } from './hoverRoutePreviewTypes';
import { refreshHoverRoutePreview } from './hoverRoutePreviewRefresh';
export { refreshHoverRoutePreview };

/**
 * Defines the `getRepresentativeSelectedUnitIdsByOrigin` function shape (export function getRepresentativeSelectedUnitIdsByOrigin(): string[]).

 * Purpose: Supports maintainability by documenting why `getRepresentativeSelectedUnitIdsByOrigin` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRepresentativeSelectedUnitIdsByOrigin(): string[] {
  if (!S.gameState) return [...S.selectedUnitIds];
  const tb = S.tacticalBattleSnapshot;
  if (tb) {
    const byId = new Map(tb.subUnits.map((u) => [u.id, u]));
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

/**
 * Defines the `replacePendingRangedAttacksForSelected` function shape (export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingRangedAttacksForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingRangedAttacks = S.pendingRangedAttacks.filter((row) => !selectedIds.includes(row.unitId));
    for (const unitId of selectedIds) {
      S.pendingRangedAttacks.push({ unitId, targetH3Index });
    }
  });
}

/**
 * Defines the `replacePendingAirStrikesForSelected` function shape (export function replacePendingAirStrikesForSelected().

 * Purpose: Supports maintainability by documenting why `replacePendingAirStrikesForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingAirStrikesForSelected(
  selectedIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingAirStrikes = S.pendingAirStrikes.filter((row) => !selectedIds.includes(row.unitId));
    for (const unitId of selectedIds) {
      S.pendingAirStrikes.push({ unitId, targetH3Index, targetType });
    }
  });
}

/**
 * Defines the `replacePendingFerryOrdersForSelected` function shape (export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingFerryOrdersForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingFerryOrders = S.pendingFerryOrders.filter((row) => !selectedIds.includes(row.unitId));
    for (const unitId of selectedIds) {
      S.pendingFerryOrders.push({ unitId, destinationH3Index });
    }
  });
}

/**
 * Defines the `clearPendingTacticalOrders` function shape (export function clearPendingTacticalOrders(): void).

 * Purpose: Supports maintainability by documenting why `clearPendingTacticalOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearPendingTacticalOrders(): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingRangedAttacks = [];
    S.rangedModeActive = false;
    S.pendingAirStrikes = [];
    S.airStrikeModeActive = false;
    S.pendingFerryOrders = [];
    S.pendingEmbarkOrders = [];
    S.tacticalPendingMarches = [];
  });
}

/**
 * Defines the `clearCommittedOrderDraftState` function shape (export function clearCommittedOrderDraftState(deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `clearCommittedOrderDraftState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearCommittedOrderDraftState(deps: TacticalOrderDeps): void {
  deps.clearSelection();
  S.selectedUnitIdsAtMouseDown = [];
  S.selectedHexIndex = null;
  S.hideCommittedOrderLinesAfterReady = false;
  S.hoverRoutePreview = null;
  showOrderBlockHexTooltip(null);
  hideOrderSlowerHexTooltip();
}

/**
 * Defines the `cancelOrderForUnit` function shape (export async function cancelOrderForUnit(unitId: string, deps: TacticalOrderDeps): Promise<void>).

 * Purpose: Supports maintainability by documenting why `cancelOrderForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `cancelRangedForUnit` function shape (export function cancelRangedForUnit(unitId: string, deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `cancelRangedForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelRangedForUnit(unitId: string, deps: TacticalOrderDeps): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingRangedAttacks = S.pendingRangedAttacks.filter((r) => r.unitId !== unitId);
    if (S.tacticalBattleSnapshot) {
      S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
    }
    S.rangedModeActive = false;
  });
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

/**
 * Defines the `cancelAirStrikeForUnit` function shape (export function cancelAirStrikeForUnit(unitId: string, deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `cancelAirStrikeForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelAirStrikeForUnit(unitId: string, deps: TacticalOrderDeps): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingAirStrikes = S.pendingAirStrikes.filter((r) => r.unitId !== unitId);
    if (S.tacticalBattleSnapshot) {
      S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
    }
    S.airStrikeModeActive = false;
  });
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

/**
 * Defines the `cancelFerryForUnit` function shape (export function cancelFerryForUnit(unitId: string, deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `cancelFerryForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelFerryForUnit(unitId: string, deps: TacticalOrderDeps): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingFerryOrders = S.pendingFerryOrders.filter((r) => r.unitId !== unitId);
    if (S.tacticalBattleSnapshot) {
      S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
    }
  });
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.redraw();
}

/**
 * Defines the `updateRangedSidebar` function shape (export function updateRangedSidebar(deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `updateRangedSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateRangedSidebar(deps: TacticalOrderDeps): void {
  const listEl = document.getElementById('ranged-attacks-list');
  const strikeListEl = document.getElementById('air-strikes-list');
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  const strikeTypeEl = document.getElementById('air-strike-target-type') as HTMLSelectElement | null;
  const strikeCancelEl = document.getElementById('air-strike-cancel-btn') as HTMLButtonElement | null;
  if (!listEl) return;

  const tacticalPositions = S.tacticalBattleSnapshot?.subUnits;
  listEl.innerHTML = '';
  if (S.pendingRangedAttacks.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    listEl.appendChild(span);
  } else {
    for (const r of S.pendingRangedAttacks) {
      const row = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          r.unitId,
          formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)
        ),
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
          labelText: deps.formatUnitArrowLabel(
            strike.unitId,
            formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)
          ),
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
    const tb = S.tacticalBattleSnapshot;
    const selectedUnits = tb
      ? S.selectedUnitIds
          .map((id) => tb.subUnits.find((u) => u.id === id))
          .filter((unit): unit is NonNullable<typeof unit> => !!unit)
      : S.selectedUnitIds
          .map((id) => S.gameState?.units.find((u) => u.id === id))
          .filter((unit): unit is NonNullable<typeof unit> => !!unit);
    const allAir = selectedUnits.length > 0 && selectedUnits.every((unit) => unit.unitType === 'air');
    const allHaveRanged =
      selectedUnits.length > 0 && selectedUnits.every((unit) => unitHasTacticalRangedBaseline(unit.unitType));
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
