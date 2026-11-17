/**
 * The turn window the charts open on, and the extent they zoom and pan inside.
 *
 * Purpose: Every chart with turns on its X axis opens on the same window of at most 12 turns. A short series fills in from the left edge and leaves blank space on the right, and a long series opens on its newest turns.
 * When to use: The line charts and the stance strip in the charts dialog, when they are built, refreshed, zoomed, and panned.
 * Expected outcome: Pure functions over a list of recorded turn numbers. Nothing touches the DOM.
 * Exceptions: None.
 */

import { zoomedTurnRange, type TurnRange } from './matchChartSeries';

/**
 * How many turns a chart shows when the charts dialog opens.
 *
 * Purpose: Twelve points keep each point readable. A longer series scrolls to its newest turns, and a shorter one leaves blank space on the right.
 * When to use: `initialTurnWindow` and `zoomExtentTurnRange`.
 * Expected outcome: 12.
 * Exceptions: None.
 */
export const INITIAL_VISIBLE_TURNS = 12;

/**
 * Gives the turn the window starts from when no turn is recorded yet.
 *
 * Purpose: An empty chart still needs an X axis. A match starts on turn 1.
 * When to use: `initialTurnWindow` and `zoomExtentTurnRange` with an empty list.
 * Expected outcome: 1.
 * Exceptions: None.
 */
const FIRST_TURN_WHEN_EMPTY = 1;

/**
 * Gives the window a chart shows when the dialog opens.
 *
 * Purpose: Points fill in from the left edge (the first recorded turn) while the series has no more than `INITIAL_VISIBLE_TURNS` turns, and the window slides to the newest turns after that.
 * When to use: Building a chart, refreshing a chart the player has not zoomed or panned, and checking whether a zoom has returned to the opening view.
 * Expected outcome: A range `INITIAL_VISIBLE_TURNS - 1` turns wide. With 12 turns or fewer it starts at the first turn, so the blank space on the right shrinks as the series grows. With more it ends on the last turn. With no turns it is turn 1 through turn 12.
 * Exceptions: None.
 *
 * @param turns The recorded turn numbers, oldest first.
 */
export function initialTurnWindow(turns: readonly number[]): TurnRange {
  const span = INITIAL_VISIBLE_TURNS - 1;
  if (turns.length === 0) return { min: FIRST_TURN_WHEN_EMPTY, max: FIRST_TURN_WHEN_EMPTY + span };
  const first = turns[0];
  const last = turns[turns.length - 1];
  if (last - first <= span) return { min: first, max: first + span };
  return { min: last - span, max: last };
}

/**
 * Gives the widest range a chart may zoom out to and pan inside.
 *
 * Purpose: Zoom and pan stay inside the recorded turns, and never narrow the opening window of a short series, whose blank space is part of the view.
 * When to use: As the `full` range of `zoomedTurnRange`, `pannedTurnRange`, and `wholeTurnRange`.
 * Expected outcome: From the first recorded turn to the last, widened to `INITIAL_VISIBLE_TURNS` turns for a short series. With no turns it is turn 1 through turn 12.
 * Exceptions: None.
 *
 * @param turns The recorded turn numbers, oldest first.
 */
export function zoomExtentTurnRange(turns: readonly number[]): TurnRange {
  const opening = initialTurnWindow(turns);
  if (turns.length === 0) return opening;
  return { min: turns[0], max: Math.max(turns[turns.length - 1], opening.max) };
}

/**
 * Reports whether two turn ranges are the same.
 *
 * Purpose: A chart that has zoomed or panned back to its opening window follows the newest turns again.
 * When to use: After each zoom or pan, comparing the new range to `initialTurnWindow`.
 * Expected outcome: True when both ends match.
 * Exceptions: None.
 */
export function sameTurnRange(a: TurnRange, b: TurnRange): boolean {
  return a.min === b.min && a.max === b.max;
}

/**
 * What a chart knew before a refresh and what it knows now.
 *
 * Purpose: `refreshedTurnView` needs the old and new turns to tell a full zoom-out from a narrower zoom.
 * When to use: The argument of `refreshedTurnView`.
 * Expected outcome: A plain record.
 * Exceptions: None.
 */
export interface RefreshedTurnViewArgs {
  /**
   * The zoomed or panned range before the refresh.
   *
   * Contract: Null while the chart follows the opening window.
   * When to use: The range the player left.
   * Expected outcome: A range or null.
   * Exceptions: None.
   */
  readonly view: TurnRange | null;
  /**
   * The recorded turns before the refresh, oldest first.
   *
   * Contract: The turns `view` was chosen over.
   * When to use: Telling whether `view` was every turn.
   * Expected outcome: A list of turn numbers.
   * Exceptions: None.
   */
  readonly previousTurns: readonly number[];
  /**
   * The recorded turns after the refresh, oldest first.
   *
   * Contract: The turns the chart now draws.
   * When to use: The new extent and opening window.
   * Expected outcome: A list of turn numbers.
   * Exceptions: None.
   */
  readonly nextTurns: readonly number[];
  /**
   * The narrowest span a zoom may reach.
   *
   * Contract: The chart's own minimum, `MIN_ZOOM_SPAN_TURNS` in the charts dialog.
   * When to use: Keeping a narrow zoom inside the new extent.
   * Expected outcome: A positive number of turns.
   * Exceptions: None.
   */
  readonly minSpan: number;
}

/**
 * Gives the range a chart keeps after its turns are refreshed.
 *
 * Purpose: A chart the player has not zoomed follows the opening window. A chart zoomed all the way out keeps showing every turn as turns arrive. Any other zoom stays where the player left it.
 * When to use: The line charts and the stance strip, each time new data arrives.
 * Expected outcome: Null to follow the opening window. Otherwise the new zoom extent when the old view covered the old extent, or the old view moved inside the new extent. A result equal to the new opening window is null.
 * Exceptions: None.
 */
export function refreshedTurnView(args: RefreshedTurnViewArgs): TurnRange | null {
  const { view, previousTurns, nextTurns, minSpan } = args;
  if (view === null) return null;
  const full = zoomExtentTurnRange(nextTurns);
  const kept = sameTurnRange(view, zoomExtentTurnRange(previousTurns))
    ? full
    : zoomedTurnRange({ range: view, full, anchor: view.min, factor: 1, minSpan });
  return sameTurnRange(kept, initialTurnWindow(nextTurns)) ? null : kept;
}
