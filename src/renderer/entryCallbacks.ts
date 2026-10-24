/**
 * Renderer entry callbacks moved out of the esbuild entry so that file can stay readable.
 */

import { dismissMapDetailPopoversIfHoverPlanningActive, hideStackCallout, isClientPointInsideMainMapLeafletContainer, refreshStackCalloutIfOpen, shouldSuppressTerrainTooltip } from './map/stackCallout';
import { redraw, requestRedraw, resizeAndRedraw } from './rendering/gameScene';
import { getMainLeafletMap } from './map/worldLeafletMap';
import { deriveInfrastructureOverlayState } from './rendering/infrastructureOverlayState';
import type { GameStateSnapshot, TacticalCityOverlayRow, TacticalRoadRailOverlayRow, TacticalTransportVectorOverlayRow } from '../shared/ipcTypes';
import { formatUnitNameForViewer, viewerSeatIdForRoster } from '../shared/sideLabels';
import { unitIdOwnerFromId } from '../shared/unitIds';
import { buildUnitDisplayNameLookup, fallbackDisplayNameFromUnitId } from '../shared/unitDisplayNames';

import { TOOLTIP_OFFSET_PX } from './core/constants';
import { runButtonTooltipText } from './chrome/controlTooltipText';
import { appendOpenRouterLog, showAiStrategyToast, showMapToast, updateOpenRouterCostLabel, updateOpenRouterToolCountLabels, updateReadyButtonState } from './openRouter/openRouterUiHelpers';
import { hitTestHexAtContainerPixel, hitTestTacticalHexAtContainerPixel } from './map/mapHelpers';
import { shouldRenderTacticalHexes } from './map/terrainView';

import { clearSelection, isHexExploredByPlayer, reconcileSelectionToCurrentState, replaceSelection, toggleUnitSelection } from './core/selection';
import { setMainUIControlsEnabled, updateGameOverUI as updateGameOverUIFromModule, updateGameStateSidebar, updateSidebar as updateSidebarFromModule } from './core/uiState';
import { openNewGameOverlayFromModelTab as openNewGameOverlayFromModelTabFromModule, refreshHumanStandingOrders } from './gameplay/newGame';

import { rendererSharedState as S } from './core/state';
import { rememberUnitOrigins } from './core/unitOriginFlags';
import { activateRestoredTacticalBattleFromMainSnapshot, buildDefaultTacticalBattleActivationSideEffects, startTacticalBattleFromEntryHex as startTacticalBattleFromEntryHexFromModule } from './tactical/tacticalEntryFlow';
import type { TacticalRendererStartBattleSideEffects } from './tactical/tacticalIpcHandlers';
import { tacticalReconcileBattleAfterStrategicSnapshot, tacticalSyncTacticalEntryButtonOverlay } from './tactical/tacticalUiOrchestration';
import { createBuildQueuePopupHandler } from './gameplay/buildQueuePopup';

import { renderOpenRouterToolsList as renderOpenRouterToolsListFromModule, startBackgroundRequestIfAllowed as startBackgroundRequestIfAllowedFromModule, stopOpponentPlanning } from './openRouter/openRouterRuntime';

import { clearPendingTacticalOrders, refreshHoverRoutePreview as refreshHoverRoutePreviewFromModule, type RefreshHoverRoutePreviewOptions } from './gameplay/tacticalOrders';
import { prepareStrategicPlanningUiBeforeTacticalAutoStart, type ReadyHandlerDeps } from './gameplay/readyHandler';

import { buildMeleeInterceptHexPopupHtmlForStrategic as buildMeleeInterceptHexPopupHtmlForStrategicFromModule } from './gameplay/meleeInterceptHexTooltip';
import type { NamingLookupTarget, TerrainTooltipState } from './map/terrainTooltipTypes';
import { clearStrategicTooltipSummaryCaches, clearTerrainTooltipTimer, getCachedNamingLineForTarget, getCachedTerrainTooltipHtml, hideTerrainTooltipVisual, namingLookupTargetForPointer, terrainStateForPointer, terrainTooltipStateForStrategicHex } from './map/terrainTooltipStrategicState';
import { paintTerrainSwatches } from './rendering/terrainVisualStyles';

