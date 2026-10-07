/**
 * Renderer process entry point. Leaflet world basemap + overlay canvas (terrain, units, orders),
 * minimap with viewport sync, and click / double-click interaction with the sidebar.
 */

import {
  applyModifierDrivenPopoverCloseRules,
  bindStackCalloutHost,
  hideStackCallout,
  refreshStackCalloutIfOpen,
  shouldSuppressTerrainTooltip,
  showStackCallout,
} from './map/stackCallout';
import {
  bindEntryCallbacksHost,
  hideBuildPopup,
  showBuildPopup,
  handleBuildEntryClick,
  syncTacticalEntryButtonOverlay,
  applyGameStateSnapshot,
  showTerrainTooltip,
  scheduleTerrainTooltipRestoreAfterPopoverClose,
  getPrimarySelectedUnitId,
  applyTacticalTerrainOverrides,
  refreshTacticalTerrainOverridesForRenderer,
  formatUnitDisplayName,
  refreshStrategicOrderSidebars,
  startTacticalBattleFromEntryHex,
  updateSidebar,
  applySelectionFromSidebarUnitButton,
  formatUnitArrowLabel,
  syncUiAfterSelectionChange,
  createTacticalSidebarDeps,
  refreshHoverRoutePreview,
} from './entryCallbacks';
import {
  getUnitAtHex,
  isStackCalloutTargetInsideDialog,
  refreshGameStateAfterSealiftChange,
  detailHitAtClientPixel,
  drawTacticalTerrainHexes,
  drawTacticalCityOverlayPass,
  drawLoadingScene,
  getUnitsForDrawWithMovingIds,
  tryHandleBuildEntryAtClientXY,
  tryHandleTacticalEntryAtClientXY,
  createReadyHandlerDeps,
  updateMapInteractionCursor,
  initNewGameButton,
  formatPendingOrderSidebarLabel,
  cancelOrderForUnit,
  clearCommittedOrderDraftState,
  cancelFerryForUnit,
  initOpenRouterUI,
} from './wiredEntryCallbacks';
import {
  bindGameSceneHost,
  redraw,
  requestRedraw,
  resizeAndRedraw,
} from './rendering/gameScene';
import {
  getMainLeafletMap,
} from './map/worldLeafletMap';

import type {
  KillEdge,
} from '../shared/ipc/combatResultTypes';
import type {
  GameStateSnapshot,
  GameApi,
  RemovedUnitSnapshot,
} from '../shared/ipcTypes';

import {
  buildEntryTooltipText,
} from './chrome/controlTooltipText';
import {
  showMapToast,
  updateReadyButtonState,
} from './openRouter/openRouterUiHelpers';
import {
  getLeafletGlobal,
  hexCenterPx,
} from './map/mapHelpers';
import {
  hideBuildEntryLayer,
  shouldRenderTacticalHexes,
  shouldShowBuildEntryZoom,
} from './map/terrainView';

import {
  isHoverOrderPlanningActive,
  shouldDrawHoveredPathPreview,
} from './rendering/canvasPreviewPolicy';
import {
  clearSelection,
  getExploredHexSet,
  isHexExploredByPlayer,
  replaceSelection,
  toggleUnitSelection,
} from './core/selection';
import {
  updateGameStateSidebar,
} from './core/uiState';
import {
  refreshHumanStandingOrders,
} from './gameplay/newGame';

import {
  areResolutionDiceChipsShowing,
} from './rendering/combatDiceChipDrawing';
import {
  rendererSharedState as S,
} from './core/state';

import {
  installUnitOriginTooltip,
} from './core/unitOriginTooltip';
import {
  tacticalMaybeScheduleAnnihilationExit,
  type TacticalExitSessionAccessor,
} from './tactical/tacticalExitFlow';
import {
  performTacticalBattleExitWithGameApi,
} from './tactical/tacticalEntryFlow';

import {
  tacticalUpdateExitButtonVisibility,
} from './tactical/tacticalUiOrchestration';
import {
  isBuildPopupOrEntryTarget,
  isBuildQueueSelectInPopupFocused,
} from './gameplay/buildQueuePopup';

