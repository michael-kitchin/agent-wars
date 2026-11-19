/**
 * The agreements strip: one row of cells per AI commander, one cell per turn.
 *
 * Purpose: Shows how many agreements each commander held at each turn, with marks for proposals, breaches, and agreements the other side does not record.
 * When to use: The charts dialog builds one strip inside the agreements block.
 * Expected outcome: A canvas with DOM labels beside it, built on `createStripTimeline`, with the same zoom, pan, and opening window as the stance strip.
 * Exceptions: None.
 */

import { agreementCellLabel, agreementCellShortLabel, agreementCellTooltip } from '../../shared/agreementStripText';
import type { AgreementCell, AgreementStrip } from '../../shared/agreementStrip';
import { createStripTimeline, stripCssColor, type StripCellRect } from './stripTimelineCore';

/**
 * The smallest gap between a label and the edges of its cell.
 *
 * Purpose: A label that touches the cell edges cannot be read.
 * When to use: Choosing between the full label, the short label, and none.
 * Expected outcome: 4 pixels, counted once against the measured label width.
 * Exceptions: None.
 */
const LABEL_PADDING = 4;

/**
 * The distance between hatching lines.
 *
 * Purpose: Breach hatching is drawn as diagonal lines at 45 degrees.
 * When to use: Painting a breached cell.
 * Expected outcome: 5 pixels.
 * Exceptions: None.
 */
const HATCH_SPACING = 5;

/**
 * The longest leg of the mismatch triangle.
 *
 * Purpose: The amber corner stays small. A narrow cell uses a third of its width instead.
 * When to use: Painting a mismatched cell.
 * Expected outcome: 6 pixels.
 * Exceptions: None.
 */
const MISMATCH_LEG_MAX = 6;

/**
 * What a caller controls about the strip.
 *
 * Contract: The host is empty and in the document.
 * When to use: `createAgreementTimeline`.
 * Expected outcome: Enough to build the strip.
 * Exceptions: None.
 */
