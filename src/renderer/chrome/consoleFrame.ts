/**
 * The console docked on the right: its tab rail, its title, and collapsing it to the rail.
 *
 * The console root keeps the id `sidebar` so existing lookups keep working.
 */
import { nextConsoleTabState, type ConsoleTabState } from '../../shared/consoleTabState';
import { scrollOpenRouterLogToEnd } from '../openRouter/openRouterUiHelpers';
import { selectTabPanel, type TabPanelBinding } from './selectTabPanel';

/**
 * One enabled console tab: its button, its panel, the title shown while it is active, and what to refresh on show.
 *
 * Purpose: The rail, the panels, and the header title stay in step from one table.
 * When to use: Entries of `CONSOLE_TABS`.
 * Expected outcome: Both ids exist in `static/index.html`.
 * Exceptions: None.
 */
interface ConsoleTabBinding extends TabPanelBinding {
  /**
   * Header title while this tab is active.
   *
   * Contract: Matches the tab's visible label.
   * When to use: Written to `#console-title` when the tab becomes active.
   * Expected outcome: Plain text.
   * Exceptions: None.
   */
  readonly title: string;
  /**
   * Work to redo each time the tab's panel is shown, if any.
   *
   * Contract: Runs after the panel is visible, so it can measure and scroll.
   * When to use: Content that changes while its panel is hidden, such as the AI activity log.
   * Expected outcome: The panel shows its current state.
   * Exceptions: None.
   */
  readonly onShow?: () => void;
}

/**
 * The console's enabled tabs, in rail order. Disabled placeholder tabs are not listed.
 *
 * Purpose: The single list of tabs that can be selected.
 * When to use: Building the click handlers and calling `selectTabPanel`.
 * Expected outcome: The first entry is the tab the console opens on.
 * Exceptions: None.
 */
const CONSOLE_TABS: readonly ConsoleTabBinding[] = Object.freeze([
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders' },
  { tabId: 'console-tab-opponent', panelId: 'console-panel-opponent', title: 'Opponent', onShow: scrollOpenRouterLogToEnd },
]);

/**
 * The console's current tab and collapsed state for this app session.
 *
 * Purpose: Collapsing and the tab choice are per-session view choices; they are not saved.
 * When to use: Read and replaced only inside this module.
 * Expected outcome: Starts expanded on the first tab.
 * Exceptions: None.
 */
let consoleState: ConsoleTabState = { activeTabId: CONSOLE_TABS[0].tabId, collapsed: false };

/**
 * Writes `consoleState` to the page.
 *
 * Purpose: The rail, the panels, the title, the collapse attribute, and the collapse button change together.
 * When to use: After every change to `consoleState`, and once at startup.
 * Expected outcome: The active panel shows, the others hide, the title matches, and `#sidebar` carries
 *   `data-collapsed="true"` or `"false"`. While expanded, the active tab's `onShow` runs. The map resizes on its
 *   own through its resize observer.
 * Exceptions: None; missing elements are skipped.
 */
function applyConsoleState(): void {
  selectTabPanel(consoleState.activeTabId, CONSOLE_TABS);
  const active = CONSOLE_TABS.find((tab) => tab.tabId === consoleState.activeTabId);
  const title = document.getElementById('console-title');
  if (title && active) title.textContent = active.title;
  document.getElementById('sidebar')?.setAttribute('data-collapsed', consoleState.collapsed ? 'true' : 'false');
  document.getElementById('console-collapse-btn')?.setAttribute('aria-expanded', consoleState.collapsed ? 'false' : 'true');
  if (!consoleState.collapsed) active?.onShow?.();
}

/**
 * Wires the rail's tabs and the collapse button.
 *
 * Purpose: One bootstrap for the console's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A tab click follows `nextConsoleTabState`. The collapse button collapses the console. The console
 *   starts expanded on Orders.
 * Exceptions: None; missing elements are skipped.
 */
export function wireConsoleFrame(): void {
  for (const tab of CONSOLE_TABS) {
    document.getElementById(tab.tabId)?.addEventListener('click', () => {
      consoleState = nextConsoleTabState(consoleState, tab.tabId);
      applyConsoleState();
    });
  }
  document.getElementById('console-collapse-btn')?.addEventListener('click', () => {
    consoleState = { activeTabId: consoleState.activeTabId, collapsed: true };
    applyConsoleState();
  });
  applyConsoleState();
}
