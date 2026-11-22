/**
 * The posture strip: one row per AI commander, one cell per turn, colored by posture.
 *
 * Purpose: Shows which posture each commander held every turn, whether the posture's lead activity ran, and whether the commander ever declared one.
 * When to use: The posture block of the charts dialog builds one strip.
 * Expected outcome: A canvas with DOM labels beside it, built on `createStripTimeline`. Cells hold no text. Wheel zooms, drag pans, double-click zooms all the way out, and a tooltip names the posture per commander.
 * Exceptions: None.
 */

import type { Posture } from '../../shared/postureTypes';
import { postureCellTooltipText, type PostureStrip, type PostureStripCell } from '../../shared/postureStrip';
import { createStripTimeline, stripCssColor, type StripCellRect } from './stripTimelineCore';

/**
 * The fill used when a posture's CSS variable is missing.
 *
 * Purpose: A cell is never drawn without a color, even before the style sheet loads.
 * When to use: `stripCssColor` fallbacks.
 * Expected outcome: One hex color per posture, the same as the style sheet's variable.
 * Exceptions: None.
 */
const POSTURE_FALLBACK_COLORS: Readonly<Record<Posture, string>> = {
  overland: '#C08A4E',
  maritime: '#4BA3E3',
  strangle: '#B07CD8',
  blitz: '#F2C14E',
};

/**
 * The opacity of a declared posture whose lead activity did not run.
 *
 * Purpose: Matches the stance strip's carried-over cells.
 * When to use: Painting declared idle cells.
 * Expected outcome: 0.45.
 * Exceptions: None.
 */
const IDLE_ALPHA = 0.45;

/**
 * What a caller controls about the strip.
 *
 * Contract: The host is empty and in the document.
 * When to use: `createPostureTimeline`.
 * Expected outcome: Enough to build the strip.
 * Exceptions: None.
 */
export interface CreatePostureTimelineArgs {
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
   * Contract: Not above a quarter of the dialog less the title row and legend.
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
  /**
   * Gives the last turn a side played.
   *
   * Contract: Returns null or undefined while the side is in the match.
   * When to use: Telling an out side from a missing report in tooltips.
   * Expected outcome: A turn number, null, or undefined.
   * Exceptions: None.
   */
  readonly outTurnOf: (seatId: string) => number | null | undefined;
}

/**
 * What a caller can do with the strip.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Refreshing, resizing, and closing.
 * Expected outcome: Three operations.
 * Exceptions: None.
 */
export interface PostureTimelineHandle {
  /**
   * Replaces the strip and keeps the zoom range when zoomed.
   *
   * Contract: A strip with no rows shows `No AI commander has a posture.`.
   * When to use: A refresh.
   * Expected outcome: The strip redraws.
   * Exceptions: None.
   */
  update(strip: PostureStrip): void;
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
 * Paints one posture cell.
 *
 * Purpose: A declared posture is filled in its color, full when its lead activity ran and light when it did not. The default posture is a colored outline, and a missing cell is a gray outline.
 * When to use: As the painter of the posture strip's core.
 * Expected outcome: The cell is drawn inside its rectangle with no text.
 * Exceptions: None.
 */
function paintPostureCell(context: CanvasRenderingContext2D, cell: PostureStripCell, rect: StripCellRect): void {
  const { x, y, width, height } = rect;
  if (cell.posture === null) {
    context.strokeStyle = stripCssColor('--chrome-muted', '#b7c4d4');
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, Math.max(0, width - 1), height - 1);
    return;
  }
  if (!cell.declared) {
    context.strokeStyle = stripCssColor('--posture-overland', POSTURE_FALLBACK_COLORS.overland);
    context.lineWidth = 2;
    context.strokeRect(x + 1, y + 1, Math.max(0, width - 2), Math.max(0, height - 3));
    return;
  }
  context.globalAlpha = cell.acting ? 1 : IDLE_ALPHA;
  context.fillStyle = stripCssColor(`--posture-${cell.posture}`, POSTURE_FALLBACK_COLORS[cell.posture]);
  context.fillRect(x, y, width, height - 1);
  context.globalAlpha = 1;
}

/**
 * Creates the posture strip.
 *
 * Purpose: Draws every AI commander's posture per turn.
 * When to use: The posture block of the charts dialog, once.
 * Expected outcome: A handle. Nothing is drawn until `update` is called.
 * Exceptions: None.
 */
export function createPostureTimeline(args: CreatePostureTimelineArgs): PostureTimelineHandle {
  let strip: PostureStrip = { turns: [], rows: [] };
  const core = createStripTimeline<PostureStripCell>({
    host: args.host,
    width: args.width,
    height: args.height,
    nameOf: args.nameOf,
    flagOf: args.flagOf,
    emptyText: 'No AI commander has a posture.',
    paintCell: paintPostureCell,
    tooltipAt: (turnIndex) => ({
      heading: `Turn ${strip.turns[turnIndex]}`,
      lines: strip.rows.map((row) => ({
        text: postureCellTooltipText({
          name: args.nameOf(row.seatId),
          cell: row.cells[turnIndex],
          outTurn: args.outTurnOf(row.seatId),
          turnNumber: strip.turns[turnIndex],
        }),
        emphasis: false,
      })),
    }),
  });
  return {
    update(next: PostureStrip): void {
      strip = next;
      core.update({ turns: next.turns, rows: next.rows });
    },
    resize: (width: number, height: number): void => core.resize(width, height),
    destroy: (): void => core.destroy(),
  };
}
