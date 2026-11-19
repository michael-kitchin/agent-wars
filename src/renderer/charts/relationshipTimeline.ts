/**
 * The stance strip: one row of cells per reporting commander, one cell per turn.
 *
 * Purpose: Shows how each commander's stance toward one side changed over the match, and which turns carry a stance forward from an earlier report.
 * When to use: The charts dialog builds one strip with a subject selector.
 * Expected outcome: A canvas with DOM labels beside it, built on `createStripTimeline`. It opens on a window of at most 12 turns (`initialTurnWindow`). Wheel zooms, drag pans, double-click zooms all the way out, and a tooltip names the stance per reporter.
 * Exceptions: None.
 */

import type { RelationshipStrip } from '../../shared/matchChartSeries';
import type { StripCell } from '../../shared/matchChartSeriesTypes';
import { createStripTimeline, stripCssColor, type StripCellRect } from './stripTimelineCore';

/**
 * The narrowest cell that still shows the stance's first letter.
 *
 * Purpose: A letter in a narrower cell cannot be read.
 * When to use: Drawing cells.
 * Expected outcome: 14 pixels.
 * Exceptions: None.
 */
const LETTER_MIN_CELL_WIDTH = 14;

/**
 * What a caller controls about the strip.
 *
 * Contract: The host is empty and in the document.
 * When to use: `createRelationshipTimeline`.
 * Expected outcome: Enough to build the strip.
 * Exceptions: None.
 */
export interface CreateRelationshipTimelineArgs {
  /**
   * The element the strip is drawn inside.
   *
   * Contract: Empty and positioned.
   * When to use: Mounting the labels, canvas, and tooltip.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly host: HTMLElement;
  /**
   * The strip's total width in CSS pixels, labels included.
   *
   * Contract: Positive.
   * When to use: Sizing the canvas.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * The height available for the rows and the axis.
   *
   * Contract: Not above a quarter of the dialog less the title row.
   * When to use: Choosing the row height.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly height: number;
  /**
   * Gives a side's name.
   *
   * Contract: Returns the name shown on screen.
   * When to use: Labels and tooltip lines.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Gives a side's numbered flag.
   *
   * Contract: Returns a new element, or null.
   * When to use: Labels.
   * Expected outcome: A flag element or null.
   * Exceptions: None.
   */
  readonly flagOf: (seatId: string) => HTMLElement | null;
}

/**
 * What a caller can do with the strip.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Changing the subject, refreshing, resizing, and closing.
 * Expected outcome: Three operations.
 * Exceptions: None.
 */
export interface RelationshipTimelineHandle {
  /**
   * Replaces the strip and keeps the zoom range when zoomed.
   *
   * Contract: A strip with no rows shows `No AI commander reports on this side.`.
   * When to use: A subject change and a refresh.
   * Expected outcome: The strip redraws.
   * Exceptions: None.
   */
  update(strip: RelationshipStrip): void;
  /**
   * Resizes the strip.
   *
   * Contract: Sizes are in CSS pixels.
   * When to use: A window resize while the dialog is open.
   * Expected outcome: The strip redraws.
   * Exceptions: None.
   */
  resize(width: number, height: number): void;
  /**
   * Removes the strip and its listeners.
   *
   * Contract: Safe to call once.
   * When to use: Closing the dialog.
   * Expected outcome: The host is empty.
   * Exceptions: None.
   */
  destroy(): void;
}

/**
 * Paints one stance cell.
 *
 * Purpose: A fresh report is a solid cell, a carried stance is the same color at 45% opacity, and no report is an outline.
 * When to use: As the painter of the stance strip's core.
 * Expected outcome: The cell is drawn inside its rectangle, with the stance's first letter when the cell is wide enough.
 * Exceptions: None.
 */
function paintStanceCell(context: CanvasRenderingContext2D, cell: StripCell, rect: StripCellRect): void {
  const { x, y, width, height } = rect;
  if (cell.stance === null) {
    context.strokeStyle = stripCssColor('--chrome-muted', '#b7c4d4');
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), height - 1);
    return;
  }
  context.globalAlpha = cell.reportedThisTurn ? 1 : 0.45;
  context.fillStyle = stripCssColor(`--stance-${cell.stance}`, '#9AA5A3');
  context.fillRect(x, y, width, height - 1);
  context.globalAlpha = 1;
  if (width >= LETTER_MIN_CELL_WIDTH) {
    context.fillStyle = '#10161d';
    context.fillText(cell.stance.charAt(0).toUpperCase(), x + width / 2, y + height / 2);
  }
}

/**
 * Creates the stance strip.
 *
 * Purpose: Draws every reporter's stance per turn, with carried-over stances lighter than fresh reports.
 * When to use: The charts dialog, once.
 * Expected outcome: A handle. Nothing is drawn until `update` is called.
 * Exceptions: None.
 */
export function createRelationshipTimeline(args: CreateRelationshipTimelineArgs): RelationshipTimelineHandle {
  let strip: RelationshipStrip = { turns: [], rows: [] };
  const core = createStripTimeline<StripCell>({
    host: args.host,
    width: args.width,
    height: args.height,
    nameOf: args.nameOf,
    flagOf: args.flagOf,
    emptyText: 'No AI commander reports on this side.',
    paintCell: paintStanceCell,
    tooltipAt: (turnIndex) => ({
      heading: `Turn ${strip.turns[turnIndex]}`,
      lines: strip.rows.map((row) => {
        const cell = row.cells[turnIndex];
        const name = args.nameOf(row.reporterSeatId);
        return {
          text:
            cell.stance === null
              ? `${name}: no report`
              : `${name}: ${cell.stance} (${cell.reportedThisTurn ? 'reported this turn' : 'from an earlier turn'})`,
          emphasis: false,
        };
      }),
    }),
  });
  return {
    update(next: RelationshipStrip): void {
      strip = next;
      core.update({ turns: next.turns, rows: next.rows.map((row) => ({ seatId: row.reporterSeatId, cells: row.cells })) });
    },
    resize: (width: number, height: number): void => core.resize(width, height),
    destroy: (): void => core.destroy(),
  };
}
