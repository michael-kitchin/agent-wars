import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { TERRAIN_TOOLTIP_DELAY_MS } from '../core/constants';
import { hitTestHexAtContainerPixel } from './mapUtils';
import { rendererSharedState as S } from '../core/state';
import { getMainLeafletMap } from './worldLeafletMap';

interface MainMapInteractionDeps {
  clearTerrainTooltipTimer: () => void;
  hideTerrainTooltipVisual: () => void;
  shouldSuppressTerrainTooltip: () => boolean;
  requestRedraw: () => void;
  refreshHoverRoutePreview: () => Promise<void>;
  detailHitAtClientPixel: (clientX: number, clientY: number, mapHexSet: Set<string>) => string | null;
  terrainStateForPointer: (clientX: number, clientY: number, fallbackRes1H3: string | null) => any;
  namingLookupTargetForPointer: (clientX: number, clientY: number, fallbackRes1H3: string | null) => any;
  showTerrainTooltip: (clientX: number, clientY: number, state: any, namingTarget: any) => Promise<void>;
  clearSidebarError: () => void;
  formatTargetingValidationReason: (reason: string | undefined, fallbackMessage: string) => string;
  showMapToast: (message: string, options?: { isError?: boolean }) => void;
  replacePendingAirStrikesForSelected: (selectedIds: string[], targetH3Index: string, targetType: any) => void;
  replacePendingRangedAttacksForSelected: (selectedIds: string[], targetH3Index: string) => void;
  clearSelection: () => void;
  hideStackCallout: () => void;
  updateSidebar: () => void;
  updateRangedSidebar: () => void;
  redraw: () => void;
  getUnitsForDrawWithMovingIds: (state: GameStateSnapshot) => {
    unitsToDraw: GameStateSnapshot['units'];
    movingIds: Set<string> | undefined;
  };
  tryHandleBuildEntryAtClientXY: (clientX: number, clientY: number) => boolean;
  containerPixelHitsDrawnUnitIcon: (px: number, py: number, h3Index: string, unitCount: number) => boolean;
  showStackCallout: (units: GameStateSnapshot['units'], clientX: number, clientY: number) => void;
  getUnitAtHex: (h3Index: string) => GameStateSnapshot['units'][0] | null;
  toggleUnitSelection: (unitId: string) => void;
  replaceSelection: (unitIds: string[]) => void;
  getPrimarySelectedUnitId: () => string | null;
  updatePendingOrdersSidebar: () => void;
  replacePendingFerryOrdersForSelected: (selectedIds: string[], destinationH3Index: string) => void;
  clearCommittedOrderDraftState: () => void;
  refreshHumanStandingOrders: () => Promise<void>;
}

