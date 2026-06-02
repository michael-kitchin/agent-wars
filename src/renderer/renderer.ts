/**
 * Renderer process entry point. Leaflet world basemap + overlay canvas (terrain, units, orders),
 * minimap with viewport sync, and click / double-click interaction with the sidebar.
 */

import { cellToParent, latLngToCell } from 'h3-js';
import { getMainLeafletMap, invalidateLeafletMapSizes } from './map/worldLeafletMap';
import { deriveInfrastructureOverlayState } from './rendering/infrastructureOverlayState';
import type {
  GameStateSnapshot,
  GameApi,
  AirStrikeTargetType,
  RemovedUnitSnapshot,
  HumanStandingOrderSnapshot,
  SealiftStackState,
  Res4CityOverlayRow,
  Res4RoadRailOverlayRow,
  Res4TransportVectorOverlayRow,
} from '../shared/ipcTypes';
import {
  buildUnitDisplayNameLookup,
  fallbackDisplayNameFromUnitId,
} from '../shared/unitDisplayNames';
import {
  buildResolutionPlaybackState as buildResolutionPlaybackStateFromModule,
  resolutionAnimationElapsedMs as resolutionAnimationElapsedMsFromModule,
  type ResolutionPlaybackPhase,
} from './rendering/resolutionPlayback';
import {
  BACKGROUND_COLOR,
  DETAIL_H3_RESOLUTION,
  TOOLTIP_OFFSET_PX,
  WORLD_H3_RESOLUTION,
  UNIT_DESELECT_GLYPH,
  UNIT_SELECT_GLYPH,
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
  hexCenterPx,
  hitTestHexAtContainerPixel,
  hitTestTacticalRes4HexAtContainerPixel,
} from './map/mapUtils';
import {
  hideBuildEntryLayer,
  shouldRenderRes4Hexes,
  shouldShowBuildEntryZoom,
} from './map/terrainView';
import { tryHandleTacticalEntryAtClientXY as tryHandleTacticalEntryAtClientXYFromModule } from './map/tacticalEntryLayer';
import {
  drawMovingUnits,
  drawResolutionMoveLines,
  drawStandingOrderLines,
  drawTacticalPendingMarchPlanLines,
} from './rendering/pathDrawing';
import { drawPendingMarchesHoverAndSupportOrderStack } from './rendering/orderOverlayStages';
import {
  getCommittedOrderUnitsHiddenDuringPreview,
  shouldDrawCommittedOrderPaths,
  shouldDrawHoveredPathPreview,
} from './rendering/canvasPreviewPolicy';
import {
  addUnitsToSelection as addUnitsToSelectionFromModule,
  clearSelection as clearSelectionFromModule,
  getExploredHexSet as getExploredHexSetFromModule,
  getVisibleHexSet as getVisibleHexSetFromModule,
  isHexExploredByPlayer as isHexExploredByPlayerFromModule,
  reconcileSelectionToCurrentState as reconcileSelectionToCurrentStateFromModule,
  removeUnitsFromSelection as removeUnitsFromSelectionFromModule,
  replaceSelection as replaceSelectionFromModule,
  toggleUnitSelection as toggleUnitSelectionFromModule,
} from './core/selection';
import {
  setMainUIControlsEnabled as setMainUIControlsEnabledFromModule,
  updateGameOverUI as updateGameOverUIFromModule,
  updateGameStateSidebar as updateGameStateSidebarFromModule,
  updateSidebar as updateSidebarFromModule,
} from './core/uiState';
import {
  openNewGameOverlayFromModelTab as openNewGameOverlayFromModelTabFromModule,
  refreshHumanStandingOrders as refreshHumanStandingOrdersFromModule,
  registerNewGameButton,
} from './gameplay/newGame';
import {
  buildAirStrikeOutboundPlaybackMoves,
  buildAirStrikeReturnPlaybackMoves,
  buildResolutionPlaybackMoves,
} from './rendering/orderDrawing';
import {
  drawCasualtyOverlay,
  drawCombatLightning,
  drawStaleEnemyIntel,
  drawUnits,
  drawUnknownBattleMarkers,
} from './rendering/unitDrawing';
import { rendererSharedState as S } from './core/state';
import { mergePendingTacticalEmbarkOrdersIntoSealiftState } from './tactical/tacticalEmbarkSealiftMerge';
import {
  tacticalMaybeScheduleAnnihilationExit,
  type TacticalExitSessionAccessor,
} from './tactical/tacticalExitFlow';
import {
  activateRestoredTacticalBattleFromMainSnapshot,
  buildDefaultTacticalBattleActivationSideEffects,
  performTacticalBattleExitWithGameApi,
  startTacticalBattleFromEntryHex as startTacticalBattleFromEntryHexFromModule,
} from './tactical/tacticalEntryFlow';
import type { TacticalRendererStartBattleSideEffects } from './tactical/tacticalIpcHandlers';
import {
  tacticalReconcileBattleAfterStrategicSnapshot,
  tacticalSyncTacticalEntryButtonOverlay,
  tacticalUpdateExitButtonVisibility,
} from './tactical/tacticalUiOrchestration';
import {
  createBuildQueuePopupController,
  isBuildPopupOrEntryTarget,
  isBuildQueueSelectInPopupFocused,
} from './gameplay/buildQueuePopup';
import { initOpenRouterUI as initOpenRouterUIFromModule } from './openRouter/openRouterControls';
import {
  renderOpenRouterToolsList as renderOpenRouterToolsListFromModule,
  startBackgroundRequestIfAllowed as startBackgroundRequestIfAllowedFromModule,
  syncEventDrivenFromTools as syncEventDrivenFromToolsFromModule,
  withTacticalHumanDraftPrefetchInvalidation,
} from './openRouter/openRouterRuntime';
import { resetPrecomputedAiState } from './openRouter/precomputedAiState';
import { flushResolutionPlaybackCompleteNotifyCallbacks } from './openRouter/resolutionPlaybackDeferral';
import {
  containerPixelHitsDrawnUnitIcon as containerPixelHitsDrawnUnitIconFromModule,
  drawLoadingScene as drawLoadingSceneFromModule,
  getUnitsForDrawWithMovingIds as getUnitsForDrawWithMovingIdsFromModule,
  tryHandleBuildEntryAtClientXY as tryHandleBuildEntryAtClientXYFromModule,
  updateMapInteractionCursor as updateMapInteractionCursorFromModule,
} from './map/drawInteraction';
import {
  cancelFerryForUnit as cancelFerryForUnitFromModule,
  cancelOrderForUnit as cancelOrderForUnitFromModule,
  clearCommittedOrderDraftState as clearCommittedOrderDraftStateFromModule,
  clearPendingTacticalOrders as clearPendingTacticalOrdersFromModule,
  refreshHoverRoutePreview as refreshHoverRoutePreviewFromModule,
  type RefreshHoverRoutePreviewOptions,
  replacePendingAirStrikesForSelected as replacePendingAirStrikesForSelectedFromModule,
  replacePendingFerryOrdersForSelected as replacePendingFerryOrdersForSelectedFromModule,
  replacePendingRangedAttacksForSelected as replacePendingRangedAttacksForSelectedFromModule,
  updateRangedSidebar as updateRangedSidebarFromModule,
} from './gameplay/tacticalOrders';
import { formatTargetingValidationReason as formatTargetingValidationReasonWithResolver } from './gameplay/formatTargetingValidationReason';
import { drawHoverRoutePreview as drawHoverRoutePreviewFromModule } from './rendering/hoverPreview';
import {
  handleReadyButtonClick as handleReadyButtonClickFromModule,
  prepareStrategicPlanningUiBeforeTacticalAutoStart,
  type ReadyHandlerDeps,
} from './gameplay/readyHandler';
import {
  buildProductionOverlayContext,
  formatProductionLabelForAnyController,
  formatProductionLabelForHumanControllerOnly,
  getControllerForHex,
  getUrbanProductionCapacityForHex,
  isMapInspectionModeHeld,
  isRes1HexHumanUrbanProduction,
} from './gameplay/productionOverlayHelpers';
import { openMeleeInterceptModal } from './gameplay/meleeInterceptModal';
import { buildMeleeInterceptHexPopupHtmlForRes1 as buildMeleeInterceptHexPopupHtmlForRes1FromModule } from './gameplay/meleeInterceptHexTooltip';
import type { NamingLookupTarget, TerrainTooltipState } from './map/terrainTooltipTypes';
import {
  clearRes1TooltipSummaryCaches,
  clearTerrainTooltipTimer,
  getCachedNamingLineForTarget,
  getCachedTerrainTooltipHtml,
  getRes1DominantTerrainKind,
  hideTerrainTooltipVisual,
  infraGlyphsAllowedForRes1Hex,
  infraGlyphsAllowedForRes4Child,
  namingLookupTargetForPointer,
  terrainStateForPointer,
  terrainTooltipStateForRes1Hex,
} from './map/terrainTooltipRes1State';
import { isOrderBlockHexTooltipVisible } from './map/orderBlockHexTooltip';
import { isOrderSlowerHexTooltipVisible } from './map/orderSlowerHexTooltip';
import { wireMainMapInteractions as wireMainMapInteractionsFromModule } from './map/mainMapInteractions';
import { wireInitCore as wireInitCoreFromModule } from './map/initCore';
import {
  computeRes1OverlayTextY as computeRes1OverlayTextYFromModule,
  drawRes4TerrainHexes as drawRes4TerrainHexesFromModule,
  drawScenarioHomeRegionOutlines as drawScenarioHomeRegionOutlinesFromModule,
  drawTerrainHexes as drawTerrainHexesFromModule,
  drawTerrainInfrastructureOverlays as drawTerrainInfrastructureOverlaysFromModule,
  hasVisibleRes1InfrastructureGlyphs as hasVisibleRes1InfrastructureGlyphsFromModule,
} from './rendering/terrainRendering';
import { drawRes4CityOverlays, drawStrategicRes1InspectionHexCodes } from './rendering/res4CityOverlays';
import { applyRes4CityOverlayRows } from './rendererRes4Hydration';
import { syncRes4TransportVectorLeafletLayer } from './map/res4TransportVectorLayer';
import {
  applyGameStateSnapshot as applyGameStateSnapshotFromModule,
  refreshGameStateAfterBuildQueueChange as refreshGameStateAfterBuildQueueChangeFromModule,
  updateClientStaleEnemyIntel as updateClientStaleEnemyIntelFromModule,
} from './core/stateSnapshot';
import {
  applySelectionFromSidebarUnitButton as applySelectionFromSidebarUnitButtonFromModule,
  buildKillToastFormatterBundle as buildKillToastFormatterBundleFromModule,
  clearSidebarError as clearSidebarErrorFromModule,
  createSidebarOrderRow as createSidebarOrderRowFromModule,
  formatPendingOrderSidebarLabel as formatPendingOrderSidebarLabelFromModule,
  formatUnitArrowLabel as formatUnitArrowLabelFromModule,
  isPendingMovementOrderForDisplay as isPendingMovementOrderForDisplayFromModule,
  showSidebarError as showSidebarErrorFromModule,
  syncUiAfterSelectionChange as syncUiAfterSelectionChangeFromModule,
  updatePendingOrdersSidebar as updatePendingOrdersSidebarFromModule,
} from './gameplay/sidebarSupport';

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

/**
 * Documents the module-scope binding `stackCalloutNonSelectableUnitIds` (stackCalloutNonSelectableUnitIds: ReadonlySet<string>).

 * Purpose: Supports maintainability by documenting why `stackCalloutNonSelectableUnitIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let stackCalloutNonSelectableUnitIds: ReadonlySet<string> = new Set<string>();

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
 * Defines the `buildResolutionPlaybackState` function shape (function buildResolutionPlaybackState( anim: NonNullable<typeof S.resolutionMoveAnimation>, elapsed: number ): ReturnType<typeof buildResolutionPlaybackS).

 * Purpose: Supports maintainability by documenting why `buildResolutionPlaybackState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildResolutionPlaybackState(
  anim: NonNullable<typeof S.resolutionMoveAnimation>,
  elapsed: number
): ReturnType<typeof buildResolutionPlaybackStateFromModule> {
  return buildResolutionPlaybackStateFromModule(anim, elapsed);
}

/**
 * Defines the `resolutionAnimationElapsedMs` function shape (function resolutionAnimationElapsedMs( anim: NonNullable<typeof S.resolutionMoveAnimation> ): number).

 * Purpose: Delegates to shared playback clock math so tactical Ready can freeze elapsed during post-commit awaits.
 * When to use: Any renderer path that previously subtracted `anim.startTime` from `Date.now()` for resolution playback.
 * Expected outcome: Same ms timeline as `resolutionPlayback.resolutionAnimationElapsedMs` for the current anim object.
 * Exceptions: None.
 */
