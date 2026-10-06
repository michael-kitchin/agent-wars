import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { selectionSupportButtonMode } from '../../shared/selectionSupportButtonMode';
import {
  formatPendingAirStrikeSidebarLabel,
  formatPendingRangedAttackSidebarLabel,
} from './orderLabelFormatting';
import { rendererSharedState as S } from '../core/state';
import { showOrderBlockHexTooltip } from '../map/orderBlockHexTooltip';
import { hideOrderSlowerHexTooltip } from '../map/orderSlowerHexTooltip';
import { appendMutedPlaceholder } from './sidebarListHelpers';
import type { TacticalOrderDeps } from './tacticalOrderDeps';
export type { TacticalOrderDeps } from './tacticalOrderDeps';
export type { RefreshHoverRoutePreviewOptions } from './hoverRoutePreviewTypes';
import { refreshHoverRoutePreview } from './hoverRoutePreviewRefresh';
import { rangedButtonTooltipText } from '../chrome/controlTooltipText';
export { refreshHoverRoutePreview };

/**
 * Replaces pending support-order rows for the selected unit ids via a row builder.
 *
 * Purpose: Shared filter/push for ranged, air, and ferry pending arrays.
 * When to use: From `replacePending*ForSelected` only.
 * Expected outcome: Prior rows for `selectedIds` removed; one new row per selected id.
 * Exceptions: None.
 */
function replacePendingOrdersForSelected<T extends { unitId: string }>(
  getRows: () => T[],
  setRows: (next: T[]) => void,
  selectedIds: string[],
  buildRow: (unitId: string) => T
): void {
  const kept = getRows().filter((row) => !selectedIds.includes(row.unitId));
  for (const unitId of selectedIds) {
    kept.push(buildRow(unitId));
  }
  setRows(kept);
}

/**
 * Defines the `replacePendingRangedAttacksForSelected` function shape (export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingRangedAttacksForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void {
  replacePendingOrdersForSelected(
    () => S.pendingRangedAttacks,
    (next) => {
      S.pendingRangedAttacks = next;
    },
    selectedIds,
    (unitId) => ({ unitId, targetH3Index })
  );
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
  replacePendingOrdersForSelected(
    () => S.pendingAirStrikes,
    (next) => {
      S.pendingAirStrikes = next;
    },
    selectedIds,
    (unitId) => ({ unitId, targetH3Index, targetType })
  );
}

/**
 * Defines the `replacePendingFerryOrdersForSelected` function shape (export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingFerryOrdersForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  replacePendingOrdersForSelected(
    () => S.pendingFerryOrders,
    (next) => {
      S.pendingFerryOrders = next;
    },
    selectedIds,
    (unitId) => ({ unitId, destinationH3Index })
  );
}

/**
 * Empties every draft order list (ranged, air strike, ferry, embark, tactical march) and turns Ranged and Strike targeting off.
 *
 * Purpose: One reset for callers that discard all drafts, so no list is forgotten.
 * When to use: New game, tactical battle exit or session release, and preparing the strategic UI before a tactical battle auto-starts.
 * Expected outcome: All five lists are empty and both targeting modes are off. Standing orders and any in-flight AI planning are untouched.
 * Exceptions: None.
 */
export function clearPendingTacticalOrders(): void {
  S.pendingRangedAttacks = [];
  S.rangedModeActive = false;
  S.pendingAirStrikes = [];
  S.airStrikeModeActive = false;
  S.pendingFerryOrders = [];
  S.pendingEmbarkOrders = [];
  S.tacticalPendingMarches = [];
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
  S.gestureSelectionSnapshotAtMs = 0;
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
 * Removes one unit's pending ranged attack (and, during a battle, its embark row), turns Ranged targeting off, and refreshes the panels and map.
 *
 * Purpose: Backs the cancel control on a pending ranged row in both theaters.
 * When to use: From the ranged list's row cancel callback.
 * Expected outcome: Only that unit's rows are removed; other drafts and any in-flight AI planning are unaffected.
 * Exceptions: None.
 */
export function cancelRangedForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingRangedAttacks = S.pendingRangedAttacks.filter((r) => r.unitId !== unitId);
  S.rangedModeActive = false;
  finishTargetingDraftCancel(unitId, deps);
}

/**
 * Removes one unit's pending air strike (and, during a battle, its embark row), turns Strike targeting off, and refreshes the panels and map.
 *
 * Purpose: Backs the cancel control on a pending air strike row in both theaters.
 * When to use: From the air strike list's row cancel callback.
 * Expected outcome: Only that unit's rows are removed; other drafts and any in-flight AI planning are unaffected.
 * Exceptions: None.
 */
