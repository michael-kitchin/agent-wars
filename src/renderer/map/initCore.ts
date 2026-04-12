import type { GameStateSnapshot, Res4TerrainOverrideRow } from '../../shared/ipcTypes';
import { RANGED_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { panMapOneRes1Hex, shouldIgnoreGlobalKeydown } from './mapUtils';
import { rendererSharedState as S } from '../core/state';
import { getActiveTerrainStyleBasemapId, renderTerrainLegend } from '../rendering/terrainVisualStyles';
import { getMainLeafletMap, initWorldLeafletMaps, setMainBasemapByProviderId, setMainBasemapFilter } from './worldLeafletMap';

/**
 * Documents the `InitCoreDeps` interface as a named contract surface (interface InitCoreDeps).

 * Purpose: Supports maintainability by documenting why `InitCoreDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface InitCoreDeps {
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `requestRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestRedraw: () => void;
    /**
   * Specifies the contract for the `resizeAndRedraw` member (resizeAndRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `resizeAndRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
resizeAndRedraw: () => void;
    /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSidebar: () => void;
    /**
   * Specifies the contract for the `updateGameStateSidebar` member (updateGameStateSidebar: (state: GameStateSnapshot | null) => void;).

   * Contract: Describes stable behavior for callers of `updateGameStateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateGameStateSidebar: (state: GameStateSnapshot | null) => void;
    /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHumanStandingOrders: () => Promise<void>;
    /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatePendingOrdersSidebar: () => void;
    /**
   * Specifies the contract for the `initOpenRouterUI` member (initOpenRouterUI: () => void;).

   * Contract: Describes stable behavior for callers of `initOpenRouterUI` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
initOpenRouterUI: () => void;
    /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateRangedSidebar: () => void;
    /**
   * Specifies the contract for the `initNewGameButton` member (initNewGameButton: () => void;).

   * Contract: Describes stable behavior for callers of `initNewGameButton` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
initNewGameButton: () => void;
    /**
   * Specifies the contract for the `updateReadyButtonState` member (updateReadyButtonState: () => void;).

   * Contract: Describes stable behavior for callers of `updateReadyButtonState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateReadyButtonState: () => void;
    /**
   * Specifies the contract for the `refreshHoverRoutePreview` member (refreshHoverRoutePreview: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHoverRoutePreview` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHoverRoutePreview: () => Promise<void>;
    /**
   * Specifies the contract for the `applyGameStateSnapshot` member (applyGameStateSnapshot: ( nextState: GameStateSnapshot, options?: { refreshStandingOrders?: boolean; updateGameStateSidebarUi?: boolean;).

   * Contract: Describes stable behavior for callers of `applyGameStateSnapshot` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
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
    /**
   * Specifies the contract for the `applyRes4TerrainOverrides` member (applyRes4TerrainOverrides: (rows: Res4TerrainOverrideRow[]) => void;).

   * Contract: Describes stable behavior for callers of `applyRes4TerrainOverrides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyRes4TerrainOverrides: (rows: Res4TerrainOverrideRow[]) => void;
    /**
   * Specifies the contract for the `hideBuildPopup` member (hideBuildPopup: () => void;).

   * Contract: Describes stable behavior for callers of `hideBuildPopup` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideBuildPopup: () => void;
    /**
   * Specifies the contract for the `hideStackCallout` member (hideStackCallout: () => void;).

   * Contract: Describes stable behavior for callers of `hideStackCallout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideStackCallout: () => void;
    /**
   * Specifies the contract for the `applyModifierDrivenPopoverCloseRules` member (applyModifierDrivenPopoverCloseRules: (reason: 'ctrl_pressed' | 'ctrl_released' | 'window_blur') => void;).

   * Contract: Describes stable behavior for callers of `applyModifierDrivenPopoverCloseRules` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyModifierDrivenPopoverCloseRules: (reason: 'ctrl_pressed' | 'ctrl_released' | 'window_blur') => void;
    /**
   * Specifies the contract for the `isMapInspectionModeHeld` member (isMapInspectionModeHeld: () => boolean;).

   * Contract: Describes stable behavior for callers of `isMapInspectionModeHeld` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isMapInspectionModeHeld: () => boolean;
    /**
   * Specifies the contract for the `isBuildPopupOrEntryTarget` member (isBuildPopupOrEntryTarget: (target: EventTarget | null) => boolean;).

   * Contract: Describes stable behavior for callers of `isBuildPopupOrEntryTarget` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isBuildPopupOrEntryTarget: (target: EventTarget | null) => boolean;
    /**
   * Specifies the contract for the `isBuildQueueSelectInPopupFocused` member (isBuildQueueSelectInPopupFocused: () => boolean;).

   * Contract: Describes stable behavior for callers of `isBuildQueueSelectInPopupFocused` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isBuildQueueSelectInPopupFocused: () => boolean;
    /**
   * Specifies the contract for the `isStackCalloutTargetInsideDialog` member (isStackCalloutTargetInsideDialog: (target: EventTarget | null) => boolean;).

   * Contract: Describes stable behavior for callers of `isStackCalloutTargetInsideDialog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isStackCalloutTargetInsideDialog: (target: EventTarget | null) => boolean;
    /**
   * Specifies the contract for the `clearTerrainTooltipTimer` member (clearTerrainTooltipTimer: () => void;).

   * Contract: Describes stable behavior for callers of `clearTerrainTooltipTimer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearTerrainTooltipTimer: () => void;
    /**
   * Specifies the contract for the `hideTerrainTooltipVisual` member (hideTerrainTooltipVisual: () => void;).

   * Contract: Describes stable behavior for callers of `hideTerrainTooltipVisual` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideTerrainTooltipVisual: () => void;
    /**
   * Specifies the contract for the `showBuildPopup` member (showBuildPopup: (h3Index: string, clientX: number, clientY: number) => void;).

   * Contract: Describes stable behavior for callers of `showBuildPopup` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showBuildPopup: (h3Index: string, clientX: number, clientY: number) => void;
    /**
   * Specifies the contract for the `updateMapInteractionCursor` member (updateMapInteractionCursor: (clientX: number, clientY: number) => void;).

   * Contract: Describes stable behavior for callers of `updateMapInteractionCursor` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateMapInteractionCursor: (clientX: number, clientY: number) => void;
    /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).

   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
redraw: () => void;
}

/**
 * Defines the `wireInitCore` function shape (export function wireInitCore(deps: InitCoreDeps): void).

 * Purpose: Supports maintainability by documenting why `wireInitCore` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
      const tb = S.tacticalBattleSnapshot;
      const selectedUnits = tb
        ? S.selectedUnitIds
            .map((id) => tb.subUnits.find((u) => u.id === id))
            .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human')
        : S.selectedUnitIds
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

  const tacticalEntryLayer = document.getElementById('tactical-entry-layer');
  tacticalEntryLayer?.addEventListener('pointerover', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest('.tactical-entry-btn')) return;
    S.tacticalEntryButtonPointerInside = true;
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
  });
  tacticalEntryLayer?.addEventListener('pointerout', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest('.tactical-entry-btn')) return;
    const next = e.relatedTarget as Element | null;
    if (next?.closest('.tactical-entry-btn')) return;
    S.tacticalEntryButtonPointerInside = false;
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
