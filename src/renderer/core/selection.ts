import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from './state';

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
        .filter((u) => u.player === 'human')
        .map((u) => u.id)
    );
    S.selectedUnitIds = S.selectedUnitIds.filter((id) => validHumanUnitIds.has(id));
    return;
  }
  if (!S.gameState) {
    S.selectedUnitIds = [];
    return;
  }
  const validHumanUnitIds = new Set(S.gameState.units.filter((u) => u.player === 'human').map((u) => u.id));
  S.selectedUnitIds = S.selectedUnitIds.filter((id) => validHumanUnitIds.has(id));
}

/**
 * Defines the `replaceSelection` function shape (export function replaceSelection(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `replaceSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replaceSelection(unitIds: string[]): void {
  const unique = [...new Set(unitIds)];
  S.selectedUnitIds = unique;
  reconcileSelectionToCurrentState();
  if (S.selectedUnitIds.length === 0) {
    S.selectedHexIndex = null;
    S.hoverRoutePreview = null;
    S.hoverPreviewRequestSeq++;
    S.rangedModeActive = false;
    S.airStrikeModeActive = false;
    return;
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
