/**
 * Sentences for one turn report when more than one side can win or lose.
 *
 * Purpose: The toast and the Reports entry name who took hexes.
 * When to use: After Ready, for the active human seat, or with a null viewer while observing.
 * Expected outcome: Hex sentences for the viewer, then the other update lines. A null viewer writes no "You" line.
 * Exceptions: None.
 */

import { aiIndexForSeatId, isNeutralOwnerId } from './seatIds';
import { shortSideName } from './seatRoster';

/**
 * A side the report can name.
 *
 * Purpose: Short names and order come from the roster, not from seat ids.
 * When to use: `buildTurnReportLines`.
 * Expected outcome: One row per seat.
 * Exceptions: None.
 */
export interface TurnReportSeat {
  /**
   * The seat id.
   *
   * Contract: A seat id.
   * When to use: Matching a transition or a loss to a name.
   * Expected outcome: The id stored on the roster.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Seat order, starting at 1.
   *
   * Contract: A positive integer.
   * When to use: Ordering names in a sentence.
   * Expected outcome: Lower numbers are named first.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * The full home name.
   *
   * Contract: The roster's `homeRegion`.
   * When to use: `shortSideName`.
   * Expected outcome: "Western Turkey" becomes "W. Turkey".
   * Exceptions: None.
   */
  readonly homeRegion: string;
}

/**
 * One hex whose controller changed.
 *
 * Purpose: "You took" and "{Side} took" count these.
 * When to use: `buildTurnReportLines`.
 * Expected outcome: `from` or `to` null is unowned land and does not get a sentence.
 * Exceptions: None.
 */
export interface TurnReportTransition {
  /**
   * The hex that changed hands.
   *
   * Contract: An H3 index. The sentences count hexes and do not print this.
   * When to use: Grouping. The label is not required.
   * Expected outcome: One row per flip.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * The previous controller.
   *
   * Contract: A seat id, the neutral owner id, or null.
   * When to use: Who the viewer took the hex from.
   * Expected outcome: Null is skipped.
   * Exceptions: None.
   */
  readonly from: string | null;
  /**
   * The new controller.
   *
   * Contract: A seat id, the neutral owner id, or null.
   * When to use: Who took the viewer's hex.
   * Expected outcome: Null is skipped.
   * Exceptions: None.
   */
  readonly to: string | null;
}

/**
 * Facts for one turn report.
 *
 * Purpose: The function does not read the match.
 * When to use: `buildTurnReportLines`.
 * Expected outcome: Hex sentences, then `otherLines`. A null viewer writes no "You" line.
 * Exceptions: None.
 */
export interface TurnReportInput {
  /**
   * The seat the "You" lines speak to.
   *
   * Contract: A seat id, or null while observing every side.
   * When to use: The "You took" sentences.
   * Expected outcome: Null omits every "You" line.
   * Exceptions: None.
   */
  readonly viewerSeatId: string | null;
  /**
   * Seats in the match, used for names and order.
   *
   * Contract: One row per seat.
   * When to use: Every name in a sentence.
   * Expected outcome: Short names. Neutral is the word "Neutral".
   * Exceptions: None.
   */
  readonly seats: readonly TurnReportSeat[];
  /**
   * Control changes this turn.
   *
   * Contract: Rows from Ready. A null side is unowned land.
   * When to use: The hex sentences.
   * Expected outcome: Only flips between the viewer and another owner are sentences.
   * Exceptions: None.
   */
  readonly transitions: readonly TurnReportTransition[];
  /**
   * Deployment, cap, and other update lines already written.
   *
   * Contract: Plain sentences, in the order they should appear.
   * When to use: After the fight sentences.
   * Expected outcome: Appended unchanged.
   * Exceptions: None.
   */
  readonly otherLines: readonly string[];
}

/**
 * Writes the hex sentences and any extra lines.
 *
 * Purpose: One wording for the toast and the Reports entry. Loss sections are built separately.
 * When to use: After Ready has transitions and the viewer's seat.
 * Expected outcome: Hex sentences, then `otherLines`.
 * Exceptions: None.
 */
export function buildTurnReportLines(input: TurnReportInput): string[] {
  return [...hexLines(input), ...input.otherLines];
}

/**
 * The short name of an owner.
 *
 * Purpose: Sentences use "E. Turkey" and "Neutral".
 * When to use: Every named side.
 * Expected outcome: Neutral is "Neutral". A known seat uses its short name, or its seat id when the home name is blank. An unknown id is printed as itself.
 * Exceptions: None.
 */