import {
  containerPixelHitsDrawnUnitIcon,
} from './map/drawInteraction';
import {
  replacePendingAirStrikesForSelected,
  replacePendingFerryOrdersForSelected,
  replacePendingRangedAttacksForSelected,
  updateRangedSidebar as updateRangedSidebarFromModule,
} from './gameplay/tacticalOrders';
import {
  formatTargetingValidationReason as formatTargetingValidationReasonWithResolver,
} from './gameplay/formatTargetingValidationReason';
import {
  drawHoverRoutePreview as drawHoverRoutePreviewFromModule,
} from './rendering/hoverPreview';
import {
  handleReadyButtonClick as handleReadyButtonClickFromModule,
} from './gameplay/readyHandler';
import {
  buildProductionOverlayContext,
  formatProductionLabelForAnyController,
  formatProductionLabelForHumanControllerOnly,
  getControllerForHex,
  getUrbanProductionCapacityForHex,
  isMapInspectionModeHeld,
  isStrategicHexHumanUrbanProduction,
} from './gameplay/productionOverlayHelpers';

import {
  clearTerrainTooltipTimer,
  getStrategicDominantTerrainKind,
  hideTerrainTooltipVisual,
  infraGlyphsAllowedForStrategicHex,
  infraGlyphsAllowedForTacticalChild,
  namingLookupTargetForPointer,
  terrainStateForPointer,
} from './map/terrainTooltipStrategicState';

import {
  wireMainMapInteractions as wireMainMapInteractionsFromModule,
} from './map/mainMapInteractions';

import {
  wireInitCore as wireInitCoreFromModule,
} from './map/initCore';
import {
  computeStrategicOverlayTextY,
  drawTerrainInfrastructureOverlays as drawTerrainInfrastructureOverlaysFromModule,
  hasVisibleStrategicInfrastructureGlyphs as hasVisibleStrategicInfrastructureGlyphsFromModule,
} from './rendering/terrainRendering';

import {
  buildKillToastFormatterBundle as buildKillToastFormatterBundleFromModule,
  clearSidebarError,
  isPendingMovementOrderForDisplay,
  updatePendingOrdersSidebar as updatePendingOrdersSidebarFromModule,
} from './gameplay/sidebarSupport';
import {
  createSidebarOrderRow,
} from './gameplay/sidebarOrderRow';

/**
 * Bridges renderer shared tactical fields into tactical exit/advance helpers without those modules importing `renderer.ts`.
 *
 * Contract: Read/write `S.tacticalBattleSnapshot` and `S.tacticalPhasePlanning` only.
 * When to use: Passed to tactical exit/advance helpers and annihilation scheduling.
 * Expected outcome: Same session semantics as the pre-refactor direct `S` mutations.
 * Exceptions: None.
 */
const tacticalExitSessionAccessor: TacticalExitSessionAccessor = {
  getBattleSnapshot: () => S.tacticalBattleSnapshot,
  getPhasePlanning: () => S.tacticalPhasePlanning,
  setBattleSnapshot: (next) => {
    S.tacticalBattleSnapshot = next;
  },
  setPhasePlanning: (next) => {
    S.tacticalPhasePlanning = next;
  },
};

declare global {
    /**
   * Documents the `Window` interface as a named contract surface (interface Window).

   * Purpose: Supports maintainability by documenting why `Window` exists.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
interface Window {
        /**
     * Specifies the contract for the `gameApi` member (gameApi?: GameApi;).

     * Contract: Describes stable behavior for callers of `gameApi` in this codebase.
     * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
     * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
     * Exceptions: None.
     */
gameApi?: GameApi;
  }
}

/**
 * Defines the `formatTargetingValidationReason` function shape (function formatTargetingValidationReason(reason: string | undefined, fallbackMessage: string): string).

 * Purpose: Supports maintainability by documenting why `formatTargetingValidationReason` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatTargetingValidationReason(reason: string | undefined, fallbackMessage: string): string {
  return formatTargetingValidationReasonWithResolver(reason, fallbackMessage, formatUnitDisplayName);
}

/**
 * Defines the `hasVisibleStrategicInfrastructureGlyphs` function shape (function hasVisibleStrategicInfrastructureGlyphs().

 * Purpose: Supports maintainability by documenting why `hasVisibleStrategicInfrastructureGlyphs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hasVisibleStrategicInfrastructureGlyphs(
  h3Index: string,
  tacticalOn: boolean,
  unitHexes: Set<string>
): boolean {
  return hasVisibleStrategicInfrastructureGlyphsFromModule(h3Index, tacticalOn, unitHexes, {
    getExploredHexSet,
    getStrategicDominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForStrategicHex,
    infraGlyphsAllowedForTacticalChild,
  });
}

/**
 * Synchronizes the build marker buttons (production labels) on explored human urban hexes.
 *
 * Purpose: Keeps the DOM markers that open the build popup aligned with the map after every redraw.
 * When to use: After each scene draw, beside the tactical entry marker sync.
 * Expected outcome: One button per eligible hex, rebuilt only when labels, positions, or the build selection change.
 *   The layer hides when the zoom is too far out, at battle-detail zoom (which also closes the build popup), and while
 *   resolution playback paints dice chips, which the buttons would otherwise cover. Playback redraws every frame, so
 *   the markers return as the chips fade.
 * Exceptions: None.
 */
