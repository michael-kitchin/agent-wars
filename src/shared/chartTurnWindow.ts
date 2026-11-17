/**
 * The turn window the charts open on, and the extent they zoom and pan inside.
 *
 * Purpose: Every chart with turns on its X axis opens on the same window of at most 12 turns. A short series fills in from the left edge and leaves blank space on the right, and a long series opens on its newest turns.
 * When to use: The line charts and the stance strip in the charts dialog, when they are built, refreshed, zoomed, and panned.
 * Expected outcome: Pure functions over a list of recorded turn numbers. Nothing touches the DOM.
 * Exceptions: None.
 */

import type { TurnRange } from './matchChartSeries';

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
