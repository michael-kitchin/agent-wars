/**
 * Entry callbacks that other extracted callbacks do not call.
 */

import {
  cellToParent,
  latLngToCell,
} from 'h3-js';
import {
  hideStackCallout,
} from './map/stackCallout';
import {
  mergeTacticalSubUnitsForMarchPlayback,
  redraw,
  requestRedraw,
  resizeAndRedraw,
  tickResolutionMoveAnimation,
} from './rendering/gameScene';
import {
  getMainLeafletMap,
} from './map/worldLeafletMap';

import type {
  GameStateSnapshot,
  HumanStandingOrderSnapshot,
} from '../shared/ipcTypes';

import {
  buildResolutionPlaybackState,
} from './rendering/resolutionPlayback';
import {
  BACKGROUND_COLOR,
  DETAIL_H3_RESOLUTION,
  WORLD_H3_RESOLUTION,
} from './core/constants';

import {
  appendOpenRouterLog,
  callReadyWithTimeout,
  hideAiStrategyToast,
  hideMapToast,
  showAiStrategyToast,
  showMapToast,
  updateOpenRouterCostLabel,
  updateOpenRouterToolCountLabels,
  updateReadyButtonState,
} from './openRouter/openRouterUiHelpers';
import {
  applyInitialCameraForState,
  getLeafletGlobal,
} from './map/mapHelpers';
import {
  shouldRenderRes4Hexes,
} from './map/terrainView';
import {
  tryHandleTacticalEntryAtClientXY as tryHandleTacticalEntryAtClientXYFromModule,
} from './map/tacticalEntryLayer';
import {
  getExploredHexSet,
  getVisibleHexSet,
  reconcileSelectionToCurrentState,
} from './core/selection';
import {
  setMainUIControlsEnabled,
  updateGameStateSidebar,
} from './core/uiState';
import {
  refreshHumanStandingOrders,
  registerNewGameButton,
} from './gameplay/newGame';
import {
  buildAirStrikeOutboundPlaybackMoves,
  buildAirStrikeReturnPlaybackMoves,
} from './rendering/orderDrawing';
import {
  rendererSharedState as S,
} from './core/state';



import {
  tacticalUpdateExitButtonVisibility,
} from './tactical/tacticalUiOrchestration';

import {
  initOpenRouterUI as initOpenRouterUIFromModule,
} from './openRouter/openRouterControls';
import {
  syncEventDrivenFromTools,
} from './openRouter/openRouterRuntime';

import {
  drawLoadingScene as drawLoadingSceneFromModule,
  getUnitsForDrawWithMovingIds as getUnitsForDrawWithMovingIdsFromModule,
  tryHandleBuildEntryAtClientXY as tryHandleBuildEntryAtClientXYFromModule,
  updateMapInteractionCursor as updateMapInteractionCursorFromModule,
} from './map/drawInteraction';
import {
  cancelFerryForUnit as cancelFerryForUnitFromModule,
  cancelOrderForUnit as cancelOrderForUnitFromModule,
  clearCommittedOrderDraftState as clearCommittedOrderDraftStateFromModule,
  clearPendingTacticalOrders,
} from './gameplay/tacticalOrders';
import {
  type ReadyHandlerDeps,
} from './gameplay/readyHandler';
import {
  isMapInspectionModeHeld,
} from './gameplay/productionOverlayHelpers';
import {
  openMeleeInterceptModal,
} from './gameplay/meleeInterceptModal';


import {
  clearRes1TooltipSummaryCaches,
  getRes1DominantTerrainKind,
  infraGlyphsAllowedForRes1Hex,
  infraGlyphsAllowedForRes4Child,
} from './map/terrainTooltipRes1State';

import {
  drawRes4TerrainHexes as drawRes4TerrainHexesFromModule,
} from './rendering/terrainRendering';
import {
  drawRes4CityOverlays,
} from './rendering/res4CityOverlays';

import {
  refreshGameStateAfterSealiftChange as refreshGameStateAfterSealiftChangeFromModule,
  updateClientStaleEnemyIntel,
} from './core/stateSnapshot';
import {
  clearSidebarError,
  formatPendingOrderSidebarLabel as formatPendingOrderSidebarLabelFromModule,
} from './gameplay/sidebarSupport';

