import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { RANGED_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { panMapOneRes1Hex, shouldIgnoreGlobalKeydown } from './mapUtils';
import { rendererSharedState as S } from '../core/state';
import { getActiveTerrainStyleBasemapId, renderTerrainLegend } from '../rendering/terrainVisualStyles';
import { getMainLeafletMap, initWorldLeafletMaps, setMainBasemapByProviderId, setMainBasemapFilter } from './worldLeafletMap';

interface InitCoreDeps {
  requestRedraw: () => void;
  resizeAndRedraw: () => void;
  updateSidebar: () => void;
  updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
  refreshHumanStandingOrders: () => Promise<void>;
  updatePendingOrdersSidebar: () => void;
  initOpenRouterUI: () => void;
  updateRangedSidebar: () => void;
  initNewGameButton: () => void;
  updateReadyButtonState: () => void;
  refreshHoverRoutePreview: () => Promise<void>;
  applyGameStateSnapshot: (
    nextState: GameStateSnapshot,
    options?: {
      refreshStandingOrders?: boolean;
      updateGameStateSidebarUi?: boolean;
      updateSelectionUi?: boolean;
      updateGameOverUi?: boolean;
      updateReadyButton?: boolean;
      refreshBuildPopup?: boolean;
      redraw?: boolean;
    }
  ) => Promise<void>;
  applyRes4TerrainOverrides: (rows: Array<any>) => void;
  hideBuildPopup: () => void;
  hideStackCallout: () => void;
  applyModifierDrivenPopoverCloseRules: (reason: 'ctrl_pressed' | 'ctrl_released' | 'window_blur') => void;
  isMapInspectionModeHeld: () => boolean;
  isBuildPopupOrEntryTarget: (target: EventTarget | null) => boolean;
  isBuildQueueSelectInPopupFocused: () => boolean;
  isStackCalloutTargetInsideDialog: (target: EventTarget | null) => boolean;
  clearTerrainTooltipTimer: () => void;
  hideTerrainTooltipVisual: () => void;
  showBuildPopup: (h3Index: string, clientX: number, clientY: number) => void;
  updateMapInteractionCursor: (clientX: number, clientY: number) => void;
  redraw: () => void;
}

export function wireInitCore(deps: InitCoreDeps): void {
  try {
    initWorldLeafletMaps('main-map', 'minimap', () => deps.requestRedraw(), getActiveTerrainStyleBasemapId());
    setMainBasemapFilter('');
    const leg = document.getElementById('terrain-legend');
    if (leg) {
      renderTerrainLegend(leg, {
        onStyleChanged: () => {
          setMainBasemapByProviderId(getActiveTerrainStyleBasemapId());
          deps.requestRedraw();
        },
      });
    }
  } catch (err) {
    console.error('Map init failed:', err);
  }
  deps.resizeAndRedraw();
  deps.updateSidebar();
  deps.updateGameStateSidebar(null);
  void deps.refreshHumanStandingOrders().then(() => deps.updatePendingOrdersSidebar());
  deps.updatePendingOrdersSidebar();
  deps.initOpenRouterUI();
  deps.updateRangedSidebar();
  deps.initNewGameButton();
  deps.updateReadyButtonState();

  document.getElementById('ranged-attack-btn')?.addEventListener('click', () => {
    if (S.airStrikeModeActive) {
      S.airStrikeModeActive = false;
      void deps.refreshHoverRoutePreview();
    } else if (S.rangedModeActive) {
      S.rangedModeActive = false;
      void deps.refreshHoverRoutePreview();
    } else if (S.selectedUnitIds.length > 0 && S.gameState) {
      const state = S.gameState;
      const selectedUnits = S.selectedUnitIds
        .map((id) => state.units.find((u) => u.id === id))
        .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
      const allAir = selectedUnits.length > 0 && selectedUnits.every((unit) => unit.unitType === 'air');
      const allHaveRanged =
        selectedUnits.length > 0 && selectedUnits.every((unit) => (RANGED_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 0) >= 1);
      if (allAir) {
        S.airStrikeModeActive = true;
        S.rangedModeActive = false;
        S.hoverPreviewRequestSeq++;
        S.hoverRoutePreview = null;
      } else if (allHaveRanged) {
        S.rangedModeActive = true;
        S.airStrikeModeActive = false;
        S.hoverPreviewRequestSeq++;
        S.hoverRoutePreview = null;
      }
    }
    deps.updateRangedSidebar();
    deps.redraw();
  });
  document.getElementById('air-strike-target-type')?.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target) return;
    const value = target.value;
    if (value === 'units' || value === 'urban' || value === 'airport' || value === 'seaport') {
      S.airStrikeTargetType = value;
    }
  });
  document.getElementById('air-strike-cancel-btn')?.addEventListener('click', () => {
    S.airStrikeModeActive = false;
    deps.updateRangedSidebar();
    deps.redraw();
  });

  if (window.gameApi) {
    window.gameApi
      .getGameState()
      .then(async (raw) => {
        const state = raw as GameStateSnapshot;
        await deps.applyGameStateSnapshot(state, {
          refreshStandingOrders: true,
          updateGameStateSidebarUi: true,
          updateSelectionUi: true,
          updateGameOverUi: true,
          updateReadyButton: true,
          refreshBuildPopup: true,
          redraw: true,
        });
      })
      .catch((err) => console.error('getGameState failed:', err));
    window.gameApi
      .getRes4TerrainOverrides()
      .then((rows) => {
        deps.applyRes4TerrainOverrides(rows);
        deps.requestRedraw();
      })
      .catch((err) => console.error('getRes4TerrainOverrides failed:', err));
  }

  window.addEventListener('resize', () => {
    deps.resizeAndRedraw();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const buildPopup = document.getElementById('build-popup');
      if (buildPopup && !buildPopup.classList.contains('hidden')) {
        e.preventDefault();
        deps.hideBuildPopup();
        return;
      }
      const stackCallout = document.getElementById('stack-callout');
      if (stackCallout && !stackCallout.classList.contains('hidden')) {
        e.preventDefault();
        deps.hideStackCallout();
        return;
      }
    }
    if (shouldIgnoreGlobalKeydown(e)) return;
    if (e.repeat) return;
    if (e.key === 'Control') {
      S.ctrlKeyActive = true;
      deps.applyModifierDrivenPopoverCloseRules('ctrl_pressed');
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 't') {
      S.hideTerrainFillWhileHeld = true;
      deps.requestRedraw();
      return;
    }
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
      const direction = key === 'w' ? 'north' : key === 'a' ? 'west' : key === 's' ? 'south' : 'east';
      panMapOneRes1Hex(direction);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Control') {
      S.ctrlKeyActive = false;
      deps.applyModifierDrivenPopoverCloseRules('ctrl_released');
      return;
    }
    if (e.key.toLowerCase() === 't') {
      S.hideTerrainFillWhileHeld = false;
      deps.requestRedraw();
    }
  });
  window.addEventListener('blur', () => {
    S.ctrlKeyActive = false;
    deps.applyModifierDrivenPopoverCloseRules('window_blur');
    if (!deps.isMapInspectionModeHeld()) return;
    S.hideTerrainFillWhileHeld = false;
    deps.requestRedraw();
  });
  window.addEventListener(
    'pointerdown',
    (e) => {
      const buildPopup = document.getElementById('build-popup');
      if (!buildPopup || buildPopup.classList.contains('hidden')) return;
      if (deps.isBuildPopupOrEntryTarget(e.target)) return;
      const activeEl = document.activeElement;
      const hadSelectFocused = activeEl instanceof HTMLSelectElement && buildPopup.contains(activeEl);
      if (hadSelectFocused) {
        queueMicrotask(() => {
          const p = document.getElementById('build-popup');
          if (!p || p.classList.contains('hidden')) return;
          if (deps.isBuildQueueSelectInPopupFocused()) return;
          deps.hideBuildPopup();
        });
        return;
      }
      deps.hideBuildPopup();
    },
    true
  );
  window.addEventListener(
    'pointerdown',
    (e) => {
      const stackCallout = document.getElementById('stack-callout');
      if (!stackCallout || stackCallout.classList.contains('hidden')) return;
      if (deps.isStackCalloutTargetInsideDialog(e.target)) return;
      deps.hideStackCallout();
    },
    true
  );
  const buildEntryLayer = document.getElementById('build-entry-layer');
  buildEntryLayer?.addEventListener('pointerover', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest('.build-entry-btn')) return;
    S.buildEntryButtonPointerInside = true;
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
  });
  buildEntryLayer?.addEventListener('pointerout', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest('.build-entry-btn')) return;
    const next = e.relatedTarget as Element | null;
    if (next?.closest('.build-entry-btn')) return;
    S.buildEntryButtonPointerInside = false;
  });
  buildEntryLayer?.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const btn = target?.closest('.build-entry-btn') as HTMLButtonElement | null;
    if (!btn) return;
    e.stopPropagation();
    const h3 = btn.dataset.h3Index;
    if (!h3) return;
    S.selectedHexIndex = h3;
    const popup = document.getElementById('build-popup');
    if (popup && !popup.classList.contains('hidden') && S.buildPopupHexH3 === h3) {
      deps.hideBuildPopup();
      return;
    }
    deps.showBuildPopup(h3, e.clientX, e.clientY);
  });

  const canvasContainer = document.getElementById('canvas-container');
  canvasContainer?.addEventListener('pointermove', (e) => {
    deps.updateMapInteractionCursor(e.clientX, e.clientY);
  });
  canvasContainer?.addEventListener('pointerleave', () => {
    S.lastAppliedMapInteractionCursor = '';
    const map = getMainLeafletMap() as { getContainer?: () => HTMLElement } | null;
    map?.getContainer?.()?.style.removeProperty('cursor');
  });
}