function syncBuildEntryButton(): void {
  const layer = document.getElementById('build-entry-layer');
  if (!layer || !S.gameState) {
    if (layer) hideBuildEntryLayer(layer, false);
    return;
  }
  if (!shouldShowBuildEntryZoom()) {
    hideBuildEntryLayer(layer);
    return;
  }
  if (areResolutionDiceChipsShowing(S.resolutionMoveAnimation)) {
    hideBuildEntryLayer(layer);
    return;
  }
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
      }
    | null;
  if (!map) {
    hideBuildEntryLayer(layer);
    return;
  }
  const L = getLeafletGlobal();
  if (!L) {
    hideBuildEntryLayer(layer);
    return;
  }
  const tacticalOn = shouldRenderTacticalHexes();
  if (tacticalOn) {
    hideBuildEntryLayer(layer);
    hideBuildPopup();
    return;
  }
  const visibleUnitHexes = new Set(S.gameState.units.map((u) => u.h3Index));
  const selectedBuildHexes = new Set(S.selectedBuildHexH3s);
  const rows: Array<{
    h3: string;
    label: string;
    left: number;
    top: number;
    hasCapacity: boolean;
    selected: boolean;
  }> = [];
  for (const hx of S.gameState.hexes) {
    const explored = isHexExploredByPlayer(hx.h3Index);
    if (!explored) continue;
    if (!isStrategicHexHumanUrbanProduction(S.gameState, hx)) continue;
    const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);
    const hasInfraSymbols = hasVisibleStrategicInfrastructureGlyphs(hx.h3Index, tacticalOn, visibleUnitHexes);
    const hasVisibleUnits = visibleUnitHexes.has(hx.h3Index);
    const center = hexCenterPx(hx.h3Index);
    // While T is held, align build-entry buttons with the downward offset used for airport/seaport hexes so labels stay clear of centered hex codes.
    const textY = computeStrategicOverlayTextY(
      hx.h3Index,
      map,
      L,
      isMapInspectionModeHeld() || hasInfraSymbols || hasVisibleUnits
    );
    rows.push({
      h3: hx.h3Index,
      label: formatProductionLabelForHumanControllerOnly(S.gameState, hx.h3Index, capacityPerTurn, 'human'),
      left: Math.round(center.x),
      top: Math.round(textY),
      hasCapacity: true,
      selected: selectedBuildHexes.has(hx.h3Index),
    });
  }
  if (rows.length === 0) {
    hideBuildEntryLayer(layer);
    return;
  }
  rows.sort((a, b) => a.h3.localeCompare(b.h3));
  const layerKey = rows
    .map((r) => `${r.h3}|${r.label}|${r.left}|${r.top}|${r.hasCapacity ? 1 : 0}|${r.selected ? 1 : 0}`)
    .join(';');
  if (layerKey !== S.lastBuildEntryLayerKey) {
    const html = rows
      .map(
        (r) =>
          `<button type="button" class="build-entry-btn${r.hasCapacity ? ' has-capacity' : ''}${r.selected ? ' selected' : ''}" data-h3-index="${r.h3}" data-control-tooltip="${buildEntryTooltipText}" style="left:${r.left}px;top:${r.top}px;transform:translate(-50%, -50%);" aria-label="Open build queue for ${r.h3}" aria-pressed="${r.selected ? 'true' : 'false'}">${r.label}</button>`
      )
      .join('');
    layer.innerHTML = html;
    S.lastBuildEntryLayerKey = layerKey;
  }
  layer.classList.remove('hidden');
  layer.setAttribute('aria-hidden', 'false');
}

