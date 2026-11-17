/**
 * The zoom limits and the whole-turn rounding the line charts and the stance strip share.
 *
 * Purpose: Every chart in the charts dialog zooms by the same wheel step down to the same narrowest view, so the numbers are defined once.
 * When to use: The wheel and drag handlers in `lineChart.ts` and `relationshipTimeline.ts`.
 * Expected outcome: Two constants and one pure function. Nothing touches the DOM.
 * Exceptions: None.
 */

import type { TurnRange } from '../../shared/matchChartSeries';

/**
 * The smallest span, in turns, a wheel zoom may reach, measured as the last turn shown minus the first.
 *
 * Purpose: A chart zoomed to one turn has nothing to read. A span of 2 leaves three turns in view.
 * When to use: The `minSpan` of every `zoomedTurnRange` call in the charts dialog.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const MIN_ZOOM_SPAN_TURNS = 2;

/**
 * The span multiplier for one wheel step that zooms in.
 *
 * Purpose: Scrolling up narrows the visible turns by the same step on every chart.
 * When to use: The wheel handlers. Zooming out uses its reciprocal.
 * Expected outcome: 0.8.
 * Exceptions: None.
 */
export const WHEEL_ZOOM_IN_FACTOR = 0.8;

/**
 * Rounds a visible range to whole turns inside the full range.
 *
 * Purpose: The stance strip draws one cell per turn and labels turns a whole number of steps from the first one shown. Zoom and pan produce fractional ranges, which would leave a sliver of a cell and drop every label.
 * When to use: Before the stance strip stores a range from a wheel step, a drag step, or a data update.
 * Expected outcome: A range with whole-number ends, a span of at least `MIN_ZOOM_SPAN_TURNS` (or the full span when that is shorter), and both ends inside `full`.
 * Exceptions: None.
 */
export function wholeTurnRange(range: TurnRange, full: TurnRange): TurnRange {
  const fullSpan = full.max - full.min;
  const span = Math.min(fullSpan, Math.max(MIN_ZOOM_SPAN_TURNS, Math.round(range.max - range.min)));
  const min = Math.min(Math.max(Math.round(range.min), full.min), full.max - span);
  return { min, max: min + span };
}
