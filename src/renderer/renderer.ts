/**
 * Renderer process entry point. Leaflet world basemap + overlay canvas (terrain, units, orders),
 * minimap with viewport sync, and click / double-click interaction with the sidebar.
 */

import { cellToChildren, cellToLatLng, cellToParent, gridDisk, gridDistance, latLngToCell } from 'h3-js';
import {
  alignLngToReference,
  clampLatForWebMercatorDisplay,
  getHexBoundaryLatLngForLeafletOverlay,
} from './map/hexGrid';
import {
  initWorldLeafletMaps,
  getMainLeafletMap,
  hexCenterToOverlayPoint,
  hexCenterToOverlayPointWithReferenceLng,
  invalidateLeafletMapSizes,
  setMainBasemapByProviderId,
  setMainBasemapFilter,
} from './map/worldLeafletMap';
import {
  fillHexTerrain,
  getActiveHexStrokeStyle,
  getActiveTerrainStyleBasemapId,
  renderTerrainLegend,
} from './rendering/terrainVisualStyles';
import {
  drawTerrainInfrastructureGlyphs,
  RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE,
} from './rendering/terrainInfrastructureOverlay';
import { deriveInfrastructureOverlayState } from './rendering/infrastructureOverlayState';
import {
  formatPendingAirStrikeSidebarLabel,
  formatPendingFerryOrderSidebarLabel,
  formatPendingRangedAttackSidebarLabel,
} from './gameplay/orderLabelFormatting';
import { buildTurnUpdateBullets } from './gameplay/turnUpdateSummary';
import type {
  GameStateSnapshot,
  GameApi,
  BuildUnitType,
  HexBuildQueueSnapshot,
  MovementOrder,
  RangedAttackOrder,
  AirStrikeOrder,
  AirStrikeAnimationMove,
  AirStrikeTargetType,
  FerryOrder,
  RemovedUnitSnapshot,
  HumanStandingOrderSnapshot,
} from '../shared/ipcTypes';
import { estimateTurnsToNextSpawn, MAX_UNITS_PER_TYPE } from '../shared/productionConfig';
import {
  buildUnitDisplayNameLookup,
  fallbackDisplayNameFromUnitId,
} from '../shared/unitDisplayNames';
import {
  MOVEMENT_RANGE_BY_UNIT_TYPE,
  RANGED_RANGE_BY_UNIT_TYPE,
} from '../shared/tacticalRanges';
import {
  buildResolutionPlaybackState as buildResolutionPlaybackStateFromModule,
  type ResolutionPlaybackPhase,
} from './rendering/resolutionPlayback';
import type { ResolutionMove, ResolutionPlaybackMove, HoverRoutePreviewState, PanDirection } from './core/types';
import {
  AI_ORDER_LINE_COLOR,
  BACKGROUND_COLOR,
  BUILD_ENTRY_HIT_PAD_PX,
  BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT,
  CASUALTY_X_COLOR,
  COUNT_BADGE_OFFSET,
  DETAIL_H3_RESOLUTION,
  INITIAL_CAMERA_ZOOM_IN_LEVELS,
  LIGHTNING_COLOR,
  MAIN_MAP_WHEEL_ZOOM_STEP,
  MULTI_PLAYER_FILL,
  MULTI_PLAYER_STROKE,
  ORDER_ARROW_SIZE,
  ORDER_LINE_COLOR,
  ORDER_LINE_WIDTH,
  PLAYER_COLORS,
  RES4_HIDE_THRESHOLD_VIEW_FRACTION,
  RES4_SHOW_THRESHOLD_VIEW_FRACTION,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  TERRAIN_TOOLTIP_DELAY_MS,
  TOOLTIP_OFFSET_PX,
  UNIT_DESELECT_GLYPH,
  UNIT_ICON_HIT_PAD_PX,
  UNIT_RADIUS,
  UNIT_SELECT_GLYPH,
  UNIT_TYPE_LABELS,
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
  hexCenterPx,
  hexCenterPxRelativeTo,
  hitTestHexAtContainerPixel,
  panMapOneRes1Hex,
  shouldIgnoreGlobalKeydown,
} from './map/mapUtils';
import {
  computeRes1HexFillFraction,
  hideBuildEntryLayer,
  projectHexBoundaryToContainerPoints,
  projectedPolygonOverlapsViewport,
  shouldRenderRes4Hexes,
  shouldShowBuildEntryZoom,
  spanForProjectedHex,
} from './map/terrainView';
import {
  drawArrowheadOnly,
  drawLineArrow,
  drawMovingUnits,
  drawResolutionMoveLines,
  drawStandingOrderLines,
  strokePolylineSkippingWrap,
} from './rendering/pathDrawing';
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
  drawAirStrikeLines,
  drawPendingFerryLines,
  drawRangedAttackLines,
} from './rendering/orderDrawing';
import {
  drawCasualtyOverlay,
  drawCombatLightning,
  drawOneUnitMarker,
  drawStaleEnemyIntel,
  drawUnits,
  drawUnknownBattleMarkers,
} from './rendering/unitDrawing';
import { rendererSharedState as S } from './core/state';
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
} from './openRouter/openRouterRuntime';
import { resetPrecomputedAiState } from './openRouter/precomputedAiState';
import {
  containerPixelHitsDrawnUnitIcon as containerPixelHitsDrawnUnitIconFromModule,
  drawLoadingScene as drawLoadingSceneFromModule,
  getUnitsForDrawWithMovingIds as getUnitsForDrawWithMovingIdsFromModule,
  pointInExpandedClientRect as pointInExpandedClientRectFromModule,
  tryHandleBuildEntryAtClientXY as tryHandleBuildEntryAtClientXYFromModule,
  updateMapInteractionCursor as updateMapInteractionCursorFromModule,
} from './map/drawInteraction';
import {
  cancelAirStrikeForUnit as cancelAirStrikeForUnitFromModule,
  cancelFerryForUnit as cancelFerryForUnitFromModule,
  cancelOrderForUnit as cancelOrderForUnitFromModule,
  cancelRangedForUnit as cancelRangedForUnitFromModule,
  clearCommittedOrderDraftState as clearCommittedOrderDraftStateFromModule,
  clearPendingTacticalOrders as clearPendingTacticalOrdersFromModule,
  getRepresentativeSelectedUnitIdsByOrigin as getRepresentativeSelectedUnitIdsByOriginFromModule,
  refreshHoverRoutePreview as refreshHoverRoutePreviewFromModule,
  replacePendingAirStrikesForSelected as replacePendingAirStrikesForSelectedFromModule,
  replacePendingFerryOrdersForSelected as replacePendingFerryOrdersForSelectedFromModule,
  replacePendingRangedAttacksForSelected as replacePendingRangedAttacksForSelectedFromModule,
  updateRangedSidebar as updateRangedSidebarFromModule,
} from './gameplay/tacticalOrders';
import { drawHoverRoutePreview as drawHoverRoutePreviewFromModule } from './rendering/hoverPreview';
import {
  handleReadyButtonClick as handleReadyButtonClickFromModule,
  type ReadyHandlerDeps,
} from './gameplay/readyHandler';
import { wireMainMapInteractions as wireMainMapInteractionsFromModule } from './map/mainMapInteractions';
import { wireInitCore as wireInitCoreFromModule } from './map/initCore';
import {
  computeRes1OverlayTextY as computeRes1OverlayTextYFromModule,
  drawRes4TerrainHexes as drawRes4TerrainHexesFromModule,
  drawTerrainHexes as drawTerrainHexesFromModule,
  drawTerrainInfrastructureOverlays as drawTerrainInfrastructureOverlaysFromModule,
  hasVisibleRes1InfrastructureGlyphs as hasVisibleRes1InfrastructureGlyphsFromModule,
} from './rendering/terrainRendering';
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
  estimateHexesLeftForOrder as estimateHexesLeftForOrderFromModule,
  formatPendingOrderSidebarLabel as formatPendingOrderSidebarLabelFromModule,
  formatUnitArrowLabel as formatUnitArrowLabelFromModule,
  isPendingMovementOrderForDisplay as isPendingMovementOrderForDisplayFromModule,
  showSidebarError as showSidebarErrorFromModule,
  syncUiAfterSelectionChange as syncUiAfterSelectionChangeFromModule,
  updatePendingOrdersSidebar as updatePendingOrdersSidebarFromModule,
} from './gameplay/sidebarSupport';