import {
  hideBuildPopup,
  showBuildPopup,
  handleBuildEntryClick,
  applyGameStateSnapshot,
  rebuildUnitDisplayNameLookup,
  refreshRes4TerrainOverridesForRenderer,
  formatUnknownBattleAnnouncement,
  startBackgroundRequestIfAllowed,
  renderOpenRouterToolsList,
  startTacticalBattleFromEntryHex,
  buildMeleeInterceptHexPopupHtmlForRes1,
  updateSidebar,
  updateGameOverUI,
  openNewGameOverlayFromModelTab,
  formatUnitArrowLabel,
  createTacticalSidebarDeps,
  showSidebarError,
  syncOpenRouterRunToggleInteractable,
  maybeScheduleTacticalAnnihilationExit,
  updatePendingOrdersSidebar,
  updateRangedSidebar,
  buildKillToastFormatterBundle,
} from './entryCallbacks';

/**
 * Defines the `getUnitAtHex` function shape (function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null).

 * Purpose: Supports maintainability by documenting why `getUnitAtHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null {
  if (S.tacticalBattleSnapshot) {
    const atHex = S.tacticalBattleSnapshot.subUnits.filter((u) => u.h3Index === h3Index);
    if (atHex.length === 0) return null;
    const tacticalUnit = atHex.find((u) => u.player === 'human') ?? atHex[0];
    return {
      id: tacticalUnit.id,
      player: tacticalUnit.player,
      unitType: tacticalUnit.unitType,
      h3Index: tacticalUnit.h3Index,
    };
  }
  if (!S.gameState) return null;
  return S.gameState.units.find((u) => u.h3Index === h3Index) ?? null;
}

/**
 * Defines the `isStackCalloutTargetInsideDialog` function shape (function isStackCalloutTargetInsideDialog(target: EventTarget | null): boolean).

 * Purpose: Supports maintainability by documenting why `isStackCalloutTargetInsideDialog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isStackCalloutTargetInsideDialog(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const callout = document.getElementById('stack-callout');
  return !!callout && callout.contains(target);
}

/**
 * Reloads strategic state after sealift embark/debark so selection uses current embark flags.
 *
 * Purpose: Stack sealift mutates transport assignments without Ready; client must refresh `embarkedOnNavalUnitId`.
 * When to use: After successful strategic `updateSealiftSlot` in `renderSealiftSection`.
 * Expected outcome: Debarked land units become selectable/movable same turn; embark cancels refresh standing orders when requested.
 * Exceptions: None (errors logged inside the module helper).
 */
export async function refreshGameStateAfterSealiftChange(options: { refreshStandingOrders?: boolean } = {}): Promise<void> {
  return refreshGameStateAfterSealiftChangeFromModule({ applyGameStateSnapshot }, options);
}

/**
 * Defines the `detailHitAtClientPixel` function shape (function detailHitAtClientPixel().

 * Purpose: Supports maintainability by documenting why `detailHitAtClientPixel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function detailHitAtClientPixel(
  clientX: number,
  clientY: number,
  mapHexSet: Set<string>
): string | null {
  if (!S.gameState || !shouldRenderRes4Hexes()) return null;
  const exploredHexes = getExploredHexSet(S.gameState);
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) return null;
  const L = getLeafletGlobal();
  if (!L) return null;
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parentH3 = cellToParent(detailH3, WORLD_H3_RESOLUTION);
    if (!exploredHexes.has(parentH3)) return null;
    return mapHexSet.has(parentH3) ? detailH3 : null;
  } catch {
    return null;
  }
}

/**
 * Defines the `drawRes4TerrainHexes` function shape (function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawRes4TerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D): void {
  return drawRes4TerrainHexesFromModule(ctx, {
    getExploredHexSet,
    getRes1DominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForRes1Hex,
    infraGlyphsAllowedForRes4Child,
  });
}

/**
 * Paints res4 road/rail segments and city marks before infrastructure glyphs so airport/seaport symbols cover city markers.

 * Purpose: Keeps drawable order stable: terrain strokes, res4 city marker/labels (canvas), then infra glyphs; road/rail lines are on the Leaflet vector layer under this canvas.
 * When to use: After `drawRes4TerrainHexes` (and res1 production overlays when applicable), before `drawTerrainInfrastructureOverlays`.
 * Expected outcome: No-op unless res4 is active; visibility follows `drawRes4CityOverlays` (res4 gate + exploration parity with terrain).
 * Exceptions: None; delegates drawing to `drawRes4CityOverlays`.
 */
