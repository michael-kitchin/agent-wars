/**
 * The shapes the chart data rules take and return.
 *
 * Purpose: The rules in `matchChartSeries.ts` and the chart modules share these types without a cycle.
 * When to use: Importing a chart data type.
 * Expected outcome: Types only. This module has no runtime code.
 * Exceptions: None.
 */

import type { SideStance } from './sideMessages';

/**
 * The line charts the dialog can draw.
 *
 * Purpose: Names the nine charts that plot one number per side per turn.
 * When to use: Choosing a series in `lineChartData`.
 * Expected outcome: One of the nine ids.
 * Exceptions: None.
 */
export type LineChartId =
  | 'built-units'
  | 'mercenary-units'
  | 'hexes'
  | 'production'
  | 'stored-points'
  | 'treasury'
  | 'upkeep'
  | 'units-lost'
  | 'model-cost';

/**
 * One side's line on a chart.
 *
 * Contract: `values` has one entry per chart turn, null where there is no data.
 * When to use: Drawing a line and a tooltip row.
 * Expected outcome: The seat id and its values.
 * Exceptions: None.
 */
export interface LineChartSeries {
  /**
   * The seat the line belongs to.
   *
   * Contract: A seat id.
   * When to use: Choosing the line's color and name.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The value at each turn.
   *
   * Contract: Same length as `LineChartData.turns`. Null is a gap.
   * When to use: Plotting.
   * Expected outcome: Numbers and nulls.
   * Exceptions: None.
   */
  readonly values: readonly (number | null)[];
}

/**
 * Everything one line chart draws.
 *
 * Contract: Every series has one value per turn.
 * When to use: Creating and updating a line chart.
 * Expected outcome: The turns and one series per side.
 * Exceptions: None.
 */
export interface LineChartData {
  /**
   * The strategic turns on the X axis, in order.
   *
   * Contract: Every turn recorded in the snapshot.
   * When to use: X values.
   * Expected outcome: Turn numbers.
   * Exceptions: None.
   */
  readonly turns: readonly number[];
  /**
   * One line per side, in side order.
   *
   * Contract: The model cost chart lists AI seats only.
   * When to use: Y values.
   * Expected outcome: The series.
   * Exceptions: None.
   */
  readonly series: readonly LineChartSeries[];
}

/**
 * The text a chart tooltip shows.
 *
 * Contract: Built by `chartTooltip`.
 * When to use: Filling the tooltip element.
 * Expected outcome: A heading, one line per side, and a total line.
 * Exceptions: None.
 */
