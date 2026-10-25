/**
 * The console's Reports tab: a list of what the two map toasts showed during this match, newest first.
 *
 * Toasts file themselves here when they show. Errors are not filed. The list is not saved, and it clears when a new
 * match starts.
 */
import {
  CONSOLE_REPORT_KIND_LABELS,
  consoleReportVisible,
  formatConsoleReportTag,
  MAX_CONSOLE_REPORTS,
  type ConsoleReportKind,
} from '../../shared/consoleReportLog';
import { paletteForOwner } from '../../shared/seatPalette';
import { createSideNumberFlag } from './toastInlineMarks';
import { rendererSharedState as S } from '../core/state';
import { unavailableTooltipText } from './frameTooltipText';

/**
 * Extra facts a message entry can name.
 *
 * Purpose: The Reports row shows who sent it and which model, without parsing the toast text.
 * When to use: The fourth argument of `recordConsoleReport`.
 * Expected outcome: A message with `messageText` is drawn as a sender line. Other entries ignore this.
 * Exceptions: None.
 */
export interface ConsoleReportMeta {
  /**
   * The seat that sent the message.
   *
   * Contract: A seat id, or omitted for a notice that is not from a seat.
   * When to use: Message entries and the sender filter.
   * Expected outcome: The filter can hide the entry.
   * Exceptions: None.
   */
  readonly senderSeatId?: string;
  /**
   * The model label shown at the right of the head.
   *
   * Contract: Plain text, or omitted.
   * When to use: A message from a consult.
   * Expected outcome: Shown on the head.
   * Exceptions: None.
   */
  readonly modelLabel?: string;
  /**
   * The message, without quotes.
   *
   * Contract: Plain text. When set, the entry body is built from this instead of `body`.
   * When to use: A commander message.
   * Expected outcome: Shown in quotes after the sender's name.
   * Exceptions: None.
   */
  readonly messageText?: string;
  /**
   * Strategy prose.
   *
   * Contract: Plain text, or omitted.
   * When to use: When the consult sent a strategy, including while a human seat is playing.
   * Expected outcome: A muted "Strategy:" line. A blank value is omitted.
   * Exceptions: None.
   */
  readonly strategyText?: string;
}

/**
 * The Reports sender filter. Empty means everyone.
 *
 * Purpose: The select and the list share one value.
 * When to use: `setReportSenderFilter`.
 * Expected outcome: A seat id, or empty.
 * Exceptions: None.
 */
let reportSenderFilter = '';

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
 * The sender line for a message entry.
 *
 * Purpose: The row names the side and quotes the message. Strategy follows when the consult sent it.
 * When to use: `recordConsoleReport` when `messageText` is set.
 * Expected outcome: The opponent's number flag when that sender has one, otherwise the color dot. Then the full name, the message in quotes when it is non-empty, and a strategy line when strategy is non-empty.
 * Exceptions: None.
 */
function messageReportBody(meta: ConsoleReportMeta): HTMLElement {
  const wrap = document.createElement('div');
  const line = document.createElement('div');
  line.className = 'console-report-sender';
  const seats = S.gameState?.seats ?? [];
  const seat = seats.find((row) => row.seatId === meta.senderSeatId);
  const flag = meta.senderSeatId ? createSideNumberFlag(meta.senderSeatId, seats) : null;
  const mark = flag ?? document.createElement('span');
  if (!flag) {
    mark.className = 'console-report-dot';
    mark.style.background = paletteForOwner(meta.senderSeatId ?? null, seats)?.map ?? '#9D174D';
  }
  const name = document.createElement('span');
  const message = meta.messageText?.trim() ?? '';
  const home = seat?.homeRegion ?? 'Commander';
  name.textContent = message.length > 0 ? `${home} "${message}"` : home;
  line.append(mark, name);
  wrap.append(line);
  const strategyText = meta.strategyText?.trim() ?? '';
  if (strategyText.length > 0) {
    const strategy = document.createElement('p');
    strategy.className = 'console-report-strategy';
    strategy.textContent = `Strategy: ${strategyText}`;
    wrap.append(strategy);
  }
  return wrap;
}