import { applyStrategicBaselineUrbanHexCounts, applyTacticalCityOverlayRows } from './rendererTacticalHydration';
import { applyGameStateSnapshot as applyGameStateSnapshotFromModule, refreshGameStateAfterBuildQueueChange as refreshGameStateAfterBuildQueueChangeFromModule, updateClientStaleEnemyIntel } from './core/stateSnapshot';
import { applySelectionFromSidebarUnitButton as applySelectionFromSidebarUnitButtonFromModule, clearSidebarError, showSidebarError as showSidebarErrorFromModule, syncUiAfterSelectionChange as syncUiAfterSelectionChangeFromModule } from './gameplay/sidebarSupport';

/**
 * Entry callbacks that still live in renderer.ts.
 *
 * Contract: Installed before map listeners run.
 * When to use: Pass the staying functions from renderer init.
 * Expected outcome: Moved callbacks reach the entry implementations.
 * Exceptions: None. Calls before bind throw.
 */
export interface EntryCallbacksHost {
  /**
   * Schedules tactical annihilation UI from the renderer entry.
   *
   * Contract: Same function the scene host receives.
   * When to use: Pass it from renderer init.
   * Expected outcome: The entry scheduler runs.
   * Exceptions: Calling before bind throws.
   */
  maybeScheduleTacticalAnnihilationExit: () => void;
  /**
   * Refreshes the pending-order sidebar from the renderer entry.
   *
   * Contract: The entry function, including its retained source anchors.
   * When to use: Pass it from renderer init.
   * Expected outcome: The pending-order sidebar refreshes.
   * Exceptions: Calling before bind throws.
   */
  updatePendingOrdersSidebar: () => void;
  /**
   * Refreshes the ranged sidebar from the renderer entry.
   *
   * Contract: The entry function, including its retained source anchors.
   * When to use: Pass it from renderer init.
   * Expected outcome: The ranged sidebar refreshes.
   * Exceptions: Calling before bind throws.
   */
  updateRangedSidebar: () => void;
  /**
   * Reports infrastructure glyph visibility from the renderer entry.
   *
   * Contract: The entry wrapper and its terrain deps.
   * When to use: Pass it from renderer init.
   * Expected outcome: Glyph visibility matches the entry wrapper.
   * Exceptions: Calling before bind throws.
   */
  hasVisibleStrategicInfrastructureGlyphs: (h3Index: string, tacticalOn: boolean, unitHexes: Set<string>) => boolean;
  /**
   * Builds kill-toast formatters from the renderer entry.
   *
   * Contract: The entry bundle builder.
   * When to use: Pass it from renderer init.
   * Expected outcome: Ready and tactical exit format kills the same way.
   * Exceptions: Calling before bind throws.
   */
  buildKillToastFormatterBundle: ReadyHandlerDeps['buildKillToastFormatterBundle'];
}

/**
 * Forwards tactical annihilation scheduling to the renderer entry.
 *
 * Purpose: Activation side effects call this name directly.
 * When to use: Assigned by bindEntryCallbacksHost before listeners run.
 * Expected outcome: The entry scheduler runs.
 * Exceptions: Throws if the host is not bound.
 */
export let maybeScheduleTacticalAnnihilationExit: EntryCallbacksHost['maybeScheduleTacticalAnnihilationExit'] = () => {
  throw new Error('entry callbacks host is not bound');
};

/**
 * Forwards pending-order sidebar refresh to the renderer entry.
 *
 * Purpose: Session callbacks call this name directly.
 * When to use: Assigned by bindEntryCallbacksHost before listeners run.
 * Expected outcome: The entry sidebar refresh runs.
 * Exceptions: Throws if the host is not bound.
 */
export let updatePendingOrdersSidebar: EntryCallbacksHost['updatePendingOrdersSidebar'] = () => {
  throw new Error('entry callbacks host is not bound');
};