export function cancelAirStrikeForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingAirStrikes = S.pendingAirStrikes.filter((r) => r.unitId !== unitId);
  S.airStrikeModeActive = false;
  finishTargetingDraftCancel(unitId, deps);
}

/**
 * Drops one unit's embark draft during a battle, then refreshes hover, sidebars, and the map.
 *
 * Purpose: Ranged and strike cancel share this refresh sequence after each has cleared its own draft and mode flag.
 * When to use: Only from `cancelRangedForUnit` and `cancelAirStrikeForUnit`, after those writes.
 * Expected outcome: Embark rows for that unit are gone when a battle is active; panels and the map match the remaining drafts.
 * Exceptions: None.
 */
function finishTargetingDraftCancel(unitId: string, deps: TacticalOrderDeps): void {
  if (S.tacticalBattleSnapshot) {
    S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
  }
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

/**
 * Removes one unit's pending ferry order (and, during a battle, its embark row) and refreshes the panels and map.
 *
 * Purpose: Backs the cancel control on a pending ferry row in both theaters.
 * When to use: From the movement list's ferry row cancel callback.
 * Expected outcome: Only that unit's rows are removed; other drafts and any in-flight AI planning are unaffected.
 * Exceptions: None.
 */
export function cancelFerryForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingFerryOrders = S.pendingFerryOrders.filter((r) => r.unitId !== unitId);
  if (S.tacticalBattleSnapshot) {
    S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
  }
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.redraw();
}

/**
 * Rebuilds the pending ranged and air-strike rows and chooses Ranged, Strike, or neither for the current selection.
 *
 * Purpose: The shared button follows `selectionSupportButtonMode`. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The button is hidden unless every resolved unit can range, or every resolved unit is air. `Cancel` stays while ranged mode is still valid. A true-to-false flag change nulls the hover preview, hides the block and slower tooltips, redraws, and starts one hover refresh.
 * Exceptions: None. Returns immediately when `#ranged-attacks-list` is missing, and then leaves the button untouched.
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
    appendMutedPlaceholder(listEl, 'None');
  } else {
    for (const r of S.pendingRangedAttacks) {
      const row = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          r.unitId,
          formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)
        ),
        unitId: r.unitId,
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
      appendMutedPlaceholder(strikeListEl, 'None');
    } else {
      for (const strike of S.pendingAirStrikes) {
        const row = deps.createSidebarOrderRow({
          labelText: deps.formatUnitArrowLabel(
            strike.unitId,
            formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)
          ),
          unitId: strike.unitId,
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
    const rangedWasActive = S.rangedModeActive;
    const strikeWasActive = S.airStrikeModeActive;
    const mode = selectionSupportButtonMode(
      selectedUnits.map((unit) => unit.unitType),
      !!tb
    );
    if (mode === 'strike') {
      S.rangedModeActive = false;
      btnEl.textContent = 'Strike';
      btnEl.setAttribute('data-control-tooltip', rangedButtonTooltipText('Strike'));
      btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';
      if (strikeTypeEl) {
        strikeTypeEl.style.display = S.airStrikeModeActive ? 'inline-block' : 'none';
        strikeTypeEl.value = S.airStrikeTargetType;
      }
      if (strikeCancelEl) {
        strikeCancelEl.style.display = S.airStrikeModeActive ? 'inline-block' : 'none';
      }
    } else if (mode === 'ranged') {
      S.airStrikeModeActive = false;
      btnEl.style.display = 'inline-block';
      btnEl.textContent = S.rangedModeActive ? 'Cancel' : 'Ranged';
      btnEl.setAttribute(
        'data-control-tooltip',
        rangedButtonTooltipText(S.rangedModeActive ? 'Cancel' : 'Ranged')
      );
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    } else {
      btnEl.style.display = 'none';
      S.rangedModeActive = false;
      S.airStrikeModeActive = false;
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    }
    const targetingModeCleared =
      (rangedWasActive && !S.rangedModeActive) || (strikeWasActive && !S.airStrikeModeActive);
    if (targetingModeCleared) {
      S.hoverRoutePreview = null;
      showOrderBlockHexTooltip(null);
      hideOrderSlowerHexTooltip();
      deps.redraw();
      void refreshHoverRoutePreview(deps);
    }
  }
}