function ownerName(ownerId: string, seats: readonly TurnReportSeat[]): string {
  if (isNeutralOwnerId(ownerId)) return 'Neutral';
  const seat = seats.find((row) => row.seatId === ownerId);
  return seat ? hexLabelForSeat(seat) : ownerId;
}

/**
 * The name a hex sentence shows for one seat.
 *
 * Purpose: The sentence and the number-flag mark have to name the seat with the same characters.
 * When to use: `ownerName` and `hexNameForSeat`.
 * Expected outcome: The short home name, or the seat id when the trimmed home is empty.
 * Exceptions: None.
 */
function hexLabelForSeat(seat: { readonly seatId: string; readonly homeRegion: string }): string {
  return seat.homeRegion.trim().length > 0 ? shortSideName(seat.homeRegion) : seat.seatId;
}

/**
 * Compares two owners by seat order. Neutral is last.
 *
 * Purpose: Names in one sentence follow the roster.
 * When to use: Sorting the owners in the hex sentences.
 * Expected outcome: A negative number when `left` is named first.
 * Exceptions: None.
 */
function compareOwners(left: string, right: string, seats: readonly TurnReportSeat[]): number {
  const rank = (ownerId: string): number => {
    if (isNeutralOwnerId(ownerId)) return 10_000;
    return seats.find((row) => row.seatId === ownerId)?.seatOrder ?? 9_000;
  };
  return rank(left) - rank(right) || left.localeCompare(right);
}

/**
 * Hex sentences for the viewer.
 *
 * Purpose: "You took" and "{Side} took" replace a single hex-lost count.
 * When to use: The hex sentences at the start of Updates.
 * Expected outcome: One line per other owner. A null controller is skipped. A null viewer writes nothing.
 * Exceptions: None.
 */
function hexLines(input: TurnReportInput): string[] {
  const viewer = input.viewerSeatId;
  if (viewer === null) return [];
  const taken = new Map<string, number>();
  const lost = new Map<string, number>();
  for (const row of input.transitions) {
    if (row.to === viewer && row.from !== null && row.from !== viewer) taken.set(row.from, (taken.get(row.from) ?? 0) + 1);
    if (row.from === viewer && row.to !== null && row.to !== viewer) lost.set(row.to, (lost.get(row.to) ?? 0) + 1);
  }
  const lines: string[] = [];
  for (const ownerId of [...taken.keys()].sort((left, right) => compareOwners(left, right, input.seats))) {
    const count = taken.get(ownerId) ?? 0;
    const hexWord = count === 1 ? 'hex' : 'hexes';
    lines.push(`You took ${count} ${hexWord} from ${ownerName(ownerId, input.seats)}.`);
  }
  for (const ownerId of [...lost.keys()].sort((left, right) => compareOwners(left, right, input.seats))) {
    const count = lost.get(ownerId) ?? 0;
    lines.push(`${ownerName(ownerId, input.seats)} took ${count} of your hexes.`);
  }
  return lines;
}

/**
 * One opponent name inside a toast line.
 *
 * Purpose: The painter inserts a numbered flag immediately before that name.
 * When to use: Output of `sideNameMarksForLine`.
 * Expected outcome: `start` is inclusive and `end` is exclusive, both in the line that was passed.
 * Exceptions: None.
 */
export interface SideNameMark {
  /**
   * The AI seat whose name was found.
   *
   * Contract: `aiIndexForSeatId` of this id is 1 through 4.
   * When to use: Choosing the flag color and the digit.
   * Expected outcome: An AI seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Index of the first character of the name.
   *
   * Contract: `0 <= start < end <= line.length`.
   * When to use: Slicing the line.
   * Expected outcome: The name begins here.
   * Exceptions: None.
   */
  readonly start: number;
  /**
   * Index just after the name.
   *
   * Contract: Greater than `start`.
   * When to use: Slicing the line.
   * Expected outcome: The name ends here.
   * Exceptions: None.
   */
  readonly end: number;
}

/**
 * A seat a toast line can name.
 *
 * Purpose: Hex sentences use the short name. Loss headers use the full home name.
 * When to use: `sideNameMarksForLine`.
 * Expected outcome: One row per seat.
 * Exceptions: None.
 */
export interface SideNameMarkSeat {
  /**
   * Seat id.
   *
   * Contract: An AI seat id can receive a mark. The human seat cannot.
   * When to use: Matching a blank home name, and the mark's `seatId`.
   * Expected outcome: The roster id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Seat order.
   *
   * Contract: Lower numbers win when two seats display the same name.
   * When to use: Sorting candidates.
   * Expected outcome: The seat's `seatOrder`.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Full home name.
   *
   * Contract: Blank or whitespace means the seat id is the displayed name.
   * When to use: `shortSideName` for hex sentences, and the full name for loss headers.
   * Expected outcome: The name the roster stores.
   * Exceptions: None.
   */
  readonly homeRegion: string;
}

