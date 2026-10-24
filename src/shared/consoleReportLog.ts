/**
 * The kinds of Reports entry. This module holds the words and tags of the console's Reports tab, so every entry is
 * named the same way everywhere.
 *
 * Purpose: A turn update, the opponent's message, and any other informational toast are filed apart.
 * When to use: When filing a toast.
 * Expected outcome: `turn` for the turn or beat update, `message` for the opponent's message and strategy, and
 *   `notice` for other informational toasts.
 * Exceptions: None.
 */
export type ConsoleReportKind = 'turn' | 'message' | 'notice';

/**
 * The label each kind shows.
 *
 * Purpose: Entries name their kind in the player's words.
 * When to use: Beside an entry's tag.
 * Expected outcome: Turn report, Message, or Notice.
 * Exceptions: None.
 */
export const CONSOLE_REPORT_KIND_LABELS: Readonly<Record<ConsoleReportKind, string>> = Object.freeze({
  turn: 'Turn report',
  message: 'Message',
  notice: 'Notice',
});

/**
 * The most entries the Reports tab keeps.
 *
 * Purpose: A long match must not grow the list without limit.
 * When to use: After filing an entry.
 * Expected outcome: The oldest entries are dropped past this count.
 * Exceptions: None.
 */
export const MAX_CONSOLE_REPORTS = 200;

/**
 * Formats an entry's tag from a turn number or a battle beat.
 *
 * Purpose: Says when an entry happened, the way the top bar counts turns and beats.
 * When to use: Pass the battle's beat during a battle, otherwise null, and the strategic turn number.
 * Expected outcome: `B2` for a beat, `T7` for a turn, or an empty string when neither is known.
 * Exceptions: None.
 */
export function formatConsoleReportTag(turnNumber: number | null, battleBeat: number | null): string {
  if (battleBeat != null) return `B${battleBeat}`;
  if (turnNumber != null) return `T${turnNumber}`;
  return '';
}

/**
 * Whether one Reports entry stays visible for the sender filter.
 *
 * Purpose: The filter hides other sides' messages and leaves turn reports and notices on screen.
 * When to use: When the Reports filter changes, and when an entry is filed.
 * Expected outcome: An empty filter shows every entry. A seat filter hides messages from other seats.
 * Exceptions: None.
 */
export function consoleReportVisible(kind: ConsoleReportKind, senderSeatId: string | null, filterSeatId: string): boolean {
  if (filterSeatId === '') return true;
  if (kind !== 'message') return true;
  return senderSeatId === filterSeatId;
}
