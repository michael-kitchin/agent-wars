import { TOOLTIP_OFFSET_PX, UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import {
  addUnitsToSelection,
  removeUnitsFromSelection,
  replaceSelection,
  toggleUnitSelection,
} from '../core/selection';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { mergePendingTacticalEmbarkOrdersIntoSealiftState } from '../tactical/tacticalEmbarkSealiftMerge';
import { getMainLeafletMap } from './worldLeafletMap';
import { shouldHideStrategicMapUnitsForZoom } from './terrainView';
import { clearDeferredStackCalloutTimer } from './mapClickSelectionPolicy';
import { isOrderBlockHexTooltipVisible } from './orderBlockHexTooltip';
import { isOrderSlowerHexTooltipVisible } from './orderSlowerHexTooltip';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from './terrainTooltipStrategicState';
import { sealiftDebarkTooltipText, sealiftSelectTooltipText } from '../chrome/controlTooltipText';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import {
  isHoverOrderPlanningActive,
  shouldBlockSelectionReplaceDuringHoverPlanning,
  shouldBlockToggleSelectionDuringHoverPlanning,
  shouldDismissStackCalloutForHoverPlanning,
} from '../rendering/canvasPreviewPolicy';
import type { GameStateSnapshot, SealiftStackState } from '../../shared/ipcTypes';

/**
 * Entry-module callbacks the stack popup still calls by their original names.
 *
 * Contract: Each member is the renderer-entry function of the same name, installed before map listeners run.
 * When to use: Pass the entry wrappers from renderer init.
 * Expected outcome: Stack calls observe the same sidebar, sealift, and tooltip behavior as before the split.
 * Exceptions: None. Calling stack UI before bind throws from the unset defaults.
 */
export interface StackCalloutHost {
  /**
   * Closes the build queue popup.
   *
   * Contract: Hides build chrome without changing the stack module's call text.
   * When to use: Hover-planning dismiss of map detail popovers.
   * Expected outcome: The build popup is hidden.
   * Exceptions: None.
   */
  hideBuildPopup: () => void;
  /**
   * Schedules restoration of the terrain tooltip after a popup closes.
   *
   * Contract: Runs the entry scheduler, not a second implementation.
   * When to use: After the stack popup hides.
   * Expected outcome: A tooltip restore is scheduled.
   * Exceptions: None.
   */
  scheduleTerrainTooltipRestoreAfterPopoverClose: () => void;
  /**
   * Refreshes sidebar chrome after a stack selection change.
   *
   * Contract: Runs the entry wrapper that also updates ranged and pending-order sidebars.
   * When to use: Stack unit toggle and select-all actions.
   * Expected outcome: Sidebars match the new selection.
   * Exceptions: None.
   */
  syncUiAfterSelectionChange: (options?: { refreshHoverPreview?: boolean; refreshStackCallout?: boolean }) => void;
  /**
   * Reloads game state after a sealift slot edit.
   *
   * Contract: Runs the entry wrapper that passes the entry applyGameStateSnapshot into the snapshot module.
   * When to use: After a successful sealift slot write from the stack popup.
   * Expected outcome: Embark flags and sidebars refresh through that wrapper.
   * Exceptions: Errors are logged inside the snapshot helper.
   */
  refreshGameStateAfterSealiftChange: (options?: { refreshStandingOrders?: boolean }) => Promise<void>;
  /**
   * Resolves a unit id to the label shown in the popup.
   *
   * Contract: Uses the entry display-name lookup, including the id fallback.
   * When to use: Stack rows and sealift cargo labels.
   * Expected outcome: The same label the map would show for that id.
   * Exceptions: None.
   */
  formatUnitDisplayName: (unitId: string) => string;
  /**
   * Turns a validation reason into toast text.
   *
   * Contract: Runs the entry formatter, including unit-name substitution.
   * When to use: Sealift slot writes that fail.
   * Expected outcome: The same toast text the entry formatter would produce.
   * Exceptions: None.
   */
  formatTargetingValidationReason: (reason: string | undefined, fallbackMessage: string) => string;
  /**
   * Reloads the human standing-order list.
   *
   * Contract: Runs the entry refresh after a tactical sealift embark.
   * When to use: After a tactical sealift slot selects a land unit.
   * Expected outcome: Standing orders match the server.
   * Exceptions: IPC failures follow the entry helper.
   */
  refreshHumanStandingOrders: () => Promise<void>;
  /**
   * Repaints the pending-order sidebar.
   *
   * Contract: Runs the entry sidebar updater.
   * When to use: After a tactical sealift slot change.
   * Expected outcome: The pending-order list matches client state.
   * Exceptions: None.
   */
  updatePendingOrdersSidebar: () => void;
  /**
   * Schedules a canvas redraw.
   *
   * Contract: Runs the entry redraw scheduler.
   * When to use: After a sealift popup mutates client state.
   * Expected outcome: A frame is requested unless playback is running.
   * Exceptions: None.
   */
  requestRedraw: () => void;
  /**
   * Refreshes the hover route preview.
   *
   * Contract: Runs the entry preview refresh.
   * When to use: After a strategic sealift embark that changes movement.
   * Expected outcome: The hover preview matches the new embark flags.
   * Exceptions: Preview IPC failures follow the entry helper.
   */
  refreshHoverRoutePreview: () => Promise<void>;
}

/**
 * Closes the build popup through the renderer entry.
 *
 * Purpose: dismissMapDetailPopoversIfHoverPlanningActive calls this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry hideBuildPopup runs.
 * Exceptions: Throws if the host is not bound.
 */
let hideBuildPopup: StackCalloutHost['hideBuildPopup'] = () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Schedules terrain-tooltip restore through the renderer entry.
 *
 * Purpose: hideStackCallout calls this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry scheduler runs.
 * Exceptions: Throws if the host is not bound.
 */
let scheduleTerrainTooltipRestoreAfterPopoverClose: StackCalloutHost['scheduleTerrainTooltipRestoreAfterPopoverClose'] =
  () => {
    throw new Error('stack callout host is not bound');
  };

/**
 * Syncs sidebar chrome through the renderer entry.
 *
 * Purpose: Stack selection handlers call this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry sync wrapper runs.
 * Exceptions: Throws if the host is not bound.
 */
let syncUiAfterSelectionChange: StackCalloutHost['syncUiAfterSelectionChange'] = () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Refreshes state after sealift edits through the renderer entry.
 *
 * Purpose: renderSealiftSection awaits this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry refresh wrapper runs.
 * Exceptions: Throws if the host is not bound.
 */
let refreshGameStateAfterSealiftChange: StackCalloutHost['refreshGameStateAfterSealiftChange'] = async () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Formats a unit label through the renderer entry.
 *
 * Purpose: Stack rows and sealift labels call this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry display-name lookup runs.
 * Exceptions: Throws if the host is not bound.
 */
let formatUnitDisplayName: StackCalloutHost['formatUnitDisplayName'] = () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Formats a failed sealift reason through the renderer entry.
 *
 * Purpose: Sealift error toasts call this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry validation formatter runs.
 * Exceptions: Throws if the host is not bound.
 */
let formatTargetingValidationReason: StackCalloutHost['formatTargetingValidationReason'] = () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Reloads standing orders through the renderer entry.
 *
 * Purpose: Tactical sealift embark calls this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry standing-order refresh runs.
 * Exceptions: Throws if the host is not bound.
 */
let refreshHumanStandingOrders: StackCalloutHost['refreshHumanStandingOrders'] = async () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Repaints pending orders through the renderer entry.
 *
 * Purpose: Tactical sealift slot changes call this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry pending-order sidebar updater runs.
 * Exceptions: Throws if the host is not bound.
 */
let updatePendingOrdersSidebar: StackCalloutHost['updatePendingOrdersSidebar'] = () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Requests a redraw through the renderer entry.
 *
 * Purpose: Sealift popup mutations call this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry redraw scheduler runs.
 * Exceptions: Throws if the host is not bound.
 */
let requestRedraw: StackCalloutHost['requestRedraw'] = () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Refreshes hover preview through the renderer entry.
 *
 * Purpose: Strategic sealift embark calls this name directly.
 * When to use: Assigned by bindStackCalloutHost before listeners run.
 * Expected outcome: The entry hover-preview refresh runs.
 * Exceptions: Throws if the host is not bound.
 */
let refreshHoverRoutePreview: StackCalloutHost['refreshHoverRoutePreview'] = async () => {
  throw new Error('stack callout host is not bound');
};

/**
 * Installs entry-module callbacks used by the stack popup.
 *
 * Purpose: Avoids a cycle where the stack module and the renderer entry import each other.
 * When to use: First statement of renderer init, before map listeners are attached.
 * Expected outcome: Later stack calls reach the entry wrappers.
 * Exceptions: None.
 */
export function bindStackCalloutHost(host: StackCalloutHost): void {
  hideBuildPopup = host.hideBuildPopup;
  scheduleTerrainTooltipRestoreAfterPopoverClose = host.scheduleTerrainTooltipRestoreAfterPopoverClose;
  syncUiAfterSelectionChange = host.syncUiAfterSelectionChange;
  refreshGameStateAfterSealiftChange = host.refreshGameStateAfterSealiftChange;
  formatUnitDisplayName = host.formatUnitDisplayName;
  formatTargetingValidationReason = host.formatTargetingValidationReason;
  refreshHumanStandingOrders = host.refreshHumanStandingOrders;
  updatePendingOrdersSidebar = host.updatePendingOrdersSidebar;
  requestRedraw = host.requestRedraw;
  refreshHoverRoutePreview = host.refreshHoverRoutePreview;
}

/**
 * Documents the module-scope binding `stackCalloutNonSelectableUnitIds` (stackCalloutNonSelectableUnitIds: ReadonlySet<string>).

 * Purpose: Supports maintainability by documenting why `stackCalloutNonSelectableUnitIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let stackCalloutNonSelectableUnitIds: ReadonlySet<string> = new Set<string>();

/**
 * Monotonic generation for in-flight stack sealift renders.
 *
 * Purpose: Overlapping `renderSealiftSection` awaits would otherwise append a second `.stack-sealift-section`.
 * When to use: Increment at the start of each sealift render and when hiding the stack popup; ignore stale awaits.
 * Expected outcome: Only the latest render appends sealift rows.
 * Exceptions: None.
 */
let sealiftSectionRenderGeneration = 0;

/**
 * Defines the `formatStackTooltip` function shape (function formatStackTooltip(units: GameStateSnapshot['units']): string).

 * Purpose: Supports maintainability by documenting why `formatStackTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Expected outcome: Popup hidden; `sealiftSectionRenderGeneration` advanced so stale sealift awaits return without appending.
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
  stackCalloutNonSelectableUnitIds = new Set<string>();
  sealiftSectionRenderGeneration += 1;
  scheduleTerrainTooltipRestoreAfterPopoverClose();
}

/**
 * Defines the `isStackOrBuildMapPopoverOpen` function shape (function isStackOrBuildMapPopoverOpen(): boolean).

 * Purpose: Supports maintainability by documenting why `isStackOrBuildMapPopoverOpen` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Defines the `shouldSuppressTerrainTooltip` function shape (function shouldSuppressTerrainTooltip(): boolean).

 * Purpose: Supports maintainability by documenting why `shouldSuppressTerrainTooltip` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Defines the `applyModifierDrivenPopoverCloseRules` function shape (function applyModifierDrivenPopoverCloseRules(reason: 'shift_pressed' | 'shift_released' | 'window_blur'): void).

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
 * Defines the `activateStackCalloutModal` function shape (function activateStackCalloutModal(): void).

 * Purpose: Supports maintainability by documenting why `activateStackCalloutModal` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function activateStackCalloutModal(): void {
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
 * Defines the `onStackAllActionClick` function shape (function onStackAllActionClick( action: 'selectAll' | 'addAll' | 'removeAll', selectableHumanIds: string[], allUnitsAtHex: GameStateSnapshot['units'],).

 * Purpose: Supports maintainability by documenting why `onStackAllActionClick` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
 * Defines the `applyStackCalloutSelectionButtonVisibility` function shape (function applyStackCalloutSelectionButtonVisibility(calloutEl: HTMLElement, nonSelectableUnitIds: ReadonlySet<string>): void).

 * Purpose: Supports maintainability by documenting why `applyStackCalloutSelectionButtonVisibility` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function applyStackCalloutSelectionButtonVisibility(calloutEl: HTMLElement, nonSelectableUnitIds: ReadonlySet<string>): void {
  const listEl = document.getElementById('stack-callout-list');
  if (!listEl) return;
  const rows = Array.from(listEl.querySelectorAll('li'));
  for (const row of rows) {
    const unitId = row.getAttribute('data-unit-id');
    if (!unitId) continue;
    const btn = row.querySelector('button.stack-unit-toggle') as HTMLButtonElement | null;
    if (!btn) continue;
    btn.style.visibility = nonSelectableUnitIds.has(unitId) ? 'hidden' : 'visible';
  }
}

/**
 * Defines the `setStackPopupNonSelectableUnitIds` function shape (function setStackPopupNonSelectableUnitIds(calloutEl: HTMLElement, unitIds: string[]): void).

 * Purpose: Supports maintainability by documenting why `setStackPopupNonSelectableUnitIds` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setStackPopupNonSelectableUnitIds(calloutEl: HTMLElement, unitIds: string[]): void {
  const normalized = [...new Set(unitIds)].sort((a, b) => a.localeCompare(b));
  const nonSelectable = new Set<string>(normalized);
  stackCalloutNonSelectableUnitIds = nonSelectable;
  const selectedBlockedIds = normalized.filter((unitId) => S.selectedUnitIds.includes(unitId));
  if (selectedBlockedIds.length > 0) {
    removeUnitsFromSelection(selectedBlockedIds);
    syncUiAfterSelectionChange({ refreshHoverPreview: false, refreshStackCallout: false });
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
export function getSelectableHumanIdsForStackCallout(units: GameStateSnapshot['units']): string[] {
  return units.filter((u) => u.player === 'human' && !stackCalloutNonSelectableUnitIds.has(u.id)).map((u) => u.id);
}

/**
 * Removes every sealift assignment block from the stack popup.
 *
 * Purpose: Overlapping async renders can leave more than one `.stack-sealift-section`; a single `querySelector` would keep extras.
 * When to use: Before fetching new sealift state and whenever the popup must not show stale cargo rows.
 * Expected outcome: No `.stack-sealift-section` remains under `calloutEl`.
 * Exceptions: None.
 */
export function removeSealiftSection(calloutEl: HTMLElement): void {
  calloutEl.querySelectorAll('.stack-sealift-section').forEach((el) => el.remove());
}

/**
 * Defines the `buildSealiftUnitLabel` function shape (function buildSealiftUnitLabel(unitId: string, unitType: string): string).

 * Purpose: Supports maintainability by documenting why `buildSealiftUnitLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildSealiftUnitLabel(unitId: string, unitType: string): string {
  void unitType;
  return formatUnitDisplayName(unitId);
}

/**
 * Fills the stack popup sealift controls for the current hex after loading stack state.
 *
 * Purpose: Cargo slot UI is async; a generation token drops stale awaits so each fleet is listed once.
 * When to use: End of `showStackCallout` and after sealift slot IPC refreshes the open popup.
 * Expected outcome: At most one sealift section for the latest stack hex; hidden or superseded renders do not append.
 * Exceptions: Logs to the console if sealift IPC throws.
 */
export async function renderSealiftSection(units: GameStateSnapshot['units'], calloutEl: HTMLElement): Promise<void> {
  const generation = ++sealiftSectionRenderGeneration;
  removeSealiftSection(calloutEl);
  const h3Index = units[0]?.h3Index;
  if (!h3Index) return;
  const tacticalSealiftMode = !!(
    S.tacticalBattleSnapshot?.tacticalChildH3Indexes.includes(h3Index) &&
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
    if (generation !== sealiftSectionRenderGeneration) return;
    if (calloutEl.classList.contains('hidden')) return;
    if (calloutEl.getAttribute('data-h3-index') !== h3Index) return;
    if (!state.showSealiftSection) return;
    const nonSelectableEmbarkedIds = state.navalRows
      .flatMap((row) => [row.slot1UnitId, row.slot2UnitId])
      .filter((unitId): unitId is string => typeof unitId === 'string' && unitId.length > 0);
    setStackPopupNonSelectableUnitIds(calloutEl, nonSelectableEmbarkedIds);
    if (generation !== sealiftSectionRenderGeneration) return;

    const section = document.createElement('div');
    section.className = 'stack-sealift-section';

    for (const row of state.navalRows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'stack-sealift-row';
      const left = document.createElement('span');
      left.className = 'stack-sealift-naval';
      setUnitNameContent(left, row.navalUnitId, formatUnitDisplayName(row.navalUnitId));
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
        const selectHost = document.createElement('span');
        selectHost.className = 'control-tooltip-host';
        selectHost.setAttribute('data-control-tooltip', sealiftSelectTooltipText);
        selectHost.appendChild(select);
        select.addEventListener('change', async () => {
          const selected = select.value.trim();
          if (tacticalSealiftMode) {
            const prev = select.dataset.prevLand ?? '';
            if (prev) {
              S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== prev);
            }
            if (selected.length > 0) {
              S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== selected);
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
              S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => !navalIds.has(e.navalUnitId));
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
          } else {
            // Embark/debark changes `embarkedOnNavalUnitId` in main; refresh so selection/march use current flags.
            await refreshGameStateAfterSealiftChange({ refreshStandingOrders: selected.length > 0 });
            if (selected.length > 0) {
              await refreshHoverRoutePreview();
            }
          }
          refreshStackCalloutIfOpen();
          requestRedraw();
        });
        slotRow.appendChild(selectHost);

        const debarkBtn = document.createElement('button');
        debarkBtn.type = 'button';
        debarkBtn.className = 'unit-select stack-unit-toggle';
        debarkBtn.textContent = UNIT_DESELECT_GLYPH;
        debarkBtn.setAttribute('data-control-tooltip', sealiftDebarkTooltipText);
        debarkBtn.disabled = !debarkEnabled;
        debarkBtn.style.visibility = debarkEnabled ? 'visible' : 'hidden';
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
                  S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== prev);
                  S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => !navalIds.has(e.navalUnitId));
                  updatePendingOrdersSidebar();
                }
              }
              refreshStackCalloutIfOpen();
              requestRedraw();
              return;
            }
            const result = await window.gameApi!.updateSealiftSlot({
              h3Index,
              navalUnitId: row.navalUnitId,
              slotIndex,
              landUnitId: null,
            });
            if (!result.success) {
              showMapToast(formatTargetingValidationReason(result.reason, 'Failed to debark unit.'));
            } else {
              await refreshGameStateAfterSealiftChange();
            }
            refreshStackCalloutIfOpen();
            requestRedraw();
        });
        slotRow.appendChild(debarkBtn);
        right.appendChild(slotRow);
      };

      addSlotControl(1, row.slot1UnitId, row.controlsDisabled, row.debarkSlot1Enabled);
      addSlotControl(2, row.slot2UnitId, row.controlsDisabled || row.slot2Disabled, row.debarkSlot2Enabled);
      rowEl.appendChild(right);
      section.appendChild(rowEl);
    }
    if (generation !== sealiftSectionRenderGeneration) return;
    calloutEl.appendChild(section);
  } catch (err) {
    console.error('sealift stack section failed:', err);
  }
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
  if (humanIds.length > 0 && !S.shiftKeyActive) {
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
    setUnitNameContent(label, u.id, formatUnitDisplayName(u.id));
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
