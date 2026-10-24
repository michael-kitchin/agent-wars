/**
 * The console docked on the right: its tab rail, its title, and collapsing it to the rail. A click on the selected tab
 * collapses the console, and a click on any tab expands it again, so the header has no collapse button of its own.
 *
 * The console root keeps the id `sidebar` so existing lookups keep working.
 */
import { expandedConsoleTabState, nextConsoleTabState, type ConsoleTabState } from '../../shared/consoleTabState';
import { observeModeControls } from '../../shared/observeModeControls';
import { formatQueuedOrdersSubtitle } from '../../shared/orderRowDetail';
import { rendererSharedState as S } from '../core/state';
import { onQueuedOrdersChanged, queuedOrderCount } from '../gameplay/queuedOrderRows';
import { scrollOpenRouterLogToEnd } from '../openRouter/openRouterUiHelpers';
import { onConsoleReportsChanged, refreshReportSenderFilter, setConsoleReportsVisible, unreadConsoleReportCount } from './consoleReports';
import { selectTabPanel, type TabPanelBinding } from './selectTabPanel';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

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
   * Builds the header subtitle shown beside the title while this tab is active.
   *
   * Contract: Reads the current state each time it is called.
   * When to use: Called by `refreshConsoleHeader`.
   * Expected outcome: Plain text; an empty string shows no subtitle.
   * Exceptions: None.
   */
  readonly subtitle: () => string;
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
  { tabId: 'console-tab-orders', panelId: 'console-panel-orders', title: 'Orders', subtitle: ordersSubtitle },
  { tabId: 'console-tab-reports', panelId: 'console-panel-reports', title: 'Reports', subtitle: () => 'this match' },
  {
    tabId: 'console-tab-commanders',
    panelId: 'console-panel-commanders',
    title: 'Commanders',
    subtitle: commandersSubtitle,
    onShow: scrollOpenRouterLogToEnd,
  },
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
 * Builds the Orders tab's subtitle.
 *
 * Purpose: Says how many orders Ready will send, and for which turn or beat.
 * When to use: As the Orders entry's `subtitle`.
 * Expected outcome: For example "6 queued for turn 7", or "2 queued for beat 3" during a battle.
 * Exceptions: None.
 */
function ordersSubtitle(): string {
  return formatQueuedOrdersSubtitle(
    queuedOrderCount(),
    S.gameState?.turnNumber ?? 0,
    S.tacticalBattleSnapshot ? S.tacticalBattleSnapshot.tacticalTurnNumber : null
  );
}

/**
 * Builds the Commanders tab's subtitle.
 *
 * Purpose: Says how many commanders are in the match, and when the player is only watching.
 * When to use: As that tab's `subtitle`.
 * Expected outcome: "{n} opponents" while a human seat is playing, or "{n} sides, observing" when none is.
 * Exceptions: None.
 */
function commandersSubtitle(): string {
  const seats = S.gameState?.seats ?? [];
  const humanPlaying = seats.some((seat) => seat.kind === HUMAN_SEAT_ID && seat.outTurn === null);
  if (!humanPlaying && seats.length > 0) return `${seats.length} sides, observing`;
  const opponents = seats.filter((seat) => seat.kind === 'ai').length || 1;
  const word = opponents === 1 ? 'opponents'.slice(0, -1) : 'opponents';
  return `${opponents} ${word}`;
}

/**
 * Shows a count on a rail tab, or hides the count when it is zero.
 *
 * Purpose: Rail badges share one look and one rule.
 * When to use: From `refreshConsoleHeader`, once per badge.
 * Expected outcome: The badge shows the number when it is above zero, and is hidden otherwise.
 * Exceptions: None; a missing badge is skipped.
 */
function setRailBadge(badgeId: string, count: number): void {
  const badge = document.getElementById(badgeId);
  if (!badge) return;
  badge.textContent = count > 0 ? String(count) : '';
  badge.hidden = count <= 0;
}