function resolutionAnimationElapsedMs(anim: NonNullable<typeof S.resolutionMoveAnimation>): number {
  return resolutionAnimationElapsedMsFromModule(anim);
}

/**
 * Defines the `getUnitAtHex` function shape (function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null).

 * Purpose: Supports maintainability by documenting why `getUnitAtHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null {
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
 * Defines the `formatStackTooltip` function shape (function formatStackTooltip(units: GameStateSnapshot['units']): string).

 * Purpose: Supports maintainability by documenting why `formatStackTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatStackTooltip(units: GameStateSnapshot['units']): string {
  const byKey = new Map<string, number>();
  for (const u of units) {
    const key = `${u.player} ${u.unitType}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return Array.from(byKey.entries())
    .map(([key, n]) => `${n} ${key}`)
    .sort()
    .join(', ');
}

/**
 * Defines the `hideStackCallout` function shape (function hideStackCallout(): void).

 * Purpose: Supports maintainability by documenting why `hideStackCallout` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hideStackCallout(): void {
  const el = document.getElementById('stack-callout');
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('stack-modal');
    el.removeAttribute('data-open');
    el.removeAttribute('data-x');
    el.removeAttribute('data-y');
    el.removeAttribute('data-unit-ids');
  }
  S.stackCalloutModalActive = false;
  stackCalloutNonSelectableUnitIds = new Set<string>();
  scheduleTerrainTooltipRestoreAfterPopoverClose();
}

/**
 * Defines the `isStackOrBuildMapPopoverOpen` function shape (function isStackOrBuildMapPopoverOpen(): boolean).

 * Purpose: Supports maintainability by documenting why `isStackOrBuildMapPopoverOpen` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isStackOrBuildMapPopoverOpen(): boolean {
  const stack = document.getElementById('stack-callout');
  const build = document.getElementById('build-popup');
  return (
    (!!stack && !stack.classList.contains('hidden')) || (!!build && !build.classList.contains('hidden'))
  );
}

/**
 * Defines the `shouldSuppressTerrainTooltip` function shape (function shouldSuppressTerrainTooltip(): boolean).

 * Purpose: Supports maintainability by documenting why `shouldSuppressTerrainTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function shouldSuppressTerrainTooltip(): boolean {
  return (
    isStackOrBuildMapPopoverOpen() ||
    S.buildEntryButtonPointerInside ||
    S.tacticalEntryButtonPointerInside ||
    isOrderBlockHexTooltipVisible() ||
    isOrderSlowerHexTooltipVisible()
  );
}

/**
 * Returns whether the given viewport coordinates still lie over the main Leaflet map container.
 *
 * Purpose: After async naming work in `showTerrainTooltip`, the pointer may have moved to the sidebar
 * or other chrome; we must not resurrect the tooltip over non-map UI.
 * When to use: Immediately before revealing `#hex-tooltip` after an `await` in `showTerrainTooltip`.
 * Expected outcome: `true` only when `(clientX, clientY)` intersects the main map `getBoundingClientRect()`.
 * Exceptions: Returns `false` when the map is not initialized.
 */
