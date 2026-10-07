import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { selectionSupportButtonMode } from '../../shared/selectionSupportButtonMode';
import { panBindingToDirection, panPhysicalKeyId } from '../../shared/mapKeyboardPanLogic';
import { clearMapKeyboardPan, mapPanKeyDown, mapPanKeyUp } from './mapKeyboardPan';
import { isEditableKeyboardTarget, shouldIgnoreGlobalKeydown } from './mapHelpers';
import { rendererSharedState as S } from '../core/state';
import { hidePlanningChromeToasts } from '../openRouter/openRouterUiHelpers';
import { isHoverOrderPlanningActive } from '../rendering/canvasPreviewPolicy';
import { shouldRefreshStackCalloutOnShiftKeydown } from '../../shared/stackCalloutShiftKeydown';
import { basemapCssFilterForStyle } from '../../shared/basemapStyleLogic';
import { getActiveTerrainStyleBasemapId, getActiveTerrainStyleId, renderTerrainLegend } from '../rendering/terrainVisualStyles';
import {
  clearDeferredStackCalloutTimer,
  clearDeferredStackCalloutTimerForPressAway,
} from './mapClickSelectionPolicy';
import { hideOrderBlockHexTooltip } from './orderBlockHexTooltip';
import { clearOrderEffectsTooltipDwell, hideOrderSlowerHexTooltip } from './orderSlowerHexTooltip';
import { resumeHexTooltipDwellAfterAimingEnds } from './mainMapInteractions';
import { getMainLeafletMap, initWorldLeafletMaps, setMainBasemapByProviderId, setMainBasemapFilter } from './worldLeafletMap';
import { installControlTooltip } from '../chrome/controlTooltip';

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
   * Specifies the contract for the `refreshHoverRoutePreview` member (refreshHoverRoutePreview: (options?: import('../gameplay/tacticalOrders').RefreshHoverRoutePreviewOptions) => Promise<void>;).

   * Contract: Omit options unless forwarding map hover-only blocking tooltip intent.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHoverRoutePreview: (
    options?: import('../gameplay/tacticalOrders').RefreshHoverRoutePreviewOptions
  ) => Promise<void>;
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
   * Specifies the contract for the `applyTacticalTerrainOverrides` member (applyTacticalTerrainOverrides: (rows: import('../../shared/ipcTypes').TacticalTerrainOverrideRow[]) => void;).

   * Contract: Describes stable behavior for callers of `applyTacticalTerrainOverrides` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyTacticalTerrainOverrides: (rows: import('../../shared/ipcTypes').TacticalTerrainOverrideRow[]) => void;
    /**
   * Specifies the contract for the `refreshTacticalTerrainOverridesForRenderer` member (refreshTacticalTerrainOverridesForRenderer: () => Promise<void>;).

   * Contract: Refreshes terrain override rows plus tactical city/road/rail/vector overlay payloads from main.
   * When to use: Initial window load after `gameApi` is ready and whenever gameplay modules request a resync.
   * Expected outcome: Renderer maps stay aligned with main-process caches after the promise settles.
   * Exceptions: None; failures are logged by the implementation without throwing to callers.
   */
refreshTacticalTerrainOverridesForRenderer: () => Promise<void>;
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
   * Specifies the contract for the `applyModifierDrivenPopoverCloseRules` member (applyModifierDrivenPopoverCloseRules: (reason: 'shift_pressed' | 'shift_released' | 'window_blur') => void;).

   * Contract: Describes stable behavior for callers of `applyModifierDrivenPopoverCloseRules` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applyModifierDrivenPopoverCloseRules: (reason: 'shift_pressed' | 'shift_released' | 'window_blur') => void;
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
   * Applies plain/Shift build-entry selection semantics and popup synchronization.
   *
   * Contract: This is the only build-entry membership-changing path for direct DOM clicks.
   * When to use: Build-entry layer click handler after resolving the target H3 index.
   * Expected outcome: Same behavior as the canvas hit-test path.
   * Exceptions: Async mutation failures are reported by the controller.
   */
handleBuildEntryClick: (h3Index: string, clientX: number, clientY: number, shiftKey: boolean) => Promise<void>;
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
 * Starts ranged or air-strike hover planning and drops leftover march order hints.
 *
 * Purpose: Enabling support targeting must not leave a march “Slower:” / “Blocked:” tooltip visible until the next pointermove.
 * When to use: `#ranged-attack-btn` after the selection is known to be all-air (air) or all ranged-capable (ranged).
 * Expected outcome: Mode flags set; both order-preview tooltips hidden; in-flight march preview invalidated; hover refresh starts for the current hex.
 * Exceptions: None.
 */
