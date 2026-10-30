import { TOOLTIP_OFFSET_PX, UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';
import { placeOpenStackCallout } from '../chrome/placeAnchoredPopup';
import {
  stackAddAllTooltipText,
  stackCalloutCloseTooltipText,
  stackRemoveAllTooltipText,
  stackSelectAllTooltipText,
  stackUnitToggleTooltipText,
} from '../../shared/popupControlTooltipText';
import { rendererSharedState as S } from '../core/state';
import {
  addUnitsToSelection,
  removeUnitsFromSelection,
  replaceSelection,
  toggleUnitSelection,
} from '../core/selection';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { getMainLeafletMap } from './worldLeafletMap';
import { shouldHideStrategicMapUnitsForZoom } from './terrainView';
import { clearDeferredStackCalloutTimer } from './mapClickSelectionPolicy';
import { isOrderBlockHexTooltipVisible } from './orderBlockHexTooltip';
import { isOrderSlowerHexTooltipVisible } from './orderSlowerHexTooltip';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from './terrainTooltipStrategicState';
import {
  isHoverOrderPlanningActive,
  shouldBlockSelectionReplaceDuringHoverPlanning,
  shouldBlockToggleSelectionDuringHoverPlanning,
  shouldDismissStackCalloutForHoverPlanning,
} from '../rendering/canvasPreviewPolicy';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  formatUnitDisplayName,
  hideBuildPopup,
  scheduleTerrainTooltipRestoreAfterPopoverClose,
  syncUiAfterSelectionChange,
} from './stackCalloutHost';
import {
  applyStackCalloutSelectionButtonVisibility,
  currentStackCalloutNonSelectableUnitIds,
  getSelectableHumanIdsForStackCallout,
  resetStackCalloutNonSelectableUnitIds,
} from './stackCalloutSelectionToggles';
import { invalidateSealiftSectionRenders, renderSealiftSection } from './stackCalloutSealift';


/**
 * A short count of the units in a stack, grouped by owner and type.
 *
 * Purpose: The popup's accessible name should say what is in the hex without listing every id.
 * When to use: When the stack popup opens.
 * Expected outcome: Counts such as `2 human infantry, 1 opponent armor`, sorted.
 * Exceptions: None.
 */
