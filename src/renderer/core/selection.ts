import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from './state';

export function reconcileSelectionToCurrentState(): void {
  if (!S.gameState) {
    S.selectedUnitIds = [];
    return;
  }
  const validHumanUnitIds = new Set(S.gameState.units.filter((u) => u.player === 'human').map((u) => u.id));
  S.selectedUnitIds = S.selectedUnitIds.filter((id) => validHumanUnitIds.has(id));
}

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
  const primary = S.gameState?.units.find((u) => u.id === S.selectedUnitIds[0]);
  S.selectedHexIndex = primary?.h3Index ?? null;
}

export function addUnitsToSelection(unitIds: string[]): void {
  replaceSelection([...S.selectedUnitIds, ...unitIds]);
}

export function removeUnitsFromSelection(unitIds: string[]): void {
  const remove = new Set(unitIds);
  replaceSelection(S.selectedUnitIds.filter((id) => !remove.has(id)));
}

export function toggleUnitSelection(unitId: string): void {
  if (S.selectedUnitIds.includes(unitId)) {
    removeUnitsFromSelection([unitId]);
  } else {
    addUnitsToSelection([unitId]);
  }
}

export function clearSelection(): void {
  replaceSelection([]);
}

export function getVisibleHexSet(state: GameStateSnapshot | null): Set<string> {
  if (!state) return new Set<string>();
  if (!Array.isArray(state.visibleHexes)) return new Set(state.hexes.map((h) => h.h3Index));
  return new Set(state.visibleHexes);
}

export function getExploredHexSet(state: GameStateSnapshot | null): Set<string> {
  if (!state) return new Set<string>();
  if (!Array.isArray(state.exploredHexes)) return new Set(state.hexes.map((h) => h.h3Index));
  return new Set(state.exploredHexes);
}

export function isHexExploredByPlayer(h3Index: string): boolean {
  if (!S.gameState) return false;
  const explored = getExploredHexSet(S.gameState);
  return explored.has(h3Index);
}