/**
 * Forwards ranged sidebar refresh to the renderer entry.
 *
 * Purpose: Session callbacks call this name directly.
 * When to use: Assigned by bindEntryCallbacksHost before listeners run.
 * Expected outcome: The entry sidebar refresh runs.
 * Exceptions: Throws if the host is not bound.
 */
export let updateRangedSidebar: EntryCallbacksHost['updateRangedSidebar'] = () => {
  throw new Error('entry callbacks host is not bound');
};

/**
 * Forwards infrastructure glyph visibility to the renderer entry.
 *
 * Purpose: The tactical entry overlay calls this name directly.
 * When to use: Assigned by bindEntryCallbacksHost before listeners run.
 * Expected outcome: The entry wrapper runs.
 * Exceptions: Throws if the host is not bound.
 */
export let hasVisibleStrategicInfrastructureGlyphs: EntryCallbacksHost['hasVisibleStrategicInfrastructureGlyphs'] = () => {
  throw new Error('entry callbacks host is not bound');
};

/**
 * Forwards kill-toast formatting to the renderer entry.
 *
 * Purpose: Ready handler deps call this name directly.
 * When to use: Assigned by bindEntryCallbacksHost before listeners run.
 * Expected outcome: The entry bundle builder runs.
 * Exceptions: Throws if the host is not bound.
 */
export let buildKillToastFormatterBundle: EntryCallbacksHost['buildKillToastFormatterBundle'] = () => {
  throw new Error('entry callbacks host is not bound');
};

/**
 * Installs the entry callbacks that stayed in renderer.ts.
 *
 * Purpose: Avoids a cycle between this module and the renderer entry.
 * When to use: At the start of renderer init, before map listeners are attached.
 * Expected outcome: Later calls reach the entry functions.
 * Exceptions: None.
 */
export function bindEntryCallbacksHost(host: EntryCallbacksHost): void {
  maybeScheduleTacticalAnnihilationExit = host.maybeScheduleTacticalAnnihilationExit;
  updatePendingOrdersSidebar = host.updatePendingOrdersSidebar;
  updateRangedSidebar = host.updateRangedSidebar;
  hasVisibleStrategicInfrastructureGlyphs = host.hasVisibleStrategicInfrastructureGlyphs;
  buildKillToastFormatterBundle = host.buildKillToastFormatterBundle;
}

/**
 * Defines the `hideBuildPopup` function shape (function hideBuildPopup(): void).

 * Purpose: Supports maintainability by documenting why `hideBuildPopup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hideBuildPopup(): void {
  getBuildQueuePopupController().hideBuildPopup();
}

/**
 * Defines the `showBuildPopup` function shape (function showBuildPopup(h3Index: string, clientX: number, clientY: number): void).

 * Purpose: Supports maintainability by documenting why `showBuildPopup` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function showBuildPopup(h3Index: string, clientX: number, clientY: number): void {
  getBuildQueuePopupController().showBuildPopup(h3Index, clientX, clientY);
}

/**
 * Routes a build-entry activation through the shared plain/Shift selection policy.
 *
 * Purpose: Keeps direct DOM clicks and canvas hit-testing on one production-selection implementation.
 * When to use: Every build-entry button activation.
 * Expected outcome: Popup, selected button chrome, and queue synchronization remain consistent.
 * Exceptions: Controller reports asynchronous write failures through the existing map toast.
 */
export async function handleBuildEntryClick(
  h3Index: string,
  clientX: number,
  clientY: number,
  shiftKey: boolean
): Promise<void> {
  await getBuildQueuePopupController().handleBuildEntryClick(h3Index, clientX, clientY, shiftKey);
}