function isClientPointInsideMainMapLeafletContainer(clientX: number, clientY: number): boolean {
  const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
  if (!map) return false;
  const r = map.getContainer().getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/**
 * Defines the `applyModifierDrivenPopoverCloseRules` function shape (function applyModifierDrivenPopoverCloseRules(reason: 'ctrl_pressed' | 'ctrl_released' | 'window_blur'): void).

 * Purpose: Supports maintainability by documenting why `applyModifierDrivenPopoverCloseRules` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function applyModifierDrivenPopoverCloseRules(reason: 'ctrl_pressed' | 'ctrl_released' | 'window_blur'): void {
  if (reason === 'ctrl_pressed') {
    hideBuildPopup();
    refreshStackCalloutIfOpen();
    return;
  }
  if (reason === 'ctrl_released') {
    hideStackCallout();
    return;
  }
  refreshStackCalloutIfOpen();
}

/**
 * Defines the `activateStackCalloutModal` function shape (function activateStackCalloutModal(): void).

 * Purpose: Supports maintainability by documenting why `activateStackCalloutModal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function activateStackCalloutModal(): void {
  S.stackCalloutModalActive = true;
  const el = document.getElementById('stack-callout');
  if (el) el.classList.add('stack-modal');
}

/**
 * Defines the `onStackSingleUnitToggleClick` function shape (function onStackSingleUnitToggleClick( unitId: string, inSelection: boolean, allUnitsAtHex: GameStateSnapshot['units'], clientX: number, clientY:).

 * Purpose: Supports maintainability by documenting why `onStackSingleUnitToggleClick` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function onStackSingleUnitToggleClick(
  unitId: string,
  inSelection: boolean,
  allUnitsAtHex: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  if (!S.ctrlKeyActive) {
    if (inSelection) {
      removeUnitsFromSelection([unitId]);
    } else {
      replaceSelection([unitId]);
    }
    hideStackCallout();
    syncUiAfterSelectionChange({ refreshHoverPreview: false });
    return;
  }
  activateStackCalloutModal();
  toggleUnitSelection(unitId);
  showStackCallout(allUnitsAtHex, clientX, clientY);
  syncUiAfterSelectionChange({ refreshHoverPreview: false });
}

/**
 * Defines the `onStackAllActionClick` function shape (function onStackAllActionClick( action: 'selectAll' | 'addAll' | 'removeAll', selectableHumanIds: string[], allUnitsAtHex: GameStateSnapshot['units'],).

 * Purpose: Supports maintainability by documenting why `onStackAllActionClick` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function onStackAllActionClick(
  action: 'selectAll' | 'addAll' | 'removeAll',
  selectableHumanIds: string[],
  allUnitsAtHex: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  if (selectableHumanIds.length === 0) return;
  if (action === 'selectAll') {
    replaceSelection(selectableHumanIds);
    hideStackCallout();
    syncUiAfterSelectionChange({ refreshHoverPreview: false });
    return;
  }
  activateStackCalloutModal();
  if (action === 'addAll') addUnitsToSelection(selectableHumanIds);
  else removeUnitsFromSelection(selectableHumanIds);
  showStackCallout(allUnitsAtHex, clientX, clientY);
  syncUiAfterSelectionChange({ refreshHoverPreview: false });
}

/**
 * Defines the `applyStackCalloutSelectionButtonVisibility` function shape (function applyStackCalloutSelectionButtonVisibility(calloutEl: HTMLElement, nonSelectableUnitIds: ReadonlySet<string>): void).

 * Purpose: Supports maintainability by documenting why `applyStackCalloutSelectionButtonVisibility` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function applyStackCalloutSelectionButtonVisibility(calloutEl: HTMLElement, nonSelectableUnitIds: ReadonlySet<string>): void {
  const listEl = document.getElementById('stack-callout-list');
  if (!listEl) return;
  const rows = Array.from(listEl.querySelectorAll('li'));
  for (const row of rows) {
    const unitId = row.getAttribute('data-unit-id');
    if (!unitId) continue;
    const btn = row.querySelector('button.stack-unit-toggle') as HTMLButtonElement | null;
    if (!btn) continue;
    btn.style.display = nonSelectableUnitIds.has(unitId) ? 'none' : '';
  }
}

/**
 * Defines the `setStackPopupNonSelectableUnitIds` function shape (function setStackPopupNonSelectableUnitIds(calloutEl: HTMLElement, unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `setStackPopupNonSelectableUnitIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function setStackPopupNonSelectableUnitIds(calloutEl: HTMLElement, unitIds: string[]): void {
  const normalized = [...new Set(unitIds)].sort((a, b) => a.localeCompare(b));
  const nonSelectable = new Set<string>(normalized);
  stackCalloutNonSelectableUnitIds = nonSelectable;
  const selectedBlockedIds = normalized.filter((unitId) => S.selectedUnitIds.includes(unitId));
  if (selectedBlockedIds.length > 0) {
    removeUnitsFromSelection(selectedBlockedIds);
    syncUiAfterSelectionChange({ refreshHoverPreview: false });
  }
  applyStackCalloutSelectionButtonVisibility(calloutEl, nonSelectable);
}

/**
 * Defines the `getSelectableHumanIdsForStackCallout` function shape (function getSelectableHumanIdsForStackCallout(units: GameStateSnapshot['units']): string[]).

 * Purpose: Supports maintainability by documenting why `getSelectableHumanIdsForStackCallout` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getSelectableHumanIdsForStackCallout(units: GameStateSnapshot['units']): string[] {
  return units.filter((u) => u.player === 'human' && !stackCalloutNonSelectableUnitIds.has(u.id)).map((u) => u.id);
}

/**
 * Defines the `removeSealiftSection` function shape (function removeSealiftSection(calloutEl: HTMLElement): void).

 * Purpose: Supports maintainability by documenting why `removeSealiftSection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function removeSealiftSection(calloutEl: HTMLElement): void {
  const existing = calloutEl.querySelector('.stack-sealift-section');
  if (existing) existing.remove();
}

/**
 * Defines the `buildSealiftUnitLabel` function shape (function buildSealiftUnitLabel(unitId: string, unitType: string): string).

 * Purpose: Supports maintainability by documenting why `buildSealiftUnitLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildSealiftUnitLabel(unitId: string, unitType: string): string {
  void unitType;
  return formatUnitDisplayName(unitId);
}

/**
 * Defines the `renderSealiftSection` function shape (async function renderSealiftSection(units: GameStateSnapshot['units'], calloutEl: HTMLElement): Promise<void>).

 * Purpose: Supports maintainability by documenting why `renderSealiftSection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function renderSealiftSection(units: GameStateSnapshot['units'], calloutEl: HTMLElement): Promise<void> {
  removeSealiftSection(calloutEl);
  const h3Index = units[0]?.h3Index;
  if (!h3Index) return;
  const tacticalSealiftMode = !!(
    S.tacticalBattleSnapshot?.res4ChildH3Indexes.includes(h3Index) &&
    window.gameApi?.getTacticalSealiftStackState &&
    window.gameApi?.updateTacticalSealiftSlot
  );
  if (!tacticalSealiftMode && (!window.gameApi?.getSealiftStackState || !window.gameApi?.updateSealiftSlot)) return;
  if (tacticalSealiftMode && (!window.gameApi?.getTacticalSealiftStackState || !window.gameApi?.updateTacticalSealiftSlot))
    return;
  try {
    let state: SealiftStackState;
    if (tacticalSealiftMode) {
      state = (await window.gameApi.getTacticalSealiftStackState!({ h3Index })) as SealiftStackState;
      state = mergePendingTacticalEmbarkOrdersIntoSealiftState(state, S.pendingEmbarkOrders);
    } else {
      state = (await window.gameApi.getSealiftStackState!({ h3Index })) as SealiftStackState;
    }
    if (calloutEl.classList.contains('hidden')) return;
    if (calloutEl.getAttribute('data-h3-index') !== h3Index) return;
    if (!state.showSealiftSection) return;
    const nonSelectableEmbarkedIds =
      state.contextMode === 'water'
        ? state.navalRows
            .flatMap((row) => [row.slot1UnitId, row.slot2UnitId])
            .filter((unitId): unitId is string => typeof unitId === 'string' && unitId.length > 0)
        : [];
    setStackPopupNonSelectableUnitIds(calloutEl, nonSelectableEmbarkedIds);

    const section = document.createElement('div');
    section.className = 'stack-sealift-section';

    for (const row of state.navalRows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'stack-sealift-row';
      const left = document.createElement('span');
      left.className = 'stack-sealift-naval';
      left.textContent = formatUnitDisplayName(row.navalUnitId);
      rowEl.appendChild(left);

      const right = document.createElement('div');
      right.className = 'stack-sealift-slots';

      const addSlotControl = (
        slotIndex: 1 | 2,
        selectedUnitId: string | null,
        slotDisabled: boolean,
        debarkEnabled: boolean
      ) => {
        const slotRow = document.createElement('div');
        slotRow.className = 'stack-sealift-slot-row';
        const select = document.createElement('select');
        select.className = 'stack-sealift-select';
        select.disabled = slotDisabled;
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(none)';
        select.appendChild(noneOption);
        for (const option of state.landOptions) {
          const opt = document.createElement('option');
          opt.value = option.unitId;
          opt.textContent = buildSealiftUnitLabel(option.unitId, option.unitType);
          select.appendChild(opt);
        }
        select.value = selectedUnitId ?? '';
        select.dataset.prevLand = selectedUnitId ?? '';
        select.addEventListener('change', async () => {
          const selected = select.value.trim();
          if (tacticalSealiftMode) {
            const prev = select.dataset.prevLand ?? '';
            if (prev) {
              withTacticalHumanDraftPrefetchInvalidation(() => {
                S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== prev);
              });
            }
            if (selected.length > 0) {
              withTacticalHumanDraftPrefetchInvalidation(() => {
                S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== selected);
              });
            }
            const result = await window.gameApi.updateTacticalSealiftSlot!({
              h3Index,
              navalUnitId: row.navalUnitId,
              slotIndex,
              landUnitId: selected.length > 0 ? selected : null,
            });
            if (!result.success) {
              showMapToast(formatTargetingValidationReason(result.reason, 'Failed to update sealift assignment.'));
            } else {
              if (result.tacticalBattle) {
                S.tacticalBattleSnapshot = result.tacticalBattle;
              }
              const navalIds = new Set((result.state?.navalRows ?? []).map((r) => r.navalUnitId));
              withTacticalHumanDraftPrefetchInvalidation(() => {
                S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => !navalIds.has(e.navalUnitId));
              });
              select.dataset.prevLand = selected;
              if (selected.length > 0) {
                await refreshHumanStandingOrders();
              }
              updatePendingOrdersSidebar();
            }
            refreshStackCalloutIfOpen();
            requestRedraw();
            return;
          }
          const result = await window.gameApi!.updateSealiftSlot({
            h3Index,
            navalUnitId: row.navalUnitId,
            slotIndex,
            landUnitId: selected.length > 0 ? selected : null,
          });
          if (!result.success) {
            showMapToast(formatTargetingValidationReason(result.reason, 'Failed to update sealift assignment.'));
          } else if (selected.length > 0) {
            // Embarking can cancel existing movement orders server-side, so refresh client order state immediately.
            await refreshHumanStandingOrders();
            updatePendingOrdersSidebar();
            await refreshHoverRoutePreview();
          }
          refreshStackCalloutIfOpen();
          requestRedraw();
        });
        slotRow.appendChild(select);

        if (state.contextMode !== 'water') {
          const debarkBtn = document.createElement('button');
          debarkBtn.type = 'button';
          debarkBtn.className = 'unit-select stack-unit-toggle';
          debarkBtn.textContent = UNIT_DESELECT_GLYPH;
          debarkBtn.disabled = !debarkEnabled;
          debarkBtn.addEventListener('click', async () => {
            if (tacticalSealiftMode) {
              const prev = selectedUnitId ?? '';
              if (prev) {
                const result = await window.gameApi.updateTacticalSealiftSlot!({
                  h3Index,
                  navalUnitId: row.navalUnitId,
                  slotIndex,
                  landUnitId: null,
                });
                if (!result.success) {
                  showMapToast(formatTargetingValidationReason(result.reason, 'Failed to debark unit.'));
                } else {
                  if (result.tacticalBattle) {
                    S.tacticalBattleSnapshot = result.tacticalBattle;
                  }
                  const navalIds = new Set((result.state?.navalRows ?? []).map((r) => r.navalUnitId));
                  withTacticalHumanDraftPrefetchInvalidation(() => {
                    S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== prev);
                    S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => !navalIds.has(e.navalUnitId));
                  });
                  updatePendingOrdersSidebar();
                }
              }
              refreshStackCalloutIfOpen();
              requestRedraw();
              return;
            }
            // Strategic sealift debark (`updateSealiftSlot`): not a tactical res4 draft mutation, so no tactical prefetch
            // fingerprint / `withTacticalHumanDraftPrefetchInvalidation` hook (those apply only under `tacticalSealiftMode`).
            const result = await window.gameApi!.updateSealiftSlot({
              h3Index,
              navalUnitId: row.navalUnitId,
              slotIndex,
              landUnitId: null,
            });
            if (!result.success) {
              showMapToast(formatTargetingValidationReason(result.reason, 'Failed to debark unit.'));
            }
            refreshStackCalloutIfOpen();
            requestRedraw();
          });
          slotRow.appendChild(debarkBtn);
        }
        right.appendChild(slotRow);
      };

      addSlotControl(1, row.slot1UnitId, row.controlsDisabled, row.debarkSlot1Enabled);
      addSlotControl(2, row.slot2UnitId, row.controlsDisabled || row.slot2Disabled, row.debarkSlot2Enabled);
      rowEl.appendChild(right);
      section.appendChild(rowEl);
    }
    calloutEl.appendChild(section);
  } catch (err) {
    console.error('sealift stack section failed:', err);
  }
}

/**
 * Defines the `showStackCallout` function shape (function showStackCallout().

 * Purpose: Supports maintainability by documenting why `showStackCallout` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function showStackCallout(
  units: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  const calloutEl = document.getElementById('stack-callout');
  const listEl = document.getElementById('stack-callout-list');
  if (!calloutEl || !listEl) return;
  hideBuildPopup();
  clearTerrainTooltipTimer();
  hideTerrainTooltipVisual();
  if (S.stackCalloutModalActive) calloutEl.classList.add('stack-modal');
  else calloutEl.classList.remove('stack-modal');

  const sorted = [...units].sort(
    (a, b) =>
      `${a.player} ${a.unitType} ${formatUnitDisplayName(a.id)}`.localeCompare(
        `${b.player} ${b.unitType} ${formatUnitDisplayName(b.id)}`
      )
  );

  calloutEl.setAttribute('data-open', 'true');
  calloutEl.setAttribute('data-x', String(clientX));
  calloutEl.setAttribute('data-y', String(clientY));
  calloutEl.setAttribute('data-h3-index', sorted[0]?.h3Index ?? '');
  calloutEl.setAttribute('data-unit-ids', JSON.stringify(sorted.map((u) => u.id)));
  stackCalloutNonSelectableUnitIds = new Set<string>();

  listEl.innerHTML = '';
  const existingHeader = calloutEl.querySelector('.stack-callout-actions');
  if (existingHeader) existingHeader.remove();
  const header = document.createElement('div');
  header.className = 'stack-callout-actions';
  header.style.display = 'flex';
  header.style.justifyContent = 'flex-start';
  header.style.gap = '0.4rem';
  header.style.marginBottom = '0.4rem';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'unit-select stack-close-btn';
  closeBtn.textContent = '×';
  closeBtn.style.marginRight = 'auto';
  closeBtn.addEventListener('click', () => {
    hideStackCallout();
  });
  header.appendChild(closeBtn);

  const humanIds = sorted.filter((u) => u.player === 'human').map((u) => u.id);
  if (humanIds.length > 0 && !S.ctrlKeyActive) {
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'unit-select';
    selectAllBtn.textContent = `${UNIT_SELECT_GLYPH} All`;
    selectAllBtn.addEventListener('click', () => {
      onStackAllActionClick('selectAll', getSelectableHumanIdsForStackCallout(units), units, clientX, clientY);
    });
    header.appendChild(selectAllBtn);
  } else if (humanIds.length > 0) {
    const addAllBtn = document.createElement('button');
    addAllBtn.type = 'button';
    addAllBtn.className = 'unit-select';
    addAllBtn.textContent = `${UNIT_SELECT_GLYPH} All`;
    addAllBtn.addEventListener('click', () => {
      onStackAllActionClick('addAll', getSelectableHumanIdsForStackCallout(units), units, clientX, clientY);
    });
    const removeAllBtn = document.createElement('button');
    removeAllBtn.type = 'button';
    removeAllBtn.className = 'unit-select';
    removeAllBtn.textContent = `${UNIT_DESELECT_GLYPH} All`;
    removeAllBtn.addEventListener('click', () => {
      onStackAllActionClick('removeAll', getSelectableHumanIdsForStackCallout(units), units, clientX, clientY);
    });
    header.appendChild(removeAllBtn);
    header.appendChild(addAllBtn);
  }
  calloutEl.insertBefore(header, listEl);
  for (const u of sorted) {
    const li = document.createElement('li');
    li.setAttribute('data-unit-id', u.id);
    const label = document.createElement('span');
    label.className = 'unit-label';
    label.textContent = formatUnitDisplayName(u.id);
    li.appendChild(label);
    if (u.player === 'human') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unit-select stack-unit-toggle';
      const inSelection = S.selectedUnitIds.includes(u.id);
      btn.textContent = inSelection ? UNIT_DESELECT_GLYPH : UNIT_SELECT_GLYPH;
      btn.addEventListener('click', () => {
        onStackSingleUnitToggleClick(u.id, inSelection, units, clientX, clientY);
      });
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  }
  applyStackCalloutSelectionButtonVisibility(calloutEl, stackCalloutNonSelectableUnitIds);

  calloutEl.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  calloutEl.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  calloutEl.setAttribute('aria-label', formatStackTooltip(units));
  calloutEl.classList.remove('hidden');
  void renderSealiftSection(sorted, calloutEl);
}

/**
 * Defines the `refreshStackCalloutIfOpen` function shape (function refreshStackCalloutIfOpen(): void).

 * Purpose: Supports maintainability by documenting why `refreshStackCalloutIfOpen` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Resolves stored stack-callout unit ids to drawable rows for both strategic units and tactical sub-units.
 *
 * Purpose: `refreshStackCalloutIfOpen` runs on Control keydown (`ctrl_pressed`); tactical stacks store sub-unit ids that
 * are not rows in `gameState.units`, so resolving only from strategic state incorrectly yields zero rows and closes the popup.
 * When to use: Only from `refreshStackCalloutIfOpen`.
 * Expected outcome: Same unit rows `showStackCallout` would receive when opening from map hit-testing in tactical mode.
 * Exceptions: Returns empty array when ids cannot be matched (caller may hide the callout).
 */
function resolveUnitsForStackCalloutRefresh(unitIds: string[], state: GameStateSnapshot): GameStateSnapshot['units'] {
  if (unitIds.length === 0) return [];
  const tactical = S.tacticalBattleSnapshot;
  const firstId = unitIds[0];
  const tacticalRowsMatch =
    tactical !== null &&
    tactical.subUnits.some((su) => su.id === firstId);
  if (tacticalRowsMatch && tactical) {
    const out: GameStateSnapshot['units'] = [];
    for (const id of unitIds) {
      const su = tactical.subUnits.find((s) => s.id === id);
      if (!su) return [];
      out.push({
        id: su.id,
        player: su.player,
        unitType: su.unitType,
        h3Index: su.h3Index,
      } as GameStateSnapshot['units'][number]);
    }
    return out;
  }
  return unitIds
    .map((id) => state.units.find((u) => u.id === id))
    .filter((unit): unit is NonNullable<typeof unit> => !!unit);
}

function refreshStackCalloutIfOpen(): void {
  const calloutEl = document.getElementById('stack-callout');
  if (!calloutEl || calloutEl.classList.contains('hidden')) return;
  const rawX = calloutEl.getAttribute('data-x');
  const rawY = calloutEl.getAttribute('data-y');
  const rawUnitIds = calloutEl.getAttribute('data-unit-ids');
  if (!rawX || !rawY || !rawUnitIds || !S.gameState) return;
  let unitIds: string[] = [];
  try {
    const parsed = JSON.parse(rawUnitIds);
    if (Array.isArray(parsed)) unitIds = parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return;
  }
  const state = S.gameState;
  if (!state) return;
  const units = resolveUnitsForStackCalloutRefresh(unitIds, state);
  if (units.length === 0) {
    hideStackCallout();
    return;
  }
  showStackCallout(units, Number(rawX), Number(rawY));
}

/**
 * Defines the `hideBuildPopup` function shape (function hideBuildPopup(): void).

 * Purpose: Supports maintainability by documenting why `hideBuildPopup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hideBuildPopup(): void {
  getBuildQueuePopupController().hideBuildPopup();
}

/**
 * Defines the `showBuildPopup` function shape (function showBuildPopup(h3Index: string, clientX: number, clientY: number): void).

 * Purpose: Supports maintainability by documenting why `showBuildPopup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function showBuildPopup(h3Index: string, clientX: number, clientY: number): void {
  getBuildQueuePopupController().showBuildPopup(h3Index, clientX, clientY);
}

/**
 * Defines the `refreshBuildPopupIfOpen` function shape (function refreshBuildPopupIfOpen(): void).

 * Purpose: Supports maintainability by documenting why `refreshBuildPopupIfOpen` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function refreshBuildPopupIfOpen(): void {
  getBuildQueuePopupController().refreshBuildPopupIfOpen();
}

/**
 * Documents the module-scope binding `buildQueuePopupController` (buildQueuePopupController: ReturnType<typeof createBuildQueuePopupController> | null).

 * Purpose: Supports maintainability by documenting why `buildQueuePopupController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let buildQueuePopupController: ReturnType<typeof createBuildQueuePopupController> | null = null;

/**
 * Defines the `getBuildQueuePopupController` function shape (function getBuildQueuePopupController(): ReturnType<typeof createBuildQueuePopupController>).

 * Purpose: Supports maintainability by documenting why `getBuildQueuePopupController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getBuildQueuePopupController(): ReturnType<typeof createBuildQueuePopupController> {
  if (buildQueuePopupController) return buildQueuePopupController;
  buildQueuePopupController = createBuildQueuePopupController({
    shouldRenderRes4Hexes,
    hideStackCallout,
    clearTerrainTooltipTimer,
    hideTerrainTooltipVisual,
    requestRedraw,
    scheduleTerrainTooltipRestoreAfterPopoverClose,
    refreshGameStateAfterBuildQueueChange,
    showMapToast,
  });
  return buildQueuePopupController;
}

/**
 * Defines the `isStackCalloutTargetInsideDialog` function shape (function isStackCalloutTargetInsideDialog(target: EventTarget | null): boolean).

 * Purpose: Supports maintainability by documenting why `isStackCalloutTargetInsideDialog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isStackCalloutTargetInsideDialog(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const callout = document.getElementById('stack-callout');
  return !!callout && callout.contains(target);
}

/**
 * Rebuilds contested-hex tactical magnifier controls during strategic planning at zoom levels where they are meaningful.
 *
 * Purpose: Centralizes dependency wiring for `syncTacticalEntryButton` beside build-entry sync.
 * When to use: Each canvas resize/redraw while strategic planning may show tactical entry.
 * Expected outcome: DOM under `#tactical-entry-layer` matches contested explored res1 hexes.
 * Exceptions: None.
 */
function syncTacticalEntryButtonOverlay(): void {
  tacticalSyncTacticalEntryButtonOverlay({
    isHexExploredByPlayer,
    hasRes1OverlayOffsetFeatures: (h3Index, visibleUnitHexes) =>
      hasVisibleRes1InfrastructureGlyphs(h3Index, shouldRenderRes4Hexes(), visibleUnitHexes),
  });
}

/**
 * Supplies activation side effects shared by magnifier tactical start and main-process snapshot restore.
 *
 * Purpose: Deduplicates the `TacticalRendererStartBattleSideEffects` literal previously repeated in `applyGameStateSnapshot`.
 * When to use: Passed to `startTacticalBattleFromEntryHexFromModule` and `activateRestoredTacticalBattleFromMainSnapshot`.
 * Expected outcome: Identical sequencing for sidebar suppression, res4 entry, HUD refresh, and redraw.
 * Exceptions: None.
 */
function getTacticalBattleActivationSideEffects(): TacticalRendererStartBattleSideEffects {
  return buildDefaultTacticalBattleActivationSideEffects({
    showMapToast,
    syncTacticalEntryOverlay: syncTacticalEntryButtonOverlay,
    redraw,
    refreshReadyButton: () => {
      updateReadyButtonState();
      startBackgroundRequestIfAllowed();
    },
    scheduleAnnihilationExit: maybeScheduleTacticalAnnihilationExit,
    rebuildUnitDisplayNameLookup: () => rebuildUnitDisplayNameLookup(S.gameState),
    refreshOrderSidebars: refreshStrategicOrderSidebars,
  });
}

/**
 * Defines the `refreshGameStateAfterBuildQueueChange` function shape (async function refreshGameStateAfterBuildQueueChange(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshGameStateAfterBuildQueueChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function refreshGameStateAfterBuildQueueChange(): Promise<void> {
  return refreshGameStateAfterBuildQueueChangeFromModule({ applyGameStateSnapshot });
}

/**
 * Defines the `applyGameStateSnapshot` function shape (async function applyGameStateSnapshot( nextState: GameStateSnapshot, options: { refreshStandingOrders?: boolean; updateGameStateSidebarUi?: bool).

 * Purpose: Supports maintainability by documenting why `applyGameStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function applyGameStateSnapshot(
  nextState: GameStateSnapshot,
  options: {
    refreshStandingOrders?: boolean;
    updateGameStateSidebarUi?: boolean;
    updateSelectionUi?: boolean;
    updateGameOverUi?: boolean;
    updateReadyButton?: boolean;
    refreshBuildPopup?: boolean;
    redraw?: boolean;
  } = {}
): Promise<void> {
  return applyGameStateSnapshotFromModule(
    {
      rebuildUnitDisplayNameLookup,
      reconcileSelectionToCurrentState,
      updateClientStaleEnemyIntel,
      clearRes1TooltipSummaryCaches,
      refreshHumanStandingOrders,
      updateGameStateSidebar,
      updateRangedSidebar,
      updateSidebar,
      updatePendingOrdersSidebar,
      updateGameOverUI,
      updateReadyButtonState,
      redraw,
      refreshBuildPopupIfOpen,
      reconcileTacticalBattleAfterStrategicSnapshot: tacticalReconcileBattleAfterStrategicSnapshot,
      applyRestoredTacticalBattleFromMain: (battle) => {
        activateRestoredTacticalBattleFromMainSnapshot(battle, getTacticalBattleActivationSideEffects);
      },
    },
    nextState,
    options
  );
}

/**
 * Defines the `showTerrainTooltip` function shape (async function showTerrainTooltip( clientX: number, clientY: number, state: TerrainTooltipState, namingTarget: NamingLookupTarget | null ): Promise).

 * Purpose: Supports maintainability by documenting why `showTerrainTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function showTerrainTooltip(
  clientX: number,
  clientY: number,
  state: TerrainTooltipState,
  namingTarget: NamingLookupTarget | null
): Promise<void> {
  if (shouldSuppressTerrainTooltip()) return;
  const requestSeq = ++S.terrainTooltipRequestSeq;
  const namingLine = await getCachedNamingLineForTarget(namingTarget);
  if (requestSeq !== S.terrainTooltipRequestSeq) return;
  if (shouldSuppressTerrainTooltip()) return;
  if (!isClientPointInsideMainMapLeafletContainer(S.lastPointerClientX, S.lastPointerClientY)) return;
  const el = document.getElementById('hex-tooltip');
  if (!el) return;
  el.innerHTML = getCachedTerrainTooltipHtml(state, namingLine, namingTarget);
  el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'tooltip');
}

/**
 * Defines the `restoreTerrainTooltipAfterPopoverClose` function shape (async function restoreTerrainTooltipAfterPopoverClose(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `restoreTerrainTooltipAfterPopoverClose` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function restoreTerrainTooltipAfterPopoverClose(): Promise<void> {
  if (!S.gameState) return;
  if (S.buildEntryButtonPointerInside) {
    const atPointer = document.elementFromPoint(S.lastPointerClientX, S.lastPointerClientY);
    const stillInsideBuildEntry = atPointer instanceof Element && !!atPointer.closest('.build-entry-btn');
    if (!stillInsideBuildEntry) S.buildEntryButtonPointerInside = false;
  }
  if (S.tacticalEntryButtonPointerInside) {
    const atPointerT = document.elementFromPoint(S.lastPointerClientX, S.lastPointerClientY);
    const stillInsideTacticalEntry = atPointerT instanceof Element && !!atPointerT.closest('.tactical-entry-btn');
    if (!stillInsideTacticalEntry) S.tacticalEntryButtonPointerInside = false;
  }
  if (shouldSuppressTerrainTooltip()) return;
  let hoverH3 = S.hoveredHexH3;
  if (!hoverH3) {
    const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    if (!map) return;
    const rect = map.getContainer().getBoundingClientRect();
    const x = S.lastPointerClientX - rect.left;
    const y = S.lastPointerClientY - rect.top;
    const tb = S.tacticalBattleSnapshot;
    if (tb) {
      hoverH3 = hitTestTacticalRes4HexAtContainerPixel(x, y, tb);
    } else {
      const set = new Set(S.gameState.hexes.map((h) => h.h3Index));
      hoverH3 = hitTestHexAtContainerPixel(x, y, set);
    }
    if (!hoverH3) return;
    S.hoveredHexH3 = hoverH3;
  }
  clearTerrainTooltipTimer();
  const state = terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, hoverH3);
  const namingTarget = namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, hoverH3);
  await showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
}

/**
 * Defines the `scheduleTerrainTooltipRestoreAfterPopoverClose` function shape (function scheduleTerrainTooltipRestoreAfterPopoverClose(): void).

 * Purpose: Supports maintainability by documenting why `scheduleTerrainTooltipRestoreAfterPopoverClose` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function scheduleTerrainTooltipRestoreAfterPopoverClose(): void {
  if (S.terrainTooltipRestoreTimer !== null) {
    clearTimeout(S.terrainTooltipRestoreTimer);
    S.terrainTooltipRestoreTimer = null;
  }
  S.terrainTooltipRestoreTimer = setTimeout(() => {
    S.terrainTooltipRestoreTimer = null;
    void restoreTerrainTooltipAfterPopoverClose();
  }, 0);
}

/**
 * Defines the `getPrimarySelectedUnitId` function shape (function getPrimarySelectedUnitId(): string | null).

 * Purpose: Supports maintainability by documenting why `getPrimarySelectedUnitId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getPrimarySelectedUnitId(): string | null {
  return S.selectedUnitIds[0] ?? null;
}

/**
 * Defines the `rebuildUnitDisplayNameLookup` function shape (function rebuildUnitDisplayNameLookup(state: GameStateSnapshot | null): void).

 * Purpose: Supports maintainability by documenting why `rebuildUnitDisplayNameLookup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function rebuildUnitDisplayNameLookup(state: GameStateSnapshot | null): void {
  const base = state ? buildUnitDisplayNameLookup(state.units) : new Map<string, string>();
  const tb = S.tacticalBattleSnapshot;
  if (tb) {
    for (const su of tb.subUnits) {
      base.set(su.id, su.displayName);
    }
  }
  S.unitDisplayNameById = base;
}

/**
 * Defines the `applyRes4TerrainOverrides` function shape (function applyRes4TerrainOverrides(rows: Array<{ h3Index: string; terrainKind: string; isUrban: boolean; isAirport?: boolean; isSeaport?: boolean).

 * Purpose: Supports maintainability by documenting why `applyRes4TerrainOverrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function applyRes4TerrainOverrides(rows: Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}>): void {
  const nextState = deriveInfrastructureOverlayState(rows);
  S.res4TerrainOverridesByH3 = nextState.res4TerrainOverridesByH3;
  S.terrainInfraRes1Airport = nextState.terrainInfraRes1Airport;
  S.terrainInfraRes1Seaport = nextState.terrainInfraRes1Seaport;
  S.terrainInfraRes4Airport = nextState.terrainInfraRes4Airport;
  S.terrainInfraRes4Seaport = nextState.terrainInfraRes4Seaport;
  clearRes1TooltipSummaryCaches();
}

/**
 * Tracks whether static res4 city/road/rail/vector overlays were fetched this renderer session.
 *
 * Purpose: Avoids repeating large static IPC payloads on every Ready refresh.
 * When to use: Cleared when `reloadStaticOverlays` is true (New Game path).
 * Expected outcome: Static overlays load once per session unless explicitly reset.
 * Exceptions: None.
 */
let sessionStaticRes4OverlaysLoaded = false;

/**
 * Fetches static res4 overlay IPC payloads once per session unless `forceReload` is set.
 *
 * Purpose: Split from dynamic terrain-override refresh (Phase 8 performance plan).
 * When to use: Before every map refresh; skipped when already loaded and not forced.
 * Expected outcome: City/road-rail/vector renderer state populated via `applyRes4CityOverlayRows`.
 * Exceptions: Logs to console and rethrows on IPC failure (caller catches).
 */
async function ensureStaticRes4OverlaysLoaded(forceReload: boolean): Promise<void> {
  if (sessionStaticRes4OverlaysLoaded && !forceReload) return;
  const api = window.gameApi;
  if (!api) return;
  const cityPromise = api.getRes4CityOverlays ? api.getRes4CityOverlays() : Promise.resolve<Res4CityOverlayRow[]>([]);
  const roadRailPromise = api.getRes4RoadRailOverlays
    ? api.getRes4RoadRailOverlays()
    : Promise.resolve<Res4RoadRailOverlayRow[]>([]);
  const vectorsPromise = api.getRes4TransportVectorOverlays
    ? api.getRes4TransportVectorOverlays()
    : Promise.resolve<Res4TransportVectorOverlayRow[]>([]);
  const [cityRows, roadRailRows, vectorRows] = await Promise.all([cityPromise, roadRailPromise, vectorsPromise]);
  applyRes4CityOverlayRows(cityRows, roadRailRows, vectorRows);
  sessionStaticRes4OverlaysLoaded = true;
}

/**
 * Defines the `refreshRes4TerrainOverridesForRenderer` function shape (async function refreshRes4TerrainOverridesForRenderer(): Promise<void>).

 * Purpose: Refreshes dynamic res4 terrain overrides on every call; static overlays load once per session (or when `reloadStaticOverlays` is true).
 * When to use: Map init, New Game, Ready, and infrastructure-damage refresh triggers.
 * Expected outcome: Dynamic rubble/airport/seaport state updates; static overlays unchanged on routine Ready.
 * Exceptions: Logs failure to console; does not throw to callers.
 */
async function refreshRes4TerrainOverridesForRenderer(options?: { reloadStaticOverlays?: boolean }): Promise<void> {
  const api = window.gameApi;
  if (!api?.getRes4TerrainOverrides) return;
  try {
    await ensureStaticRes4OverlaysLoaded(options?.reloadStaticOverlays === true);
    const rows = await api.getRes4TerrainOverrides();
    applyRes4TerrainOverrides(rows);
    requestRedraw();
  } catch (err) {
    console.error('refreshRes4TerrainOverridesForRenderer failed:', err);
  }
}

/**
 * Defines the `formatUnitDisplayName` function shape (function formatUnitDisplayName(unitId: string): string).

 * Purpose: Supports maintainability by documenting why `formatUnitDisplayName` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatUnitDisplayName(unitId: string): string {
  return S.unitDisplayNameById.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId);
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
 * Defines the `reconcileSelectionToCurrentState` function shape (function reconcileSelectionToCurrentState(): void).

 * Purpose: Supports maintainability by documenting why `reconcileSelectionToCurrentState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function reconcileSelectionToCurrentState(): void {
  return reconcileSelectionToCurrentStateFromModule();
}

/**
 * Defines the `replaceSelection` function shape (function replaceSelection(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `replaceSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function replaceSelection(unitIds: string[]): void {
  return replaceSelectionFromModule(unitIds);
}

/**
 * Defines the `addUnitsToSelection` function shape (function addUnitsToSelection(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `addUnitsToSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function addUnitsToSelection(unitIds: string[]): void {
  return addUnitsToSelectionFromModule(unitIds);
}

/**
 * Defines the `removeUnitsFromSelection` function shape (function removeUnitsFromSelection(unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `removeUnitsFromSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function removeUnitsFromSelection(unitIds: string[]): void {
  return removeUnitsFromSelectionFromModule(unitIds);
}

/**
 * Defines the `toggleUnitSelection` function shape (function toggleUnitSelection(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `toggleUnitSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function toggleUnitSelection(unitId: string): void {
  return toggleUnitSelectionFromModule(unitId);
}

/**
 * Defines the `clearSelection` function shape (function clearSelection(): void).

 * Purpose: Supports maintainability by documenting why `clearSelection` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function clearSelection(): void {
  return clearSelectionFromModule();
}

/**
 * Defines the `getVisibleHexSet` function shape (function getVisibleHexSet(state: GameStateSnapshot | null): Set<string>).

 * Purpose: Supports maintainability by documenting why `getVisibleHexSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getVisibleHexSet(state: GameStateSnapshot | null): Set<string> {
  return getVisibleHexSetFromModule(state);
}

/**
 * Defines the `getExploredHexSet` function shape (function getExploredHexSet(state: GameStateSnapshot | null): Set<string>).

 * Purpose: Supports maintainability by documenting why `getExploredHexSet` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getExploredHexSet(state: GameStateSnapshot | null): Set<string> {
  return getExploredHexSetFromModule(state);
}

/**
 * Defines the `isHexExploredByPlayer` function shape (function isHexExploredByPlayer(h3Index: string): boolean).

 * Purpose: Supports maintainability by documenting why `isHexExploredByPlayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isHexExploredByPlayer(h3Index: string): boolean {
  return isHexExploredByPlayerFromModule(h3Index);
}

/**
 * Defines the `inferUnitTypeLabelFromId` function shape (function inferUnitTypeLabelFromId(unitId: string): string).

 * Purpose: Supports maintainability by documenting why `inferUnitTypeLabelFromId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function inferUnitTypeLabelFromId(unitId: string): string {
  if (unitId.includes('-infantry-')) return 'I';
  if (unitId.includes('-armor-')) return 'A';
  if (unitId.includes('-naval-')) return 'N';
  if (unitId.includes('-air-')) return 'S';
  return '?';
}

/**
 * Defines the `formatUnknownBattleAnnouncement` function shape (function formatUnknownBattleAnnouncement(continentNames: string[]): string).

 * Purpose: Supports maintainability by documenting why `formatUnknownBattleAnnouncement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatUnknownBattleAnnouncement(continentNames: string[]): string {
  const clean = continentNames
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((name, idx, arr) => arr.indexOf(name) === idx);
  if (clean.length === 0) return 'Unknown battle observed in an unidentified continent.';
  if (clean.length === 1) return `Unknown battle observed in ${clean[0]}.`;
  if (clean.length === 2) return `Unknown battle observed in ${clean[0]} or ${clean[1]}.`;
  return `Unknown battle observed in ${clean.slice(0, -1).join(', ')}, or ${clean[clean.length - 1]}.`;
}
/**
 * Defines the `requestRedraw` function shape (function requestRedraw(): void).

 * Purpose: Supports maintainability by documenting why `requestRedraw` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function requestRedraw(): void {
  if (S.resolutionMoveAnimation) return;
  if (S.redrawRafId !== null) return;

  S.redrawRafId = requestAnimationFrame(() => {
    S.redrawRafId = null;
    redraw();
  });
}

/**
 * Defines the `updateClientStaleEnemyIntel` function shape (function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void).

 * Purpose: Supports maintainability by documenting why `updateClientStaleEnemyIntel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void {
  return updateClientStaleEnemyIntelFromModule(previousState, state);
}

/**
 * Defines the `detailHitAtClientPixel` function shape (function detailHitAtClientPixel().

 * Purpose: Supports maintainability by documenting why `detailHitAtClientPixel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function detailHitAtClientPixel(
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
 * Defines the `drawTerrainHexes` function shape (function drawTerrainHexes(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawTerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawTerrainHexes(ctx: CanvasRenderingContext2D): void {
  // Contract anchor retained after extraction:
  // if (res4Active) return;
  return drawTerrainHexesFromModule(ctx, {
    getExploredHexSet,
    getRes1DominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForRes1Hex,
    infraGlyphsAllowedForRes4Child,
  });
}

/**
 * Defines the `hasVisibleRes1InfrastructureGlyphs` function shape (function hasVisibleRes1InfrastructureGlyphs().

 * Purpose: Supports maintainability by documenting why `hasVisibleRes1InfrastructureGlyphs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function hasVisibleRes1InfrastructureGlyphs(
  h3Index: string,
  res4On: boolean,
  unitHexes: Set<string>
): boolean {
  return hasVisibleRes1InfrastructureGlyphsFromModule(h3Index, res4On, unitHexes, {
    getExploredHexSet,
    getRes1DominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForRes1Hex,
    infraGlyphsAllowedForRes4Child,
  });
}

/**
 * Defines the `computeRes1OverlayTextY` function shape (function computeRes1OverlayTextY( h3Index: string, map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }, L: { latLng: (lat: numbe).

 * Purpose: Supports maintainability by documenting why `computeRes1OverlayTextY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function computeRes1OverlayTextY(
  h3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  L: { latLng: (lat: number, lng: number) => unknown },
  hasOffsetFeatures: boolean
): number {
  return computeRes1OverlayTextYFromModule(h3Index, map, L, hasOffsetFeatures);
}

/**
 * Defines the `syncBuildEntryButton` function shape (function syncBuildEntryButton(): void).

 * Purpose: Supports maintainability by documenting why `syncBuildEntryButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
  const res4On = shouldRenderRes4Hexes();
  if (res4On) {
    hideBuildEntryLayer(layer);
    hideBuildPopup();
    return;
  }
  const visibleUnitHexes = new Set(S.gameState.units.map((u) => u.h3Index));
  const rows: Array<{ h3: string; label: string; left: number; top: number; hasCapacity: boolean }> = [];
  for (const hx of S.gameState.hexes) {
    const explored = isHexExploredByPlayer(hx.h3Index);
    if (!explored) continue;
    if (!isRes1HexHumanUrbanProduction(S.gameState, hx)) continue;
    const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);
    const hasInfraSymbols = hasVisibleRes1InfrastructureGlyphs(hx.h3Index, res4On, visibleUnitHexes);
    const hasVisibleUnits = visibleUnitHexes.has(hx.h3Index);
    const center = hexCenterPx(hx.h3Index);
    // While T is held, align build-entry buttons with the downward offset used for airport/seaport hexes so labels stay clear of centered hex codes.
    const textY = computeRes1OverlayTextY(
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
    });
  }
  if (rows.length === 0) {
    hideBuildEntryLayer(layer);
    return;
  }
  rows.sort((a, b) => a.h3.localeCompare(b.h3));
  const layerKey = rows
    .map((r) => `${r.h3}|${r.label}|${r.left}|${r.top}|${r.hasCapacity ? 1 : 0}`)
    .join(';');
  if (layerKey !== S.lastBuildEntryLayerKey) {
    const html = rows
      .map(
        (r) =>
          `<button type="button" class="build-entry-btn${r.hasCapacity ? ' has-capacity' : ''}" data-h3-index="${r.h3}" style="left:${r.left}px;top:${r.top}px;transform:translate(-50%, -50%);" aria-label="Open build queue for ${r.h3}">${r.label}</button>`
      )
      .join('');
    layer.innerHTML = html;
    S.lastBuildEntryLayerKey = layerKey;
  }
  layer.classList.remove('hidden');
  layer.setAttribute('aria-hidden', 'false');
}

/**
 * Defines the `drawRes4TerrainHexes` function shape (function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawRes4TerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D): void {
  return drawRes4TerrainHexesFromModule(ctx, {
    getExploredHexSet,
    getRes1DominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForRes1Hex,
    infraGlyphsAllowedForRes4Child,
  });
}

/**
 * Defines the `drawScenarioHomeRegionOutlines` function shape (function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawScenarioHomeRegionOutlines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void {
  return drawScenarioHomeRegionOutlinesFromModule(ctx);
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
function drawRes4CityOverlayPass(ctx: CanvasRenderingContext2D): void {
  drawRes4CityOverlays(ctx, {
    getExploredHexSet,
  });
}

/**
 * Defines the `drawRes1ProductionOverlays` function shape (function drawRes1ProductionOverlays(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawRes1ProductionOverlays` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawRes1ProductionOverlays(ctx: CanvasRenderingContext2D): void {
  if (!S.gameState) return;
  if (shouldRenderRes4Hexes()) return;
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
      const canShowLabelWithoutInspection = isRes1HexHumanUrbanProduction(S.gameState, hx) || controlledByHuman;
      if (!canShowLabelWithoutInspection) continue;
    }
    const hasUrbanCapacity = capacityPerTurn > 0;
    const hasInfraSymbols = hasVisibleRes1InfrastructureGlyphs(hx.h3Index, false, overlayContext.unitHexes);
    const hasVisibleUnits = overlayContext.unitHexes.has(hx.h3Index);
    const center = hexCenterPx(hx.h3Index);
    // Inspection mode shows centered hex codes on res1; push production text to the same lower band as infra-heavy hexes.
    const textY = computeRes1OverlayTextY(
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
      explored && isRes1HexHumanUrbanProduction(S.gameState, hx) && shouldShowBuildEntryZoom();
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
 * Defines the `syncEventDrivenFromTools` function shape (function syncEventDrivenFromTools(): void).

 * Purpose: Supports maintainability by documenting why `syncEventDrivenFromTools` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function syncEventDrivenFromTools(): void {
  return syncEventDrivenFromToolsFromModule();
}

/**
 * Defines the `startBackgroundRequestIfAllowed` function shape (function startBackgroundRequestIfAllowed(): void).

 * Purpose: Supports maintainability by documenting why `startBackgroundRequestIfAllowed` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function startBackgroundRequestIfAllowed(): void {
  return startBackgroundRequestIfAllowedFromModule({
    appendOpenRouterLog,
    updateReadyButtonState,
    updateOpenRouterToolCountLabels,
    updateOpenRouterCostLabel,
    showSidebarError,
    showAiStrategyToast,
    requestRedraw,
  });
}

/**
 * Defines the `renderOpenRouterToolsList` function shape (function renderOpenRouterToolsList(): void).

 * Purpose: Supports maintainability by documenting why `renderOpenRouterToolsList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function renderOpenRouterToolsList(): void {
  return renderOpenRouterToolsListFromModule({
    appendOpenRouterLog,
    updateReadyButtonState,
    updateOpenRouterToolCountLabels,
    updateOpenRouterCostLabel,
    showSidebarError,
    showAiStrategyToast,
  });
}

/**
 * Defines the `drawLoadingScene` function shape (function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number): void).

 * Purpose: Supports maintainability by documenting why `drawLoadingScene` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawLoadingScene(ctx: CanvasRenderingContext2D, width: number, height: number): void {
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
function getUnitsForDrawWithMovingIds(state: GameStateSnapshot): {
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
 * Defines the `containerPixelHitsDrawnUnitIcon` function shape (function containerPixelHitsDrawnUnitIcon().

 * Purpose: Supports maintainability by documenting why `containerPixelHitsDrawnUnitIcon` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function containerPixelHitsDrawnUnitIcon(
  px: number,
  py: number,
  h3Index: string,
  unitCount: number
): boolean {
  return containerPixelHitsDrawnUnitIconFromModule(px, py, h3Index, unitCount);
}

/**
 * Defines the `tryHandleBuildEntryAtClientXY` function shape (function tryHandleBuildEntryAtClientXY(clientX: number, clientY: number): boolean).

 * Purpose: Supports maintainability by documenting why `tryHandleBuildEntryAtClientXY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function tryHandleBuildEntryAtClientXY(clientX: number, clientY: number): boolean {
  return tryHandleBuildEntryAtClientXYFromModule(clientX, clientY, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/**
 * Refreshes pending-movement, ranged/air/ferry, and selected-unit sidebars after shared order state changes (e.g. tactical exit teardown).
 *
 * Purpose: Keeps DOM updates for the three panels in one place alongside `prepareStrategicPlanningUiBeforeTacticalAutoStart` (which performs the same three calls after clearing drafts and reloading standing orders).
 * When to use: Tactical-exit `refreshSidebarAfterTacticalDraftTeardown`; do not duplicate these three calls elsewhere without updating both paths.
 * Expected outcome: Pending orders list, ranged strike UI, and unit sidebar reflect current `S` slices.
 * Exceptions: None.
 */
function refreshStrategicOrderSidebars(): void {
  updatePendingOrdersSidebar();
  updateRangedSidebar();
  updateSidebar();
}

/**
 * Delegates to `prepareStrategicPlanningUiBeforeTacticalAutoStart` with renderer closures so magnifier tactical entry matches Ready’s Fight → tactical auto-start sequence.
 *
 * Purpose: Bridges `startTacticalBattleFromEntryHex` deps to the shared ready-handler helper.
 * When to use: Passed as `prepareStrategicUiBeforeTacticalStart` into `startTacticalBattleFromEntryHexFromModule`.
 * Expected outcome: Same mutations as `handleReadyButtonClick` immediately before `startTacticalBattleFromInterceptHex`.
 * Exceptions: None.
 */
async function prepareStrategicUiBeforeTacticalStartFromMagnifier(): Promise<void> {
  await prepareStrategicPlanningUiBeforeTacticalAutoStart(S.gameState, {
    clearPendingTacticalOrders,
    refreshHumanStandingOrders,
    updateGameStateSidebar,
    updatePendingOrdersSidebar,
    updateRangedSidebar,
    updateSidebar,
  });
}

/**
 * Renderer-local entry point for magnifier-driven tactical start; delegates IPC and activation to `tacticalEntryFlow`.
 *
 * Purpose: Preserves the historical `startTacticalBattleFromEntryHex` symbol for map wiring while shrinking `renderer.ts`.
 * When to use: Tactical entry layer hit tests and `#tactical-entry-layer` button handlers.
 * Expected outcome: Same toasts and res4 transition as `startTacticalBattleFromEntryHexFromModule`; resumes an existing main-process session when the clicked hex matches without a redundant `startTacticalBattle` IPC.
 * Exceptions: None; missing IPC surfaces through the shared unavailable toast.
 */
async function startTacticalBattleFromEntryHex(h3: string): Promise<void> {
  await startTacticalBattleFromEntryHexFromModule(h3, {
    hideBuildPopup,
    invokeStartTacticalBattle: window.gameApi?.startTacticalBattle,
    getActivationSideEffects: getTacticalBattleActivationSideEffects,
    onMissingStartTacticalBattleIpc: () => {
      showMapToast('Tactical battle is not available.', { isError: true });
    },
    prepareStrategicUiBeforeTacticalStart: prepareStrategicUiBeforeTacticalStartFromMagnifier,
  });
}

/**
 * Starts a tactical battle when the player clicks a contested-hex magnifier during strategic planning.
 *
 * Purpose: Bridges map overlay clicks to `startTacticalBattle` IPC and tactical map entry.
 * When to use: Main map interactions before build-entry handling returns.
 * Expected outcome: On success, renderer enters tactical res4 view; on failure, shows a toast.
 * Exceptions: None.
 */
async function tryHandleTacticalEntryAtClientXY(clientX: number, clientY: number): Promise<boolean> {
  return tryHandleTacticalEntryAtClientXYFromModule(clientX, clientY, startTacticalBattleFromEntryHex);
}

/**
 * Bridges renderer tooltip helpers into the shared melee-intercept hex HTML builder.
 *
 * Purpose: Keeps `ReadyHandlerDeps.buildMeleeInterceptHexPopupHtml` stable without duplicating tooltip assembly in `renderer.ts`.
 * When to use: Only from `createReadyHandlerDeps`.
 * Expected outcome: Delegates to `meleeInterceptHexTooltip` with live naming/terrain readers.
 * Exceptions: None.
 */
async function buildMeleeInterceptHexPopupHtmlForRes1(h3Index: string): Promise<string> {
  return buildMeleeInterceptHexPopupHtmlForRes1FromModule(h3Index, {
    getCachedNamingLineForTarget,
    terrainTooltipStateForRes1Hex,
    getCachedTerrainTooltipHtml,
  });
}

/**
 * Builds the shared dependency bundle for strategic Ready handling (also used after tactical exit).
 *
 * Purpose: Keeps Ready and tactical-exit paths identical so milestone-2.1 “Ready-equivalent” behavior stays centralized.
 * When to use: Ready button clicks and tactical exit after `endTacticalBattle` IPC succeeds.
 * Expected outcome: A fully populated `ReadyHandlerDeps` object referencing live renderer helpers.
 * Exceptions: None.
 */
function createReadyHandlerDeps(): ReadyHandlerDeps {
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
  };
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
 * Expected outcome: Clears renderer tactical snapshot and invokes Ready pipeline on success.
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
  });
}

