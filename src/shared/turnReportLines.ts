/**
 * Sentences for one turn report when more than one side can win or lose.
 *
 * Purpose: The toast and the Reports entry name who took hexes.
 * When to use: After Ready, for the active human seat, or with a null viewer while observing.
 * Expected outcome: Hex sentences for the viewer, then the other update lines. A null viewer writes no "You" line.
 * Exceptions: None.
 */

import { isNeutralOwnerId } from './seatIds';
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
 * Expected outcome: Neutral is "Neutral". A known seat uses `shortSideName`. An unknown id is printed as itself.
 * Exceptions: None.
 */
function ownerName(ownerId: string, seats: readonly TurnReportSeat[]): string {
  if (isNeutralOwnerId(ownerId)) return 'Neutral';
  const seat = seats.find((row) => row.seatId === ownerId);
  return seat ? shortSideName(seat.homeRegion) : ownerId;
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
 * When to use: First lines of the report.
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