export function drawRes4CityOverlayPass(ctx: CanvasRenderingContext2D): void {
  drawRes4CityOverlays(ctx, {
    getExploredHexSet,
  });
}

/**
 * Defines the `drawLoadingScene` function shape (function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number): void).

 * Purpose: Supports maintainability by documenting why `drawLoadingScene` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  return drawLoadingSceneFromModule(ctx, width, height, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/**
 * Defines the `getUnitsForDrawWithMovingIds` function shape (function getUnitsForDrawWithMovingIds(state: GameStateSnapshot): { unitsToDraw: GameStateSnapshot['units']; movingIds: Set<string> | undefined; } { //).

 * Purpose: Chooses which units are drawn on the static layer versus the resolution animation layer.
 * When to use: Any draw or hit-test path that needs the same unit split as `drawGameScene` (including tactical with merged `state.units`).
 * Expected outcome: Strategic and tactical-with-animation both delegate to `drawInteraction.getUnitsForDrawWithMovingIds` so movers are omitted from the static pass while `moveProgress < 1`. Tactical without animation maps snapshot sub-units with no moving filter.
 * Exceptions: None.
 */
export function getUnitsForDrawWithMovingIds(state: GameStateSnapshot): {
  unitsToDraw: GameStateSnapshot['units'];
  movingIds: Set<string> | undefined;
} {
  if (S.tacticalBattleSnapshot) {
    if (S.resolutionMoveAnimation) {
      const tacticalUnits = S.tacticalBattleSnapshot.subUnits.map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
      })) as GameStateSnapshot['units'];
      const merged = mergeTacticalSubUnitsForMarchPlayback(
        tacticalUnits,
        S.resolutionMoveAnimation.tacticalMarchPlaybackUnits
      );
      return getUnitsForDrawWithMovingIdsFromModule({ ...state, units: merged }, {
        backgroundColor: BACKGROUND_COLOR,
        buildResolutionPlaybackState,
        hideBuildPopup,
        showBuildPopup,
      });
    }
    return {
      unitsToDraw: S.tacticalBattleSnapshot.subUnits.map((u) => ({
        id: u.id,
        player: u.player,
        unitType: u.unitType,
        h3Index: u.h3Index,
      })),
      movingIds: undefined,
    };
  }
  // Contract anchors retained for rendererConsolidation tests after extraction:
  // phase.inAirStrikeLightning || phase.inAirStrikeCasualty
  // h3Index: move.toH3Index
  // movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));
  return getUnitsForDrawWithMovingIdsFromModule(state, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/**
 * Defines the `tryHandleBuildEntryAtClientXY` function shape (function tryHandleBuildEntryAtClientXY(clientX: number, clientY: number, eventShiftKey?: boolean): boolean).

 * Purpose: Supports maintainability by documenting why `tryHandleBuildEntryAtClientXY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function tryHandleBuildEntryAtClientXY(
  clientX: number,
  clientY: number,
  eventShiftKey = false
): boolean {
  return tryHandleBuildEntryAtClientXYFromModule(clientX, clientY, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    handleBuildEntryClick,
  }, eventShiftKey);
}

/**
 * Starts a tactical battle when the player clicks a contested-hex magnifier during strategic planning.
 *
 * Purpose: Bridges map overlay clicks to `startTacticalBattle` IPC and tactical map entry.
 * When to use: Main map interactions before build-entry handling returns.
 * Expected outcome: On success, renderer enters tactical res4 view; on failure, shows a toast.
 * Exceptions: None.
 */
export async function tryHandleTacticalEntryAtClientXY(clientX: number, clientY: number): Promise<boolean> {
  return tryHandleTacticalEntryAtClientXYFromModule(clientX, clientY, startTacticalBattleFromEntryHex);
}

/**
 * Builds the shared dependency bundle for strategic Ready handling (also used after tactical exit).
 *
 * Purpose: Keeps Ready and tactical-exit paths on one dependency bundle so both use the same helpers.
 * When to use: Ready button clicks and tactical exit after `endTacticalBattle` IPC succeeds.
 * Expected outcome: A fully populated `ReadyHandlerDeps` object referencing live renderer helpers.
 * Exceptions: None.
 */
export function createReadyHandlerDeps(): ReadyHandlerDeps {
  return {
    clearSidebarError,
    updateReadyButtonState,
    updateOpenRouterToolCountLabels,
    showSidebarError,
    callReadyWithTimeout,
    refreshRes4TerrainOverridesForRenderer,
    applyGameStateSnapshot,
    buildAirStrikeOutboundPlaybackMoves,
    buildAirStrikeReturnPlaybackMoves,
    showAiStrategyToast,
    hideAiStrategyToast,
    updateOpenRouterCostLabel,
    appendOpenRouterLog,
    showMapToast,
    getVisibleHexSet,
    buildKillToastFormatterBundle,
    formatUnknownBattleAnnouncement,
    tickResolutionMoveAnimation,
    clearPendingTacticalOrders,
    refreshHumanStandingOrders,
    updateGameStateSidebar,
    updatePendingOrdersSidebar,
    updateRangedSidebar,
    updateSidebar,
    updateGameOverUI,
    startBackgroundRequestIfAllowed,
    redraw,
    buildMeleeInterceptHexPopupHtml: buildMeleeInterceptHexPopupHtmlForRes1,
    openMeleeInterceptModal,
    startTacticalBattleFromInterceptHex: startTacticalBattleFromEntryHex,
    scheduleTacticalAnnihilationExit: maybeScheduleTacticalAnnihilationExit,
    syncTacticalExitButton: tacticalUpdateExitButtonVisibility,
  };
}

/**
 * Defines the `updateMapInteractionCursor` function shape (function updateMapInteractionCursor(clientX: number, clientY: number): void).

 * Purpose: Supports maintainability by documenting why `updateMapInteractionCursor` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateMapInteractionCursor(clientX: number, clientY: number): void {
  return updateMapInteractionCursorFromModule(clientX, clientY, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/**
 * Defines the `initNewGameButton` function shape (function initNewGameButton(): void).

 * Purpose: Supports maintainability by documenting why `initNewGameButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function initNewGameButton(): void {
  registerNewGameButton({
    refreshRes4TerrainOverridesForRenderer,
    rebuildUnitDisplayNameLookup,
    reconcileSelectionToCurrentState,
    updateClientStaleEnemyIntel,
    applyInitialCameraForState,
    clearRes1TooltipSummaryCaches,
    clearPendingTacticalOrders,
    hideStackCallout,
    updateOpenRouterCostLabel,
    updateGameStateSidebar,
    refreshHumanStandingOrders,
    updatePendingOrdersSidebar,
    updateRangedSidebar,
    updateSidebar,
    updateGameOverUI,
    updateReadyButtonState,
    startBackgroundRequestIfAllowed,
    resizeAndRedraw,
    setMainUIControlsEnabled,
  });
}

/**
 * Defines the `formatPendingOrderSidebarLabel` function shape (function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string).

 * Purpose: Supports maintainability by documenting why `formatPendingOrderSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string {
  return formatPendingOrderSidebarLabelFromModule(order, formatUnitArrowLabel);
}

/**
 * Defines the `cancelOrderForUnit` function shape (async function cancelOrderForUnit(unitId: string): Promise<void>).

 * Purpose: Supports maintainability by documenting why `cancelOrderForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function cancelOrderForUnit(unitId: string): Promise<void> {
  return cancelOrderForUnitFromModule(unitId, createTacticalSidebarDeps());
}

/**
 * Defines the `clearCommittedOrderDraftState` function shape (function clearCommittedOrderDraftState(): void).

 * Purpose: Supports maintainability by documenting why `clearCommittedOrderDraftState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearCommittedOrderDraftState(): void {
  return clearCommittedOrderDraftStateFromModule(createTacticalSidebarDeps());
}

/**
 * Defines the `cancelFerryForUnit` function shape (function cancelFerryForUnit(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `cancelFerryForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelFerryForUnit(unitId: string): void {
  return cancelFerryForUnitFromModule(unitId, createTacticalSidebarDeps());
}

/**
 * Defines the `initOpenRouterUI` function shape (function initOpenRouterUI(): void).

 * Purpose: Supports maintainability by documenting why `initOpenRouterUI` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function initOpenRouterUI(): void {
  return initOpenRouterUIFromModule({
    appendOpenRouterLog,
    updateOpenRouterCostLabel,
    renderOpenRouterToolsList,
    syncEventDrivenFromTools,
    hideMapToast,
    hideAiStrategyToast,
    openNewGameOverlayFromModelTab,
    startBackgroundRequestIfAllowed,
    updateReadyButtonState,
    syncOpenRouterRunToggleInteractable,
    showAiStrategyToast,
    updateOpenRouterToolCountLabels,
    requestRedraw,
  });
}
