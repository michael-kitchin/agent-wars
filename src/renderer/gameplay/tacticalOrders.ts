import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import { selectionSupportAction, selectionSupportButtonMode } from '../../shared/selectionSupportButtonMode';
import {
  formatPendingAirStrikeSidebarLabel,
  formatPendingMissileLaunchSidebarLabel,
  formatPendingRangedAttackSidebarLabel,
} from './orderLabelFormatting';
import { rendererSharedState as S } from '../core/state';
import { showOrderBlockHexTooltip } from '../map/orderBlockHexTooltip';
import { hideOrderSlowerHexTooltip } from '../map/orderSlowerHexTooltip';
import { renderSidebarOrderGroup, sidebarOrderRowArgs } from './sidebarOrderRow';
import type { TacticalOrderDeps } from './tacticalOrderDeps';
export type { TacticalOrderDeps } from './tacticalOrderDeps';
export type { RefreshHoverRoutePreviewOptions } from './hoverRoutePreviewTypes';
import { refreshHoverRoutePreview } from './hoverRoutePreviewRefresh';
import { renderSelectionBarState, selectedUnitTypes } from './selectionBar';
import { supportButtonTooltipText } from '../chrome/controlTooltipText';
export { refreshHoverRoutePreview };

/**
 * The reticle's accessible names, one per kind of attack.
 *
 * Purpose: The reticle is an icon with no visible label, so assistive technology and the smoke run read this name.
 * When to use: `updateRangedSidebar`, as `aria-label` on `#ranged-attack-btn`.
 * Expected outcome: The name of the attack a click would aim, greyed out or not.
 * Exceptions: None.
 */
const SUPPORT_BUTTON_NAMES = Object.freeze({
  ranged: 'Ranged attack',
  strike: 'Air strike',
  launch: 'Missile launch',
});

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
 * Replaces pending missile launches for the selected missiles.
 *
 * Purpose: A double-click on a legal target queues one launch per selected missile.
 * When to use: After `validateGroupMissileLaunchTarget` succeeds.
 * Expected outcome: Prior launches for those ids are replaced. Other missiles keep theirs.
 * Exceptions: None.
 */
export function replacePendingMissileLaunchesForSelected(selectedIds: string[], targetH3Index: string): void {
  replacePendingOrdersForSelected(
    () => S.pendingMissileLaunches,
    (next) => {
      S.pendingMissileLaunches = next;
    },
    selectedIds,
    (unitId) => ({ unitId, targetH3Index })
  );
}

/**
 * Queues a ferry for each selected air unit that is not already based at the destination.
 *
 * Purpose: A group double-click means "everyone else rebase here." A unit already on that hex is not given a no-op order, and any earlier ferry for it is dropped.
 * When to use: After `validateGroupFerryTarget` succeeds for the selection.
 * Expected outcome: Moving units replace their pending ferry. Units already at `destinationH3Index` lose any pending ferry and are not re-queued. Other units' ferries stay.
 * Exceptions: None.
 */
export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  const alreadyBased = new Set(
    selectedIds.filter((unitId) =>
      S.gameState?.units.some((unit) => unit.id === unitId && unit.h3Index === destinationH3Index)
    )
  );
  const movingIds = selectedIds.filter((unitId) => !alreadyBased.has(unitId));
  replacePendingOrdersForSelected(
    () => S.pendingFerryOrders.filter((row) => !alreadyBased.has(row.unitId)),
    (next) => {
      S.pendingFerryOrders = next;
    },
    movingIds,
    (unitId) => ({ unitId, destinationH3Index })
  );
}

/**
 * Empties every draft order list and turns Ranged, Strike, and Launch targeting off.
 *
 * Purpose: One reset for callers that discard all drafts, so no list is forgotten.
 * When to use: New game, tactical battle exit or session release, and preparing the strategic UI before a tactical battle auto-starts.
 * Expected outcome: The draft lists are empty and the targeting modes are off. Standing orders and any in-flight AI planning are untouched.
 * Exceptions: None.
 */
