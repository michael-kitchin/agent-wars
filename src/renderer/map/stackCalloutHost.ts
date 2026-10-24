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
 * The renderer-entry callbacks installed for the stack popup.
 *
 * Purpose: The popup modules call these names without importing the renderer entry.
 * When to use: Set by `bindStackCalloutHost` before map listeners run. Read by the wrappers below.
 * Expected outcome: Null until bind. After bind, the entry functions the popup should call.
 * Exceptions: None.
 */
let boundStackCalloutHost: StackCalloutHost | null = null;

/**
 * Installs entry-module callbacks used by the stack popup.
 *
 * Purpose: Avoids a cycle where the stack module and the renderer entry import each other.
 * When to use: First statement of renderer init, before map listeners are attached.
 * Expected outcome: Later stack calls reach the entry wrappers.
 * Exceptions: None.
 */
export function bindStackCalloutHost(host: StackCalloutHost): void {
  boundStackCalloutHost = host;
}

/**
 * The host installed by renderer init.
 *
 * Purpose: Every wrapper needs the same missing-host failure.
 * When to use: The start of each wrapper in this file.
 * Expected outcome: The bound host.
 * Exceptions: Throws when the host is not bound.
 */
function requireStackCalloutHost(): StackCalloutHost {
  if (boundStackCalloutHost === null) {
    throw new Error('stack callout host is not bound');
  }
  return boundStackCalloutHost;
}

/**
 * Closes the build popup through the renderer entry.
 *
 * Purpose: dismissMapDetailPopoversIfHoverPlanningActive calls this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry hideBuildPopup runs.
 * Exceptions: Throws when the host is not bound.
 */
export function hideBuildPopup(): void {
  requireStackCalloutHost().hideBuildPopup();
}

/**
 * Schedules terrain-tooltip restore through the renderer entry.
 *
 * Purpose: hideStackCallout calls this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry scheduler runs.
 * Exceptions: Throws when the host is not bound.
 */
export function scheduleTerrainTooltipRestoreAfterPopoverClose(): void {
  requireStackCalloutHost().scheduleTerrainTooltipRestoreAfterPopoverClose();
}

/**
 * Syncs sidebar chrome through the renderer entry.
 *
 * Purpose: Stack selection handlers call this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry sync wrapper runs.
 * Exceptions: Throws when the host is not bound.
 */
export function syncUiAfterSelectionChange(options?: { refreshHoverPreview?: boolean; refreshStackCallout?: boolean }): void {
  requireStackCalloutHost().syncUiAfterSelectionChange(options);
}

/**
 * Refreshes state after sealift edits through the renderer entry.
 *
 * Purpose: renderSealiftSection awaits this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry refresh wrapper runs.
 * Exceptions: Throws when the host is not bound.
 */
export async function refreshGameStateAfterSealiftChange(options?: { refreshStandingOrders?: boolean }): Promise<void> {
  await requireStackCalloutHost().refreshGameStateAfterSealiftChange(options);
}

/**
 * Formats a unit label through the renderer entry.
 *
 * Purpose: Stack rows and sealift labels call this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry display-name lookup runs.
 * Exceptions: Throws when the host is not bound.
 */
export function formatUnitDisplayName(unitId: string): string {
  return requireStackCalloutHost().formatUnitDisplayName(unitId);
}

/**
 * Formats a failed sealift reason through the renderer entry.
 *
 * Purpose: Sealift error toasts call this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry validation formatter runs.
 * Exceptions: Throws when the host is not bound.
 */
export function formatTargetingValidationReason(reason: string | undefined, fallbackMessage: string): string {
  return requireStackCalloutHost().formatTargetingValidationReason(reason, fallbackMessage);
}

/**
 * Reloads standing orders through the renderer entry.
 *
 * Purpose: Tactical sealift embark calls this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry standing-order refresh runs.
 * Exceptions: Throws when the host is not bound.
 */
export async function refreshHumanStandingOrders(): Promise<void> {
  await requireStackCalloutHost().refreshHumanStandingOrders();
}

/**
 * Repaints pending orders through the renderer entry.
 *
 * Purpose: Tactical sealift slot changes call this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry pending-order sidebar updater runs.
 * Exceptions: Throws when the host is not bound.
 */
export function updatePendingOrdersSidebar(): void {
  requireStackCalloutHost().updatePendingOrdersSidebar();
}

/**
 * Requests a redraw through the renderer entry.
 *
 * Purpose: Sealift popup mutations call this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry redraw scheduler runs.
 * Exceptions: Throws when the host is not bound.
 */
export function requestRedraw(): void {
  requireStackCalloutHost().requestRedraw();
}

/**
 * Refreshes hover preview through the renderer entry.
 *
 * Purpose: Strategic sealift embark calls this name directly.
 * When to use: After the host is bound.
 * Expected outcome: The entry hover-preview refresh runs.
 * Exceptions: Throws when the host is not bound.
 */
export async function refreshHoverRoutePreview(): Promise<void> {
  await requireStackCalloutHost().refreshHoverRoutePreview();
}