export interface ChartTooltipText {
  /**
   * The tooltip heading.
   *
   * Contract: `Turn {n}`.
   * When to use: The first line.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly heading: string;
  /**
   * One line per series.
   *
   * Contract: `{name}: {value}`, or `{name}: no data`.
   * When to use: Rows under the heading.
   * Expected outcome: Text lines in series order.
   * Exceptions: None.
   */
  readonly lines: readonly string[];
  /**
   * The total line.
   *
   * Contract: `Total: {sum}` over the non-null values.
   * When to use: The last line.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly total: string;
}

/**
 * A closed range of strategic turns.
 *
 * Contract: `min` is at most `max`.
 * When to use: The visible part of a chart's X axis.
 * Expected outcome: Two turn numbers.
 * Exceptions: None.
 */
export interface TurnRange {
  /**
   * The first visible turn.
   *
   * Contract: At most `max`.
   * When to use: The left edge.
   * Expected outcome: A turn number.
   * Exceptions: None.
   */
  readonly min: number;
  /**
   * The last visible turn.
   *
   * Contract: At least `min`.
   * When to use: The right edge.
   * Expected outcome: A turn number.
   * Exceptions: None.
   */
  readonly max: number;
}

/**
 * Inputs to `zoomedTurnRange`.
 *
 * Contract: `factor` is positive. Below 1 zooms in.
 * When to use: A wheel step over a chart.
 * Expected outcome: Enough to compute the new range.
 * Exceptions: None.
 */
export interface ZoomTurnRangeArgs {
  /**
   * The range now visible.
   *
   * Contract: Inside `full`.
   * When to use: The starting point.
   * Expected outcome: A range.
   * Exceptions: None.
   */
  readonly range: TurnRange;
  /**
   * Every turn the chart has.
   *
   * Contract: The limit of any result.
   * When to use: Clamping.
   * Expected outcome: A range.
   * Exceptions: None.
   */
  readonly full: TurnRange;
  /**
   * The turn under the pointer.
   *
   * Contract: A turn, not always a whole one.
   * When to use: Keeping that turn at the same relative position.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly anchor: number;
  /**
   * The multiplier for the span.
   *
   * Contract: Positive. Below 1 zooms in.
   * When to use: Scaling the span.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly factor: number;
  /**
   * The narrowest span a zoom may reach.
   *
   * Contract: Positive.
   * When to use: Stopping a zoom.
   * Expected outcome: A number of turns.
   * Exceptions: None.
   */
  readonly minSpan: number;
}

/**
 * Inputs to `pannedTurnRange`.
 *
 * Contract: `deltaTurns` is positive to move right.
 * When to use: A drag over a chart.
 * Expected outcome: Enough to compute the new range.
 * Exceptions: None.
 */
export interface PanTurnRangeArgs {
  /**
   * The range now visible.
   *
   * Contract: Inside `full`.
   * When to use: The starting point.
   * Expected outcome: A range.
   * Exceptions: None.
   */
  readonly range: TurnRange;
  /**
   * Every turn the chart has.
   *
   * Contract: The limit of any result.
   * When to use: Clamping.
   * Expected outcome: A range.
   * Exceptions: None.
   */
  readonly full: TurnRange;
  /**
   * How far to move, in turns.
   *
   * Contract: Positive moves right.
   * When to use: Shifting the range.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly deltaTurns: number;
}

/**
 * How old a relationship report is.
 *
 * Contract: `none` means the commander never reported.
 * When to use: Styling a spoke and a row.
 * Expected outcome: One of three words.
 * Exceptions: None.
 */
export type ReportAge = 'fresh' | 'old' | 'none';

/**
 * One commander's view of the subject side, for the row card and the spokes.
 *
 * Contract: Every figure is null when the commander has not reported it.
 * When to use: Drawing one row and one spoke.
 * Expected outcome: Stance, trust, threat, hexes taken, and the report's age.
 * Exceptions: None.
 */
export interface RelationshipRow {
  /**
   * The commander reporting.
   *
   * Contract: An AI seat id other than the subject.
   * When to use: Naming the row.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly reporterSeatId: string;
  /**
   * The reporter's stance toward the subject.
   *
   * Contract: Null with no report.
   * When to use: The pill and the spoke color.
   * Expected outcome: A stance or null.
   * Exceptions: None.
   */
  readonly stance: SideStance | null;
  /**
   * The reporter's trust in the subject.
   *
   * Contract: Null when never reported.
   * When to use: The trust bar and the spoke width.
   * Expected outcome: A whole number or null.
   * Exceptions: None.
   */
  readonly trust: number | null;
  /**
   * The reporter's threat score for the subject.
   *
   * Contract: Null when never reported.
   * When to use: The threat bar.
   * Expected outcome: A whole number or null.
   * Exceptions: None.
   */
  readonly threat: number | null;
  /**
   * Hexes the reporter took from the subject in the recent window.
   *
   * Contract: Null when every turn in the window is unknown.
   * When to use: The Taken column.
   * Expected outcome: A whole number or null.
   * Exceptions: None.
   */
  readonly hexesTaken: number | null;
  /**
   * The turn the report was written.
   *
   * Contract: Null with no report.
   * When to use: The As of column.
   * Expected outcome: A turn number or null.
   * Exceptions: None.
   */
  readonly reportedTurn: number | null;
  /**
   * How old the report is.
   *
   * Contract: `none` exactly when `reportedTurn` is null.
   * When to use: Dashes and the old marker.
   * Expected outcome: `fresh`, `old`, or `none`.
   * Exceptions: None.
   */
  readonly age: ReportAge;
}

/**
 * One cell of the stance strip.
 *
 * Contract: A null stance is an empty cell.
 * When to use: Drawing one turn of one reporter.
 * Expected outcome: The stance and whether it was newly reported.
 * Exceptions: None.
 */
export interface StripCell {
  /**
   * The reporter's stance in that turn's statistics.
   *
   * Contract: Null with no report.
   * When to use: Cell color.
   * Expected outcome: A stance or null.
   * Exceptions: None.
   */
  readonly stance: SideStance | null;
  /**
   * Whether the commander reported this stance at this step.
   *
   * Contract: False for a carried-over stance and for a null cell.
   * When to use: Lightening carried-over cells.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly reportedThisTurn: boolean;
}

/**
 * One reporter's row on the strip.
 *
 * Contract: `cells` has one entry per strip turn.
 * When to use: Drawing a row.
 * Expected outcome: The reporter and its cells.
 * Exceptions: None.
 */
export interface StripRow {
  /**
   * The commander reporting.
   *
   * Contract: An AI seat id other than the subject.
   * When to use: The row label.
   * Expected outcome: The seat id.
   * Exceptions: None.
   */
  readonly reporterSeatId: string;
  /**
   * One cell per turn.
   *
   * Contract: Same length as `RelationshipStrip.turns`.
   * When to use: Drawing the row.
   * Expected outcome: The cells.
   * Exceptions: None.
   */
  readonly cells: readonly StripCell[];
}

/**
 * Everything the stance strip draws.
 *
 * Contract: Every row has one cell per turn.
 * When to use: Creating and updating the strip.
 * Expected outcome: The turns and one row per reporter.
 * Exceptions: None.
 */
export interface RelationshipStrip {
  /**
   * The strategic turns, in order.
   *
   * Contract: Every recorded turn.
   * When to use: The strip's axis.
   * Expected outcome: Turn numbers.
   * Exceptions: None.
   */
  readonly turns: readonly number[];
  /**
   * One row per reporter, in side order.
   *
   * Contract: AI seats other than the subject.
   * When to use: Drawing the rows.
   * Expected outcome: The rows.
   * Exceptions: None.
   */
  readonly rows: readonly StripRow[];
}

/**
 * A point on the spoke graph.
 *
 * Contract: Screen coordinates around the origin, with y growing downward.
 * When to use: Placing a reporter's node.
 * Expected outcome: Two numbers.
 * Exceptions: None.
 */
export interface SpokePosition {
  /**
   * The horizontal offset from the center.
   *
   * Contract: Positive is right.
   * When to use: Node placement.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * The vertical offset from the center.
   *
   * Contract: Positive is down.
   * When to use: Node placement.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly y: number;
}
