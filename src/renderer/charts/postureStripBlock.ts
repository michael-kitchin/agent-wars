/**
 * The posture block of the charts dialog: the strip and its legend.
 *
 * Purpose: Keeps the posture strip's drawing and text legend in one place, so the dialog only builds and refreshes it.
 * When to use: The charts dialog builds one block directly under the agreements block.
 * Expected outcome: The strip in the plot host and a legend paragraph after the plot host.
 * Exceptions: None.
 */

import type { MatchChartsSnapshot } from '../../shared/matchStatistics';
import { postureStrip } from '../../shared/postureStrip';
import { POSTURES } from '../../shared/postureTypes';
import { createPostureTimeline } from './postureTimeline';

/**
 * The explanation under the swatches.
 *
 * Purpose: Every mark on the strip has a plain-words explanation.
 * When to use: The legend paragraph, after the posture swatches.
 * Expected outcome: The exact text of the strip's legend.
 * Exceptions: None.
 */
const POSTURE_LEGEND_TEXT =
  "Full color: the posture's lead activity ran that turn. Light: declared, but that activity did not run. Colored outline: overland by default, never declared. Gray outline: not recorded, or out of the match. Lead activity: overland, the land campaign assaulting; maritime, a sea operation at sea or landed; strangle, a missile launched; blitz, an air operation.";

/**
 * What a caller controls about the block.
 *
 * Contract: The title row and plot host are in the document, in one block.
 * When to use: `createPostureStripBlock`.
 * Expected outcome: Enough to build the block.
 * Exceptions: None.
 */
export interface CreatePostureStripBlockArgs {
  /**
   * The block's title row.
   *
   * Contract: Holds the heading.
   * When to use: Measuring its height.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly titleRow: HTMLElement;
  /**
   * The block's plot host.
   *
   * Contract: Empty. The legend is appended directly after it.
   * When to use: Mounting the strip and the legend.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly plotHost: HTMLElement;
  /**
   * The strip's total width in CSS pixels.
   *
   * Contract: Positive.
   * When to use: Sizing the strip.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Gives the block's plot height for a title row height.
   *
   * Contract: Keeps the block within a quarter of the dialog.
   * When to use: Sizing the strip once the legend is in place.
   * Expected outcome: A height in pixels.
   * Exceptions: None.
   */
  readonly plotHeightFor: (titleRowHeight: number) => number;
  /**
   * Gives a side's name.
   *
   * Contract: Returns the name shown on screen.
   * When to use: Labels and tooltips.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Gives a side's numbered flag.
   *
   * Contract: Returns a new element, or null.
   * When to use: Row labels.
   * Expected outcome: A flag element or null.
   * Exceptions: None.
   */
  readonly flagOf: (seatId: string) => HTMLElement | null;
  /**
   * The snapshot the block starts with.
   *
   * Contract: Has at least one turn.
   * When to use: The first draw.
   * Expected outcome: The strip shows it.
   * Exceptions: None.
   */
  readonly snapshot: MatchChartsSnapshot;
}

/**
 * What a caller can do with the block.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Refreshing, resizing, measuring, and closing.
 * Expected outcome: Four members.
 * Exceptions: None.
 */
export interface PostureStripBlockHandle {
  /**
   * The block's title row.
   *
   * Contract: In the document while the dialog is open.
   * When to use: Measuring its height on resize.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly titleRow: HTMLElement;
  /**
   * Redraws the strip from a fresh snapshot.
   *
   * Contract: Keeps the zoom.
   * When to use: A refresh.
   * Expected outcome: The strip matches the snapshot.
   * Exceptions: None.
   */
  update(snapshot: MatchChartsSnapshot): void;
  /**
   * Resizes the block's strip.
   *
   * Contract: The height is the block's plot height, which includes the legend.
   * When to use: A window resize while the dialog is open.
   * Expected outcome: The strip fits the height less the legend.
   * Exceptions: None.
   */
  resize(width: number, height: number): void;
  /**
   * Removes the strip.
   *
   * Contract: Safe to call once.
   * When to use: Closing the dialog.
   * Expected outcome: The strip is destroyed.
   * Exceptions: None.
   */
  destroy(): void;
}

/**
 * Builds the legend paragraph.
 *
 * Purpose: Names each posture color and explains the shading.
 * When to use: Building the block.
 * Expected outcome: A `p.charts-posture-legend` with one swatch per posture, in `POSTURES` order, then the legend text. Built from DOM nodes only.
 * Exceptions: None.
 */
function buildLegend(): HTMLElement {
  const legend = document.createElement('p');
  legend.className = 'charts-posture-legend';
  for (const posture of POSTURES) {
    const swatch = document.createElement('span');
    swatch.className = 'charts-posture-swatch';
    swatch.style.background = `var(--posture-${posture})`;
    legend.append(swatch, `${posture} `);
  }
  legend.append(POSTURE_LEGEND_TEXT);
  return legend;
}

/**
 * Creates the posture block.
 *
 * Purpose: Draws the strip and the legend, and redraws the strip on a refresh.
 * When to use: The charts dialog, once, directly after the agreements block.
 * Expected outcome: A handle. The strip already shows the starting snapshot.
 * Exceptions: None.
 */
export function createPostureStripBlock(args: CreatePostureStripBlockArgs): PostureStripBlockHandle {
  const { titleRow, plotHost } = args;
  let snapshot = args.snapshot;
  const legend = buildLegend();
  plotHost.after(legend);

  /**
   * Measures the room the legend takes under the plot.
   *
   * Purpose: The block counts its legend toward the quarter-height rule, and the legend's top margin is part of that room.
   * When to use: Sizing or resizing the plot.
   * Expected outcome: The legend's height plus its top margin, in pixels.
   * Exceptions: None. A margin that does not parse counts as 0.
   */
  const legendSpace = (): number => legend.offsetHeight + (Number.parseFloat(getComputedStyle(legend).marginTop) || 0);

  const strip = createPostureTimeline({
    host: plotHost,
    width: args.width,
    height: Math.max(0, args.plotHeightFor(titleRow.offsetHeight) - legendSpace()),
    nameOf: args.nameOf,
    flagOf: args.flagOf,
    outTurnOf: (seatId) => snapshot.seats.find((seat) => seat.seatId === seatId)?.outTurn,
  });
  strip.update(postureStrip(snapshot));

  return {
    titleRow,
    update(next: MatchChartsSnapshot): void {
      snapshot = next;
      strip.update(postureStrip(snapshot));
    },
    resize(width: number, height: number): void {
      strip.resize(width, Math.max(0, height - legendSpace()));
    },
    destroy(): void {
      strip.destroy();
    },
  };
}