export function wireMainMapInteractions(deps: MainMapInteractionDeps): void {
  const mainMapEl = document.getElementById('main-map');
  if (!mainMapEl) return;

  function clientXYToHit(clientX: number, clientY: number): string | null {
    if (!S.gameState) return null;
    const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    if (!map) return null;
    const rect = map.getContainer().getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const set = new Set(S.gameState.hexes.map((h) => h.h3Index));
    return hitTestHexAtContainerPixel(x, y, set);
  }

  function getSelectedHumanUnitsAtMouseDown(state: GameStateSnapshot): GameStateSnapshot['units'] {
    return S.selectedUnitIdsAtMouseDown
      .map((id) => state.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
  }

  async function commitGroupedAirFerryOrders(selectedIds: string[], destinationH3: string): Promise<boolean> {
    if (!window.gameApi?.validateGroupFerryTarget) return false;
    const validation = await window.gameApi.validateGroupFerryTarget({
      unitIds: selectedIds,
      destinationH3Index: destinationH3,
    });
    if (!validation.success) {
      deps.showMapToast(validation.reason ?? 'Selected air units cannot ferry to that destination.', { isError: true });
      return true;
    }
    deps.replacePendingFerryOrdersForSelected(selectedIds, destinationH3);
    deps.clearCommittedOrderDraftState();
    deps.updatePendingOrdersSidebar();
    deps.updateSidebar();
    deps.redraw();
    return true;
  }

  async function commitGroupedMarchOrders(selectedIds: string[], destinationH3: string): Promise<boolean> {
    if (!window.gameApi?.assignHumanMarchOrders) return false;
    const assign = await window.gameApi.assignHumanMarchOrders({
      unitIds: selectedIds,
      destinationH3Index: destinationH3,
    });
    if (!assign.success) {
      deps.showMapToast(assign.reason ?? 'Failed to assign movement order.', { isError: true });
      return true;
    }
    deps.clearCommittedOrderDraftState();
    await deps.refreshHumanStandingOrders();
    deps.updatePendingOrdersSidebar();
    deps.updateSidebar();
    deps.redraw();
    return true;
  }

  mainMapEl.addEventListener('pointermove', (e) => {
    S.lastPointerClientX = e.clientX;
    S.lastPointerClientY = e.clientY;
    if (deps.shouldSuppressTerrainTooltip()) {
      deps.clearTerrainTooltipTimer();
      deps.hideTerrainTooltipVisual();
    }
    const mapHexSet = new Set((S.gameState?.hexes ?? []).map((h) => h.h3Index));
    const hit = clientXYToHit(e.clientX, e.clientY);
    const detailHit = deps.detailHitAtClientPixel(e.clientX, e.clientY, mapHexSet);

    if (hit !== S.hoveredHexH3 || detailHit !== S.hoveredDetailHexH3) {
      deps.clearTerrainTooltipTimer();
      deps.hideTerrainTooltipVisual();
      S.hoveredHexH3 = hit;
      S.hoveredDetailHexH3 = detailHit;
      void deps.refreshHoverRoutePreview();
      deps.requestRedraw();
      if (hit && !deps.shouldSuppressTerrainTooltip()) {
        const targetHex = hit;
        S.terrainTooltipDelayTimer = setTimeout(() => {
          S.terrainTooltipDelayTimer = null;
          if (S.hoveredHexH3 !== targetHex || !S.gameState) return;
          if (deps.shouldSuppressTerrainTooltip()) return;
          const state = deps.terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, targetHex);
          const namingTarget = deps.namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, targetHex);
          void deps.showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
        }, TERRAIN_TOOLTIP_DELAY_MS);
      }
      return;
    }

    const tipFollow = document.getElementById('hex-tooltip');
    if (
      !deps.shouldSuppressTerrainTooltip() &&
      tipFollow &&
      !tipFollow.classList.contains('hidden') &&
      hit
    ) {
      const state = deps.terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, hit);
      const namingTarget = deps.namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, hit);
      void deps.showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
    }
  });

  mainMapEl.addEventListener('pointerleave', (e) => {
    const next = e.relatedTarget;
    if (next instanceof Node) {
      const buildEntry = document.getElementById('build-entry-layer');
      const buildPopup = document.getElementById('build-popup');
      if ((buildEntry && buildEntry.contains(next)) || (buildPopup && buildPopup.contains(next))) {
        return;
      }
    }
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
    if (S.hoveredHexH3 !== null || S.hoveredDetailHexH3 !== null) {
      S.hoveredHexH3 = null;
      S.hoveredDetailHexH3 = null;
      S.hoverRoutePreview = null;
      deps.requestRedraw();
    }
  });

  mainMapEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    S.selectedUnitIdsAtMouseDown = [...S.selectedUnitIds];
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
  });

  mainMapEl.addEventListener('click', async (e) => {
    const hit = clientXYToHit(e.clientX, e.clientY);
    S.selectedHexIndex = hit;
    deps.clearSidebarError();

    if (hit && S.airStrikeModeActive && S.selectedUnitIds.length > 0 && S.gameState) {
      if (!window.gameApi?.validateGroupAirStrikeTarget) return;
      const selectedIds = [...S.selectedUnitIds];
      const validation = await window.gameApi.validateGroupAirStrikeTarget({
        unitIds: selectedIds,
        targetH3Index: hit,
        targetType: S.airStrikeTargetType,
      });
      if (!validation.success) {
        deps.showMapToast(deps.formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.'), {
          isError: true,
        });
        S.airStrikeModeActive = false;
        S.hoverRoutePreview = null;
        S.hoverPreviewRequestSeq++;
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
      deps.replacePendingAirStrikesForSelected(selectedIds, hit, S.airStrikeTargetType);
      S.airStrikeModeActive = false;
      deps.clearSelection();
      S.hoverRoutePreview = null;
      S.hoverPreviewRequestSeq++;
      deps.updateRangedSidebar();
      deps.hideStackCallout();
      deps.updateSidebar();
      deps.redraw();
      return;
    }

    if (hit && S.rangedModeActive && S.selectedUnitIds.length > 0 && S.gameState) {
      if (!window.gameApi?.validateGroupRangedTarget) return;
      const selectedIds = [...S.selectedUnitIds];
      const validation = await window.gameApi.validateGroupRangedTarget({ unitIds: selectedIds, targetH3Index: hit });
      if (!validation.success) {
        deps.showMapToast(deps.formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.'), {
          isError: true,
        });
        S.rangedModeActive = false;
        S.hoverRoutePreview = null;
        S.hoverPreviewRequestSeq++;
        deps.updateRangedSidebar();
        deps.redraw();
        return;
      }
      deps.replacePendingRangedAttacksForSelected(selectedIds, hit);
      S.rangedModeActive = false;
      deps.clearSelection();
      S.hoverRoutePreview = null;
      S.hoverPreviewRequestSeq++;
      deps.updateRangedSidebar();
      deps.hideStackCallout();
      deps.updateSidebar();
      deps.redraw();
      return;
    }

    const mapForClick = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    const clickRect = mapForClick?.getContainer().getBoundingClientRect();
    const px = clickRect ? e.clientX - clickRect.left : 0;
    const py = clickRect ? e.clientY - clickRect.top : 0;
    const { unitsToDraw, movingIds } = S.gameState
      ? deps.getUnitsForDrawWithMovingIds(S.gameState)
      : { unitsToDraw: [] as GameStateSnapshot['units'], movingIds: undefined as Set<string> | undefined };

    if (deps.tryHandleBuildEntryAtClientXY(e.clientX, e.clientY)) {
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;
    }

    const unitsAtHit = hit ? unitsToDraw.filter((u) => u.h3Index === hit && !movingIds?.has(u.id)) : [];
    const isStack = unitsAtHit.length >= 2;
    const isLoneAi = unitsAtHit.length === 1 && unitsAtHit[0]?.player !== 'human';
    const stackIconHit = !!hit && unitsAtHit.length > 0 && deps.containerPixelHitsDrawnUnitIcon(px, py, hit, unitsAtHit.length);
    if (hit && (isStack || isLoneAi) && stackIconHit) {
      S.ctrlKeyActive = e.ctrlKey;
      deps.showStackCallout(unitsAtHit, e.clientX, e.clientY);
      deps.updateSidebar();
      deps.updateRangedSidebar();
      deps.redraw();
      return;
    }

    deps.hideStackCallout();
    if (hit) {
      const unit = deps.getUnitAtHex(hit);
      const drawnAtHit = unitsToDraw.filter((u) => u.h3Index === hit && !movingIds?.has(u.id));
      const unitIconHit = drawnAtHit.length > 0 && deps.containerPixelHitsDrawnUnitIcon(px, py, hit, drawnAtHit.length);
      if (unit?.player === 'human' && unitIconHit) {
        if (e.ctrlKey) {
          if (S.pendingSelectTimeout !== null) {
            clearTimeout(S.pendingSelectTimeout);
            S.pendingSelectTimeout = null;
          }
          deps.toggleUnitSelection(unit.id);
          void deps.refreshHoverRoutePreview();
        } else if (S.pendingSelectTimeout !== null) {
          clearTimeout(S.pendingSelectTimeout);
          S.pendingSelectTimeout = null;
        } else {
          const unitIdToSelect = unit.id;
          S.pendingSelectTimeout = setTimeout(() => {
            deps.replaceSelection([unitIdToSelect]);
            void deps.refreshHoverRoutePreview();
            S.pendingSelectTimeout = null;
            deps.updateSidebar();
            deps.updateRangedSidebar();
            deps.redraw();
          }, 250);
        }
      } else if (unit?.player === 'human' && !unitIconHit) {
        if (S.pendingSelectTimeout !== null) {
          clearTimeout(S.pendingSelectTimeout);
          S.pendingSelectTimeout = null;
        }
      } else if (deps.getPrimarySelectedUnitId() && hit !== S.gameState?.units.find((u) => u.id === deps.getPrimarySelectedUnitId())?.h3Index) {
        if (S.pendingSelectTimeout !== null) {
          clearTimeout(S.pendingSelectTimeout);
          S.pendingSelectTimeout = null;
        }
      } else {
        if (S.pendingSelectTimeout !== null) {
          clearTimeout(S.pendingSelectTimeout);
          S.pendingSelectTimeout = null;
        }
        deps.clearSelection();
        S.hoverRoutePreview = null;
      }
    } else {
      if (S.pendingSelectTimeout !== null) {
        clearTimeout(S.pendingSelectTimeout);
        S.pendingSelectTimeout = null;
      }
      deps.clearSelection();
      S.hoverRoutePreview = null;
    }

    deps.updateSidebar();
    deps.updateRangedSidebar();
    deps.redraw();
  });

  mainMapEl.addEventListener('dblclick', async (e) => {
    if (S.pendingSelectTimeout !== null) {
      clearTimeout(S.pendingSelectTimeout);
      S.pendingSelectTimeout = null;
    }
    if (!S.gameState) return;
    const state = S.gameState;
    if (S.rangedModeActive || S.airStrikeModeActive) return;
    const hit = clientXYToHit(e.clientX, e.clientY);
    const destinationH3 = S.selectedHexIndex ?? S.hoveredHexH3 ?? hit;
    if (!destinationH3 || S.selectedUnitIdsAtMouseDown.length === 0) return;

    const selectedAtMouseDown = getSelectedHumanUnitsAtMouseDown(state);
    if (selectedAtMouseDown.length === 0) return;
    const selectedIds = selectedAtMouseDown.map((unit) => unit.id);
    if (selectedAtMouseDown.every((unit) => unit.h3Index === destinationH3)) return;
    const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === 'air');
    const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== 'air');
    if (hasAirSelection && hasNonAirSelection) {
      deps.showMapToast('Cannot issue grouped movement for mixed air and non-air units.', { isError: true });
      return;
    }

    if (hasAirSelection) {
      if (await commitGroupedAirFerryOrders(selectedIds, destinationH3)) return;
      return;
    }

    await commitGroupedMarchOrders(selectedIds, destinationH3);
  });

  mainMapEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (S.selectedUnitIds.length === 0 && !S.hoverRoutePreview) return;
    deps.clearSelection();
    S.selectedUnitIdsAtMouseDown = [];
    S.selectedHexIndex = null;
    S.hoverRoutePreview = null;
    deps.updateSidebar();
    deps.updateRangedSidebar();
    deps.redraw();
  });
}
