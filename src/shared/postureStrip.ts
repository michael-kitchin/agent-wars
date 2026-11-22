/**
 * The rules that turn a match statistics snapshot into the posture strip.
 *
 * Purpose: Rows, cells, and tooltip lines for the "Posture over time" strip are decided here, with no DOM, so tests can check them.
 * When to use: The charts dialog's posture strip.
 * Expected outcome: Pure functions over `MatchChartsSnapshot` and `TurnStatistics`. This module does not read the database or log.
 * Exceptions: None.
 */

import type { MatchChartsSnapshot, PostureReport, TurnStatistics } from './matchStatistics';
import { POSTURES, type Posture } from './postureTypes';

/**
 * One cell of the posture strip.
 *
 * Contract: `recorded` is false for a turn saved without posture reports. A recorded cell with a null posture means the seat has no report for that turn.
 * When to use: Choosing how to paint one commander's turn.
 * Expected outcome: Whether the turn is recorded, the posture, whether it was declared, and whether its lead activity ran.
 * Exceptions: None.
 */
export interface PostureStripCell {
  /**
   * Whether the turn carries posture reports.
   *
   * Contract: False when the turn has no valid `postures` list.
   * When to use: Drawing the gray not-recorded outline.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly recorded: boolean;
  /**
   * The posture in force, or null when the seat has no report.
   *
   * Contract: A member of `POSTURES` or null.
   * When to use: Choosing the cell's color.
   * Expected outcome: The posture or null.
   * Exceptions: None.
   */
  readonly posture: Posture | null;
  /**
   * Whether the commander declared the posture.
   *
   * Contract: False for the engine default and for cells without a report.
   * When to use: Choosing between a filled cell and the default outline.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly declared: boolean;
  /**
   * Whether the posture's lead activity ran that turn.
   *
   * Contract: False for cells without a report.
   * When to use: Choosing full or light color.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly acting: boolean;
}

/**
 * One row of the posture strip.
 *
 * Contract: One cell per recorded turn, in turn order.
 * When to use: Drawing one commander's row.
 * Expected outcome: The seat id and its cells.
 * Exceptions: None.
 */
export interface PostureStripRow {
  /**
   * The AI seat the row belongs to.
   *
   * Contract: An AI seat id.
   * When to use: Naming the row and finding its out turn.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The row's cells.
   *
   * Contract: The same length as `PostureStrip.turns`.
   * When to use: Drawing one cell per turn.
   * Expected outcome: One cell per turn.
   * Exceptions: None.
   */
  readonly cells: readonly PostureStripCell[];
}

/**
 * The whole posture strip.
 *
 * Contract: Rows are the AI seats in seat order. The human seat has no row.
 * When to use: Drawing the strip.
 * Expected outcome: The turn numbers and one row per AI seat.
 * Exceptions: None.
 */
export interface PostureStrip {
  /**
   * The recorded turn numbers.
   *
   * Contract: The same turns the other strips show.
   * When to use: Laying out columns and tooltip headings.
   * Expected outcome: Turn numbers in order.
   * Exceptions: None.
   */
  readonly turns: readonly number[];
  /**
   * The strip's rows.
   *
   * Contract: Sorted by seat order.
   * When to use: Drawing rows top to bottom.
   * Expected outcome: One row per AI seat.
   * Exceptions: None.
   */
  readonly rows: readonly PostureStripRow[];
}

/**
 * Arguments for one cell's tooltip line.
 *
 * Contract: `outTurn` is the seat's last played turn, or null or undefined while it is in the match.
 * When to use: Calling `postureCellTooltipText`.
 * Expected outcome: Everything the line needs.
 * Exceptions: None.
 */
export interface PostureCellTooltipArgs {
  /**
   * The commander's name.
   *
   * Contract: Non-empty text.
   * When to use: The start of the line.
   * Expected outcome: The name.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * The cell to describe.
   *
   * Contract: A cell from `postureStrip`.
   * When to use: Choosing the line's wording.
   * Expected outcome: The cell.
   * Exceptions: None.
   */
  readonly cell: PostureStripCell;
  /**
   * The seat's last played turn.
   *
   * Contract: Null or undefined while the seat is in the match.
   * When to use: Telling an out seat from a missing report.
   * Expected outcome: A turn number, null, or undefined.
   * Exceptions: None.
   */
  readonly outTurn: number | null | undefined;
  /**
   * The turn the cell belongs to.
   *
   * Contract: A recorded turn number.
   * When to use: Comparing with `outTurn`.
   * Expected outcome: The turn number.
   * Exceptions: None.
   */
  readonly turnNumber: number;
}

/**
 * The cell for a turn recorded without posture reports.
 *
 * Purpose: One shared value paints every not-recorded turn the same way, a gray outline with no posture.
 * When to use: In `postureStrip`, for a turn whose `postures` list is absent or not an array.
 * Expected outcome: A cell with `recorded` false, no posture, and both flags false.
 * Exceptions: None.
 */
const NOT_RECORDED_CELL: PostureStripCell = { recorded: false, posture: null, declared: false, acting: false };

/**
 * The cell for a recorded turn that has no report for the seat.
 *
 * Purpose: A seat missing from a recorded turn, such as one that left the match, reads as no report rather than as not recorded.
 * When to use: In `postureStrip`, when a recorded turn's list has no entry for the seat.
 * Expected outcome: A cell with `recorded` true, no posture, and both flags false.
 * Exceptions: None.
 */
const NO_REPORT_CELL: PostureStripCell = { recorded: true, posture: null, declared: false, acting: false };

/**
 * Checks one stored posture report.
 *
 * Purpose: A bad entry must not break the strip.
 * When to use: Filtering a stored `postures` list.
 * Expected outcome: True when the entry has a string seat id, a known posture, and boolean flags.
 * Exceptions: None.
 */
function isPostureReport(value: unknown): value is PostureReport {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.seatId === 'string' &&
    typeof entry.posture === 'string' &&
    (POSTURES as readonly string[]).includes(entry.posture) &&
    typeof entry.declared === 'boolean' &&
    typeof entry.acting === 'boolean'
  );
}

