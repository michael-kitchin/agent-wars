/**
 * The console's Reports tab: a list of what the two map toasts showed during this match, newest first.
 *
 * Toasts file themselves here when they show. Errors are not filed. The list is not saved, and it clears when a new
 * match starts.
 */
import {
  CONSOLE_REPORT_KIND_LABELS,
  formatConsoleReportTag,
  MAX_CONSOLE_REPORTS,
  type ConsoleReportKind,
} from '../../shared/consoleReportLog';
import { rendererSharedState as S } from '../core/state';
import { unavailableTooltipText } from './frameTooltipText';

/**
 * Entries filed while the Reports tab was not on screen.
 *
 * Purpose: The rail badge shows this number.
 * When to use: Changed only inside this module.
 * Expected outcome: Zero while the tab is shown.
 * Exceptions: None.
 */
let unreadCount = 0;

/**
 * Whether the Reports tab is on screen: selected, with the console expanded.
 *
 * Purpose: Entries filed while the player is looking are not unread.
 * When to use: Set by `setConsoleReportsVisible`.
 * Expected outcome: Starts false; the console opens on Orders.
 * Exceptions: None.
 */
let reportsVisible = false;

/**
 * Callbacks run after the entries or the unread count change.
 *
 * Purpose: The console header redraws the rail badge.
 * When to use: Added by `onConsoleReportsChanged`.
 * Expected outcome: Each runs once per change.
 * Exceptions: None.
 */
const listeners: Array<() => void> = [];

/**
 * Runs every listener.
 *
 * Purpose: One place that announces a change.
 * When to use: After any change to the entries or the unread count.
 * Expected outcome: Each listener runs once.
 * Exceptions: A listener that throws stops the later listeners.
 */
function notifyReportsChanged(): void {
  for (const listener of listeners) listener();
}

/**
 * Shows the empty-list sentence only while the list has no entries.
 *
 * Purpose: An empty Reports tab says so instead of showing a blank panel.
 * When to use: After entries are added or cleared.
 * Expected outcome: `#reports-empty` is hidden exactly when `#reports-list` has an entry.
 * Exceptions: None.
 */
function syncReportsEmptyState(list: HTMLElement): void {
  document.getElementById('reports-empty')?.toggleAttribute('hidden', list.childElementCount > 0);
}

/**
 * Builds the disabled Replay placeholder on a turn report.
 *
 * Purpose: Marks where replaying a turn will live, without offering it in this version.
 * When to use: Once per turn report entry.
 * Expected outcome: A disabled button inside a tip host that says Replay is not available.
 * Exceptions: None.
 */
function createReplayPlaceholder(): HTMLElement {
  const host = document.createElement('span');
  host.className = 'control-tooltip-host console-report-replay-host';
  host.setAttribute('data-control-tooltip', unavailableTooltipText('Replay'));
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'console-report-replay';
  button.disabled = true;
  button.textContent = 'Replay';
  host.append(button);
  return host;
}

/**
 * Returns the tag for an entry filed now: the current beat during a battle, otherwise the current turn.
 *
 * Purpose: Messages and notices are tagged with when they arrived.
 * When to use: When a toast is filed without a tag of its own.
 * Expected outcome: For example `T7` or `B2`; empty before a match is loaded.
 * Exceptions: None.
 */
export function currentConsoleReportTag(): string {
  const battle = S.tacticalBattleSnapshot;
  return formatConsoleReportTag(S.gameState?.turnNumber ?? null, battle ? battle.tacticalTurnNumber : null);
}

/**
 * Files one toast's content at the top of the Reports tab.
 *
 * Purpose: Keeps what a toast showed after the toast hides.
 * When to use: Right after a map toast or the AI strategy toast is filled. `body` is the toast's text element;
 *   it is copied, not moved.
 * Expected outcome: A new first entry with the tag, the kind, and a copy of the toast's text. A turn report also
 *   gets a disabled Replay placeholder. The entry is marked new until the player next leaves the Reports tab, and
 *   counts as unread unless the tab is on screen. Past `MAX_CONSOLE_REPORTS` the oldest entry is dropped.
 * Exceptions: None; a missing list files nothing.
 */
export function recordConsoleReport(kind: ConsoleReportKind, tag: string, body: HTMLElement): void {
  const list = document.getElementById('reports-list');
  if (!list) return;
  const entry = document.createElement('li');
  entry.className = `console-report console-report-${kind}`;
  entry.dataset.fresh = 'true';
  const head = document.createElement('div');
  head.className = 'console-report-head';
  if (tag) {
    const tagEl = document.createElement('span');
    tagEl.className = 'console-report-tag';
    tagEl.textContent = tag;
    head.append(tagEl);
  }
  const kindEl = document.createElement('span');
  kindEl.className = 'console-report-kind';
  kindEl.textContent = CONSOLE_REPORT_KIND_LABELS[kind];
  head.append(kindEl);
  if (kind === 'turn') head.append(createReplayPlaceholder());
  const content = document.createElement('div');
  content.className = 'console-report-body';
  content.append(...Array.from(body.cloneNode(true).childNodes));
  entry.append(head, content);
  list.prepend(entry);
  while (list.childElementCount > MAX_CONSOLE_REPORTS) list.lastElementChild?.remove();
  syncReportsEmptyState(list);
  // An entry dropped past the limit no longer counts, so the badge never exceeds the entries listed.
  if (!reportsVisible) unreadCount = Math.min(unreadCount + 1, list.childElementCount);
  notifyReportsChanged();
}

/**
 * Counts entries filed since the Reports tab was last on screen.
 *
 * Purpose: The Reports rail badge shows this number.
 * When to use: When the console header is drawn.
 * Expected outcome: Zero while the tab is shown.
 * Exceptions: None.
 */
export function unreadConsoleReportCount(): number {
  return unreadCount;
}

/**
 * Records whether the Reports tab is on screen.
 *
 * Purpose: Showing the tab reads every entry; leaving it clears the new-entry marks.
 * When to use: From the console each time its tab or collapsed state changes.
 * Expected outcome: Becoming visible sets the unread count to zero. Becoming hidden removes the new-entry marks, so
 *   the next visit marks only entries filed after this one. No change does nothing.
 * Exceptions: None.
 */
export function setConsoleReportsVisible(visible: boolean): void {
  if (visible === reportsVisible) return;
  reportsVisible = visible;
  if (visible) unreadCount = 0;
  else document.querySelectorAll('#reports-list [data-fresh]').forEach((entry) => entry.removeAttribute('data-fresh'));
  notifyReportsChanged();
}

/**
 * Empties the Reports tab for a new match.
 *
 * Purpose: Reports belong to one match, as the AI activity log does.
 * When to use: After a new match starts successfully, next to clearing the AI activity log.
 * Expected outcome: No entries, the empty-list sentence, and no unread count.
 * Exceptions: None.
 */
export function clearConsoleReports(): void {
  const list = document.getElementById('reports-list');
  list?.replaceChildren();
  if (list) syncReportsEmptyState(list);
  unreadCount = 0;
  notifyReportsChanged();
}

/**
 * Adds a callback that runs whenever the entries or the unread count change.
 *
 * Purpose: Keeps the rail badge in step without this module knowing the console.
 * When to use: Once, during renderer startup.
 * Expected outcome: The callback runs after every later change.
 * Exceptions: None.
 */
export function onConsoleReportsChanged(listener: () => void): void {
  listeners.push(listener);
}