export function formatStackTooltip(units: GameStateSnapshot['units']): string {
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
 * Closes the stack unit list popup and invalidates in-flight sealift renders.
 *
 * Purpose: Hide stack chrome and prevent a late `getSealiftStackState` result from appending into a closed popup.
 * When to use: Dismissing the stack callout, including hover-planning and Shift-release.
 * Expected outcome: Popup hidden; in-flight sealift renders are invalidated so stale awaits return without appending.
 * Exceptions: None.
 */
export function hideStackCallout(): void {
  clearDeferredStackCalloutTimer();
  const el = document.getElementById('stack-callout');
  if (el?.classList.contains('hidden') && !S.stackCalloutModalActive) {
    return;
  }
  if (el) {
    el.classList.add('hidden');
    el.classList.remove('stack-modal');
    el.removeAttribute('data-open');
    el.removeAttribute('data-x');
    el.removeAttribute('data-y');
    el.removeAttribute('data-unit-ids');
  }
  S.stackCalloutModalActive = false;
  resetStackCalloutNonSelectableUnitIds();
  invalidateSealiftSectionRenders();
  scheduleTerrainTooltipRestoreAfterPopoverClose();
}

/**
 * Whether the stack list or the build popup is currently shown.
 *
 * Purpose: Terrain tooltips should stay down while either map popup is open.
 * When to use: `shouldSuppressTerrainTooltip`.
 * Expected outcome: True when `#stack-callout` or `#build-popup` exists and is not hidden.
 * Exceptions: None.
 */
export function isStackOrBuildMapPopoverOpen(): boolean {
  const stack = document.getElementById('stack-callout');
  const build = document.getElementById('build-popup');
  return (
    (!!stack && !stack.classList.contains('hidden')) || (!!build && !build.classList.contains('hidden'))
  );
}

/**
 * Whether a terrain tooltip would cover planning chrome or another popup.
 *
 * Purpose: Hover planning, the stack and build popovers, entry-button hovers, and order-hex tooltips already occupy that space.
 * When to use: Before showing the terrain tooltip.
 * Expected outcome: True when any of those is active.
 * Exceptions: None.
 */
export function shouldSuppressTerrainTooltip(): boolean {
  return (
    isHoverOrderPlanningActive() ||
    isStackOrBuildMapPopoverOpen() ||
    S.buildEntryButtonPointerInside ||
    S.tacticalEntryButtonPointerInside ||
    isOrderBlockHexTooltipVisible() ||
    isOrderSlowerHexTooltipVisible()
  );
}

/**
 * Hides stack callout, build queue, and hex details chrome while hover order planning is active.
 *
 * Purpose: Keeps map inspection popovers from covering or competing with march/ferry/attack hover planning.
 * When to use: After hover preview refresh and before opening stack/build popovers during planning gestures.
 * Expected outcome: No-op when hover planning is inactive. Otherwise the build popup and terrain tooltip are cleared. The stack callout is cleared only when the preview is aimed at a hex the selection does not already occupy.
 * Exceptions: None.
 */
export function dismissMapDetailPopoversIfHoverPlanningActive(): void {
  if (!isHoverOrderPlanningActive()) return;
  if (shouldDismissStackCalloutForHoverPlanning()) {
    hideStackCallout();
  }
  hideBuildPopup();
  clearTerrainTooltipTimer();
  hideTerrainTooltipVisual();
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
export function isClientPointInsideMainMapLeafletContainer(clientX: number, clientY: number): boolean {
  const map = getMainLeafletMap() as { getContainer: () => HTMLElement } | null;
  if (!map) return false;
  const r = map.getContainer().getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/**
 * Closes or refreshes the stack popup when Shift or window focus changes.

 * Purpose: Shift-pressed rebuilds stack chrome (Select All vs Add All/Remove All); Shift-released
 * closes the stack callout; blur refreshes without assuming the modifier is still down.
 * When to use: Window Shift keydown/keyup and window blur. Call `shift_pressed` only on the
 * inactive→active Shift transition — key-repeat rebuilds cancel clicks on the open popup.
 * Expected outcome: Stack/build popovers follow modifier rules without a full rebuild on every
 * Shift repeat while the key is held.
 * Exceptions: None.
 */
export function applyModifierDrivenPopoverCloseRules(reason: 'shift_pressed' | 'shift_released' | 'window_blur'): void {
  if (reason === 'shift_pressed') {
    refreshStackCalloutIfOpen();
    return;
  }
  if (reason === 'shift_released') {
    hideStackCallout();
    return;
  }
  refreshStackCalloutIfOpen();
}

/**
 * Keeps the stack popup open across a Shift-click selection change.
 *
 * Purpose: With Shift held, toggling a unit should update the list instead of dismissing it.
 * When to use: The Shift branch of the single-unit and all-unit handlers.
 * Expected outcome: `stackCalloutModalActive` is set and the popup gains `stack-modal` when the element exists.
 * Exceptions: None.
 */
export function activateStackCalloutModal(): void {
  S.stackCalloutModalActive = true;
  const el = document.getElementById('stack-callout');
  if (el) el.classList.add('stack-modal');
}

/**
 * Selects or clears one unit from its stack row.
 *
 * Purpose: A plain click replaces the selection and closes the popup. Shift toggles that unit and leaves the popup open.
 * When to use: The select button on a stack row.
 * Expected outcome: The selection matches the click, and sidebars refresh. Hover planning can refuse a replace or a toggle.
 * Exceptions: None.
 */
export function onStackSingleUnitToggleClick(
  unitId: string,
  inSelection: boolean,
  allUnitsAtHex: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  if (!S.shiftKeyActive) {
    if (inSelection) {
      removeUnitsFromSelection([unitId]);
    } else {
      if (shouldBlockSelectionReplaceDuringHoverPlanning([unitId])) return;
      replaceSelection([unitId]);
    }
    hideStackCallout();
    syncUiAfterSelectionChange({ refreshHoverPreview: false });
    return;
  }
  activateStackCalloutModal();
  if (shouldBlockToggleSelectionDuringHoverPlanning(unitId)) return;
  toggleUnitSelection(unitId);
  showStackCallout(allUnitsAtHex, clientX, clientY);
  syncUiAfterSelectionChange({ refreshHoverPreview: false, refreshStackCallout: false });
}

/**
 * Selects, adds, or removes every selectable human unit in the hex.
 *
 * Purpose: Select All replaces the selection and closes the popup. Add All and Remove All keep it open under Shift.
 * When to use: The header buttons built by `showStackCallout`.
 * Expected outcome: No change when the id list is empty. Otherwise the selection updates and sidebars refresh. Hover planning can refuse a replace.
 * Exceptions: None.
 */
export function onStackAllActionClick(
  action: 'selectAll' | 'addAll' | 'removeAll',
  selectableHumanIds: string[],
  allUnitsAtHex: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  if (selectableHumanIds.length === 0) return;
  if (action === 'selectAll') {
    if (shouldBlockSelectionReplaceDuringHoverPlanning(selectableHumanIds)) return;
    replaceSelection(selectableHumanIds);
    hideStackCallout();
    syncUiAfterSelectionChange({ refreshHoverPreview: false });
    return;
  }
  activateStackCalloutModal();
  if (action === 'addAll') {
    if (shouldBlockSelectionReplaceDuringHoverPlanning(selectableHumanIds)) return;
    addUnitsToSelection(selectableHumanIds);
  } else removeUnitsFromSelection(selectableHumanIds);
  showStackCallout(allUnitsAtHex, clientX, clientY);
  syncUiAfterSelectionChange({ refreshHoverPreview: false, refreshStackCallout: false });
}


/**
 * Opens the stack callout for the units in one hex at the click point.
 *
 * Purpose: Shows each unit in that hex, including a single unit, with its origin flag and selection controls.
 * When to use: From the deferred map-click callout, after the single-click delay.
 * Expected outcome: The popup is shown unless strategic units are hidden at this zoom, or a hover order preview is aimed at a hex other than the one every selected unit already occupies. A preview of that hex does not block the popup.
 * Exceptions: Returns without throwing when the callout elements are missing.
 */
export function showStackCallout(
  units: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  if (shouldDismissStackCalloutForHoverPlanning()) return;
  if (shouldHideStrategicMapUnitsForZoom()) {
    hideStackCallout();
    return;
  }
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
  resetStackCalloutNonSelectableUnitIds();

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
  closeBtn.setAttribute('data-control-tooltip', stackCalloutCloseTooltipText);
  closeBtn.addEventListener('click', () => {
    hideStackCallout();
  });
  header.appendChild(closeBtn);

  const humanIds = sorted.filter((u) => u.player === HUMAN_SEAT_ID).map((u) => u.id);
  if (humanIds.length > 0 && !S.shiftKeyActive) {
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'unit-select';
    selectAllBtn.textContent = `${UNIT_SELECT_GLYPH} All`;
    selectAllBtn.setAttribute('data-control-tooltip', stackSelectAllTooltipText);
    selectAllBtn.addEventListener('click', () => {
      onStackAllActionClick('selectAll', getSelectableHumanIdsForStackCallout(units), units, clientX, clientY);
    });
    header.appendChild(selectAllBtn);
  } else if (humanIds.length > 0) {
    const addAllBtn = document.createElement('button');
    addAllBtn.type = 'button';
    addAllBtn.className = 'unit-select';
    addAllBtn.textContent = `${UNIT_SELECT_GLYPH} All`;
    addAllBtn.setAttribute('data-control-tooltip', stackAddAllTooltipText);
    addAllBtn.addEventListener('click', () => {
      onStackAllActionClick('addAll', getSelectableHumanIdsForStackCallout(units), units, clientX, clientY);
    });
    const removeAllBtn = document.createElement('button');
    removeAllBtn.type = 'button';
    removeAllBtn.className = 'unit-select';
    removeAllBtn.textContent = `${UNIT_DESELECT_GLYPH} All`;
    removeAllBtn.setAttribute('data-control-tooltip', stackRemoveAllTooltipText);
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
    setUnitNameContent(label, u.id, formatUnitDisplayName(u.id));
    li.appendChild(label);
    if (u.player === HUMAN_SEAT_ID) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unit-select stack-unit-toggle';
      btn.textContent = S.selectedUnitIds.includes(u.id) ? UNIT_DESELECT_GLYPH : UNIT_SELECT_GLYPH;
      btn.setAttribute('data-control-tooltip', stackUnitToggleTooltipText(S.selectedUnitIds.includes(u.id)));
      btn.addEventListener('click', () => {
        onStackSingleUnitToggleClick(u.id, S.selectedUnitIds.includes(u.id), units, clientX, clientY);
      });
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  }
  applyStackCalloutSelectionButtonVisibility(calloutEl, currentStackCalloutNonSelectableUnitIds());

  calloutEl.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  calloutEl.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  calloutEl.setAttribute('aria-label', formatStackTooltip(units));
  calloutEl.classList.remove('hidden');
  placeOpenStackCallout();
  void renderSealiftSection(sorted, calloutEl);
}

/**
 * Resolves stored stack-callout unit ids to drawable rows for both strategic units and tactical sub-units.
 *
 * Purpose: `refreshStackCalloutIfOpen` runs on Shift keydown (`shift_pressed`); tactical stacks store sub-unit ids that
 * are not rows in `gameState.units`, so resolving only from strategic state incorrectly yields zero rows and closes the popup.
 * When to use: Only from `refreshStackCalloutIfOpen`.
 * Expected outcome: Same unit rows `showStackCallout` would receive when opening from map hit-testing in tactical mode.
 * Exceptions: Returns empty array when ids cannot be matched (caller may hide the callout).
 */
export function resolveUnitsForStackCalloutRefresh(unitIds: string[], state: GameStateSnapshot): GameStateSnapshot['units'] {
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

/**
 * Rebuilds an open stack callout from the unit ids stored on it.
 *
 * Purpose: Shift-pressed and selection changes must refresh Select All versus Add All without leaving a stale row list.
 * When to use: After a selection or sealift change, and on the Shift keydown that first presses the key.
 * Expected outcome: No-op when the callout is hidden. Closes it when a hover preview is aimed at another hex, or when strategic units are hidden at battle-detail zoom. Otherwise reopens the same rows.
 * Exceptions: None. A stored id list that fails to parse closes the callout.
 */
export function refreshStackCalloutIfOpen(): void {
  if (shouldDismissStackCalloutForHoverPlanning()) {
    hideStackCallout();
    return;
  }
  if (shouldHideStrategicMapUnitsForZoom()) {
    hideStackCallout();
    return;
  }
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
