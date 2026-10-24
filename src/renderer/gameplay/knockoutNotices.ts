/**
 * Announces seats that Ready just knocked out.
 *
 * Purpose: Each knockout is one Reports notice, and the map shows one Notice toast above Messages.
 * When to use: After Ready succeeds, before the new snapshot replaces the units still on screen.
 * Expected outcome: One notice per seat. The toast is the notices joined, and it is not filed a second time.
 * Exceptions: None. An empty list does nothing.
 */

import { activeGameMap } from '../../shared/activeGameMap';
import { formatKnockoutNotice } from '../../shared/knockoutNotice';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { currentConsoleReportTag, recordConsoleReport } from '../chrome/consoleReports';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * One knockout row from a Ready result.
 *
 * Purpose: The announcer does not depend on the whole Ready result.
 * When to use: `announceKnockouts`.
 * Expected outcome: The seat, who knocked it out, and the reasons.
 * Exceptions: None.
 */
export interface KnockoutAnnouncement {
  /**
   * The seat that is out.
   *
   * Contract: A seat id present on the roster.
   * When to use: Naming the victim and counting its units.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The seat credited with the knockout.
   *
   * Contract: A seat id, or null.
   * When to use: The home-control sentence.
   * Expected outcome: The name is looked up, or "A side" when null.
   * Exceptions: None.
   */
  readonly outBy: string | null;
  /**
   * Every reason that held.
   *
   * Contract: Reason ids.
   * When to use: `formatKnockoutNotice`.
   * Expected outcome: Known reasons are written in a fixed order.
   * Exceptions: None.
   */
  readonly reasons: readonly string[];
}

/**
 * Files one notice per knockout and shows them as one toast.
 *
 * Purpose: A single map toast cannot stack several notices, so the list is one toast and the Reports tab keeps each seat.
 * When to use: When `readyResult.knockouts` is non-empty, passing the snapshot still on screen and the removed-unit ids.
 * Expected outcome: Each seat gets a Reports entry. The toast uses `skipReport`.
 * Exceptions: None.
 */
export function announceKnockouts(
  knockouts: readonly KnockoutAnnouncement[],
  before: GameStateSnapshot | null,
  afterSeats: GameStateSnapshot['seats'] | undefined,
  removedUnitIdsBySeat: Readonly<Record<string, readonly string[]>> | undefined
): void {
  if (knockouts.length === 0) return;
  const notices = knockouts.map((row) => noticeText(row, before, afterSeats, removedUnitIdsBySeat));
  const tag = currentConsoleReportTag();
  for (const notice of notices) {
    const body = document.createElement('p');
    body.textContent = notice;
    recordConsoleReport('notice', tag, body);
  }
  showMapToast(notices.join('\n\n'), { isError: false, report: { kind: 'notice', tag }, skipReport: true });
}

/**
 * The notice sentence for one seat.
 *
 * Purpose: Names come from the roster that is about to be shown. Remaining units are the before snapshot minus removals.
 * When to use: `announceKnockouts`.
 * Expected outcome: `formatKnockoutNotice` text.
 * Exceptions: None. A missing seat uses the seat id as its name.
 */
function noticeText(
  row: KnockoutAnnouncement,
  before: GameStateSnapshot | null,
  afterSeats: GameStateSnapshot['seats'] | undefined,
  removedUnitIdsBySeat: Readonly<Record<string, readonly string[]>> | undefined
): string {
  const seats = afterSeats ?? before?.seats ?? [];
  const victim = seats.find((seat) => seat.seatId === row.seatId);
  const outBy = row.outBy === null ? null : seats.find((seat) => seat.seatId === row.outBy);
  const removed = new Set(removedUnitIdsBySeat?.[row.seatId] ?? []);
  const remaining = (before?.units ?? []).filter((unit) => unit.player === row.seatId && !removed.has(unit.id)).length;
  const share = activeGameMap().controlWinMinUrbanShare;
  return formatKnockoutNotice({
    victimName: victim?.homeRegion ?? row.seatId,
    victimIsHuman: victim?.kind === HUMAN_SEAT_ID,
    outByName: outBy?.homeRegion ?? null,
    reasons: row.reasons,
    globalHome: share === null,
    controlShareLabel: share === null ? '' : `${Math.round(share * 100)}%`,
    remainingUnits: remaining,
  });
}
