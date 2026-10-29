/**
 * Per-side loss sections for the turn-update popup.
 *
 * Purpose: The popup names each side that lost a visible unit, lost hexes, controlled a hex hit by a visible missile launch, or owned a hex whose fortifications fell when the viewer may see that report.
 * When to use: Before the Updates section of a turn-update toast.
 * Expected outcome: `Your Losses` for the viewer, then other seats by order, then Neutral. A side that only lost hexes, only took missile infrastructure damage, or only lost visible fortifications is included. A side that only gained hexes is omitted.
 * Exceptions: None. This module does not import the logger.
 */

import { formatPlayerLossLinesMultiline, type TurnLossSummary } from './lossSummary';
import { NEUTRAL_OWNER_ID } from './seatIds';

/**
 * An empty hex-line map for a toast that has no territory changes.
 *
 * Purpose: Callers that only have unit losses can omit the map. One shared instance stays immutable.
 * When to use: The default of `buildTurnLossSections`.
 * Expected outcome: No hex sentences are appended.
 * Exceptions: None.
 */
const NO_HEX_LINES: ReadonlyMap<string, readonly string[]> = new Map();

/**
 * An empty strike-line map for a toast that has no seat or Neutral sentences.
 *
 * Purpose: Callers that have no missile or fortification sentences can omit the map. One shared instance stays immutable.
 * When to use: The default of `buildTurnLossSections`.
 * Expected outcome: No missile or fortification sentences are appended.
 * Exceptions: None.
 */
const NO_STRIKE_LINES: ReadonlyMap<string, readonly string[]> = new Map();

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
 * Writes one section per owner that lost a visible unit, lost hexes, took missile infrastructure damage, or lost visible fortifications.
 *
 * Purpose: Unit losses, missile and fortification sentences, and territory changes for one side stay together.
 * When to use: `buildConsolidatedTurnUpdateToastMessage`.
 * Expected outcome: Header lines start with `## `. Cause lines are `{label}: {text}`, then that owner's missile and fortification sentences, then that owner's hex sentences.
 *   An owner with empty buckets, no strike sentences, and no hex sentences is omitted. A null viewer does not get `Your Losses`.
 * Exceptions: None.
 */
export function buildTurnLossSections(
  summary: TurnLossSummary,
  viewerSeatId: string | null,
  seats: readonly TurnLossSectionSeat[],
  hexLinesByOwner: ReadonlyMap<string, readonly string[]> = NO_HEX_LINES,
  strikeLinesByOwner: ReadonlyMap<string, readonly string[]> = NO_STRIKE_LINES
): string[] {
  const lines: string[] = [];
  for (const ownerId of orderedOwners(summary, viewerSeatId, seats, hexLinesByOwner, strikeLinesByOwner)) {
    const header = headerFor(ownerId, viewerSeatId, seats);
    lines.push(
      ...sectionLines(
        summary,
        ownerId,
        header,
        hexLinesByOwner.get(ownerId) ?? [],
        strikeLinesByOwner.get(ownerId) ?? []
      )
    );
  }
  return lines;
}

/**
 * The owners that have a section, in toast order.
 *
 * Purpose: A side that only lost hexes, only took missile infrastructure damage, or only lost visible fortifications still appears between the viewer and Neutral.
 * When to use: `buildTurnLossSections`.
 * Expected outcome: The viewer, then other owners by seat order, then Neutral. An owner in none of the three sources is absent.
 * Exceptions: None.
 */
function orderedOwners(
  summary: TurnLossSummary,
  viewerSeatId: string | null,
  seats: readonly TurnLossSectionSeat[],
  hexLinesByOwner: ReadonlyMap<string, readonly string[]>,
  strikeLinesByOwner: ReadonlyMap<string, readonly string[]>
): string[] {
  const ids = new Set<string>([
    ...Object.keys(summary.byOwner),
    ...hexLinesByOwner.keys(),
    ...strikeLinesByOwner.keys(),
  ]);
  const ordered: string[] = [];
  if (viewerSeatId !== null && ids.has(viewerSeatId)) ordered.push(viewerSeatId);
  const others = [...ids].filter((ownerId) => ownerId !== viewerSeatId && ownerId !== NEUTRAL_OWNER_ID);
  others.sort((left, right) => compareOwners(left, right, seats));
  ordered.push(...others);
  if (ids.has(NEUTRAL_OWNER_ID)) ordered.push(NEUTRAL_OWNER_ID);
  return ordered;
}

/**
 * The header for one owner.
 *
 * Purpose: The viewer and Neutral keep their fixed headers. Every other owner uses the full home name.
 * When to use: Each id from `orderedOwners`.
 * Expected outcome: `Your Losses`, `Neutral Losses`, or `{home} Losses`.
 * Exceptions: None.
 */
function headerFor(ownerId: string, viewerSeatId: string | null, seats: readonly TurnLossSectionSeat[]): string {
  if (viewerSeatId !== null && ownerId === viewerSeatId) return 'Your Losses';
  if (ownerId === NEUTRAL_OWNER_ID) return 'Neutral Losses';
  return lossSectionTitle(seats.find((row) => row.seatId === ownerId), ownerId);
}

/**
 * The owner a loss-section header names.
 *
 * Purpose: Origin flags and type icons need the side that lost the units, and the header is the only place the toast string says who that is.
 * When to use: While painting a `## ` line in the turn-update toast.
 * Expected outcome: The viewer seat for `Your Losses` (null when there is no viewer). `neutral` for `Neutral Losses`.
 *   The matching seat id for `{name} Losses`. Null for `Updates` and every other title. Two seats with the same name: the lower `seatOrder`.
 * Exceptions: None.
 */
export function lossSectionOwnerId(
  headerTitle: string,
  viewerSeatId: string | null,
  seats: readonly TurnLossSectionSeat[]
): string | null {
  if (headerTitle === 'Your Losses') return viewerSeatId;
  if (headerTitle === 'Neutral Losses') return NEUTRAL_OWNER_ID;
  if (!headerTitle.endsWith(' Losses')) return null;
  const name = headerTitle.slice(0, -' Losses'.length);
  const matches = seats
    .filter((seat) => {
      const home = seat.homeRegion.trim();
      return (home.length > 0 ? home : seat.seatId) === name;
    })
    .sort((left, right) => left.seatOrder - right.seatOrder);
  return matches[0]?.seatId ?? null;
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
 * One owner's header, cause lines, missile and fortification sentences, and hex sentences, or nothing when that owner has none of them.
 *
 * Purpose: Empty buckets must not open a section, and a side that only lost hexes, only took missile damage, or only lost fortifications still does.
 * When to use: Each owner in `buildTurnLossSections`.
 * Expected outcome: The header, then one `{cause}: {names}` line per non-empty cause, then the missile and fortification sentences, then the hex sentences.
 * Exceptions: None.
 */
function sectionLines(
  summary: TurnLossSummary,
  ownerId: string,
  header: string,
  hexLines: readonly string[],
  strikeLines: readonly string[]
): string[] {
  const buckets = summary.byOwner[ownerId];
  const causes = buckets ? formatPlayerLossLinesMultiline(buckets) : [];
  if (causes.length === 0 && hexLines.length === 0 && strikeLines.length === 0) return [];
  return [
    `${SECTION_HEADER_PREFIX}${header}`,
    ...causes.map((cause) => `${cause.causeLabel}: ${cause.text}`),
    ...strikeLines,
    ...hexLines,
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