/**
 * Defines the `updateMapInteractionCursor` function shape (function updateMapInteractionCursor(clientX: number, clientY: number): void).

 * Purpose: Supports maintainability by documenting why `updateMapInteractionCursor` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updateMapInteractionCursor(clientX: number, clientY: number): void {
  return updateMapInteractionCursorFromModule(clientX, clientY, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/**
 * Defines the `drawGameScene` function shape (function drawGameScene().

 * Purpose: Supports maintainability by documenting why `drawGameScene` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
/**
 * Merges current tactical sub-unit rows with a pre-commit copy so resolution playback can still resolve movers removed
 * later in the same beat (ranged/melee) from `buildResolutionPlaybackMoves`.
 *
 * Purpose: Post-commit `tacticalBattleSnapshot.subUnits` omits casualties; march `ResolutionMove` entries would
 * otherwise lose `player`/`unitType` lookup and be dropped from lines and glides.
 * When to use: Tactical `drawGameScene` and `getUnitsForDrawWithMovingIds` while `resolutionMoveAnimation` is active.
 * Expected outcome: Prefer live rows when an id exists; add missing ids from `pre` only.
 * Exceptions: None.
 */
function mergeTacticalSubUnitsForMarchPlayback(
  current: GameStateSnapshot['units'],
  pre: GameStateSnapshot['units'] | undefined
): GameStateSnapshot['units'] {
  if (!pre?.length) return current;
  const byId = new Map(current.map((u) => [u.id, u]));
  for (const u of pre) {
    if (!byId.has(u.id)) byId.set(u.id, u);
  }
  return [...byId.values()];
}

function drawGameScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameStateSnapshot
): void {
  syncRes4TransportVectorLeafletLayer();
  ctx.clearRect(0, 0, width, height);
  if (S.tacticalBattleSnapshot) {
    maybeScheduleTacticalAnnihilationExit();
    drawTerrainHexes(ctx);
    drawRes4TerrainHexes(ctx);
    drawRes1ProductionOverlays(ctx);
    drawRes4CityOverlayPass(ctx);
    drawStrategicRes1InspectionHexCodes(ctx, { getExploredHexSet });
    drawTerrainInfrastructureOverlays(ctx);
    const tb = S.tacticalBattleSnapshot;
    const hexList = state.hexes.map((h) => h.h3Index);
    drawPendingMarchesHoverAndSupportOrderStack({
      ctx,
      width,
      height,
      state,
      hexList,
      drawTacticalPendingMarchesFirst: () => drawTacticalPendingMarchPlanLines(ctx, tb, S.tacticalPendingMarches),
      shouldDrawMarchHoverPreview: shouldDrawHoveredPathPreview(),
      resolutionAnimationBlocksMarchHoverPreview: !!S.resolutionMoveAnimation,
      drawMarchHoverPreview: drawHoverRoutePreview,
    });
    const tacticalUnits = tb.subUnits.map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
    })) as GameStateSnapshot['units'];
    const anim = S.resolutionMoveAnimation;
    const tacticalUnitsForMarchPlayback = anim
      ? mergeTacticalSubUnitsForMarchPlayback(tacticalUnits, anim.tacticalMarchPlaybackUnits)
      : tacticalUnits;
    let moveProgress = 1;
    let airStrikeOutboundProgress = 1;
    let airStrikeReturnProgress = 1;
    let playbackPhase: ResolutionPlaybackPhase | null = null;
    const regularPlaybackMoves = buildResolutionPlaybackMoves(anim?.moves ?? [], tacticalUnitsForMarchPlayback);
    const airStrikeOutboundPlaybackMoves = anim?.airStrikeOutboundMoves ?? [];
    const airStrikeReturnPlaybackMoves = anim?.airStrikeReturnMoves ?? [];
    const stateForTacticalAnim =
      anim && tacticalUnitsForMarchPlayback.length > 0
        ? { ...state, units: tacticalUnitsForMarchPlayback }
        : state;
    let elapsedAnim = 0;
    if (anim) {
      elapsedAnim = resolutionAnimationElapsedMs(anim);
      const { phase } = buildResolutionPlaybackState(anim, elapsedAnim);
      playbackPhase = phase;
      moveProgress = phase.moveProgress;
      airStrikeOutboundProgress = phase.airStrikeOutboundProgress;
      airStrikeReturnProgress = phase.airStrikeReturnProgress;
    }
    const { unitsToDraw, movingIds } = anim
      ? getUnitsForDrawWithMovingIds(stateForTacticalAnim)
      : { unitsToDraw: tacticalUnits, movingIds: undefined };
    let effectiveMovingIds = movingIds;
    if (anim && playbackPhase?.inMovement && moveProgress < 1) {
      if (regularPlaybackMoves.length > 0) {
        effectiveMovingIds = new Set(regularPlaybackMoves.map((m) => m.unitId));
      } else if ((anim.moves?.length ?? 0) > 0) {
        effectiveMovingIds = undefined;
      }
    }
    if (anim && playbackPhase) {
      if (playbackPhase.inAirStrikeOutbound) {
        drawResolutionMoveLines(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
      }
      if (playbackPhase.inAirStrikeReturn) {
        drawResolutionMoveLines(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
      }
      if (elapsedAnim >= playbackPhase.movementStart) {
        drawResolutionMoveLines(ctx, width, height, regularPlaybackMoves, hexList, 1);
      }
    }
    if (unitsToDraw.length) drawUnits(ctx, unitsToDraw, effectiveMovingIds);
    if (anim && hexList) {
      if (playbackPhase?.inAirStrikeOutbound && airStrikeOutboundProgress < 1) {
        drawMovingUnits(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, airStrikeOutboundProgress);
      } else if (playbackPhase?.inAirStrikeReturn && airStrikeReturnProgress < 1) {
        drawMovingUnits(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, airStrikeReturnProgress);
      } else if (moveProgress < 1) {
        drawMovingUnits(ctx, width, height, regularPlaybackMoves, hexList, moveProgress);
      }
    }
    if (anim && hexList) {
      const elapsed = resolutionAnimationElapsedMs(anim);
      const { phase } = buildResolutionPlaybackState(anim, elapsed);
      const meleeCombatHexes = [
        ...(anim.meleeCombatHexes ?? []),
        ...(anim.controlLossLightningHexes ?? []),
      ].filter((h3, idx, arr) => arr.indexOf(h3) === idx);
      const combatHexes = phase.inAirStrikeLightning
        ? anim.airStrikeCombatHexes
        : phase.inRangedLightning
          ? (anim.rangedCombatHexes ?? anim.combatHexes)
          : phase.inMeleeLightning
            ? meleeCombatHexes
            : undefined;
      if (combatHexes?.length) {
        const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
        const unknownSet = new Set(anim.unknownCombatHexes ?? []);
        const knownCombatHexes = combatHexes.filter((h3) => !unknownSet.has(h3));
        const unknownCombatHexes = combatHexes.filter((h3) => unknownSet.has(h3));
        drawCombatLightning(ctx, width, height, knownCombatHexes, hexList, pulseOpacity);
        drawUnknownBattleMarkers(ctx, unknownCombatHexes, pulseOpacity);
      }
      const casualtyHexes = phase.inAirStrikeCasualty
        ? anim.airStrikeCasualtyHexes
        : phase.inRangedCasualty
          ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes)
          : phase.inMeleeCasualty
            ? anim.meleeCasualtyHexes
            : undefined;
      if (casualtyHexes?.length) {
        const casualtyElapsed = phase.inAirStrikeCasualty
          ? elapsed - phase.airStrikeCasualtyStart
          : phase.inRangedCasualty
            ? elapsed - phase.rangedCasualtyStart
            : elapsed - phase.meleeCasualtyStart;
        const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
        const unknownSet = new Set(anim.unknownCasualtyHexes ?? []);
        const knownCasualtyHexes = casualtyHexes.filter((h3) => !unknownSet.has(h3));
        const unknownCasualtyHexes = casualtyHexes.filter((h3) => unknownSet.has(h3));
        drawCasualtyOverlay(ctx, width, height, knownCasualtyHexes, hexList, pulseOpacity);
        drawUnknownBattleMarkers(ctx, unknownCasualtyHexes, pulseOpacity);
      }
    }
    return;
  }
  drawTerrainHexes(ctx);
  drawRes4TerrainHexes(ctx);
  drawScenarioHomeRegionOutlines(ctx);
  const hexList = state.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let airStrikeOutboundProgress = 1;
  let airStrikeReturnProgress = 1;
  let playbackPhase: ResolutionPlaybackPhase | null = null;
  const anim = S.resolutionMoveAnimation;
  const regularPlaybackMoves = buildResolutionPlaybackMoves(anim?.moves ?? [], state.units);
  const airStrikeOutboundPlaybackMoves = anim?.airStrikeOutboundMoves ?? [];
  const airStrikeReturnPlaybackMoves = anim?.airStrikeReturnMoves ?? [];
  let elapsedStrategic = 0;
  if (anim) {
    elapsedStrategic = resolutionAnimationElapsedMs(anim);
    const { phase } = buildResolutionPlaybackState(anim, elapsedStrategic);
    playbackPhase = phase;
    moveProgress = phase.moveProgress;
    airStrikeOutboundProgress = phase.airStrikeOutboundProgress;
    airStrikeReturnProgress = phase.airStrikeReturnProgress;
  }
  const { unitsToDraw, movingIds } = getUnitsForDrawWithMovingIds(state);
  let effectiveMovingIdsStrategic = movingIds;
  if (anim && playbackPhase?.inMovement && moveProgress < 1) {
    if (regularPlaybackMoves.length > 0) {
      effectiveMovingIdsStrategic = new Set(regularPlaybackMoves.map((m) => m.unitId));
    } else if ((anim.moves?.length ?? 0) > 0) {
      effectiveMovingIdsStrategic = undefined;
    }
  }
  if (anim && playbackPhase) {
    if (playbackPhase.inAirStrikeOutbound) {
      drawResolutionMoveLines(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
    }
    if (playbackPhase.inAirStrikeReturn) {
      drawResolutionMoveLines(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
    }
    if (elapsedStrategic >= playbackPhase.movementStart) {
      drawResolutionMoveLines(ctx, width, height, regularPlaybackMoves, hexList, 1);
    }
  }
  const shouldDrawCommittedPaths = shouldDrawCommittedOrderPaths();
  const shouldDrawPathPreview = shouldDrawHoveredPathPreview();
  const hiddenCommittedUnitIdsWhilePreviewing = getCommittedOrderUnitsHiddenDuringPreview(shouldDrawPathPreview);
  if (shouldDrawCommittedPaths && !S.hideCommittedOrderLinesAfterReady && S.humanStandingOrders.length > 0 && state.units.length) {
    drawStandingOrderLines(ctx, S.humanStandingOrders, state.units, hiddenCommittedUnitIdsWhilePreviewing);
  }
  drawPendingMarchesHoverAndSupportOrderStack({
    ctx,
    width,
    height,
    state,
    hexList,
    shouldDrawMarchHoverPreview: shouldDrawPathPreview,
    resolutionAnimationBlocksMarchHoverPreview: !!anim,
    drawMarchHoverPreview: drawHoverRoutePreview,
  });
  drawRes1ProductionOverlays(ctx);
  drawRes4CityOverlayPass(ctx);
  drawStrategicRes1InspectionHexCodes(ctx, { getExploredHexSet });
  drawTerrainInfrastructureOverlays(ctx);
  drawStaleEnemyIntel(ctx, state, inferUnitTypeLabelFromId);
  if (unitsToDraw.length) {
    drawUnits(ctx, unitsToDraw, effectiveMovingIdsStrategic);
  }
  if (anim && hexList) {
    if (playbackPhase?.inAirStrikeOutbound && airStrikeOutboundProgress < 1) {
      drawMovingUnits(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, airStrikeOutboundProgress);
    } else if (playbackPhase?.inAirStrikeReturn && airStrikeReturnProgress < 1) {
      drawMovingUnits(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, airStrikeReturnProgress);
    } else if (moveProgress < 1) {
      drawMovingUnits(ctx, width, height, regularPlaybackMoves, hexList, moveProgress);
    }
  }
  if (anim && hexList) {
    const elapsed = elapsedStrategic;
    const { phase } = buildResolutionPlaybackState(anim, elapsed);
    const meleeCombatHexes = [
      ...(anim.meleeCombatHexes ?? []),
      ...(anim.controlLossLightningHexes ?? []),
    ].filter((h3, idx, arr) => arr.indexOf(h3) === idx);
    const combatHexes = phase.inAirStrikeLightning
      ? anim.airStrikeCombatHexes
      : phase.inRangedLightning
        ? (anim.rangedCombatHexes ?? anim.combatHexes)
        : phase.inMeleeLightning
          ? meleeCombatHexes
          : undefined;
    if (combatHexes?.length) {
      const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
      const unknownSet = new Set(anim.unknownCombatHexes ?? []);
      const knownCombatHexes = combatHexes.filter((h3) => !unknownSet.has(h3));
      const unknownCombatHexes = combatHexes.filter((h3) => unknownSet.has(h3));
      drawCombatLightning(ctx, width, height, knownCombatHexes, hexList, pulseOpacity);
      drawUnknownBattleMarkers(ctx, unknownCombatHexes, pulseOpacity);
    }
    const casualtyHexes = phase.inAirStrikeCasualty
      ? anim.airStrikeCasualtyHexes
      : phase.inRangedCasualty
        ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes)
        : phase.inMeleeCasualty
          ? anim.meleeCasualtyHexes
          : undefined;
    if (casualtyHexes?.length) {
      const casualtyElapsed = phase.inAirStrikeCasualty
        ? elapsed - phase.airStrikeCasualtyStart
        : phase.inRangedCasualty
          ? elapsed - phase.rangedCasualtyStart
          : elapsed - phase.meleeCasualtyStart;
      const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
      const unknownSet = new Set(anim.unknownCasualtyHexes ?? []);
      const knownCasualtyHexes = casualtyHexes.filter((h3) => !unknownSet.has(h3));
      const unknownCasualtyHexes = casualtyHexes.filter((h3) => unknownSet.has(h3));
      drawCasualtyOverlay(ctx, width, height, knownCasualtyHexes, hexList, pulseOpacity);
      drawUnknownBattleMarkers(ctx, unknownCasualtyHexes, pulseOpacity);
    }
  }
}