/**
 * Reads a turn's posture reports.
 *
 * Purpose: Turns recorded before posture reports existed, or with a damaged list, read as not recorded.
 * When to use: Before looking up a seat's report for a turn.
 * Expected outcome: The valid entries, or null when `postures` is absent or not an array.
 * Exceptions: None.
 */
export function postureReportsOf(turn: TurnStatistics): readonly PostureReport[] | null {
  const stored: unknown = turn.postures;
  return Array.isArray(stored) ? stored.filter(isPostureReport) : null;
}

/**
 * Builds the posture strip.
 *
 * Purpose: The strip shows each AI commander's posture over every recorded turn.
 * When to use: Creating or refreshing the strip.
 * Expected outcome: One row per AI seat in seat order and one cell per turn. A turn without reports gives not-recorded cells, and a seat missing from a recorded turn gives a no-report cell.
 * Exceptions: None.
 */
export function postureStrip(snapshot: MatchChartsSnapshot): PostureStrip {
  const reportsByTurn = snapshot.turns.map(postureReportsOf);
  return {
    turns: snapshot.turns.map((turn) => turn.turnNumber),
    rows: snapshot.seats
      .filter((seat) => seat.kind === 'ai')
      .sort((a, b) => a.seatOrder - b.seatOrder)
      .map((seat) => ({
        seatId: seat.seatId,
        cells: reportsByTurn.map((reports): PostureStripCell => {
          if (reports === null) {
            return NOT_RECORDED_CELL;
          }
          const report = reports.find((entry) => entry.seatId === seat.seatId);
          return report === undefined
            ? NO_REPORT_CELL
            : { recorded: true, posture: report.posture, declared: report.declared, acting: report.acting };
        }),
      })),
  };
}

/**
 * Words one cell's tooltip line.
 *
 * Purpose: The tooltip says what the cell's color and shading mean.
 * When to use: Hovering a cell of the strip.
 * Expected outcome: A line that starts with the commander's name.
 * Exceptions: None.
 */
export function postureCellTooltipText(args: PostureCellTooltipArgs): string {
  const { name, cell, outTurn, turnNumber } = args;
  if (!cell.recorded) {
    return `${name}: not recorded`;
  }
  if (cell.posture === null) {
    return outTurn != null && turnNumber >= outTurn ? `${name}: out of the match` : `${name}: no report`;
  }
  const activity = cell.acting ? 'acting' : 'idle';
  return cell.declared ? `${name}: ${cell.posture}, ${activity}` : `${name}: overland by default, ${activity}`;
}