/**
 * Redraws the header subtitle and the rail badges.
 *
 * Purpose: The subtitle and badges change while the tab stays the same: queued orders, the turn or beat, unread
 *   reports, and, on the Commanders tab, how many commanders are playing.
 * When to use: After the queued orders change, after a snapshot or turn or beat changes, and when the tab changes.
 * Expected outcome: `#console-subtitle` shows the active tab's subtitle. The Orders badge shows the number of
 *   queued orders, and the Reports badge the number of unread reports.
 * Exceptions: None; missing elements are skipped.
 */
export function refreshConsoleHeader(): void {
  const orders = document.getElementById('console-tab-orders');
  const observing = observeModeControls(S.gameState?.seats ?? []).observing;
  if (orders instanceof HTMLButtonElement) orders.disabled = observing;
  if (observing && consoleState.activeTabId === 'console-tab-orders') {
    consoleState = expandedConsoleTabState('console-tab-commanders');
    applyConsoleState();
    return;
  }
  const active = CONSOLE_TABS.find((tab) => tab.tabId === consoleState.activeTabId);
  const subtitle = document.getElementById('console-subtitle');
  if (subtitle) subtitle.textContent = active ? active.subtitle() : '';
  setRailBadge('console-tab-orders-badge', queuedOrderCount());
  setRailBadge('console-tab-reports-badge', unreadConsoleReportCount());
  refreshReportSenderFilter();
}

/**
 * Writes `consoleState` to the page.
 *
 * Purpose: The rail, the panels, the title, and the collapse attribute change together.
 * When to use: After every change to `consoleState`, and once at startup.
 * Expected outcome: The active panel shows, the others hide, the title and subtitle match, and `#sidebar` carries
 *   `data-collapsed="true"` or `"false"`. The Reports tab learns whether it is on screen. While expanded, the active
 *   tab's `onShow` runs. The map resizes on its own through its resize observer.
 * Exceptions: None; missing elements are skipped.
 */
function applyConsoleState(): void {
  selectTabPanel(consoleState.activeTabId, CONSOLE_TABS);
  const active = CONSOLE_TABS.find((tab) => tab.tabId === consoleState.activeTabId);
  const title = document.getElementById('console-title');
  if (title && active) title.textContent = active.title;
  document.getElementById('sidebar')?.setAttribute('data-collapsed', consoleState.collapsed ? 'true' : 'false');
  setConsoleReportsVisible(!consoleState.collapsed && consoleState.activeTabId === 'console-tab-reports');
  refreshConsoleHeader();
  if (!consoleState.collapsed) active?.onShow?.();
}

/**
 * Expands the console on one of its tabs.
 *
 * Purpose: A successful start can show the Opponent tab without a click. A click on the selected tab would collapse it.
 * When to use: After a new match is installed, and once when the app opens onto a live match. The console is on screen either way.
 * Expected outcome: The named tab's panel shows and the console is expanded. An unknown id is logged and the console stays as it was.
 * Exceptions: None. A missing page element is skipped by `applyConsoleState`.
 */
export function showConsoleTab(tabId: string): void {
  if (!CONSOLE_TABS.some((tab) => tab.tabId === tabId)) {
    console.error('[agent-wars] showConsoleTab unknown tab', tabId);
    return;
  }
  console.debug('[agent-wars] showConsoleTab', { tabId });
  consoleState = expandedConsoleTabState(tabId);
  applyConsoleState();
}

/**
 * Wires the rail's tabs.
 *
 * Purpose: One bootstrap for the console's own behavior.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A tab click follows `nextConsoleTabState`: the selected tab collapses the console, and any tab
 *   expands it. The header and badges follow every change to the queued orders and the reports. The console starts
 *   expanded on Orders.
 * Exceptions: None; missing elements are skipped.
 */
export function wireConsoleFrame(): void {
  onQueuedOrdersChanged(refreshConsoleHeader);
  onConsoleReportsChanged(refreshConsoleHeader);
  for (const tab of CONSOLE_TABS) {
    document.getElementById(tab.tabId)?.addEventListener('click', () => {
      if (tab.tabId === 'console-tab-orders' && observeModeControls(S.gameState?.seats ?? []).observing) return;
      consoleState = nextConsoleTabState(consoleState, tab.tabId);
      applyConsoleState();
    });
  }
  applyConsoleState();
}