/**
 * The name an AI seat shows in a hex sentence.
 *
 * Purpose: Hex sentences use the short name, and a blank home uses the seat id.
 * When to use: Matching `You took` and `{name} took` lines.
 * Expected outcome: Null when the seat is not an AI seat.
 * Exceptions: None.
 */
function hexNameForSeat(seat: SideNameMarkSeat): string | null {
  if (aiIndexForSeatId(seat.seatId) == null) return null;
  return hexLabelForSeat(seat);
}

/**
 * The name an AI seat shows in a loss header.
 *
 * Purpose: Headers use the full home name, and a blank home uses the seat id.
 * When to use: Matching `{name} Losses`.
 * Expected outcome: Null when the seat is not an AI seat.
 * Exceptions: None.
 */
function headerNameForSeat(seat: SideNameMarkSeat): string | null {
  if (aiIndexForSeatId(seat.seatId) == null) return null;
  const home = seat.homeRegion.trim();
  return home.length > 0 ? home : seat.seatId;
}

/**
 * The AI seat with the lowest seat order whose displayed name equals `name`.
 *
 * Purpose: Two homes can shorten to the same text.
 * When to use: After a sentence or header has been recognized.
 * Expected outcome: The seat, or null when no AI seat shows that name.
 * Exceptions: None.
 */
function seatForDisplayedName(
  seats: readonly SideNameMarkSeat[],
  name: string,
  nameOf: (seat: SideNameMarkSeat) => string | null
): SideNameMarkSeat | null {
  const matches = seats
    .filter((seat) => nameOf(seat) === name)
    .sort((left, right) => left.seatOrder - right.seatOrder);
  return matches[0] ?? null;
}

/**
 * A mark for one recognized name, or none.
 *
 * Purpose: The three toast shapes that name an opponent share one result shape.
 * When to use: `sideNameMarksForLine` after prefixes are stripped.
 * Expected outcome: Indexes into `body`. An empty array when the body is not one of those shapes, or the name is not an opponent.
 * Exceptions: None.
 */
function markInBody(body: string, seats: readonly SideNameMarkSeat[]): SideNameMark[] {
  const from = /^You took \d+ hex(?:es)? from (.+)\.$/.exec(body);
  if (from) {
    const name = from[1] ?? '';
    const seat = seatForDisplayedName(seats, name, hexNameForSeat);
    if (!seat) return [];
    const start = body.length - name.length - 1;
    return [{ seatId: seat.seatId, start, end: start + name.length }];
  }
  const took = /^(.+) took \d+ of your hexes\.$/.exec(body);
  if (took) {
    const name = took[1] ?? '';
    const seat = seatForDisplayedName(seats, name, hexNameForSeat);
    if (!seat || !body.startsWith(`${name} took `)) return [];
    return [{ seatId: seat.seatId, start: 0, end: name.length }];
  }
  if (body === 'Your Losses' || body === 'Neutral Losses' || !body.endsWith(' Losses')) return [];
  const name = body.slice(0, -' Losses'.length);
  const seat = seatForDisplayedName(seats, name, headerNameForSeat);
  if (!seat) return [];
  return [{ seatId: seat.seatId, start: 0, end: name.length }];
}

/**
 * Finds the one opponent name in a toast line.
 *
 * Purpose: Message tabs and Reports paint their own flags. This covers loss headers and the two hex sentences.
 * When to use: For each raw updates-toast line, and for a line that already has a bullet or `## ` prefix.
 * Expected outcome: At most one mark. A leading `• ` or `## ` is not part of the name, and the indexes include it.
 *   `Your Losses`, `Neutral Losses`, Neutral hex sentences, and every other line return none.
 * Exceptions: None.
 */
export function sideNameMarksForLine(line: string, seats: readonly SideNameMarkSeat[]): readonly SideNameMark[] {
  let offset = 0;
  let body = line;
  if (body.startsWith('\u2022 ')) {
    offset += 2;
    body = body.slice(2);
  }
  if (body.startsWith('## ')) {
    offset += 3;
    body = body.slice(3);
  }
  return markInBody(body, seats).map((mark) => ({
    seatId: mark.seatId,
    start: mark.start + offset,
    end: mark.end + offset,
  }));
}