/**
 * Defines the `drawTerrainInfrastructureOverlays` function shape (function drawTerrainInfrastructureOverlays(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawTerrainInfrastructureOverlays` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawTerrainInfrastructureOverlays(ctx: CanvasRenderingContext2D): void {
  return drawTerrainInfrastructureOverlaysFromModule(ctx, {
    getExploredHexSet,
    getStrategicDominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForStrategicHex,
    infraGlyphsAllowedForTacticalChild,
  });
}

/**
 * Defines the `drawStrategicProductionOverlays` function shape (function drawStrategicProductionOverlays(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawStrategicProductionOverlays` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawStrategicProductionOverlays(ctx: CanvasRenderingContext2D): void {
  if (!S.gameState) return;
  if (shouldRenderTacticalHexes()) return;
  const map = getMainLeafletMap() as
    | { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  if (!L) return;
  const overlayContext = buildProductionOverlayContext(S.gameState);
  for (const hx of S.gameState.hexes) {
    const explored = isHexExploredByPlayer(hx.h3Index);
    if (!explored && !overlayContext.mapInspectionHeld) continue;
    const controller = getControllerForHex(S.gameState, hx.h3Index);
    const controlledByHuman = controller === 'human';
    const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);
    if (!overlayContext.mapInspectionHeld) {
      const canShowLabelWithoutInspection = isStrategicHexHumanUrbanProduction(S.gameState, hx) || controlledByHuman;
      if (!canShowLabelWithoutInspection) continue;
    }
    const hasUrbanCapacity = capacityPerTurn > 0;
    const hasInfraSymbols = hasVisibleStrategicInfrastructureGlyphs(hx.h3Index, false, overlayContext.unitHexes);
    const hasVisibleUnits = overlayContext.unitHexes.has(hx.h3Index);
    const center = hexCenterPx(hx.h3Index);
    // Inspection mode shows centered hex codes on strategic; push production text to the same lower band as infra-heavy hexes.
    const textY = computeStrategicOverlayTextY(
      hx.h3Index,
      map,
      L,
      overlayContext.mapInspectionHeld || hasInfraSymbols || hasVisibleUnits
    );
    const text = explored || overlayContext.revealAllControllerQueues
      ? overlayContext.revealAllControllerQueues
        ? formatProductionLabelForAnyController(
            S.gameState,
            hx.h3Index,
            capacityPerTurn,
            controller,
            overlayContext.unitCountsByPlayer
          )
        : formatProductionLabelForHumanControllerOnly(S.gameState, hx.h3Index, capacityPerTurn, controller)
      : `$${Math.max(0, capacityPerTurn).toLocaleString()}`;
    const hasClickableBuildEntryForHex =
      explored && isStrategicHexHumanUrbanProduction(S.gameState, hx) && shouldShowBuildEntryZoom();
    if (hasClickableBuildEntryForHex) {
      continue;
    }
    const sizePx = hasInfraSymbols || hasVisibleUnits ? '10px' : '11px';
    const useBold = controlledByHuman && hasUrbanCapacity;
    ctx.font = `${useBold ? 'bold ' : ''}${sizePx} system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.25;
    ctx.strokeText(text, center.x, textY);
    ctx.fillStyle = '#000';
    ctx.fillText(text, center.x, textY);
  }
}

/**
 * Opens the annihilation result modal when the tactical roster becomes terminal during planning.
 *
 * Purpose: Wraps `tacticalMaybeScheduleAnnihilationExit` so redraw paths share the same session accessor as exit.
 * When to use: Tactical redraw after snapshots that may eliminate a full side roster.
 * Expected outcome: At most one modal per terminal beat; exit IPC runs only after the player confirms on the modal.
 * Exceptions: None.
 */
function maybeScheduleTacticalAnnihilationExit(): void {
  tacticalMaybeScheduleAnnihilationExit(tacticalExitSessionAccessor, {
    endTacticalBattle: window.gameApi?.endTacticalBattle,
    showMapToast,
    redraw,
    runReadyAfterExit: () => handleReadyButtonClickFromModule(createReadyHandlerDeps()),
  });
}

/**
 * Ends the tactical session in the main process then resumes strategic Ready handling.
 *
 * Purpose: Delegates boundary checks and DOM restoration to `tacticalPerformBattleExit` while preserving renderer IPC wiring.
 * When to use: Tactical HUD exit button and annihilation modal `Exit Battle` confirmation.
 * Expected outcome: Clears renderer tactical snapshot, applies post-exit strategic state without reloading standing orders, restores living-unit stash drafts, then invokes Ready pipeline on success.
 * Exceptions: Surfaces toasts when IPC fails per tactical helper contract.
 */