/**
 * Fills the Reports sender filter from the roster.
 *
 * Purpose: The select lists every side by its full name.
 * When to use: When the console header refreshes.
 * Expected outcome: "Everyone", then each seat. The current choice is kept.
 * Exceptions: None.
 */
export function refreshReportSenderFilter(): void {
  const select = document.getElementById('reports-sender-filter');
  if (!(select instanceof HTMLSelectElement)) return;
  if (!select.dataset.bound) {
    select.dataset.bound = 'true';
    select.addEventListener('change', () => setReportSenderFilter(select.value));
  }
  const current = select.value;
  select.replaceChildren(filterOption('Everyone', ''));
  for (const seat of S.gameState?.seats ?? []) select.append(filterOption(seat.homeRegion, seat.seatId));
  if ([...select.options].some((row) => row.value === current)) select.value = current;
}

/**
 * One option for the Reports filter.
 *
 * Purpose: The list is rebuilt from the roster.
 * When to use: `refreshReportSenderFilter`.
 * Expected outcome: A labeled option.
 * Exceptions: None.
 */
function filterOption(label: string, value: string): HTMLOptionElement {
  const row = document.createElement('option');
  row.value = value;
  row.textContent = label;
  return row;
}

/**
 * Hides messages from other sides.
 *
 * Purpose: Turn reports and notices stay. Messages follow the select.
 * When to use: When the select changes.
 * Expected outcome: Each entry's `hidden` flag matches `consoleReportVisible`.
 * Exceptions: None.
 */
export function setReportSenderFilter(seatId: string): void {
  reportSenderFilter = seatId;
  document.querySelectorAll('#reports-list .console-report').forEach((entry) => {
    if (!(entry instanceof HTMLElement)) return;
    const kind = (entry.dataset.reportKind ?? 'notice') as ConsoleReportKind;
    entry.hidden = !consoleReportVisible(kind, entry.dataset.senderSeatId ?? null, reportSenderFilter);
  });
  const list = document.getElementById('reports-list');
  if (list) syncReportsEmptyState(list);
}

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
 * Expected outcome: `#reports-empty` is hidden exactly when a visible entry remains. A filter that hides every entry shows the empty sentence.
 * Exceptions: None.
 */
function syncReportsEmptyState(list: HTMLElement): void {
  const anyVisible = [...list.querySelectorAll('.console-report')].some((entry) => entry instanceof HTMLElement && !entry.hidden);
  document.getElementById('reports-empty')?.toggleAttribute('hidden', anyVisible);
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
 * Expected outcome: A new first entry with the tag and the kind. Without `messageText`, the body is a copy of the toast.
 *   With `messageText`, the body is the sender's name and the quoted message when that message is non-empty, plus a strategy line when the consult sent one.
 *   A message can show a model label. A turn report also gets a disabled Replay placeholder. The entry is marked new
 *   until the player next leaves the Reports tab, and counts as unread unless the tab is on screen. Past
 *   `MAX_CONSOLE_REPORTS` the oldest entry is dropped. A sender filter hides a new message from another seat.
 * Exceptions: None; a missing list files nothing.
 */
export function recordConsoleReport(kind: ConsoleReportKind, tag: string, body: HTMLElement, meta?: ConsoleReportMeta): void {
  const list = document.getElementById('reports-list');
  if (!list) return;
  const entry = document.createElement('li');
  entry.className = `console-report console-report-${kind}`;
  entry.dataset.fresh = 'true';
  entry.dataset.reportKind = kind;
  if (meta?.senderSeatId) entry.dataset.senderSeatId = meta.senderSeatId;
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
  if (meta?.modelLabel) {
    const model = document.createElement('span');
    model.className = 'console-report-model';
    model.textContent = meta.modelLabel;
    head.append(model);
  }
  if (kind === 'turn') head.append(createReplayPlaceholder());
  const content = document.createElement('div');
  content.className = 'console-report-body';
  if (meta?.messageText !== undefined) content.append(messageReportBody(meta));
  else content.append(...Array.from(body.cloneNode(true).childNodes));
  entry.append(head, content);
  entry.hidden = !consoleReportVisible(kind, meta?.senderSeatId ?? null, reportSenderFilter);
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
