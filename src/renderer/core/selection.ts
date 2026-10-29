import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { selectionUnitIdSetsDiffer } from '../../shared/selectionUnitIdSets';
import { hidePlanningChromeToasts } from '../openRouter/openRouterUiHelpers';
import { rendererSharedState as S } from './state';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Returns whether a unit id refers to embarked cargo that must not be newly selected.
 *
 * Purpose: Shared guard for map icon, sidebar, and selection reconciliation paths.
 * When to use: Before adding a land unit to `selectedUnitIds` during planning.
 * Expected outcome: True for infantry/armor with an active embark link on strategic or tactical snapshots.
 * Exceptions: None.
 */
export function isEmbarkedLandUnitBlockedForSelection(unitId: string): boolean {
  if (S.tacticalBattleSnapshot) {
    const sub = S.tacticalBattleSnapshot.subUnits.find((u) => u.id === unitId);
    if (!sub || (sub.unitType !== 'infantry' && sub.unitType !== 'armor')) return false;
    return !!sub.embarkedOnSubUnitId;
  }
  const unit = S.gameState?.units.find((u) => u.id === unitId);
  if (!unit || (unit.unitType !== 'infantry' && unit.unitType !== 'armor')) return false;
  return !!(unit.embarkedOnNavalUnitId && unit.embarkedOnNavalUnitId.length > 0);
}

/**
 * Returns whether selecting `unitId` should be blocked (allows deselect when already selected).
 *
 * Purpose: Prevents adding embarked cargo to the active selection set from map or sidebar controls.
 * When to use: At the start of click/toggle handlers before mutating `selectedUnitIds`.
 * Expected outcome: True when the unit is embarked and not already in the selection list.
 * Exceptions: None.
 */
export function shouldBlockEmbarkedLandUnitSelect(unitId: string): boolean {
  if (!isEmbarkedLandUnitBlockedForSelection(unitId)) return false;
  return !S.selectedUnitIds.includes(unitId);
}

/**
 * Defines the `reconcileSelectionToCurrentState` function shape (export function reconcileSelectionToCurrentState(): void).

 * Purpose: Supports maintainability by documenting why `reconcileSelectionToCurrentState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function reconcileSelectionToCurrentState(): void {
  if (S.tacticalBattleSnapshot) {
    const validHumanUnitIds = new Set(
      S.tacticalBattleSnapshot.subUnits
        .filter((u) => u.player === HUMAN_SEAT_ID)
        .map((u) => u.id)
    );
    S.selectedUnitIds = S.selectedUnitIds.filter(
      (id) => validHumanUnitIds.has(id) && !isEmbarkedLandUnitBlockedForSelection(id)
    );
    return;
  }
  if (!S.gameState) {
    S.selectedUnitIds = [];
    return;
  }
  const validHumanUnitIds = new Set(S.gameState.units.filter((u) => u.player === HUMAN_SEAT_ID).map((u) => u.id));
  S.selectedUnitIds = S.selectedUnitIds.filter((id) => {
    if (!validHumanUnitIds.has(id)) return false;
    return !isEmbarkedLandUnitBlockedForSelection(id);
  });
}

/**
 * Replaces the active human unit selection and clears order-draft chrome when empty.
 *
 * Purpose: Single mutation point for `selectedUnitIds` so map, sidebar, and mode
 * toggles stay consistent; also dismisses map chrome toasts when the player’s
 * non-empty selection set changes (planning initiation).
 * When to use: Any path that sets, adds, removes, toggles, or clears unit selection.
 * Expected outcome: Selection is uniqued and reconciled to living human units; empty
 * selection clears hex/hover/ranged/air draft state; a changed non-empty set hides
 * planning chrome toasts without suppressing later toast shows.
 * Exceptions: None.
 */