async function performTacticalBattleExit(): Promise<void> {
  await performTacticalBattleExitWithGameApi(tacticalExitSessionAccessor, {
    showMapToast,
    redraw,
    runReadyAfterExit: () => handleReadyButtonClickFromModule(createReadyHandlerDeps()),
    refreshSidebarAfterTacticalDraftTeardown: () => {
      hideStackCallout();
      refreshStrategicOrderSidebars();
    },
    refreshStrategicSnapshotAfterExit: async () => {
      if (!window.gameApi?.getGameState) return;
      const nextState = (await window.gameApi.getGameState()) as GameStateSnapshot;
      await applyGameStateSnapshot(nextState, {
        refreshStandingOrders: false,
        updateGameStateSidebarUi: false,
        updateSelectionUi: false,
        updateGameOverUi: false,
        updateReadyButton: false,
        refreshBuildPopup: false,
        redraw: false,
      });
    },
  });
}

/**
 * Defines the `drawHoverRoutePreview` function shape (function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void {
  if (!shouldDrawHoveredPathPreview()) return;
  return drawHoverRoutePreviewFromModule(ctx);
}

/**
 * Defines the `buildKillToastFormatterBundle` function shape (function buildKillToastFormatterBundle( state: GameStateSnapshot, removedUnits: RemovedUnitSnapshot[] | undefined, tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[] ): { formatKillLine: (kill: { victim).

 * Purpose: Supports maintainability by documenting why `buildKillToastFormatterBundle` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildKillToastFormatterBundle(
  state: GameStateSnapshot,
  removedUnits: RemovedUnitSnapshot[] | undefined,
  tacticalSubUnitsForKillLabels?: readonly { id: string; displayName: string }[],
  killLabelUnits?: readonly import('../shared/unitDisplayNames').UnitDisplayIdentity[]
): {
  formatKillLine: (kill: KillEdge) => string;
  formatUnitName: (unitId: string) => string;
} {
  return buildKillToastFormatterBundleFromModule(state, removedUnits, tacticalSubUnitsForKillLabels, killLabelUnits);
}

/**
 * Defines the `updateRangedSidebar` function shape (function updateRangedSidebar(): void).

 * Purpose: Supports maintainability by documenting why `updateRangedSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updateRangedSidebar(): void {
  // Contract anchors retained for rendererConsolidation tests after extraction:
  // btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';
  // formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)
  // formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)
  // formatPendingFerryOrderSidebarLabel(S.gameState, ferry)
  return updateRangedSidebarFromModule(createTacticalSidebarDeps());
}

/**
 * Defines the `updatePendingOrdersSidebar` function shape (function updatePendingOrdersSidebar(): void).

 * Purpose: Supports maintainability by documenting why `updatePendingOrdersSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updatePendingOrdersSidebar(): void {
  // Contract anchor retained after extraction:
  // formatPendingFerryOrderSidebarLabel(S.gameState, ferry)
  return updatePendingOrdersSidebarFromModule({
    isPendingMovementOrderForDisplay,
    formatPendingOrderSidebarLabel,
    createSidebarOrderRow,
    applySelectionFromSidebarUnitButton,
    cancelOrderForUnit,
    cancelFerryForUnit,
    formatUnitArrowLabel,
    redraw,
    updatePendingOrdersSidebar,
    refreshStackCalloutIfOpen,
  });
}

/**
 * Defines the `init` function shape (function init(): void).

 * Purpose: Supports maintainability by documenting why `init` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function init(): void {
  bindStackCalloutHost({
    hideBuildPopup,
    scheduleTerrainTooltipRestoreAfterPopoverClose,
    syncUiAfterSelectionChange,
    refreshGameStateAfterSealiftChange,
    formatUnitDisplayName,
    formatTargetingValidationReason,
    refreshHumanStandingOrders,
    updatePendingOrdersSidebar,
    requestRedraw,
    refreshHoverRoutePreview,
  });
  bindEntryCallbacksHost({
    maybeScheduleTacticalAnnihilationExit,
    updatePendingOrdersSidebar,
    updateRangedSidebar,
    hasVisibleStrategicInfrastructureGlyphs,
    buildKillToastFormatterBundle,
  });
  bindGameSceneHost({
    maybeScheduleTacticalAnnihilationExit,
    drawTacticalTerrainHexes,
    drawStrategicProductionOverlays,
    drawTacticalCityOverlayPass,
    hasVisibleStrategicInfrastructureGlyphs,
    drawTerrainInfrastructureOverlays,
    drawHoverRoutePreview,
    getUnitsForDrawWithMovingIds,
    drawLoadingScene,
    syncBuildEntryButton,
    syncTacticalEntryButtonOverlay,
  });
  installUnitOriginTooltip();
  // Contract anchors retained after extraction:
  // applyModifierDrivenPopoverCloseRules('shift_pressed');
  // applyModifierDrivenPopoverCloseRules('shift_released');
  wireInitCoreFromModule({
    requestRedraw,
    resizeAndRedraw,
    updateSidebar,
    updateGameStateSidebar,
    refreshHumanStandingOrders,
    updatePendingOrdersSidebar,
    initOpenRouterUI,
    updateRangedSidebar,
    initNewGameButton,
    updateReadyButtonState,
    refreshHoverRoutePreview,
    applyGameStateSnapshot,
    applyTacticalTerrainOverrides,
    refreshTacticalTerrainOverridesForRenderer,
    hideBuildPopup,
    hideStackCallout,
    applyModifierDrivenPopoverCloseRules,
    isMapInspectionModeHeld,
    isBuildPopupOrEntryTarget,
    isBuildQueueSelectInPopupFocused,
    isStackCalloutTargetInsideDialog,
    clearTerrainTooltipTimer,
    hideTerrainTooltipVisual,
    showBuildPopup,
    handleBuildEntryClick,
    updateMapInteractionCursor,
    redraw,
  });

  const tacticalExitBtn = document.getElementById('tactical-exit-btn');
  tacticalExitBtn?.addEventListener('click', () => {
    void performTacticalBattleExit();
  });
  const tacticalAnnihilationExitBtn = document.getElementById('tactical-annihilation-exit-btn');
  tacticalAnnihilationExitBtn?.addEventListener('click', () => {
    void performTacticalBattleExit();
  });
  tacticalUpdateExitButtonVisibility();

  // Contract anchors retained after extraction:
  // const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === 'air');
  // const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== 'air');
  // Cannot issue grouped movement for mixed air and non-air units.
  // window.gameApi?.validateGroupFerryTarget
  // replacePendingFerryOrdersForSelected(selectedIds, destinationH3);
  // formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.')
  // formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.')
  // if (!validation.success) {}
  // airStrikeModeActive = false;
  // rangedModeActive = false;
  wireMainMapInteractionsFromModule({
    clearTerrainTooltipTimer,
    hideTerrainTooltipVisual,
    shouldSuppressTerrainTooltip,
    requestRedraw,
    refreshHoverRoutePreview,
    detailHitAtClientPixel,
    terrainStateForPointer,
    namingLookupTargetForPointer,
    showTerrainTooltip,
    clearSidebarError,
    formatTargetingValidationReason,
    showMapToast,
    replacePendingAirStrikesForSelected,
    replacePendingRangedAttacksForSelected,
    clearSelection,
    hideStackCallout,
    updateSidebar,
    updateRangedSidebar,
    redraw,
    getUnitsForDrawWithMovingIds,
    tryHandleTacticalEntryAtClientXY,
    tryHandleBuildEntryAtClientXY,
    containerPixelHitsDrawnUnitIcon,
    showStackCallout,
    getUnitAtHex,
    toggleUnitSelection,
    replaceSelection,
    getPrimarySelectedUnitId,
    updatePendingOrdersSidebar,
    replacePendingFerryOrdersForSelected,
    clearCommittedOrderDraftState,
    refreshHumanStandingOrders,
  });
  const tacticalEntryLayer = document.getElementById('tactical-entry-layer');
  tacticalEntryLayer?.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const btn = target?.closest('.tactical-entry-btn') as HTMLButtonElement | null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    if (isHoverOrderPlanningActive()) return;
    const h3 = btn.dataset.h3Index;
    if (!h3) return;
    void startTacticalBattleFromEntryHex(h3);
  });

  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.addEventListener('click', async () => {
      // Contract anchors retained after extraction:
      // const knownHumanAirStrikeTargetHexes = new Set(
      // .filter((move) => move.player === 'human')
      // .filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3))
      // airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined
      // airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined
      // buildConsolidatedTurnUpdateToastMessage({})
      // formatKillLine: killToastFormatter.formatKillLine
      // ferryOrders: S.pendingFerryOrders,
      await handleReadyButtonClickFromModule(createReadyHandlerDeps());
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