/**
 * Defines the `refreshBuildPopupIfOpen` function shape (function refreshBuildPopupIfOpen(): void).

 * Purpose: Supports maintainability by documenting why `refreshBuildPopupIfOpen` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function refreshBuildPopupIfOpen(): void {
  getBuildQueuePopupController().refreshBuildPopupIfOpen();
}

/**
 * Documents the module-scope binding `buildQueuePopupController` (buildQueuePopupController: ReturnType<typeof createBuildQueuePopupHandler> | null).

 * Purpose: Supports maintainability by documenting why `buildQueuePopupController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let buildQueuePopupController: ReturnType<typeof createBuildQueuePopupHandler> | null = null;

/**
 * Defines the `getBuildQueuePopupController` function shape (function getBuildQueuePopupController(): ReturnType<typeof createBuildQueuePopupHandler>).

 * Purpose: Supports maintainability by documenting why `getBuildQueuePopupController` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getBuildQueuePopupController(): ReturnType<typeof createBuildQueuePopupHandler> {
  if (buildQueuePopupController) return buildQueuePopupController;
  buildQueuePopupController = createBuildQueuePopupHandler({
    shouldRenderTacticalHexes,
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
 * Rebuilds contested-hex tactical magnifier controls during strategic planning at zoom levels where they are meaningful.
 *
 * Purpose: Centralizes dependency wiring for `syncTacticalEntryButton` beside build-entry sync.
 * When to use: Each canvas resize/redraw while strategic planning may show tactical entry.
 * Expected outcome: DOM under `#tactical-entry-layer` matches contested explored strategic hexes.
 * Exceptions: None.
 */
export function syncTacticalEntryButtonOverlay(): void {
  tacticalSyncTacticalEntryButtonOverlay({
    isHexExploredByPlayer,
    hasStrategicOverlayOffsetFeatures: (h3Index, visibleUnitHexes) =>
      hasVisibleStrategicInfrastructureGlyphs(h3Index, shouldRenderTacticalHexes(), visibleUnitHexes),
  });
}

/**
 * Supplies activation side effects shared by magnifier tactical start and main-process snapshot restore.
 *
 * Purpose: Deduplicates the `TacticalRendererStartBattleSideEffects` literal previously repeated in `applyGameStateSnapshot`.
 * When to use: Passed to `startTacticalBattleFromEntryHexFromModule` and `activateRestoredTacticalBattleFromMainSnapshot`.
 * Expected outcome: Identical sequencing for sidebar suppression, tactical entry, Exit Battle refresh, and redraw.
 * Exceptions: None.
 */
export function getTacticalBattleActivationSideEffects(): TacticalRendererStartBattleSideEffects {
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
    refreshOrderSidebars: () => {
      hideStackCallout();
      refreshStrategicOrderSidebars();
    },
  });
}

/**
 * Defines the `refreshGameStateAfterBuildQueueChange` function shape (async function refreshGameStateAfterBuildQueueChange(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshGameStateAfterBuildQueueChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function refreshGameStateAfterBuildQueueChange(): Promise<void> {
  return refreshGameStateAfterBuildQueueChangeFromModule({ applyGameStateSnapshot });
}

/**
 * Defines the `applyGameStateSnapshot` function shape (async function applyGameStateSnapshot( nextState: GameStateSnapshot, options: { refreshStandingOrders?: boolean; updateGameStateSidebarUi?: bool).

 * Purpose: Supports maintainability by documenting why `applyGameStateSnapshot` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function applyGameStateSnapshot(
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
  const previousMapId = S.gameState?.gameMap?.id;
  if (nextState.gameMap && previousMapId !== nextState.gameMap.id) {
    sessionStaticTacticalOverlaysLoaded = false;
    sessionBaselineUrbanHexCountsLoaded = false;
  }
  if (nextState.gameMapLoadError && nextState.gameMapLoadError !== lastShownMapLoadError) {
    lastShownMapLoadError = nextState.gameMapLoadError;
    showMapToast(nextState.gameMapLoadError);
  }
  return applyGameStateSnapshotFromModule(
    {
      rebuildUnitDisplayNameLookup,
      reconcileSelectionToCurrentState,
      updateClientStaleEnemyIntel,
      clearStrategicTooltipSummaryCaches,
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
export async function showTerrainTooltip(
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
  paintTerrainSwatches(el);
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
export async function restoreTerrainTooltipAfterPopoverClose(): Promise<void> {
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
      hoverH3 = hitTestTacticalHexAtContainerPixel(x, y, tb);
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
export function scheduleTerrainTooltipRestoreAfterPopoverClose(): void {
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
export function getPrimarySelectedUnitId(): string | null {
  return S.selectedUnitIds[0] ?? null;
}

/**
 * Rebuilds the unit display-name lookup and remembers unit birth origins from a snapshot.
 *
 * Purpose: Keeps unit labels (names and origin flags) in step with the latest game state.
 * When to use: For every applied snapshot and for the new-game snapshot.
 * Expected outcome: `S.unitDisplayNameById` covers the snapshot's units plus any active tactical sub-units;
 *   origins are added to the accumulating origin cache. A `null` state leaves only tactical names.
 * Exceptions: None.
 */