export function clearPendingTacticalOrders(): void {
  S.pendingRangedAttacks = [];
  S.rangedModeActive = false;
  S.pendingAirStrikes = [];
  S.airStrikeModeActive = false;
  S.pendingMissileLaunches = [];
  S.missileLaunchModeActive = false;
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
 * Removes one missile's pending launch, turns Launch targeting off, and refreshes the panels and map.
 *
 * Purpose: Backs the cancel control on a pending launch row.
 * When to use: From the missile launch list's row cancel callback.
 * Expected outcome: Only that missile's launch is removed.
 * Exceptions: None.
 */
export function cancelMissileLaunchForUnit(unitId: string, deps: TacticalOrderDeps): void {
  S.pendingMissileLaunches = S.pendingMissileLaunches.filter((row) => row.unitId !== unitId);
  S.missileLaunchModeActive = false;
  finishTargetingDraftCancel(unitId, deps);
}

/**
 * Drops one unit's embark draft during a battle, then refreshes hover, sidebars, and the map.
 *
 * Purpose: Ranged and strike cancel share this refresh sequence after each has cleared its own draft and mode flag.
 * When to use: Only from `cancelRangedForUnit`, `cancelAirStrikeForUnit`, and `cancelMissileLaunchForUnit`, after those writes.
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
 * Rebuilds the pending ranged and air-strike rows and sets the reticle for the current selection.
 *
 * Purpose: The reticle follows `selectionSupportButtonMode`, and `selectionSupportAction` names it and explains it when
 *   it cannot be used. Clearing a targeting flag here must also drop a hover preview that sampled the old flag.
 * When to use: After a selection change, a pending-order change, or a targeting-mode toggle.
 * Expected outcome: Pending rows match the draft arrays. The reticle shows while units are selected; its tip host
 *   (`#ranged-attack-tip-host`) is what shows and hides. It is enabled when every resolved unit can range, or every
 *   resolved unit is air; otherwise it is greyed out, and its reason is in `#selection-panel-action-note` and is the
 *   tip host's tip. Its `aria-label` names the attack, and `aria-pressed` is true while that attack is aimed; the strike
 *   target list shows to its left only while a strike is aimed. A true-to-false flag change nulls the hover preview,
 *   hides the block and slower tooltips, redraws, and starts one hover refresh. The selection bar's hint and border then
 *   follow the flags (`renderSelectionBarState`).
 * Exceptions: None. Returns immediately when `#ranged-attacks-list` is missing, and then leaves the button untouched.
 */
export function updateRangedSidebar(deps: TacticalOrderDeps): void {
  const listEl = document.getElementById('ranged-attacks-list');
  const strikeListEl = document.getElementById('air-strikes-list');
  const launchListEl = document.getElementById('missile-launches-list');
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  const btnHostEl = document.getElementById('ranged-attack-tip-host');
  const strikeTypeEl = document.getElementById('air-strike-target-type') as HTMLSelectElement | null;
  const actionNoteEl = document.getElementById('selection-panel-action-note');
  if (!listEl) return;

  const battle = S.tacticalBattleSnapshot;
  renderSidebarOrderGroup(
    'ranged',
    S.pendingRangedAttacks.map((r) =>
      sidebarOrderRowArgs(
        r.unitId,
        formatPendingRangedAttackSidebarLabel(S.gameState, r, battle),
        () => cancelRangedForUnit(r.unitId, deps),
        deps
      )
    )
  );
  if (strikeListEl) {
    renderSidebarOrderGroup(
      'strike',
      S.pendingAirStrikes.map((strike) =>
        sidebarOrderRowArgs(
          strike.unitId,
          formatPendingAirStrikeSidebarLabel(S.gameState, strike, battle),
          () => cancelAirStrikeForUnit(strike.unitId, deps),
          deps
        )
      )
    );
  }
  if (launchListEl) {
    renderSidebarOrderGroup(
      'launch',
      S.pendingMissileLaunches.map((launch) =>
        sidebarOrderRowArgs(
          launch.unitId,
          formatPendingMissileLaunchSidebarLabel(S.gameState, launch, battle),
          () => cancelMissileLaunchForUnit(launch.unitId, deps),
          deps
        )
      )
    );
  }

  if (btnEl && btnHostEl) {
    const tb = S.tacticalBattleSnapshot;
    const rangedWasActive = S.rangedModeActive;
    const strikeWasActive = S.airStrikeModeActive;
    const launchWasActive = S.missileLaunchModeActive;
    const unitTypes = selectedUnitTypes();
    const mode = selectionSupportButtonMode(unitTypes, !!tb);
    const action = selectionSupportAction(unitTypes, !!tb);
    btnEl.disabled = !action.enabled;
    if (actionNoteEl) actionNoteEl.textContent = action.reason ?? '';
    // The host carries the reason, because a disabled button gets no pointer events.
    if (!action.enabled && action.reason) btnHostEl.setAttribute('data-control-tooltip', action.reason);
    else btnHostEl.removeAttribute('data-control-tooltip');
    // An empty display hands the host back to `.control-tooltip-host`, whose inline flex keeps the button centered.
    btnHostEl.style.display = '';
    // The reticle has no visible label, so its name says which attack it aims, greyed out or not.
    btnEl.setAttribute('aria-label', SUPPORT_BUTTON_NAMES[action.kind]);
    if (mode === 'launch') {
      S.rangedModeActive = false;
      S.airStrikeModeActive = false;
      btnEl.setAttribute('aria-pressed', String(S.missileLaunchModeActive));
      btnEl.setAttribute('data-control-tooltip', supportButtonTooltipText('launch', S.missileLaunchModeActive));
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
    } else if (mode === 'strike') {
      S.rangedModeActive = false;
      S.missileLaunchModeActive = false;
      btnEl.setAttribute('aria-pressed', String(S.airStrikeModeActive));
      btnEl.setAttribute('data-control-tooltip', supportButtonTooltipText('strike', S.airStrikeModeActive));
      if (strikeTypeEl) {
        strikeTypeEl.style.display = S.airStrikeModeActive ? '' : 'none';
        strikeTypeEl.value = S.airStrikeTargetType;
      }
    } else if (mode === 'ranged') {
      S.airStrikeModeActive = false;
      S.missileLaunchModeActive = false;
      btnEl.setAttribute('aria-pressed', String(S.rangedModeActive));
      btnEl.setAttribute('data-control-tooltip', supportButtonTooltipText('ranged', S.rangedModeActive));
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
    } else {
      // Greyed out with its reason: the reticle stays visible so the player can see why it cannot be used.
      btnEl.setAttribute('aria-pressed', 'false');
      btnEl.removeAttribute('data-control-tooltip');
      S.rangedModeActive = false;
      S.airStrikeModeActive = false;
      S.missileLaunchModeActive = false;
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
    }
    const targetingModeCleared =
      (rangedWasActive && !S.rangedModeActive) ||
      (strikeWasActive && !S.airStrikeModeActive) ||
      (launchWasActive && !S.missileLaunchModeActive);
    if (targetingModeCleared) {
      S.hoverRoutePreview = null;
      showOrderBlockHexTooltip(null);
      hideOrderSlowerHexTooltip();
      deps.redraw();
      void refreshHoverRoutePreview(deps);
    }
  }
  renderSelectionBarState();
}