export interface CreateAgreementTimelineArgs {
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
   * Contract: Not above a quarter of the dialog less the title row and the legend.
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
 * When to use: Refreshing, resizing, and closing.
 * Expected outcome: Three operations.
 * Exceptions: None.
 */
export interface AgreementTimelineHandle {
  /**
   * Replaces the strip and keeps the zoom range when zoomed.
   *
   * Contract: A strip with no rows shows `No AI commander to show.`. The text function turns side codes into names for the tooltip.
   * When to use: A filter change and a refresh.
   * Expected outcome: The strip redraws.
   * Exceptions: None.
   */
  update(strip: AgreementStrip, displayText: (text: string) => string): void;
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
 * Picks the fill color for a count of active agreements.
 *
 * Purpose: One hue from light to dark shows one, two, or three or more agreements.
 * When to use: Painting a cell with at least one active agreement.
 * Expected outcome: The color of `--agreement-1`, `--agreement-2`, or `--agreement-3`.
 * Exceptions: None.
 */
function fillColorFor(activeCount: number): string {
  const level = Math.min(3, activeCount);
  return stripCssColor(`--agreement-${level}`, ['#4f6f99', '#7d9cc4', '#b3c9e6'][level - 1]);
}

/**
 * Draws diagonal hatching inside a cell.
 *
 * Purpose: A breach is marked by lines, not by color alone.
 * When to use: Painting a breached cell.
 * Expected outcome: 45 degree lines every `HATCH_SPACING` pixels, clipped to the cell.
 * Exceptions: None.
 */
function paintHatching(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.strokeStyle = stripCssColor('--chrome-error', '#f0a8a8');
  context.lineWidth = 1;
  context.beginPath();
  for (let offset = -height; offset < width; offset += HATCH_SPACING) {
    context.moveTo(x + offset, y + height);
    context.lineTo(x + offset + height, y);
  }
  context.stroke();
}

/**
 * Draws the cell label when it fits.
 *
 * Purpose: The full label shows when it fits, the short label when only that fits, and nothing otherwise.
 * When to use: Last step of painting a cell.
 * Expected outcome: Centered text in the cell, dark on the two lighter fills.
 * Exceptions: None.
 */
function paintLabel(context: CanvasRenderingContext2D, cell: AgreementCell, rect: StripCellRect): void {
  const { x, y, width, height } = rect;
  const fits = (text: string): boolean => text !== '' && context.measureText(text).width + LABEL_PADDING <= width;
  const full = agreementCellLabel(cell);
  const label = fits(full) ? full : agreementCellShortLabel(cell);
  if (!fits(label)) return;
  context.fillStyle = cell.activeCount >= 2 ? '#10161d' : stripCssColor('--chrome-text', '#f4f6f8');
  context.fillText(label, x + width / 2, y + height / 2);
}

/**
 * Paints one agreement cell.
 *
 * Purpose: Fill by count, outline for an empty cell or a proposal, hatching for a breach, a corner for a mismatch, then the label.
 * When to use: As the painter of the agreements strip's core.
 * Expected outcome: Every mark stays inside the cell's height less the 1 pixel row gap.
 * Exceptions: None.
 */
function paintAgreementCell(context: CanvasRenderingContext2D, cell: AgreementCell, rect: StripCellRect): void {
  const { x, y, width } = rect;
  const height = rect.height - 1;
  if (cell.activeCount > 0) {
    context.fillStyle = fillColorFor(cell.activeCount);
    context.fillRect(x, y, width, height);
  }
  context.lineWidth = 1;
  if (cell.proposedCount > 0) {
    context.strokeStyle = stripCssColor('--chrome-accent-edge', '#7dcec8');
    context.setLineDash([3, 2]);
    context.strokeRect(x + 2.5, y + 2.5, Math.max(0, width - 5), Math.max(0, height - 5));
    context.setLineDash([]);
  } else if (cell.activeCount === 0) {
    context.strokeStyle = stripCssColor('--chrome-muted', '#b7c4d4');
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), height - 1);
  }
  if (cell.breached) {
    context.save();
    paintHatching(context, x, y, width, height);
    context.restore();
    context.strokeStyle = stripCssColor('--chrome-error', '#f0a8a8');
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 2));
  }
  if (cell.mismatched) {
    const leg = Math.min(MISMATCH_LEG_MAX, width / 3);
    context.fillStyle = stripCssColor('--stance-wary', '#EF9F27');
    context.beginPath();
    context.moveTo(x + width - leg, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + leg);
    context.closePath();
    context.fill();
  }
  paintLabel(context, cell, { x, y, width, height: rect.height });
}

/**
 * Creates the agreements strip.
 *
 * Purpose: Draws every commander's agreements per turn, with a tooltip listing every matching agreement.
 * When to use: The agreements block, once.
 * Expected outcome: A handle. Nothing is drawn until `update` is called.
 * Exceptions: None.
 */
export function createAgreementTimeline(args: CreateAgreementTimelineArgs): AgreementTimelineHandle {
  let strip: AgreementStrip = { turns: [], rows: [] };
  let displayText = (text: string): string => text;
  const core = createStripTimeline<AgreementCell>({
    host: args.host,
    width: args.width,
    height: args.height,
    nameOf: args.nameOf,
    flagOf: args.flagOf,
    emptyText: 'No AI commander to show.',
    wrapTooltip: true,
    paintCell: paintAgreementCell,
    tooltipAt: (turnIndex, rowIndex) => {
      if (rowIndex === null) return null;
      const row = strip.rows[rowIndex];
      return agreementCellTooltip({
        rowSeatId: row.seatId,
        turn: strip.turns[turnIndex],
        cell: row.cells[turnIndex],
        nameOf: args.nameOf,
        displayText,
      });
    },
  });
  return {
    update(next: AgreementStrip, nextDisplayText: (text: string) => string): void {
      strip = next;
      displayText = nextDisplayText;
      core.update(next);
    },
    resize: (width: number, height: number): void => core.resize(width, height),
    destroy: (): void => core.destroy(),
  };
}