export function rebuildUnitDisplayNameLookup(state: GameStateSnapshot | null): void {
  if (state) rememberUnitOrigins(state.units);
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
 * Defines the `applyTacticalTerrainOverrides` function shape (function applyTacticalTerrainOverrides(rows: Array<{ h3Index: string; terrainKind: string; isUrban: boolean; isAirport?: boolean; isSeaport?: boolean).

 * Purpose: Supports maintainability by documenting why `applyTacticalTerrainOverrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyTacticalTerrainOverrides(rows: Array<{
  h3Index: string;
  terrainKind: string;
  isUrban: boolean;
  isAirport?: boolean;
  isSeaport?: boolean;
  isRubble?: boolean;
}>): void {
  const nextState = deriveInfrastructureOverlayState(rows);
  S.tacticalTerrainOverridesByH3 = nextState.tacticalTerrainOverridesByH3;
  S.terrainInfraStrategicAirport = nextState.terrainInfraStrategicAirport;
  S.terrainInfraStrategicSeaport = nextState.terrainInfraStrategicSeaport;
  S.terrainInfraTacticalAirport = nextState.terrainInfraTacticalAirport;
  S.terrainInfraTacticalSeaport = nextState.terrainInfraTacticalSeaport;
  clearStrategicTooltipSummaryCaches();
}

/**
 * Tracks whether static tactical city/road/rail/vector overlays were fetched this renderer session.
 *
 * Purpose: Avoids repeating large static IPC payloads on every Ready refresh.
 * When to use: Cleared when `reloadStaticOverlays` is true (New Game path).
 * Expected outcome: Static overlays load once per session unless explicitly reset.
 * Exceptions: None.
 */
let sessionStaticTacticalOverlaysLoaded = false;

/**
 * Tracks whether the generated strategic urban counts were fetched this renderer session.
 *
 * Purpose: Those counts never change within a session, so a failed fetch can retry without refetching the city overlays.
 * When to use: Cleared in effect when `reloadStaticOverlays` is true (New Game path) by passing forceReload.
 * Expected outcome: The baseline map loads once per session unless explicitly reset.
 * Exceptions: None.
 */
let sessionBaselineUrbanHexCountsLoaded = false;

/**
 * Last map-load error already shown in a toast.
 *
 * Purpose: A refreshed snapshot must not repeat the same toast.
 * When to use: `applyGameStateSnapshot` when `gameMapLoadError` is set.
 * Expected outcome: The toast appears once per distinct message.
 * Exceptions: None.
 */
let lastShownMapLoadError: string | null = null;

/**
 * Fetches static tactical overlay IPC payloads once per session unless `forceReload` is set.
 *
 * Purpose: Static overlays never change within a session, so they load separately from the dynamic terrain-override
 * refresh and are not refetched on every map refresh.
 * When to use: Before every map refresh; skipped when already loaded and not forced.
 * Expected outcome: City, road, and rail overlays are applied, then the generated strategic urban counts load. A failure of that count load leaves the overlays in place.
 * Exceptions: A city, road, or rail IPC failure rethrows for the caller to log. A baseline-count failure is logged inside `ensureBaselineUrbanHexCountsLoaded` and does not rethrow.
 */
export async function ensureStaticTacticalOverlaysLoaded(forceReload: boolean): Promise<void> {
  if (!(sessionStaticTacticalOverlaysLoaded && !forceReload)) {
    const api = window.gameApi;
    if (!api) return;
    const cityPromise = api.getTacticalCityOverlays ? api.getTacticalCityOverlays() : Promise.resolve<TacticalCityOverlayRow[]>([]);
    const roadRailPromise = api.getTacticalRoadRailOverlays
      ? api.getTacticalRoadRailOverlays()
      : Promise.resolve<TacticalRoadRailOverlayRow[]>([]);
    const vectorsPromise = api.getTacticalTransportVectorOverlays
      ? api.getTacticalTransportVectorOverlays()
      : Promise.resolve<TacticalTransportVectorOverlayRow[]>([]);
    const [cityRows, roadRailRows, vectorRows] = await Promise.all([cityPromise, roadRailPromise, vectorsPromise]);
    applyTacticalCityOverlayRows(cityRows, roadRailRows, vectorRows);
    sessionStaticTacticalOverlaysLoaded = true;
  }
  await ensureBaselineUrbanHexCountsLoaded(forceReload);
}

/**
 * Fetches generated strategic urban counts once per session unless `forceReload` is set.
 *
 * Purpose: Tech lines use this baseline. A failure here must not drop the city, road, or rail overlays.
 * When to use: From `ensureStaticTacticalOverlaysLoaded`, including when that load is skipped because overlays are already present.
 * Expected outcome: `baselineUrbanHexCountByStrategicH3` is replaced. A thrown IPC call is logged and the previous map is left as it was.
 * Exceptions: Logs to console and does not rethrow.
 */
export async function ensureBaselineUrbanHexCountsLoaded(forceReload: boolean): Promise<void> {
  if (sessionBaselineUrbanHexCountsLoaded && !forceReload) return;
  const api = window.gameApi;
  if (!api?.getStrategicBaselineUrbanHexCounts) return;
  try {
    const rows = await api.getStrategicBaselineUrbanHexCounts();
    applyStrategicBaselineUrbanHexCounts(rows);
    sessionBaselineUrbanHexCountsLoaded = true;
  } catch (err) {
    console.error('getRes1BaselineUrbanHexCounts failed:', err);
  }
}

/**
 * Defines the `refreshTacticalTerrainOverridesForRenderer` function shape (async function refreshTacticalTerrainOverridesForRenderer(): Promise<void>).

 * Purpose: Refreshes dynamic tactical terrain overrides on every call; static overlays load once per session (or when `reloadStaticOverlays` is true).
 * When to use: Map init, New Game, Ready, and infrastructure-damage refresh triggers.
 * Expected outcome: Dynamic rubble/airport/seaport state updates; static overlays unchanged on routine Ready.
 * Exceptions: Logs failure to console; does not throw to callers.
 */
export async function refreshTacticalTerrainOverridesForRenderer(options?: { reloadStaticOverlays?: boolean }): Promise<void> {
  const api = window.gameApi;
  if (!api?.getTacticalTerrainOverrides) return;
  try {
    await ensureStaticTacticalOverlaysLoaded(options?.reloadStaticOverlays === true);
    const rows = await api.getTacticalTerrainOverrides();
    applyTacticalTerrainOverrides(rows);
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
export function formatUnitDisplayName(unitId: string): string {
  const baseName = S.unitDisplayNameById.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId);
  const ownerId = S.gameState?.units.find((unit) => unit.id === unitId)?.player ?? unitIdOwnerFromId(unitId);
  if (!ownerId) return baseName;
  return formatUnitNameForViewer({
    baseName,
    ownerId,
    viewerSeatId: viewerSeatIdForRoster(S.gameState?.seats ?? []),
    seats: S.gameState?.seats ?? [],
  });
}

/**
 * Defines the `formatUnknownBattleAnnouncement` function shape (function formatUnknownBattleAnnouncement(continentNames: string[]): string).

 * Purpose: Supports maintainability by documenting why `formatUnknownBattleAnnouncement` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatUnknownBattleAnnouncement(continentNames: string[]): string {
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
 * Defines the `startBackgroundRequestIfAllowed` function shape (function startBackgroundRequestIfAllowed(): void).

 * Purpose: Supports maintainability by documenting why `startBackgroundRequestIfAllowed` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function startBackgroundRequestIfAllowed(): void {
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
export function renderOpenRouterToolsList(): void {
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
 * Refreshes pending-movement, ranged/air/ferry, and selected-unit sidebars after shared order state changes (e.g. tactical exit teardown).
 *
 * Purpose: Keeps DOM updates for the three panels in one place alongside `prepareStrategicPlanningUiBeforeTacticalAutoStart` (which performs the same three calls after clearing drafts and reloading standing orders).
 * When to use: Tactical-exit `refreshSidebarAfterTacticalDraftTeardown`; do not duplicate these three calls elsewhere without updating both paths.
 * Expected outcome: Pending orders list, ranged strike UI, and unit sidebar reflect current `S` slices.
 * Exceptions: None.
 */
export function refreshStrategicOrderSidebars(): void {
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
export async function prepareStrategicUiBeforeTacticalStartFromMagnifier(): Promise<void> {
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
 * Expected outcome: Same toasts and tactical transition as `startTacticalBattleFromEntryHexFromModule`; resumes an existing main-process session when the clicked hex matches without a redundant `startTacticalBattle` IPC.
 * Exceptions: None; missing IPC surfaces through the shared unavailable toast.
 */
export async function startTacticalBattleFromEntryHex(h3: string): Promise<void> {
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
 * Bridges renderer tooltip helpers into the shared melee-intercept hex HTML builder.
 *
 * Purpose: Keeps `ReadyHandlerDeps.buildMeleeInterceptHexPopupHtml` stable without duplicating tooltip assembly in `renderer.ts`.
 * When to use: Only from `createReadyHandlerDeps`.
 * Expected outcome: Delegates to `meleeInterceptHexTooltip` with live naming/terrain readers.
 * Exceptions: None.
 */
export async function buildMeleeInterceptHexPopupHtmlForStrategic(h3Index: string): Promise<string> {
  return buildMeleeInterceptHexPopupHtmlForStrategicFromModule(h3Index, {
    getCachedNamingLineForTarget,
    terrainTooltipStateForStrategicHex,
    getCachedTerrainTooltipHtml,
  });
}

/**
 * Defines the `updateSidebar` function shape (function updateSidebar(): void).

 * Purpose: Supports maintainability by documenting why `updateSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateSidebar(): void {
  return updateSidebarFromModule(formatUnitDisplayName);
}

/**
 * Shows or hides the new-game overlay, and resizes the map when that visibility changes.
 *
 * Purpose: The overlay hides the top bar and the console, so the map's size changes. Leaflet keeps the previous container size until a resize.
 * When to use: After a snapshot, and when a match ends.
 * Expected outcome: The overlay matches the snapshot. The map is resized only when the overlay opens or closes.
 * Exceptions: None.
 */
export function updateGameOverUI(state: GameStateSnapshot | null): void {
  const visibilityChanged = updateGameOverUIFromModule(state, updateReadyButtonState);
  if (visibilityChanged) resizeAndRedraw();
}

/**
 * Opens the new-game dialog from the game menu, and resizes the map when it actually opens.
 *
 * Purpose: The top bar and the console leave the layout when that dialog opens. The map has to take the freed space before the preview fits.
 * When to use: The game menu's New game item (`#openrouter-new-btn`).
 * Expected outcome: The annihilation dialog and a Ready that is still resolving ignore the click. Otherwise the dialog opens over the match, which keeps running; when a live match is held, the renderer match epoch moves forward so a reply still in flight is discarded. The map resizes only when the overlay was hidden.
 * Exceptions: None.
 */
export function openNewGameOverlayFromModelTab(): void {
  const visibilityChanged = openNewGameOverlayFromModelTabFromModule(setMainUIControlsEnabled, updateReadyButtonState);
  if (visibilityChanged) resizeAndRedraw();
}

/**
 * Defines the `applySelectionFromSidebarUnitButton` function shape (function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent): void).

 * Purpose: Supports maintainability by documenting why `applySelectionFromSidebarUnitButton` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent): void {
  return applySelectionFromSidebarUnitButtonFromModule(unitId, event, {
    toggleUnitSelection,
    replaceSelection,
    syncUiAfterSelectionChange: () => syncUiAfterSelectionChange(),
  });
}

/**
 * Defines the `syncUiAfterSelectionChange` function shape (function syncUiAfterSelectionChange(options:).

 * Purpose: Supports maintainability by documenting why `syncUiAfterSelectionChange` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Sidebar, ranged, pending-order, and optional stack chrome stay aligned with the current selection.
 * Exceptions: None.
 */
export function syncUiAfterSelectionChange(
  options: { refreshHoverPreview?: boolean; refreshStackCallout?: boolean } = {}
): void {
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
 * Defines the `createTacticalSidebarDeps` function shape (function createTacticalSidebarDeps()).

 * Purpose: Supports maintainability by documenting why `createTacticalSidebarDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createTacticalSidebarDeps() {
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
    formatUnitDisplayName,
    applySelectionFromSidebarUnitButton,
    dismissMapDetailPopoversForHoverPlanning: dismissMapDetailPopoversIfHoverPlanningActive,
  };
}

/**
 * Defines the `refreshHoverRoutePreview` function shape (async function refreshHoverRoutePreview(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function refreshHoverRoutePreview(options?: RefreshHoverRoutePreviewOptions): Promise<void> {
  await refreshHoverRoutePreviewFromModule(createTacticalSidebarDeps(), options);
  dismissMapDetailPopoversIfHoverPlanningActive();
}

/**
 * Defines the `showSidebarError` function shape (function showSidebarError(message: string): void).

 * Purpose: Supports maintainability by documenting why `showSidebarError` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function showSidebarError(message: string): void {
  return showSidebarErrorFromModule(message, showMapToast, clearSidebarError);
}

/**
 * Defines the `syncOpenRouterRunToggleInteractable` function shape (async function syncOpenRouterRunToggleInteractable(): Promise<void>).

 * Purpose: Supports maintainability by documenting why `syncOpenRouterRunToggleInteractable` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function syncOpenRouterRunToggleInteractable(): Promise<void> {
  const runBtn = document.getElementById('openrouter-run-btn') as HTMLButtonElement | null;
  const api = window.gameApi?.openRouter;
  if (!runBtn || !api?.getKey || !api.getSelectedModel) return;
  try {
    const [keyResult, modelId] = await Promise.all([api.getKey(), api.getSelectedModel()]);
    const canEnable = !!keyResult?.hasKey && !!modelId?.trim();
    if (canEnable) {
      runBtn.disabled = false;
    } else {
      runBtn.disabled = true;
      if (S.runButtonOn) {
        S.runButtonOn = false;
        runBtn.setAttribute('aria-pressed', 'false');
        void stopOpponentPlanning('run_off');
        updateReadyButtonState();
      }
    }
    const runTipHost = runBtn.closest('.control-tooltip-host');
    (runTipHost instanceof HTMLElement ? runTipHost : runBtn).setAttribute(
      'data-control-tooltip',
      runButtonTooltipText(canEnable)
    );
    runBtn.removeAttribute('title');
  } catch {
    runBtn.disabled = true;
    const runTipHost = runBtn.closest('.control-tooltip-host');
    (runTipHost instanceof HTMLElement ? runTipHost : runBtn).setAttribute(
      'data-control-tooltip',
      runButtonTooltipText(false)
    );
    runBtn.removeAttribute('title');
  }
}

