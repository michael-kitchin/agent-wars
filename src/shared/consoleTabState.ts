/**
 * Which console tab is active and whether the console is collapsed to its rail.
 *
 * Purpose: The tab-click rules are small but easy to get wrong; a pure function keeps them testable.
 * When to use: Held by the renderer's console module and passed to `nextConsoleTabState`.
 * Expected outcome: Exactly one tab is active at all times, including while collapsed.
 * Exceptions: None.
 */
export interface ConsoleTabState {
  /**
   * Id of the active tab button.
   *
   * Contract: Always one of the console's enabled tab ids.
   * When to use: Selecting the panel to show.
   * Expected outcome: Stays set while the console is collapsed.
   * Exceptions: None.
   */
  readonly activeTabId: string;
  /**
   * Whether only the rail and the footer are shown.
   *
   * Contract: The console starts expanded.
   * When to use: Writing the console's `data-collapsed` attribute.
   * Expected outcome: True hides the content column.
   * Exceptions: None.
   */
  readonly collapsed: boolean;
}

/**
 * Shows one tab with the console expanded.
 *
 * Purpose: A successful start opens the Opponent tab without using a tab click. A click on the selected tab collapses
 *   the console, so this result does not go through `nextConsoleTabState`.
 * When to use: From the console frame when a start should show a tab.
 * Expected outcome: The named tab is active and the console is expanded, whatever the previous tab and collapsed state were.
 * Exceptions: None.
 */
export function expandedConsoleTabState(tabId: string): ConsoleTabState {
  return { activeTabId: tabId, collapsed: false };
}

/**
 * Applies one click on a console tab.
 *
 * Purpose: A click on the active tab of an expanded console collapses it; any click on a collapsed console expands it.
 * When to use: From the rail's click handler, with the clicked tab's id.
 * Expected outcome: Collapsed: expand on the clicked tab. Expanded and the active tab clicked: collapse.
 *   Expanded and another tab clicked: switch to that tab.
 * Exceptions: None.
 */
export function nextConsoleTabState(current: ConsoleTabState, clickedTabId: string): ConsoleTabState {
  if (current.collapsed) return { activeTabId: clickedTabId, collapsed: false };
  if (clickedTabId === current.activeTabId) return { activeTabId: current.activeTabId, collapsed: true };
  return { activeTabId: clickedTabId, collapsed: false };
}