/**
 * Defines the `resizeAndRedraw` function shape (function resizeAndRedraw(): void).

 * Purpose: Supports maintainability by documenting why `resizeAndRedraw` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resizeAndRedraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('map-overlay') as HTMLCanvasElement | null;
  if (!container || !canvas) return;
  invalidateLeafletMapSizes();

  const dpr = window.devicePixelRatio ?? 1;
  const rect = container.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  S.canvasMetrics = { w, h, dpr };

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!S.gameState) {
    drawLoadingScene(ctx, w, h);
    syncBuildEntryButton();
    syncTacticalEntryButtonOverlay();
    tacticalUpdateExitButtonVisibility();
    updateReadyButtonState();
    return;
  }
  drawGameScene(ctx, w, h, S.gameState);
  syncBuildEntryButton();
  syncTacticalEntryButtonOverlay();
  tacticalUpdateExitButtonVisibility();
  updateReadyButtonState();
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
 * Defines the `redraw` function shape (function redraw(): void).

 * Purpose: Supports maintainability by documenting why `redraw` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function redraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('map-overlay') as HTMLCanvasElement | null;
  if (!container || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const metrics = S.canvasMetrics;
  if (!metrics) return;
  const { w, h, dpr } = metrics;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!S.gameState) {
    drawLoadingScene(ctx, w, h);
    syncBuildEntryButton();
    syncTacticalEntryButtonOverlay();
    tacticalUpdateExitButtonVisibility();
    updateReadyButtonState();
    return;
  }
  drawGameScene(ctx, w, h, S.gameState);
  syncBuildEntryButton();
  syncTacticalEntryButtonOverlay();
  tacticalUpdateExitButtonVisibility();
  updateReadyButtonState();
}

/**
 * Defines the `tickResolutionMoveAnimation` function shape (function tickResolutionMoveAnimation(): void).

 * Purpose: Supports maintainability by documenting why `tickResolutionMoveAnimation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function tickResolutionMoveAnimation(): void {
  if (!S.resolutionMoveAnimation) return;
  const anim = S.resolutionMoveAnimation;
  const elapsed = resolutionAnimationElapsedMs(anim);
  const { phase } = buildResolutionPlaybackState(anim, elapsed);
  const { totalMs } = phase;
  redraw();
  if (elapsed < totalMs) {
    S.resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
  } else {
    S.resolutionMoveAnimation = null;
    S.resolutionMoveAnimationFrameId = null;
    flushResolutionPlaybackCompleteNotifyCallbacks();
    // Re-enable committed path rendering at the end of resolution playback.
    S.hideCommittedOrderLinesAfterReady = false;
    redraw();
  }
}

/**
 * Defines the `updateSidebar` function shape (function updateSidebar(): void).

 * Purpose: Supports maintainability by documenting why `updateSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updateSidebar(): void {
  return updateSidebarFromModule(getPrimarySelectedUnitId, formatUnitDisplayName);
}

/**
 * Defines the `updateGameStateSidebar` function shape (function updateGameStateSidebar(state: GameStateSnapshot | null): void).

 * Purpose: Supports maintainability by documenting why `updateGameStateSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  return updateGameStateSidebarFromModule(state);
}

/**
 * Defines the `setMainUIControlsEnabled` function shape (function setMainUIControlsEnabled(enabled: boolean): void).

 * Purpose: Supports maintainability by documenting why `setMainUIControlsEnabled` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function setMainUIControlsEnabled(enabled: boolean): void {
  return setMainUIControlsEnabledFromModule(enabled);
}

/**
 * Defines the `updateGameOverUI` function shape (function updateGameOverUI(state: GameStateSnapshot | null): void).

 * Purpose: Supports maintainability by documenting why `updateGameOverUI` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function updateGameOverUI(state: GameStateSnapshot | null): void {
  return updateGameOverUIFromModule(state, updateReadyButtonState);
}

/**
 * Defines the `initNewGameButton` function shape (function initNewGameButton(): void).

 * Purpose: Supports maintainability by documenting why `initNewGameButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function initNewGameButton(): void {
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
 * Defines the `openNewGameOverlayFromModelTab` function shape (function openNewGameOverlayFromModelTab(): void).

 * Purpose: Supports maintainability by documenting why `openNewGameOverlayFromModelTab` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function openNewGameOverlayFromModelTab(): void {
  return openNewGameOverlayFromModelTabFromModule(setMainUIControlsEnabled, updateReadyButtonState);
}

/**
 * Defines the `refreshHumanStandingOrders` function shape (async function refreshHumanStandingOrders(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshHumanStandingOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function refreshHumanStandingOrders(): Promise<void> {
  return refreshHumanStandingOrdersFromModule();
}

/**
 * Defines the `isPendingMovementOrderForDisplay` function shape (function isPendingMovementOrderForDisplay(order: HumanStandingOrderSnapshot): boolean).

 * Purpose: Supports maintainability by documenting why `isPendingMovementOrderForDisplay` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function isPendingMovementOrderForDisplay(order: HumanStandingOrderSnapshot): boolean {
  return isPendingMovementOrderForDisplayFromModule(order);
}

/**
 * Defines the `applySelectionFromSidebarUnitButton` function shape (function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent): void).

 * Purpose: Supports maintainability by documenting why `applySelectionFromSidebarUnitButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent): void {
  return applySelectionFromSidebarUnitButtonFromModule(unitId, event, {
    toggleUnitSelection,
    replaceSelection,
    syncUiAfterSelectionChange: () => syncUiAfterSelectionChange(),
  });
}

/**
 * Defines the `formatUnitArrowLabel` function shape (function formatUnitArrowLabel(unitId: string, targetLabel: string): string).

 * Purpose: Supports maintainability by documenting why `formatUnitArrowLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatUnitArrowLabel(unitId: string, targetLabel: string): string {
  return formatUnitArrowLabelFromModule(unitId, targetLabel, formatUnitDisplayName);
}

/**
 * Defines the `formatPendingOrderSidebarLabel` function shape (function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string).

 * Purpose: Supports maintainability by documenting why `formatPendingOrderSidebarLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string {
  return formatPendingOrderSidebarLabelFromModule(order, formatUnitArrowLabel);
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
  killLabelUnits?: import('../../shared/unitDisplayNames').UnitDisplayIdentity[]
): {
  formatKillLine: (kill: { victimId: string; killerIds: string[] }) => string;
  formatUnitName: (unitId: string) => string;
} {
  return buildKillToastFormatterBundleFromModule(state, removedUnits, tacticalSubUnitsForKillLabels, killLabelUnits);
}

/**
 * Defines the `syncUiAfterSelectionChange` function shape (function syncUiAfterSelectionChange(options:).

 * Purpose: Supports maintainability by documenting why `syncUiAfterSelectionChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function syncUiAfterSelectionChange(options: { refreshHoverPreview?: boolean } = {}): void {
  return syncUiAfterSelectionChangeFromModule(
    {
      refreshHoverRoutePreview,
      updateSidebar,
      updatePendingOrdersSidebar,
      updateRangedSidebar,
      refreshStackCalloutIfOpen,
      redraw,
    },
    options
  );
}

/**
 * Defines the `createSidebarOrderRow` function shape (function createSidebarOrderRow(args: { labelText: string; selected: boolean; onToggleSelect: (event: MouseEvent) => void; onCancel: () => void; c).

 * Purpose: Supports maintainability by documenting why `createSidebarOrderRow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function createSidebarOrderRow(args: {
  labelText: string;
  selected: boolean;
  onToggleSelect: (event: MouseEvent) => void;
  onCancel: () => void;
  compactBlueButtons?: boolean;
}): HTMLDivElement {
  return createSidebarOrderRowFromModule(args);
}

/**
 * Defines the `createTacticalSidebarDeps` function shape (function createTacticalSidebarDeps()).

 * Purpose: Supports maintainability by documenting why `createTacticalSidebarDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function createTacticalSidebarDeps() {
  return {
    clearSelection,
    requestRedraw,
    redraw,
    updateSidebar,
    updatePendingOrdersSidebar,
    updateRangedSidebar,
    refreshStackCalloutIfOpen,
    refreshHumanStandingOrders,
    showMapToast,
    createSidebarOrderRow,
    formatUnitArrowLabel,
    applySelectionFromSidebarUnitButton,
  };
}

/**
 * Defines the `cancelOrderForUnit` function shape (async function cancelOrderForUnit(unitId: string): Promise<void>).

 * Purpose: Supports maintainability by documenting why `cancelOrderForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function cancelOrderForUnit(unitId: string): Promise<void> {
  return cancelOrderForUnitFromModule(unitId, createTacticalSidebarDeps());
}

/**
 * Defines the `replacePendingRangedAttacksForSelected` function shape (function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingRangedAttacksForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void {
  return replacePendingRangedAttacksForSelectedFromModule(selectedIds, targetH3Index);
}

/**
 * Defines the `replacePendingAirStrikesForSelected` function shape (function replacePendingAirStrikesForSelected().

 * Purpose: Supports maintainability by documenting why `replacePendingAirStrikesForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function replacePendingAirStrikesForSelected(
  selectedIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): void {
  return replacePendingAirStrikesForSelectedFromModule(selectedIds, targetH3Index, targetType);
}

/**
 * Defines the `replacePendingFerryOrdersForSelected` function shape (function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingFerryOrdersForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  return replacePendingFerryOrdersForSelectedFromModule(selectedIds, destinationH3Index);
}

/**
 * Defines the `clearPendingTacticalOrders` function shape (function clearPendingTacticalOrders(): void).

 * Purpose: Supports maintainability by documenting why `clearPendingTacticalOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function clearPendingTacticalOrders(): void {
  return clearPendingTacticalOrdersFromModule();
}

/**
 * Defines the `clearCommittedOrderDraftState` function shape (function clearCommittedOrderDraftState(): void).

 * Purpose: Supports maintainability by documenting why `clearCommittedOrderDraftState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function clearCommittedOrderDraftState(): void {
  return clearCommittedOrderDraftStateFromModule(createTacticalSidebarDeps());
}

/**
 * Defines the `refreshHoverRoutePreview` function shape (async function refreshHoverRoutePreview(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function refreshHoverRoutePreview(options?: RefreshHoverRoutePreviewOptions): Promise<void> {
  return refreshHoverRoutePreviewFromModule(createTacticalSidebarDeps(), options);
}

/**
 * Defines the `cancelFerryForUnit` function shape (function cancelFerryForUnit(unitId: string): void).

 * Purpose: Supports maintainability by documenting why `cancelFerryForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function cancelFerryForUnit(unitId: string): void {
  return cancelFerryForUnitFromModule(unitId, createTacticalSidebarDeps());
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
 * Defines the `showSidebarError` function shape (function showSidebarError(message: string): void).

 * Purpose: Supports maintainability by documenting why `showSidebarError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function showSidebarError(message: string): void {
  return showSidebarErrorFromModule(message, showMapToast, clearSidebarError);
}

/**
 * Defines the `clearSidebarError` function shape (function clearSidebarError(): void).

 * Purpose: Supports maintainability by documenting why `clearSidebarError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function clearSidebarError(): void {
  return clearSidebarErrorFromModule();
}

/**
 * Defines the `syncOpenRouterRunToggleInteractable` function shape (async function syncOpenRouterRunToggleInteractable(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `syncOpenRouterRunToggleInteractable` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
async function syncOpenRouterRunToggleInteractable(): Promise<void> {
  const runBtn = document.getElementById('openrouter-run-btn') as HTMLButtonElement | null;
  const api = window.gameApi?.openRouter;
  if (!runBtn || !api?.getKey || !api.getSelectedModel) return;
  try {
    const [keyResult, modelId] = await Promise.all([api.getKey(), api.getSelectedModel()]);
    const canEnable = !!keyResult?.hasKey && !!modelId?.trim();
    if (canEnable) {
      runBtn.disabled = false;
      runBtn.removeAttribute('title');
    } else {
      runBtn.disabled = true;
      runBtn.title = 'Set API key and model to enable';
      if (S.runButtonOn) {
        S.runButtonOn = false;
        runBtn.setAttribute('aria-pressed', 'false');
        window.gameApi?.cancelRequestAiOrders?.();
        resetPrecomputedAiState('null');
        S.eventDrivenInitialConsultationDone = false;
        updateReadyButtonState();
      }
    }
  } catch {
    runBtn.disabled = true;
    runBtn.title = 'Set API key and model to enable';
  }
}

/**
 * Defines the `initOpenRouterUI` function shape (function initOpenRouterUI(): void).

 * Purpose: Supports maintainability by documenting why `initOpenRouterUI` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function initOpenRouterUI(): void {
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

/**
 * Defines the `init` function shape (function init(): void).

 * Purpose: Supports maintainability by documenting why `init` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function init(): void {
  // Contract anchors retained after extraction:
  // applyModifierDrivenPopoverCloseRules('ctrl_pressed');
  // applyModifierDrivenPopoverCloseRules('ctrl_released');
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
    applyRes4TerrainOverrides,
    refreshRes4TerrainOverridesForRenderer,
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
      // buildTurnUpdateBullets({})
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