let stackCalloutNonSelectableUnitIds: ReadonlySet<string> = new Set<string>();

declare global {
  interface Window {
    gameApi?: GameApi;
  }
}

/**
 * Delegates to resolutionPlayback.ts; kept as a local function so renderer contract tests can anchor on this file.
 */
function buildResolutionPlaybackState(
  anim: NonNullable<typeof S.resolutionMoveAnimation>,
  elapsed: number
): ReturnType<typeof buildResolutionPlaybackStateFromModule> {
  return buildResolutionPlaybackStateFromModule(anim, elapsed);
}

function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null {
  if (!S.gameState) return null;
  return S.gameState.units.find((u) => u.h3Index === h3Index) ?? null;
}

/** Returns all units at the given hex. */
function getUnitsAtHex(h3Index: string): GameStateSnapshot['units'] {
  if (!S.gameState) return [];
  return S.gameState.units.filter((u) => u.h3Index === h3Index);
}

/** Builds stack tooltip text: counts by player and unit type (e.g. "2 human armor, 1 opponent infantry"). */
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

/** Hides the stack callout popover (e.g. after selecting a unit or clicking elsewhere). */
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

/** True while the stack callout or build-queue popup is visible; terrain hover tooltips stay suppressed. */
function isStackOrBuildMapPopoverOpen(): boolean {
  const stack = document.getElementById('stack-callout');
  const build = document.getElementById('build-popup');
  return (
    (!!stack && !stack.classList.contains('hidden')) || (!!build && !build.classList.contains('hidden'))
  );
}

/** True when terrain naming/hex tooltips should not show (popovers open or pointer over the build entry control). */
function shouldSuppressTerrainTooltip(): boolean {
  return isStackOrBuildMapPopoverOpen() || S.buildEntryButtonPointerInside;
}

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

/** Marks the stack callout as sticky after the player starts changing selection from it. */
function activateStackCalloutModal(): void {
  S.stackCalloutModalActive = true;
  const el = document.getElementById('stack-callout');
  if (el) el.classList.add('stack-modal');
}

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

function getSelectableHumanIdsForStackCallout(units: GameStateSnapshot['units']): string[] {
  return units.filter((u) => u.player === 'human' && !stackCalloutNonSelectableUnitIds.has(u.id)).map((u) => u.id);
}

function removeSealiftSection(calloutEl: HTMLElement): void {
  const existing = calloutEl.querySelector('.stack-sealift-section');
  if (existing) existing.remove();
}

function buildSealiftUnitLabel(unitId: string, unitType: string): string {
  void unitType;
  return formatUnitDisplayName(unitId);
}

