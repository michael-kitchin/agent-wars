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
 * Purpose: A launch onto a live match opens the Commanders tab without using a tab click. A click on the selected tab
 *   collapses the console, so this result does not go through `nextConsoleTabState`.
 * When to use: From the console frame when a tab should be shown expanded.
 * Expected outcome: The named tab is active and the console is expanded, whatever the previous tab and collapsed state were.
 * Exceptions: None.
 */
export function expandedConsoleTabState(tabId: string): ConsoleTabState {
  return { activeTabId: tabId, collapsed: false };
}

/**
 * Id of the Orders rail tab.
 *
 * Purpose: Observe mode disables this tab, and the redirect compares against this id.
 * When to use: `consoleTabWhenOrdersDisabled`.
 * Expected outcome: Matches `#console-tab-orders` in `static/index.html`.
 * Exceptions: None.
 */
const ORDERS_TAB_ID = 'console-tab-orders';

/**
 * Id of the Commanders rail tab.
 *
 * Purpose: Observe mode selects this tab when Orders was selected.
 * When to use: `consoleTabWhenOrdersDisabled`.
 * Expected outcome: Matches `#console-tab-commanders` in `static/index.html`.
 * Exceptions: None.
 */
const COMMANDERS_TAB_ID = 'console-tab-commanders';

/**
 * Collapses the console without changing which tab is selected.
 *
 * Purpose: A successful Start game or New game closes every open panel. The selected tab stays selected so the next
 *   click on that rail button opens it again.
 * When to use: After a new match is installed.
 * Expected outcome: `collapsed` is true and `activeTabId` is unchanged. An already collapsed console is returned as the
 *   same object.
 * Exceptions: None.
 */
export function collapsedConsoleState(current: ConsoleTabState): ConsoleTabState {
  if (current.collapsed) return current;
  return { activeTabId: current.activeTabId, collapsed: true };
}

/**
 * Moves off the Orders tab while the player is observing, without opening a collapsed console.
 *
 * Purpose: Orders is disabled while observing. Selecting Commanders must not expand a console that Start just collapsed.
 * When to use: From the console header refresh, with whether the current seats are observing.
 * Expected outcome: When `observing` is true and Orders is selected, Commanders is selected and `collapsed` is unchanged.
 *   Every other state is returned as the same object.
 * Exceptions: None.
 */
export function consoleTabWhenOrdersDisabled(current: ConsoleTabState, observing: boolean): ConsoleTabState {
  if (!observing || current.activeTabId !== ORDERS_TAB_ID) return current;
  return { activeTabId: COMMANDERS_TAB_ID, collapsed: current.collapsed };
}

/**
 * Chooses the console tab to open when the app loads a match.
 *
 * Purpose: A live match should show the Commanders tab. A launch that shows the new-game dialog should leave the console on its start tab.
 * When to use: Once, after the launch snapshot is applied. Null is not a live match. A missing snapshot is the caller's failure, not a value to pass here.
 * Expected outcome: `'console-tab-commanders'` (`COMMANDERS_TAB_ID`) when the match has hexes and is not over. Null otherwise, so the caller leaves the start tab.
 * Exceptions: None.
 */
export function consoleTabIdForLiveMatchLaunch(
  match: { readonly hexCount: number; readonly gameOver: boolean } | null
): string | null {
  if (match == null || match.hexCount === 0 || match.gameOver) return null;
  return COMMANDERS_TAB_ID;
}

/**
 * Collapses the console when the named tab is the one on screen.
 *
 * Purpose: Start is on the Commanders panel. Turning planning on should hide that panel and widen the map.
 * When to use: From the Start click, with the Commanders tab id.
 * Expected outcome: The named tab stays selected and the console collapses. A different tab, and a console that is already collapsed, stay as they were.
 * Exceptions: None.
 */
export function collapseOpenConsoleTab(current: ConsoleTabState, tabId: string): ConsoleTabState {
  if (current.collapsed || current.activeTabId !== tabId) return current;
  return { activeTabId: current.activeTabId, collapsed: true };
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
