/**
 * The types of a strip timeline.
 *
 * Purpose: The shared strip core, the stance strip, and the agreements strip describe rows, cells, tooltips, and arguments with the same shapes.
 * When to use: Importing a type of a strip timeline. The core re-exports every type here.
 * Expected outcome: Types only.
 * Exceptions: None.
 */

/**
 * One row of a strip.
 *
 * Contract: One cell per turn of the strip's `turns`.
 * When to use: `StripTimelineData.rows`.
 * Expected outcome: The seat id that labels the row and its cells.
 * Exceptions: None.
 */
export interface StripTimelineRow<Cell> {
  /**
   * The seat the row belongs to.
   *
   * Contract: A seat id.
   * When to use: The row label.
   * Expected outcome: Named with `nameOf` and flagged with `flagOf`.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The row's cells.
   *
   * Contract: Same length as the strip's turns.
   * When to use: Painting.
   * Expected outcome: One cell per turn.
   * Exceptions: None.
   */
  readonly cells: readonly Cell[];
}

/**
 * The data a strip draws.
 *
 * Contract: Every row has one cell per turn.
 * When to use: `StripTimelineHandle.update`.
 * Expected outcome: The turn axis and the rows.
 * Exceptions: None.
 */
export interface StripTimelineData<Cell> {
  /**
   * The turn numbers on the axis.
   *
   * Contract: Ascending.
   * When to use: The horizontal axis and the zoom extent.
   * Expected outcome: A list of turn numbers.
   * Exceptions: None.
   */
  readonly turns: readonly number[];
  /**
   * The rows in drawing order.
   *
   * Contract: May be empty.
   * When to use: Painting rows and labels.
   * Expected outcome: A list of rows.
   * Exceptions: None.
   */
  readonly rows: readonly StripTimelineRow<Cell>[];
}

/**
 * The rectangle of one cell on the canvas.
 *
 * Contract: In CSS pixels, with the context already scaled.
 * When to use: `CreateStripTimelineArgs.paintCell`.
 * Expected outcome: The full cell. A painter keeps its own 1 pixel gap between rows.
 * Exceptions: None.
 */
export interface StripCellRect {
  /**
   * The left edge.
   *
   * Contract: A number of pixels.
   * When to use: Painting.
   * Expected outcome: The cell's x.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * The top edge.
   *
   * Contract: A number of pixels.
   * When to use: Painting.
   * Expected outcome: The cell's y.
   * Exceptions: None.
   */
  readonly y: number;
  /**
   * The cell width.
   *
   * Contract: A number of pixels.
   * When to use: Painting.
   * Expected outcome: The cell's width.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * The row height.
   *
   * Contract: A number of pixels.
   * When to use: Painting.
   * Expected outcome: The cell's height.
   * Exceptions: None.
   */
  readonly height: number;
}

/**
 * One line of a strip tooltip.
 *
 * Contract: Plain text.
 * When to use: `StripTooltipContent.lines`.
 * Expected outcome: The text, an optional bold lead-in, whether it is a list item, and whether it starts a spaced group.
 * Exceptions: None.
 */
export interface StripTooltipLine {
  /**
   * The text of the line.
   *
   * Contract: Plain text, set with `textContent`.
   * When to use: Drawing the tooltip.
   * Expected outcome: A sentence.
   * Exceptions: None.
   */
  readonly text: string;
  /**
   * Bold text drawn before `text`.
   *
   * Contract: Plain text, set with `textContent` in a span with the class `charts-tooltip-lead`. Omitted for a line with no lead-in.
   * When to use: Drawing the tooltip.
   * Expected outcome: The lead, one space, then `text`.
   * Exceptions: None.
   */
  readonly lead?: string;
  /**
   * Whether the line is a bullet in a list.
   *
   * Contract: Consecutive bullet lines are drawn as the items of one `ul` with the class `charts-tooltip-list`.
   * When to use: Drawing the tooltip.
   * Expected outcome: A flag. Omitted means false.
   * Exceptions: None.
   */
  readonly bullet?: boolean;
  /**
   * Whether the line starts a spaced group.
   *
   * Contract: Adds the class `charts-tooltip-emphasis`, which puts space above the line.
   * When to use: Drawing the tooltip.
   * Expected outcome: A flag.
   * Exceptions: None.
   */
  readonly emphasis: boolean;
}

/**
 * The content of a strip tooltip.
 *
 * Contract: A heading and lines.
 * When to use: The result of `CreateStripTimelineArgs.tooltipAt`.
 * Expected outcome: Plain data the core draws.
 * Exceptions: None.
 */
export interface StripTooltipContent {
  /**
   * The heading.
   *
   * Contract: Plain text.
   * When to use: The first tooltip line.
   * Expected outcome: A short text.
   * Exceptions: None.
   */
  readonly heading: string;
  /**
   * The lines under the heading.
   *
   * Contract: May be empty.
   * When to use: Below the heading.
   * Expected outcome: A list of lines.
   * Exceptions: None.
   */
  readonly lines: readonly StripTooltipLine[];
}

/**
 * What a caller controls about a strip.
 *
 * Contract: The host is empty and in the document.
 * When to use: `createStripTimeline`.
 * Expected outcome: Enough to build the strip.
 * Exceptions: None.
 */
export interface CreateStripTimelineArgs<Cell> {
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
   * When to use: Row labels.
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
   * The sentence shown when the strip has no rows.
   *
   * Contract: Plain text.
   * When to use: A strip with no rows.
   * Expected outcome: Shown in place of the canvas.
   * Exceptions: None.
   */
  readonly emptyText: string;
  /**
   * Paints one cell.
   *
   * Contract: Called between `save` and `restore`, with the font, alignment, and baseline already set.
   * When to use: Every visible cell on every draw.
   * Expected outcome: The cell is drawn inside its rectangle.
   * Exceptions: None.
   */
  readonly paintCell: (context: CanvasRenderingContext2D, cell: Cell, rect: StripCellRect) => void;
  /**
   * Gives the tooltip for the cell under the pointer.
   *
   * Contract: The row index is null over the axis. Returns null to hide the tooltip.
   * When to use: Each pointer move over a recorded turn.
   * Expected outcome: The tooltip content or null.
   * Exceptions: None.
   */
  readonly tooltipAt: (turnIndex: number, rowIndex: number | null) => StripTooltipContent | null;
  /**
   * Whether the tooltip wraps and opens above the pointer near the bottom of the dialog.
   *
   * Contract: Optional. Missing means false.
   * When to use: A tooltip that can be long.
   * Expected outcome: True adds the class `charts-tooltip-wrap` and keeps the tooltip inside the dialog body.
   * Exceptions: None.
   */
  readonly wrapTooltip?: boolean;
}

/**
 * What a caller can do with a strip.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Refreshing, resizing, and closing.
 * Expected outcome: Three operations.
 * Exceptions: None.
 */
export interface StripTimelineHandle<Cell> {
  /**
   * Replaces the data and keeps the zoom range when zoomed.
   *
   * Contract: A strip with no rows shows the empty text.
   * When to use: A refresh or a filter change.
   * Expected outcome: The strip redraws.
   * Exceptions: None.
   */
  update(data: StripTimelineData<Cell>): void;
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