function beginHoverSupportTargetingMode(deps: InitCoreDeps, mode: 'ranged' | 'air'): void {
  hidePlanningChromeToasts();
  hideOrderBlockHexTooltip();
  hideOrderSlowerHexTooltip();
  S.rangedModeActive = mode === 'ranged';
  S.airStrikeModeActive = mode === 'air';
  S.hoverPreviewRequestSeq++;
  S.hoverRoutePreview = null;
  void deps.refreshHoverRoutePreview();
}

/**
 * Clears terrain tooltip timers/visuals and map hover state when the pointer leaves the map panel or the window loses focus.
 *
 * Purpose: `#hex-tooltip` sits in `#canvas-container`; `pointerleave` on `#main-map` misses moves onto the sidebar or OS chrome.
 * When to use: `canvas-container` pointer routing and `window` blur handling in `wireInitCore`.
 * Expected outcome: Tooltip hides and tactical hover highlights clear the same way as leaving `#main-map` toward excluded overlays.
 * Exceptions: None.
 */
function dismissTerrainTooltipWhenPointerLeavesMapPanel(deps: InitCoreDeps): void {
  hideOrderBlockHexTooltip();
  hideOrderSlowerHexTooltip();
  deps.clearTerrainTooltipTimer();
  deps.hideTerrainTooltipVisual();
  const hadHexHover = S.hoveredHexH3 !== null || S.hoveredDetailHexH3 !== null;
  const hadRoutePreview = S.hoverRoutePreview !== null;
  if (hadHexHover) {
    S.hoveredHexH3 = null;
    S.hoveredDetailHexH3 = null;
  }
  if (hadRoutePreview) {
    S.hoverRoutePreview = null;
  }
  if (hadHexHover || hadRoutePreview) {
    S.hoverPreviewRequestSeq++;
    void deps.refreshHoverRoutePreview();
    deps.requestRedraw();
  }
}

/**
 * Reports whether the tactical battles list is open.
 *
 * Purpose: The window keydown listener calls this so Escape can reach that dialog's Ignore handler without the listener closing a build popup or stack callout first.
 * When to use: At the start of the window keydown Escape branch, before the build-popup query.
 * Expected outcome: True when a dialog named "Tactical battles" is in the document; false otherwise. Does not change the page.
 * Exceptions: None.
 */
function tacticalBattlesDialogIsOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-label="Tactical battles"]') !== null;
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
    installControlTooltip();
    initWorldLeafletMaps('main-map', 'minimap', () => deps.requestRedraw(), getActiveTerrainStyleBasemapId());
    setMainBasemapFilter(basemapCssFilterForStyle(getActiveTerrainStyleId()));
    const leg = document.getElementById('terrain-legend');
    if (leg) {
      renderTerrainLegend(leg, {
        onStyleChanged: () => {
          setMainBasemapByProviderId(getActiveTerrainStyleBasemapId());
          setMainBasemapFilter(basemapCssFilterForStyle(getActiveTerrainStyleId()));
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
      const mode = selectionSupportButtonMode(
        selectedUnits.map((unit) => unit.unitType),
        !!tb
      );
      if (mode === 'strike') {
        beginHoverSupportTargetingMode(deps, 'air');
      } else if (mode === 'ranged') {
        beginHoverSupportTargetingMode(deps, 'ranged');
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
    hideOrderSlowerHexTooltip();
    void deps.refreshHoverRoutePreview();
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
    void deps.refreshTacticalTerrainOverridesForRenderer().catch((err) => {
      console.error('refreshRes4TerrainOverridesForRenderer failed:', err);
    });
  }

  window.addEventListener('resize', () => {
    deps.resizeAndRedraw();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (tacticalBattlesDialogIsOpen()) return;
      const buildPopup = document.getElementById('build-popup');
      if (buildPopup && !buildPopup.classList.contains('hidden')) {
        e.preventDefault();
        deps.hideBuildPopup();
        return;
      }
      // Also drops a callout that is scheduled but has not opened, so dismissing is not undone a
      // moment later by the popup appearing on its own.
      clearDeferredStackCalloutTimer();
      const stackCallout = document.getElementById('stack-callout');
      if (stackCallout && !stackCallout.classList.contains('hidden')) {
        e.preventDefault();
        deps.hideStackCallout();
        return;
      }
    }
    if (shouldIgnoreGlobalKeydown(e)) return;
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
      clearMapKeyboardPan();
      if (e.key === 'Shift') {
        const shiftKeyAlreadyActive = S.shiftKeyActive;
        S.shiftKeyActive = true;
        if (!shiftKeyAlreadyActive) {
          hideOrderBlockHexTooltip();
          clearOrderEffectsTooltipDwell();
          resumeHexTooltipDwellAfterAimingEnds();
        }
        if (shouldRefreshStackCalloutOnShiftKeydown(shiftKeyAlreadyActive)) {
          deps.applyModifierDrivenPopoverCloseRules('shift_pressed');
        }
      }
      return;
    }
    if (e.repeat) return;
    // Ctrl stays here so Ctrl+letter does not pan the map or hide terrain. It is not a game gesture.
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === 't') {
      S.hideTerrainFillWhileHeld = true;
      deps.requestRedraw();
      return;
    }
    const panDirection = panBindingToDirection(e.code, e.key);
    if (panDirection) {
      e.preventDefault();
      mapPanKeyDown(panPhysicalKeyId(e.code, e.key), panDirection);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      S.shiftKeyActive = false;
      deps.applyModifierDrivenPopoverCloseRules('shift_released');
      if (S.hoveredHexH3 !== null) {
        void deps.refreshHoverRoutePreview({ allowBlockingOrderTooltip: true });
      }
      return;
    }
    if (e.key.toLowerCase() === 't') {
      S.hideTerrainFillWhileHeld = false;
      deps.requestRedraw();
      return;
    }
    // Always release by physical id so same-direction overlaps (W + ArrowUp) cannot stick or drop early.
    mapPanKeyUp(panPhysicalKeyId(e.code, e.key));
  });
  window.addEventListener('blur', () => {
    clearMapKeyboardPan();
    dismissTerrainTooltipWhenPointerLeavesMapPanel(deps);
    S.shiftKeyActive = false;
    deps.applyModifierDrivenPopoverCloseRules('window_blur');
    if (!deps.isMapInspectionModeHeld()) return;
    S.hideTerrainFillWhileHeld = false;
    deps.requestRedraw();
  });
  window.addEventListener('focusin', (e) => {
    if (isEditableKeyboardTarget(e.target)) {
      clearMapKeyboardPan();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearMapKeyboardPan();
    }
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
      if (deps.isStackCalloutTargetInsideDialog(e.target)) return;
      // Covers presses that never reach the map click handler, such as the tactical entry control or
      // the sidebar: a callout scheduled elsewhere must not open over wherever the player went instead.
      clearDeferredStackCalloutTimerForPressAway(e.clientX, e.clientY);
      const stackCallout = document.getElementById('stack-callout');
      if (!stackCallout || stackCallout.classList.contains('hidden')) return;
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
    if (isHoverOrderPlanningActive()) return;
    void deps.handleBuildEntryClick(h3, e.clientX, e.clientY, e.shiftKey || S.shiftKeyActive);
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
  /**
   * Dismisses map hover tooltip state when the pointer enters the fixed sidebar.
   *
   * Purpose: `#hex-tooltip` uses `position: fixed` with a higher z-index than `#sidebar`, so the tooltip can
   * paint over the panel while the pointer is already over sidebar targets; `pointerleave` on `#main-map`
   * may not correlate with that visual in all paths (especially after tactical hover fixes).
   * When to use: Wired once at init; runs on every `pointerenter` into the primary right-hand UI column.
   * Expected outcome: Tooltip timer cleared, `#hex-tooltip` hidden, and map hover preview state cleared.
   * Exceptions: None.
   */
  const sidebarPanel = document.getElementById('sidebar');
  sidebarPanel?.addEventListener('pointerenter', () => {
    dismissTerrainTooltipWhenPointerLeavesMapPanel(deps);
  });
  canvasContainer?.addEventListener('pointermove', (e) => {
    deps.updateMapInteractionCursor(e.clientX, e.clientY);
  });
  canvasContainer?.addEventListener('pointerleave', (e) => {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget instanceof Node && e.currentTarget.contains(next)) {
      return;
    }
    dismissTerrainTooltipWhenPointerLeavesMapPanel(deps);
    S.lastAppliedMapInteractionCursor = '';
    const map = getMainLeafletMap() as { getContainer?: () => HTMLElement } | null;
    map?.getContainer?.()?.style.removeProperty('cursor');
  });
}