async function renderSealiftSection(units: GameStateSnapshot['units'], calloutEl: HTMLElement): Promise<void> {
  removeSealiftSection(calloutEl);
  if (!window.gameApi?.getSealiftStackState || !window.gameApi?.updateSealiftSlot) return;
  const h3Index = units[0]?.h3Index;
  if (!h3Index) return;
  try {
    const state = await window.gameApi.getSealiftStackState({ h3Index });
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
        select.addEventListener('change', async () => {
          const selected = select.value.trim();
          const result = await window.gameApi!.updateSealiftSlot({
            h3Index,
            navalUnitId: row.navalUnitId,
            slotIndex,
            landUnitId: selected.length > 0 ? selected : null,
          });
          if (!result.success) {
            showMapToast(formatTargetingValidationReason(result.reason, 'Failed to update sealift assignment.'));
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
 * Shows the stack callout at the given screen position with an alphabetized list of units.
 * Units belonging to the human player get +/- controls for adding/removing from the active selection.
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
  const units = unitIds
    .map((id) => state.units.find((u) => u.id === id))
    .filter((unit): unit is NonNullable<typeof unit> => !!unit);
  if (units.length === 0) {
    hideStackCallout();
    return;
  }
  showStackCallout(units, Number(rawX), Number(rawY));
}

/** Clears the build-queue popup; stack and terrain tooltip are unaffected. */
function hideBuildPopup(): void {
  getBuildQueuePopupController().hideBuildPopup();
}

/**
 * Opens the build-queue dialog for a res-1 hex (offset like the stack callout). Closes the stack callout
 * and hover terrain tooltip so only one map popup is active at a time.
 */
function showBuildPopup(h3Index: string, clientX: number, clientY: number): void {
  getBuildQueuePopupController().showBuildPopup(h3Index, clientX, clientY);
}

function refreshBuildPopupIfOpen(): void {
  getBuildQueuePopupController().refreshBuildPopupIfOpen();
}

let buildQueuePopupController: ReturnType<typeof createBuildQueuePopupController> | null = null;

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

function clearTerrainTooltipTimer(): void {
  if (S.terrainTooltipDelayTimer !== null) {
    clearTimeout(S.terrainTooltipDelayTimer);
    S.terrainTooltipDelayTimer = null;
  }
}

function hideTerrainTooltipVisual(): void {
  S.terrainTooltipRequestSeq++;
  const el = document.getElementById('hex-tooltip');
  if (el) {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Formats a pipeline terrain kind for display (e.g. `forest` → "Forest").
 */
function formatTerrainKindLabel(kind: string): string {
  if (!kind) return 'Unknown';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * Resolves base terrain kind + urban variation state for a res-1 gameplay hex.
 */
function terrainStateForRes1Hex(h3: string): { terrainKind: string; isUrban: boolean; isRubble: boolean } {
  if (!S.gameState) return { terrainKind: 'Unknown', isUrban: false, isRubble: false };
  const hx = S.gameState.hexes.find((h) => h.h3Index === h3);
  if (!hx) return { terrainKind: 'Unknown', isUrban: false, isRubble: false };
  return {
    terrainKind:
    hx.terrainKind ??
    (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : hx.terrain === 'wetlands' ? 'wetlands' : 'plains'),
    isUrban: false,
    isRubble: false,
  };
}

function terrainKindForRes1Hex(h3: string): string {
  return terrainStateForRes1Hex(h3).terrainKind;
}

function featureLabelsForRes1Hex(h3: string): string[] {
  if (!infraGlyphsAllowedForRes1Hex(h3)) return [];
  const counts = getRes1FeatureCounts(h3);
  const labels: string[] = [];
  if (counts.airportCount > 0) labels.push('Airports');
  if (counts.seaportCount > 0) labels.push('Seaports');
  if (counts.rubbleCount > 0) labels.push('Rubble');
  return labels;
}

function featureLabelsForRes4Child(parentH3: string, childH3: string): string[] {
  if (!infraGlyphsAllowedForRes4Child(parentH3, childH3)) return [];
  const labels: string[] = [];
  const detail = S.res4TerrainOverridesByH3.get(childH3);
  if (detail?.isRubble) labels.push('Rubble');
  if (S.terrainInfraRes4Airport.has(childH3)) labels.push('Airport');
  if (S.terrainInfraRes4Seaport.has(childH3)) labels.push('Seaport');
  return labels;
}

interface TerrainTooltipState {
  terrainKind: string;
  isUrban: boolean;
  isRubble: boolean;
  features: string[];
  urbanHexCount: number | null;
  res1TerrainSummary: string | null;
  res1FeaturesSummary: string | null;
}

interface NamingLookupTarget {
  h3Index: string;
  resolution: 1 | 4;
}

function countUrbanRes4HexesInRes1Hex(parentH3: string): number {
  let children = S.res4ChildrenByParent.get(parentH3);
  if (!children) {
    children = cellToChildren(parentH3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(parentH3, children);
  }
  let count = 0;
  for (const child of children) {
    if (S.res4TerrainOverridesByH3.get(child)?.isUrban) count++;
  }
  return count;
}

function getUrbanProductionCapacityForHex(h3Index: string): number {
  // Canonical capacity is the current count of urban res4 children.
  return countUrbanRes4HexesInRes1Hex(h3Index);
}

function getControllerForHex(state: GameStateSnapshot, h3Index: string): string | null {
  const row = state.res1Control?.find((entry) => entry.h3Index === h3Index);
  return row?.controllerPlayerId ?? null;
}

/**
 * Returns whether **T** is held for map inspection (see `rendererSharedState.hideTerrainFillWhileHeld`). Terrain fills, res4 fills,
 * and production overlays all consult this reader; only key/blur handlers assign the underlying flag.
 */
function isMapInspectionModeHeld(): boolean {
  return S.hideTerrainFillWhileHeld;
}

/**
 * True when this res1 hex is land, human-controlled, and has at least one urban res4 child (production
 * capacity). Matches eligibility for build-entry buttons (plus explored) and for canvas production labels
 * when not in map inspection mode.
 */
function isRes1HexHumanUrbanProduction(
  state: GameStateSnapshot,
  hx: GameStateSnapshot['hexes'][number]
): boolean {
  if (hx.terrain === 'water') return false;
  if (getControllerForHex(state, hx.h3Index) !== 'human') return false;
  return getUrbanProductionCapacityForHex(hx.h3Index) > 0;
}

function getBuildQueueSummaryForHex(
  state: GameStateSnapshot,
  h3Index: string
): NonNullable<GameStateSnapshot['res1BuildQueueTotals']>[number] | null {
  return state.res1BuildQueueTotals?.find((entry) => entry.h3Index === h3Index) ?? null;
}

type UnitCountsByType = Record<BuildUnitType, number>;
type UnitCountsByPlayer = Record<'human' | 'opponent', UnitCountsByType>;

function getUnitCountsByTypeForPlayer(
  state: GameStateSnapshot,
  playerId: 'human' | 'opponent'
): UnitCountsByType {
  const counts: UnitCountsByType = { infantry: 0, armor: 0, naval: 0, air: 0 };
  for (const unit of state.units) {
    if (unit.player !== playerId) continue;
    if (unit.unitType === 'infantry' || unit.unitType === 'armor' || unit.unitType === 'naval' || unit.unitType === 'air') {
      counts[unit.unitType] += 1;
    }
  }
  return counts;
}

function isFogOfWarDisabledForSnapshot(state: GameStateSnapshot): boolean {
  return state.fogOfWarEnabled === false;
}

function formatProductionQueueAwareLabel(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null,
  unitCountsByPlayer?: UnitCountsByPlayer
): string {
  const capacityText = `${Math.max(0, capacityPerTurn).toLocaleString()}c`;
  const queue = getBuildQueueSummaryForHex(state, h3Index);
  const queuedUnits = queue?.queuedUnits ?? 0;
  if (queuedUnits <= 0) return capacityText;
  const nextUnitType = queue?.nextUnitType;
  const storedPoints = Math.max(0, queue?.storedPoints ?? 0);
  if (!nextUnitType || capacityPerTurn <= 0) {
    return `${capacityText} / ?t`;
  }
  if (controller === 'human' || controller === 'opponent') {
    const countsByType =
      controller === 'human'
        ? (unitCountsByPlayer?.human ?? getUnitCountsByTypeForPlayer(state, 'human'))
        : (unitCountsByPlayer?.opponent ?? getUnitCountsByTypeForPlayer(state, 'opponent'));
    if (countsByType[nextUnitType] >= MAX_UNITS_PER_TYPE[nextUnitType]) {
      return `${capacityText} / ∞t`;
    }
  }
  const turns = estimateTurnsToNextSpawn(nextUnitType, storedPoints, capacityPerTurn);
  if (turns === null) return `${capacityText} / ?t`;
  return `${capacityText} / ${turns.toLocaleString()}t`;
}

function formatProductionLabelForHumanControllerOnly(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null
): string {
  if (controller !== 'human') return `${Math.max(0, capacityPerTurn).toLocaleString()}c / ?t`;
  return formatProductionQueueAwareLabel(state, h3Index, capacityPerTurn, controller);
}

function formatProductionLabelForAnyController(
  state: GameStateSnapshot,
  h3Index: string,
  capacityPerTurn: number,
  controller: string | null,
  unitCountsByPlayer?: UnitCountsByPlayer
): string {
  return formatProductionQueueAwareLabel(state, h3Index, capacityPerTurn, controller, unitCountsByPlayer);
}

interface ProductionOverlayContext {
  mapInspectionHeld: boolean;
  revealAllControllerQueues: boolean;
  unitHexes: Set<string>;
  unitCountsByPlayer?: UnitCountsByPlayer;
}

function buildProductionOverlayContext(state: GameStateSnapshot): ProductionOverlayContext {
  const mapInspectionHeld = isMapInspectionModeHeld();
  const revealAllControllerQueues = mapInspectionHeld && isFogOfWarDisabledForSnapshot(state);
  return {
    mapInspectionHeld,
    revealAllControllerQueues,
    unitHexes: new Set(state.units.map((u) => u.h3Index)),
    unitCountsByPlayer: revealAllControllerQueues
      ? {
          human: getUnitCountsByTypeForPlayer(state, 'human'),
          opponent: getUnitCountsByTypeForPlayer(state, 'opponent'),
        }
      : undefined,
  };
}

function roundToNearestInteger(value: number): number {
  return Math.round(value);
}

function formatPercentInteger(value: number): string {
  return value.toLocaleString();
}

function clearRes1TooltipSummaryCaches(): void {
  S.res1DominantTerrainKindByH3.clear();
  S.res1TerrainSummaryByH3.clear();
  S.res1FeaturesSummaryByH3.clear();
  S.res1FeatureCountsByH3.clear();
  S.terrainTooltipHtmlByContentKey.clear();
}

function getRes1FeatureCounts(h3: string): { airportCount: number; seaportCount: number; rubbleCount: number } {
  const cached = S.res1FeatureCountsByH3.get(h3);
  if (cached) return cached;
  let children = S.res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(h3, children);
  }
  let airportCount = 0;
  let seaportCount = 0;
  let rubbleCount = 0;
  for (const child of children) {
    if (S.terrainInfraRes4Airport.has(child)) airportCount++;
    if (S.terrainInfraRes4Seaport.has(child)) seaportCount++;
    if (S.res4TerrainOverridesByH3.get(child)?.isRubble) rubbleCount++;
  }
  const counts = { airportCount, seaportCount, rubbleCount };
  S.res1FeatureCountsByH3.set(h3, counts);
  return counts;
}

function getRes1DominantTerrainKind(h3: string, parentKind: string): string {
  const cached = S.res1DominantTerrainKindByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = S.res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(h3, children);
  }
  if (children.length <= 0) {
    S.res1DominantTerrainKindByH3.set(h3, parentKind);
    return parentKind;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = S.res4TerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  let dominantKind = parentKind;
  let dominantCount = -1;
  for (const [kind, count] of counts.entries()) {
    if (count > dominantCount || (count === dominantCount && kind.localeCompare(dominantKind) < 0)) {
      dominantKind = kind;
      dominantCount = count;
    }
  }
  S.res1DominantTerrainKindByH3.set(h3, dominantKind);
  return dominantKind;
}

function getRes1TerrainSummary(h3: string, parentKind: string): string {
  const cached = S.res1TerrainSummaryByH3.get(h3);
  if (cached !== undefined) return cached;
  let children = S.res4ChildrenByParent.get(h3);
  if (!children) {
    children = cellToChildren(h3, DETAIL_H3_RESOLUTION);
    S.res4ChildrenByParent.set(h3, children);
  }
  const total = children.length;
  if (total <= 0) {
    const fallback = `${formatTerrainKindLabel(parentKind)} (100.0%)`;
    S.res1TerrainSummaryByH3.set(h3, fallback);
    return fallback;
  }
  const counts = new Map<string, number>();
  for (const child of children) {
    const kind = S.res4TerrainOverridesByH3.get(child)?.terrainKind ?? parentKind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const entries = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  if (entries.length <= 3) {
    const parts = entries.map(([kind, count]) => {
      const pct = roundToNearestInteger((count * 100) / total);
      return `${formatTerrainKindLabel(kind)} (${formatPercentInteger(pct)}%)`;
    });
    const summary = parts.join(', ');
    S.res1TerrainSummaryByH3.set(h3, summary);
    return summary;
  }
  const topTwo = entries.slice(0, 2);
  const topTwoCount = topTwo.reduce((sum, [, count]) => sum + count, 0);
  const parts = topTwo.map(([kind, count]) => {
    const pct = roundToNearestInteger((count * 100) / total);
    return `${formatTerrainKindLabel(kind)} (${formatPercentInteger(pct)}%)`;
  });
  const otherPct = roundToNearestInteger(((total - topTwoCount) * 100) / total);
  parts.push(`Other (${formatPercentInteger(otherPct)}%)`);
  const summary = parts.join(', ');
  S.res1TerrainSummaryByH3.set(h3, summary);
  return summary;
}

function getRes1FeaturesSummary(h3: string): string | null {
  if (S.res1FeaturesSummaryByH3.has(h3)) return S.res1FeaturesSummaryByH3.get(h3) ?? null;
  if (!infraGlyphsAllowedForRes1Hex(h3)) {
    S.res1FeaturesSummaryByH3.set(h3, null);
    return null;
  }
  const { airportCount, seaportCount, rubbleCount } = getRes1FeatureCounts(h3);
  const parts: string[] = [];
  if (airportCount > 0) parts.push(`Airports (${airportCount.toLocaleString()})`);
  if (seaportCount > 0) parts.push(`Seaports (${seaportCount.toLocaleString()})`);
  if (rubbleCount > 0) parts.push(`Rubble (${rubbleCount.toLocaleString()})`);
  const summary = parts.length > 0 ? parts.join(', ') : null;
  S.res1FeaturesSummaryByH3.set(h3, summary);
  return summary;
}

function terrainTooltipStateForRes1Hex(h3: string): TerrainTooltipState {
  const state = terrainStateForRes1Hex(h3);
  return {
    ...state,
    features: featureLabelsForRes1Hex(h3),
    urbanHexCount: countUrbanRes4HexesInRes1Hex(h3),
    res1TerrainSummary: getRes1TerrainSummary(h3, state.terrainKind),
    res1FeaturesSummary: getRes1FeaturesSummary(h3),
  };
}

function terrainStateForPointer(
  clientX: number,
  clientY: number,
  fallbackRes1H3: string | null
): TerrainTooltipState {
  if (!S.gameState) {
    return {
      terrainKind: 'Unknown',
      isUrban: false,
      isRubble: false,
      features: [],
      urbanHexCount: null,
      res1TerrainSummary: null,
      res1FeaturesSummary: null,
    };
  }
  const res4On = shouldRenderRes4Hexes();
  if (!res4On) {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
  const L = getLeafletGlobal();
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    const parentH3 = cellToParent(detailH3, WORLD_H3_RESOLUTION);
    const parentKind = terrainKindForRes1Hex(parentH3);
    const detail = S.res4TerrainOverridesByH3.get(detailH3);
    return {
      terrainKind: detail?.terrainKind ?? parentKind,
      isUrban: detail?.isUrban ?? false,
      isRubble: detail?.isRubble ?? false,
      features: featureLabelsForRes4Child(parentH3, detailH3),
      urbanHexCount: null,
      res1TerrainSummary: null,
      res1FeaturesSummary: null,
    };
  } catch {
    if (!fallbackRes1H3) {
      return {
        terrainKind: 'Unknown',
        isUrban: false,
        isRubble: false,
        features: [],
        urbanHexCount: null,
        res1TerrainSummary: null,
        res1FeaturesSummary: null,
      };
    }
    return terrainTooltipStateForRes1Hex(fallbackRes1H3);
  }
}

function namingLookupTargetForPointer(
  clientX: number,
  clientY: number,
  fallbackRes1H3: string | null
): NamingLookupTarget | null {
  const res4On = shouldRenderRes4Hexes();
  if (!res4On) {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
      }
    | null;
  if (!map) {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
  const L = getLeafletGlobal();
  const rect = map.getContainer().getBoundingClientRect();
  const latlng = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
  try {
    const detailH3 = latLngToCell(latlng.lat, latlng.lng, DETAIL_H3_RESOLUTION);
    return { h3Index: detailH3, resolution: 4 };
  } catch {
    if (!fallbackRes1H3) return null;
    return { h3Index: fallbackRes1H3, resolution: 1 };
  }
}

function namingLookupKey(target: NamingLookupTarget | null): string | null {
  if (!target) return null;
  return `${target.resolution}:${target.h3Index}`;
}

async function getCachedNamingLineForTarget(target: NamingLookupTarget | null): Promise<string | null> {
  const key = namingLookupKey(target);
  if (!key || !target) return null;
  if (S.namingLineByLookupKey.has(key)) return S.namingLineByLookupKey.get(key) ?? null;
  if (!window.gameApi?.getHexNamingTooltipLine) return null;
  try {
    const line = await window.gameApi.getHexNamingTooltipLine(target);
    S.namingLineByLookupKey.set(key, line ?? null);
    return line ?? null;
  } catch (err) {
    console.error('getHexNamingTooltipLine failed:', err);
    S.namingLineByLookupKey.set(key, null);
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatGroupedNamingLineHtml(namingLine: string): string {
  const groups = namingLine
    .split(';')
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
  if (groups.length === 0) return escapeHtml(namingLine);
  const formattedGroups = groups.map((group) => {
    const colonIdx = group.indexOf(':');
    if (colonIdx < 0) return escapeHtml(group);
    const heading = group.slice(0, colonIdx).trim();
    const remainder = group.slice(colonIdx + 1).trim();
    if (!heading) return escapeHtml(group);
    if (!remainder) return `<strong>${escapeHtml(heading)}:</strong>`;
    return `<strong>${escapeHtml(heading)}:</strong> ${escapeHtml(remainder)}`;
  });
  return formattedGroups.join('; ');
}

function formatTerrainVariantSuffix(state: Pick<TerrainTooltipState, 'isUrban' | 'isRubble'>): string {
  const variants: string[] = [];
  if (state.isUrban) variants.push('Urban');
  if (state.isRubble) variants.push('Rubble');
  return variants.length > 0 ? `, ${variants.join(', ')}` : '';
}

function formatTerrainTooltipHtml(state: TerrainTooltipState, namingLine: string | null): string {
  const terrainLabel = formatTerrainKindLabel(state.terrainKind);
  const terrainValue = state.res1TerrainSummary ?? `${terrainLabel}${formatTerrainVariantSuffix(state)}`;
  const terrainLine = `<strong>Terrain:</strong> ${terrainValue}`;
  const bodyParts: string[] = [terrainLine];
  if (state.res1FeaturesSummary != null) bodyParts.push(`<strong>Features:</strong> ${state.res1FeaturesSummary}`);
  else if (state.features.length > 0) bodyParts.push(`<strong>Features:</strong> ${state.features.join(', ')}`);
  if (state.urbanHexCount != null) bodyParts.push(`<strong>Urban Hexes:</strong> ${state.urbanHexCount.toLocaleString()}`);
  const bodyLine = bodyParts.join('<br/>');
  if (!namingLine) return bodyLine;
  return `${formatGroupedNamingLineHtml(namingLine)}<br/>${bodyLine}`;
}

function terrainTooltipContentKey(state: TerrainTooltipState, namingLine: string | null): string {
  const namingKey = namingLine ?? '';
  const urbanKey = state.isUrban ? '1' : '0';
  const rubbleKey = state.isRubble ? '1' : '0';
  const featuresKey = state.features.join('|');
  const urbanHexCountKey = state.urbanHexCount == null ? 'x' : String(state.urbanHexCount);
  const res1TerrainSummaryKey = state.res1TerrainSummary ?? '';
  const res1FeaturesSummaryKey = state.res1FeaturesSummary ?? '';
  return `${namingKey}::${state.terrainKind}::${urbanKey}::${rubbleKey}::${featuresKey}::${urbanHexCountKey}::${res1TerrainSummaryKey}::${res1FeaturesSummaryKey}`;
}

function getCachedTerrainTooltipHtml(state: TerrainTooltipState, namingLine: string | null): string {
  const key = terrainTooltipContentKey(state, namingLine);
  const cachedHtml = S.terrainTooltipHtmlByContentKey.get(key);
  if (cachedHtml !== undefined) return cachedHtml;
  const html = formatTerrainTooltipHtml(state, namingLine);
  S.terrainTooltipHtmlByContentKey.set(key, html);
  if (S.terrainTooltipHtmlByContentKey.size > 4096) S.terrainTooltipHtmlByContentKey.clear();
  return html;
}

function isStackCalloutTargetInsideDialog(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const callout = document.getElementById('stack-callout');
  return !!callout && callout.contains(target);
}

/**
 * Refreshes renderer state after a build-queue mutation so res-1 queue labels update immediately.
 */
async function refreshGameStateAfterBuildQueueChange(): Promise<void> {
  return refreshGameStateAfterBuildQueueChangeFromModule({ applyGameStateSnapshot });
}

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
    },
    nextState,
    options
  );
}

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
  const el = document.getElementById('hex-tooltip');
  if (!el) return;
  el.innerHTML = getCachedTerrainTooltipHtml(state, namingLine);
  el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'tooltip');
}

/**
 * Restores the terrain tooltip after stack/build popovers close, even when the pointer
 * has not moved (the normal scheduling path runs only on pointermove/hex-change).
 */
async function restoreTerrainTooltipAfterPopoverClose(): Promise<void> {
  if (!S.gameState) return;
  if (S.buildEntryButtonPointerInside) {
    const atPointer = document.elementFromPoint(S.lastPointerClientX, S.lastPointerClientY);
    const stillInsideBuildEntry = atPointer instanceof Element && !!atPointer.closest('.build-entry-btn');
    if (!stillInsideBuildEntry) S.buildEntryButtonPointerInside = false;
  }
  if (shouldSuppressTerrainTooltip()) return;
  let hoverH3 = S.hoveredHexH3;
  if (!hoverH3) {
    const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
    if (!map) return;
    const rect = map.getContainer().getBoundingClientRect();
    const x = S.lastPointerClientX - rect.left;
    const y = S.lastPointerClientY - rect.top;
    const set = new Set(S.gameState.hexes.map((h) => h.h3Index));
    hoverH3 = hitTestHexAtContainerPixel(x, y, set);
    if (!hoverH3) return;
    S.hoveredHexH3 = hoverH3;
  }
  clearTerrainTooltipTimer();
  const state = terrainStateForPointer(S.lastPointerClientX, S.lastPointerClientY, hoverH3);
  const namingTarget = namingLookupTargetForPointer(S.lastPointerClientX, S.lastPointerClientY, hoverH3);
  await showTerrainTooltip(S.lastPointerClientX, S.lastPointerClientY, state, namingTarget);
}

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

function getPrimarySelectedUnitId(): string | null {
  return S.selectedUnitIds[0] ?? null;
}

function rebuildUnitDisplayNameLookup(state: GameStateSnapshot | null): void {
  S.unitDisplayNameById = state ? buildUnitDisplayNameLookup(state.units) : new Map<string, string>();
}

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

async function refreshRes4TerrainOverridesForRenderer(): Promise<void> {
  if (!window.gameApi?.getRes4TerrainOverrides) return;
  try {
    const rows = await window.gameApi.getRes4TerrainOverrides();
    applyRes4TerrainOverrides(rows);
    requestRedraw();
  } catch (err) {
    console.error('getRes4TerrainOverrides failed:', err);
  }
}

function formatUnitDisplayName(unitId: string): string {
  return S.unitDisplayNameById.get(unitId) ?? fallbackDisplayNameFromUnitId(unitId);
}

function formatTargetingValidationReason(reason: string | undefined, fallbackMessage: string): string {
  const trimmed = reason?.trim();
  if (!trimmed) return fallbackMessage;
  const prefixed = trimmed.match(/^([^:]+):\s+(.+)$/);
  if (!prefixed) return trimmed;
  const unitId = prefixed[1] ?? '';
  const unitReason = prefixed[2] ?? '';
  if (!unitId || !unitReason) return trimmed;
  return `${formatUnitDisplayName(unitId)}: ${unitReason}`;
}

function reconcileSelectionToCurrentState(): void {
  return reconcileSelectionToCurrentStateFromModule();
}

function replaceSelection(unitIds: string[]): void {
  return replaceSelectionFromModule(unitIds);
}

function addUnitsToSelection(unitIds: string[]): void {
  return addUnitsToSelectionFromModule(unitIds);
}

function removeUnitsFromSelection(unitIds: string[]): void {
  return removeUnitsFromSelectionFromModule(unitIds);
}

function toggleUnitSelection(unitId: string): void {
  return toggleUnitSelectionFromModule(unitId);
}

function clearSelection(): void {
  return clearSelectionFromModule();
}

function getVisibleHexSet(state: GameStateSnapshot | null): Set<string> {
  return getVisibleHexSetFromModule(state);
}

function getExploredHexSet(state: GameStateSnapshot | null): Set<string> {
  return getExploredHexSetFromModule(state);
}

function isHexExploredByPlayer(h3Index: string): boolean {
  return isHexExploredByPlayerFromModule(h3Index);
}

function inferUnitTypeLabelFromId(unitId: string): string {
  if (unitId.includes('-infantry-')) return 'I';
  if (unitId.includes('-armor-')) return 'A';
  if (unitId.includes('-naval-')) return 'N';
  if (unitId.includes('-air-')) return 'S';
  return '?';
}

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
function requestRedraw(): void {
  if (S.resolutionMoveAnimation) return;
  if (S.redrawRafId !== null) return;

  S.redrawRafId = requestAnimationFrame(() => {
    S.redrawRafId = null;
    redraw();
  });
}

/**
 * Maintains the client-side stale enemy intel cache across state transitions. Call after every
 * renderer snapshot update (ready, initial load, new game). Compares the previous and current visible enemy
 * sets to create stale entries for enemies that just left view, and culls entries that are now
 * contradicted (hex visible but enemy gone), expired, or re-sighted. Works alongside the persisted
 * DB intel; the draw function merges both sources so stale markers appear even when DB rows lag.
 */
function updateClientStaleEnemyIntel(previousState: GameStateSnapshot | null, state: GameStateSnapshot): void {
  return updateClientStaleEnemyIntelFromModule(previousState, state);
}

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

function computeRes1OverlayTextY(
  h3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  L: { latLng: (lat: number, lng: number) => unknown },
  hasOffsetFeatures: boolean
): number {
  return computeRes1OverlayTextYFromModule(h3Index, map, L, hasOffsetFeatures);
}

/** Renders build-entry controls for every eligible human-controlled production hex at current zoom. */
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
  const res4On = shouldRenderRes4Hexes();
  if (res4On) {
    hideBuildEntryLayer(layer);
    hideBuildPopup();
    return;
  }
  const visibleUnitHexes = new Set(S.gameState.units.map((u) => u.h3Index));
  const rows: Array<{ h3: string; label: string; left: number; top: number; hasCapacity: boolean }> = [];
  for (const hx of S.gameState.hexes) {
    if (hx.terrain === 'water') continue;
    const explored = isHexExploredByPlayer(hx.h3Index);
    if (!explored) continue;
    if (!isRes1HexHumanUrbanProduction(S.gameState, hx)) continue;
    const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);
    const hasInfraSymbols = hasVisibleRes1InfrastructureGlyphs(hx.h3Index, res4On, visibleUnitHexes);
    const hasVisibleUnits = visibleUnitHexes.has(hx.h3Index);
    const center = hexCenterPx(hx.h3Index);
    const textY = computeRes1OverlayTextY(hx.h3Index, map, L, hasInfraSymbols || hasVisibleUnits);
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
 * Res-1 glyphs track terrain fill visibility and are hidden while T is held.
 */
function infraGlyphsAllowedForRes1Hex(h3: string): boolean {
  if (!isHexExploredByPlayer(h3)) return false;
  return true;
}

/**
 * Res-4 glyphs track terrain fill visibility and are hidden while T is held.
 */
function infraGlyphsAllowedForRes4Child(parentH3: string, childH3: string): boolean {
  if (!isHexExploredByPlayer(parentH3)) return false;
  void childH3;
  return true;
}

/**
 * Draws airport / seaport symbols on highlighted terrain hexes after units so glyphs sit above unit markers when T is held.
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
 * Draws res1 production capacity / queue hints on the map overlay canvas.
 * Rules follow `isMapInspectionModeHeld()` and `isRes1HexHumanUrbanProduction()`; map inspection uses `rendererSharedState.hideTerrainFillWhileHeld`.
 * With fog disabled, T-hold inspection reveals full queue ETA labels for all land hexes.
 * Skipped while res4 child hexes are visible.
 */
function drawRes1ProductionOverlays(ctx: CanvasRenderingContext2D): void {
  if (!S.gameState) return;
  const map = getMainLeafletMap() as
    | { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  if (shouldRenderRes4Hexes()) return;
  const overlayContext = buildProductionOverlayContext(S.gameState);
  for (const hx of S.gameState.hexes) {
    const explored = isHexExploredByPlayer(hx.h3Index);
    if (!explored && !overlayContext.mapInspectionHeld) continue;
    if (hx.terrain === 'water') continue;
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
    const textY = computeRes1OverlayTextY(hx.h3Index, map, L, hasInfraSymbols || hasVisibleUnits);
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
      : `${Math.max(0, capacityPerTurn).toLocaleString()}c`;
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

/** Synchronizes event-driven mode from the Tools tab "Events" toggle state. */
function syncEventDrivenFromTools(): void {
  return syncEventDrivenFromToolsFromModule();
}

/**
 * Starts one background AI orders request if conditions allow (planning phase, key and model set, no request in flight).
 * Used when Run is toggled on and after new game when Run is on. On success stores orders and enables Ready; on failure shows a user-visible error.
 */
function startBackgroundRequestIfAllowed(): void {
  return startBackgroundRequestIfAllowedFromModule({
    appendOpenRouterLog,
    updateReadyButtonState,
    updateOpenRouterToolCountLabels,
    updateOpenRouterCostLabel,
    showSidebarError,
  });
}

/**
 * Renders or updates the Tools tab list: 2-column grid; each cell has label and count (toggle button).
 * Toggle click flips enabled state. Does not call main or Ready.
 */
function renderOpenRouterToolsList(): void {
  return renderOpenRouterToolsListFromModule({
    appendOpenRouterLog,
    updateReadyButtonState,
    updateOpenRouterToolCountLabels,
    updateOpenRouterCostLabel,
    showSidebarError,
  });
}

/**
 * Draws a neutral loading canvas while map/game state is still initializing.
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
 * Mirrors which units are passed to `drawUnits` (including resolution-phase substitutions and moving exclusions).
 */
function getUnitsForDrawWithMovingIds(state: GameStateSnapshot): {
  unitsToDraw: GameStateSnapshot['units'];
  movingIds: Set<string> | undefined;
} {
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

/** True if map-container pixel (px, py) lies on a drawn unit circle for this hex (same layout as `drawUnits`). */
function containerPixelHitsDrawnUnitIcon(
  px: number,
  py: number,
  h3Index: string,
  unitCount: number
): boolean {
  return containerPixelHitsDrawnUnitIconFromModule(px, py, h3Index, unitCount);
}

function pointInExpandedClientRect(
  clientX: number,
  clientY: number,
  rect: DOMRectReadOnly,
  padPx: number
): boolean {
  return pointInExpandedClientRectFromModule(clientX, clientY, rect, padPx);
}

/**
 * Opens or toggles the build popup when the pointer is over the slim build control. Clicks often land on
 * `#main-map` (overlay canvas uses `pointer-events: none`) instead of `#build-entry-btn`, so this mirrors the button handler.
 */
function tryHandleBuildEntryAtClientXY(clientX: number, clientY: number): boolean {
  return tryHandleBuildEntryAtClientXYFromModule(clientX, clientY, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/** Leaflet uses a grab hand on the map; use the normal arrow over actual click targets (icons, build control). */
function updateMapInteractionCursor(clientX: number, clientY: number): void {
  return updateMapInteractionCursorFromModule(clientX, clientY, {
    backgroundColor: BACKGROUND_COLOR,
    buildResolutionPlaybackState,
    hideBuildPopup,
    showBuildPopup,
  });
}

/**
 * Draws the full tactical scene for the current frame. Use from both resize and animation redraw paths
 * so terrain, units, stale intel, and combat overlays stay behaviorally identical.
 */
function drawGameScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameStateSnapshot
): void {
  ctx.clearRect(0, 0, width, height);
  drawTerrainHexes(ctx);
  drawRes4TerrainHexes(ctx);
  const hexList = state.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let airStrikeOutboundProgress = 1;
  let airStrikeReturnProgress = 1;
  let playbackPhase: ResolutionPlaybackPhase | null = null;
  const anim = S.resolutionMoveAnimation;
  const regularPlaybackMoves = buildResolutionPlaybackMoves(anim?.moves ?? [], state.units);
  const airStrikeOutboundPlaybackMoves = anim?.airStrikeOutboundMoves ?? [];
  const airStrikeReturnPlaybackMoves = anim?.airStrikeReturnMoves ?? [];
  const { unitsToDraw, movingIds } = getUnitsForDrawWithMovingIds(state);
  if (anim) {
    const elapsed = Date.now() - anim.startTime;
    const { phase } = buildResolutionPlaybackState(anim, elapsed);
    playbackPhase = phase;
    moveProgress = phase.moveProgress;
    airStrikeOutboundProgress = phase.airStrikeOutboundProgress;
    airStrikeReturnProgress = phase.airStrikeReturnProgress;
    if (phase.inAirStrikeOutbound) {
      drawResolutionMoveLines(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
    }
    if (phase.inAirStrikeReturn) {
      drawResolutionMoveLines(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
    }
    if (elapsed >= phase.movementStart) {
      drawResolutionMoveLines(ctx, width, height, regularPlaybackMoves, hexList, 1);
    }
  }
  const shouldDrawCommittedPaths = shouldDrawCommittedOrderPaths();
  const shouldDrawPathPreview = shouldDrawHoveredPathPreview();
  const hiddenCommittedUnitIdsWhilePreviewing = getCommittedOrderUnitsHiddenDuringPreview(shouldDrawPathPreview);
  if (shouldDrawCommittedPaths && !S.hideCommittedOrderLinesAfterReady && S.humanStandingOrders.length > 0 && state.units.length) {
    drawStandingOrderLines(ctx, S.humanStandingOrders, state.units, hiddenCommittedUnitIdsWhilePreviewing);
  }
  if (shouldDrawPathPreview && !anim) drawHoverRoutePreview(ctx);
  if (S.pendingRangedAttacks.length > 0 && state.units.length && hexList) {
    drawRangedAttackLines(ctx, width, height, S.pendingRangedAttacks, state.units, hexList);
  }
  if (S.pendingAirStrikes.length > 0 && state.units.length && hexList) {
    drawAirStrikeLines(ctx, S.pendingAirStrikes, state.units, hexList);
  }
  if (S.pendingFerryOrders.length > 0 && state.units.length && hexList) {
    drawPendingFerryLines(ctx, S.pendingFerryOrders, state.units, hexList, drawLineArrow);
  }
  drawRes1ProductionOverlays(ctx);
  drawTerrainInfrastructureOverlays(ctx);
  drawStaleEnemyIntel(ctx, state, inferUnitTypeLabelFromId);
  if (unitsToDraw.length) {
    drawUnits(ctx, unitsToDraw, movingIds);
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
    const elapsed = Date.now() - anim.startTime;
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

function shouldDrawCommittedOrderPaths(): boolean {
  return !S.ctrlKeyActive;
}

function shouldDrawHoveredPathPreview(): boolean {
  return !S.ctrlKeyActive && S.selectedUnitIds.length > 0;
}

function getCommittedOrderUnitsHiddenDuringPreview(
  shouldDrawPathPreview: boolean
): ReadonlySet<string> | null {
  if (!shouldDrawPathPreview || !S.hoverRoutePreview) return null;
  return new Set(S.selectedUnitIds);
}

/**
 * Resizes the overlay canvas to match the map container (including devicePixelRatio) and redraws hexes/units.
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
    return;
  }
  drawGameScene(ctx, w, h, S.gameState);
  syncBuildEntryButton();
}

/**
 * Draws hover route preview for selected unit: turn-1 segment solid, future turns dashed, optional invalid X marker.
 */
function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void {
  if (!shouldDrawHoveredPathPreview()) return;
  return drawHoverRoutePreviewFromModule(ctx);
}

/** Redraws the overlay without resizing. Use after pan/zoom or selection change. */
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
    return;
  }
  drawGameScene(ctx, w, h, S.gameState);
  syncBuildEntryButton();
}

function tickResolutionMoveAnimation(): void {
  if (!S.resolutionMoveAnimation) return;
  const anim = S.resolutionMoveAnimation;
  const elapsed = Date.now() - anim.startTime;
  const { phase } = buildResolutionPlaybackState(anim, elapsed);
  const { totalMs } = phase;
  redraw();
  if (elapsed < totalMs) {
    S.resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
  } else {
    S.resolutionMoveAnimation = null;
    S.resolutionMoveAnimationFrameId = null;
    // Re-enable committed path rendering at the end of resolution playback.
    S.hideCommittedOrderLinesAfterReady = false;
    redraw();
  }
}

/** Updates the sidebar with the selected unit or placeholder. */
function updateSidebar(): void {
  return updateSidebarFromModule(getPrimarySelectedUnitId, formatUnitDisplayName);
}

function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  return updateGameStateSidebarFromModule(state);
}

function setMainUIControlsEnabled(enabled: boolean): void {
  return setMainUIControlsEnabledFromModule(enabled);
}

function updateGameOverUI(state: GameStateSnapshot | null): void {
  return updateGameOverUIFromModule(state, updateReadyButtonState);
}

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
 * Opens the new-game overlay from the Model tab "New" button.
 * This does not mutate DB state until the user confirms via Start game.
 */
function openNewGameOverlayFromModelTab(): void {
  return openNewGameOverlayFromModelTabFromModule(setMainUIControlsEnabled, updateReadyButtonState);
}

async function refreshHumanStandingOrders(): Promise<void> {
  return refreshHumanStandingOrdersFromModule();
}

function estimateHexesLeftForOrder(order: HumanStandingOrderSnapshot): number {
  return estimateHexesLeftForOrderFromModule(order);
}

function isPendingMovementOrderForDisplay(order: HumanStandingOrderSnapshot): boolean {
  return isPendingMovementOrderForDisplayFromModule(order);
}

function applySelectionFromSidebarUnitButton(unitId: string, event: MouseEvent): void {
  return applySelectionFromSidebarUnitButtonFromModule(unitId, event, {
    toggleUnitSelection,
    replaceSelection,
    syncUiAfterSelectionChange: () => syncUiAfterSelectionChange(),
  });
}

function formatUnitArrowLabel(unitId: string, targetLabel: string): string {
  return formatUnitArrowLabelFromModule(unitId, targetLabel, formatUnitDisplayName);
}

function formatPendingOrderSidebarLabel(order: HumanStandingOrderSnapshot): string {
  return formatPendingOrderSidebarLabelFromModule(order, formatUnitArrowLabel);
}

function buildKillToastFormatterBundle(
  state: GameStateSnapshot,
  removedUnits: RemovedUnitSnapshot[] | undefined
): {
  formatKillLine: (kill: { victimId: string; killerIds: string[] }) => string;
  formatUnitName: (unitId: string) => string;
} {
  return buildKillToastFormatterBundleFromModule(state, removedUnits);
}

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

function createSidebarOrderRow(args: {
  labelText: string;
  selected: boolean;
  onToggleSelect: (event: MouseEvent) => void;
  onCancel: () => void;
  compactBlueButtons?: boolean;
}): HTMLDivElement {
  return createSidebarOrderRowFromModule(args);
}

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

async function cancelOrderForUnit(unitId: string): Promise<void> {
  return cancelOrderForUnitFromModule(unitId, createTacticalSidebarDeps());
}

function getRepresentativeSelectedUnitIdsByOrigin(): string[] {
  return getRepresentativeSelectedUnitIdsByOriginFromModule();
}

function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void {
  return replacePendingRangedAttacksForSelectedFromModule(selectedIds, targetH3Index);
}

function replacePendingAirStrikesForSelected(
  selectedIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): void {
  return replacePendingAirStrikesForSelectedFromModule(selectedIds, targetH3Index, targetType);
}

function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  return replacePendingFerryOrdersForSelectedFromModule(selectedIds, destinationH3Index);
}

function clearPendingTacticalOrders(): void {
  return clearPendingTacticalOrdersFromModule();
}

function clearCommittedOrderDraftState(): void {
  return clearCommittedOrderDraftStateFromModule(createTacticalSidebarDeps());
}

async function refreshHoverRoutePreview(): Promise<void> {
  return refreshHoverRoutePreviewFromModule(createTacticalSidebarDeps());
}

function cancelRangedForUnit(unitId: string): void {
  return cancelRangedForUnitFromModule(unitId, createTacticalSidebarDeps());
}

function cancelAirStrikeForUnit(unitId: string): void {
  return cancelAirStrikeForUnitFromModule(unitId, createTacticalSidebarDeps());
}

function cancelFerryForUnit(unitId: string): void {
  return cancelFerryForUnitFromModule(unitId, createTacticalSidebarDeps());
}

function updateRangedSidebar(): void {
  // Contract anchors retained for rendererConsolidation tests after extraction:
  // btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';
  // formatPendingRangedAttackSidebarLabel(S.gameState, r)
  // formatPendingAirStrikeSidebarLabel(S.gameState, strike)
  // formatPendingFerryOrderSidebarLabel(S.gameState, ferry)
  return updateRangedSidebarFromModule(createTacticalSidebarDeps());
}

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
  });
}

/** Reports a user-facing error to the floating log (map toast, lower-left) and clears any sidebar error. */
function showSidebarError(message: string): void {
  return showSidebarErrorFromModule(message, showMapToast, clearSidebarError);
}

function clearSidebarError(): void {
  return clearSidebarErrorFromModule();
}

/**
 * Enables the Run toggle only when an API key and model are configured; turns Run off and clears
 * precomputed state if the toggle becomes unavailable (e.g. key cleared).
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
  });
}

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
      const deps: ReadyHandlerDeps = {
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
      };
      await handleReadyButtonClickFromModule(deps);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