export function replaceSelection(unitIds: string[]): void {
  const previousIds = [...S.selectedUnitIds];
  const unique = [...new Set(unitIds)];
  S.selectedUnitIds = unique;
  reconcileSelectionToCurrentState();
  if (S.selectedUnitIds.length === 0) {
    S.selectedHexIndex = null;
    S.hoverRoutePreview = null;
    S.hoverPreviewRequestSeq++;
    S.rangedModeActive = false;
    S.airStrikeModeActive = false;
    S.missileLaunchModeActive = false;
    return;
  }
  if (selectionUnitIdSetsDiffer(previousIds, S.selectedUnitIds)) {
    hidePlanningChromeToasts();
  }
  const tb = S.tacticalBattleSnapshot;
  const primary = tb ? tb.subUnits.find((u) => u.id === S.selectedUnitIds[0]) : S.gameState?.units.find((u) => u.id === S.selectedUnitIds[0]);
  S.selectedHexIndex = primary?.h3Index ?? null;
}

/**
 * Defines the `addUnitsToSelection` function shape (export function addUnitsToSelection(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `addUnitsToSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function addUnitsToSelection(unitIds: string[]): void {
  replaceSelection([...S.selectedUnitIds, ...unitIds]);
}

/**
 * Defines the `removeUnitsFromSelection` function shape (export function removeUnitsFromSelection(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `removeUnitsFromSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function removeUnitsFromSelection(unitIds: string[]): void {
  const remove = new Set(unitIds);
  replaceSelection(S.selectedUnitIds.filter((id) => !remove.has(id)));
}

/**
 * Defines the `toggleUnitSelection` function shape (export function toggleUnitSelection(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `toggleUnitSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function toggleUnitSelection(unitId: string): void {
  if (S.selectedUnitIds.includes(unitId)) {
    removeUnitsFromSelection([unitId]);
  } else {
    addUnitsToSelection([unitId]);
  }
}

/**
 * Defines the `clearSelection` function shape (export function clearSelection(): void).

 * Purpose: Supports maintainability by documenting why `clearSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearSelection(): void {
  replaceSelection([]);
}

/**
 * Clears the live selection and the gesture snapshot while leaving queued orders alone.
 *
 * Purpose: Right-click and an ineligible empty air double-click must drop the same chrome, and neither
 * may discard marches, ferries, or other drafts the player already queued.
 * When to use: Those two gestures only. A successful order commit keeps using `clearCommittedOrderDraftState`.
 * Expected outcome: Selection, gesture snapshot, selected hex, hover preview, and both targeting modes are
 * clear; `clearSelection` covers all but the snapshot. Pending order arrays are untouched. Callers cancel
 * the deferred select and callout timers themselves.
 * Exceptions: None.
 */
export function clearMapSelectionChrome(): void {
  clearSelection();
  S.selectedUnitIdsAtMouseDown = [];
  S.gestureSelectionSnapshotAtMs = 0;
}

/**
 * Defines the `getVisibleHexSet` function shape (export function getVisibleHexSet(state: GameStateSnapshot | null): Set<string>).

 * Purpose: Supports maintainability by documenting why `getVisibleHexSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getVisibleHexSet(state: GameStateSnapshot | null): Set<string> {
  if (!state) return new Set<string>();
  if (!Array.isArray(state.visibleHexes)) return new Set(state.hexes.map((h) => h.h3Index));
  return new Set(state.visibleHexes);
}

/**
 * Defines the `getExploredHexSet` function shape (export function getExploredHexSet(state: GameStateSnapshot | null): Set<string>).

 * Purpose: Supports maintainability by documenting why `getExploredHexSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getExploredHexSet(state: GameStateSnapshot | null): Set<string> {
  if (!state) return new Set<string>();
  if (!Array.isArray(state.exploredHexes)) return new Set(state.hexes.map((h) => h.h3Index));
  return new Set(state.exploredHexes);
}

/**
 * Defines the `isHexExploredByPlayer` function shape (export function isHexExploredByPlayer(h3Index: string): boolean).

 * Purpose: Supports maintainability by documenting why `isHexExploredByPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isHexExploredByPlayer(h3Index: string): boolean {
  if (!S.gameState) return false;
  const explored = getExploredHexSet(S.gameState);
  return explored.has(h3Index);
}
