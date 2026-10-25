/**
 * Per-side loss sections for the turn-update popup.
 *
 * Purpose: The popup names each side that lost a visible unit, with the cause labels and unit names.
 * When to use: After the hex sentences and before Updates.
 * Expected outcome: `Your Losses` for the viewer, then other seats by order, then Neutral.
 * Exceptions: None. This module does not import the logger.
 */

import { formatPlayerLossLinesMultiline, type TurnLossSummary } from './lossSummary';
import { NEUTRAL_OWNER_ID } from './seatIds';

/**
 * The same prefix `MAP_TOAST_SECTION_HEADER_PREFIX` uses for a bold toast header.
 *
 * Purpose: This module must not import the toast builder, which already imports these sections.
 * When to use: Every loss-section header.
 * Expected outcome: `## `.
 * Exceptions: None.
 */
const SECTION_HEADER_PREFIX = '## ';

/**
 * A seat the section header can name.
 *
 * Purpose: Headers use the full home name, in seat order.
 * When to use: `buildTurnLossSections`.
 * Expected outcome: One row per known seat.
 * Exceptions: None.
 */
export interface TurnLossSectionSeat {
  /**
   * Seat id.
   *
   * Contract: Matches a key on `TurnLossSummary.byOwner` when that seat lost a unit.
   * When to use: Finding the seat for an owner id.
   * Expected outcome: The roster id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Roster order.
   *
   * Contract: Lower numbers are named first.
   * When to use: Sorting owners other than the viewer and Neutral.
   * Expected outcome: The seat's `seatOrder`.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Full home name.
   *
   * Contract: Not the shortened name.
   * When to use: The header `{homeRegion} Losses`.
   * Expected outcome: The name the roster stores.
   * Exceptions: None.
   */
  readonly homeRegion: string;
}

/**
 * Writes one loss section per owner that lost a visible unit.
 *
 * Purpose: The popup replaces the old "You lost" and "Seen:" sentences with these sections.
 * When to use: `buildConsolidatedTurnUpdateToastMessage`.
 * Expected outcome: Header lines start with `## `. Cause lines are `{label}: {text}`. An owner with empty buckets is omitted.
 *   A null viewer does not get `Your Losses`.
 * Exceptions: None.
 */
export function buildTurnLossSections(
  summary: TurnLossSummary,
  viewerSeatId: string | null,
  seats: readonly TurnLossSectionSeat[]
): string[] {
  const lines: string[] = [];
  if (viewerSeatId !== null) lines.push(...sectionLines(summary, viewerSeatId, 'Your Losses'));
  const others = Object.keys(summary.byOwner)
    .filter((ownerId) => ownerId !== viewerSeatId && ownerId !== NEUTRAL_OWNER_ID)
    .sort((left, right) => compareOwners(left, right, seats));
  for (const ownerId of others) {
    const seat = seats.find((row) => row.seatId === ownerId);
    lines.push(...sectionLines(summary, ownerId, lossSectionTitle(seat, ownerId)));
  }
  lines.push(...sectionLines(summary, NEUTRAL_OWNER_ID, 'Neutral Losses'));
  return lines;
}

/**
 * The header for one side that is not the viewer.
 *
 * Purpose: A blank home name must not produce a header that is only "Losses".
 * When to use: Each non-viewer owner in `buildTurnLossSections`.
 * Expected outcome: "{home} Losses", or "{seat id} Losses" when the home name is missing or blank.
 * Exceptions: None.
 */
function lossSectionTitle(seat: TurnLossSectionSeat | undefined, ownerId: string): string {
  const name = seat?.homeRegion.trim() ?? '';
  return `${name.length > 0 ? name : ownerId} Losses`;
}

/**
 * One owner's header and cause lines, or nothing when that owner lost no unit.
 *
 * Purpose: Empty buckets must not open a section.
 * When to use: Each owner in `buildTurnLossSections`.
 * Expected outcome: The header, then one `{cause}: {names}` line per non-empty cause.
 * Exceptions: None.
 */
function sectionLines(summary: TurnLossSummary, ownerId: string, header: string): string[] {
  const buckets = summary.byOwner[ownerId];
  if (!buckets) return [];
  const causes = formatPlayerLossLinesMultiline(buckets);
  if (causes.length === 0) return [];
  return [
    `${SECTION_HEADER_PREFIX}${header}`,
    ...causes.map((cause) => `${cause.causeLabel}: ${cause.text}`),
  ];
}

/**
 * Orders owners that are not the viewer and not Neutral.
 *
 * Purpose: Known seats follow `seatOrder`. An owner missing from the roster sorts after them.
 * When to use: `buildTurnLossSections`.
 * Expected outcome: A negative number when `left` comes first. Equal seat order uses `localeCompare('en')`.
 * Exceptions: None.
 */
function compareOwners(left: string, right: string, seats: readonly TurnLossSectionSeat[]): number {
  const leftSeat = seats.find((row) => row.seatId === left);
  const rightSeat = seats.find((row) => row.seatId === right);
  if (leftSeat && rightSeat) return leftSeat.seatOrder - rightSeat.seatOrder || left.localeCompare(right, 'en');
  if (leftSeat) return -1;
  if (rightSeat) return 1;
  return left.localeCompare(right, 'en');
}
