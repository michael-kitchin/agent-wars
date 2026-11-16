/**
 * The rules that turn a match statistics snapshot into what the charts draw.
 *
 * Purpose: Series, tooltips, zoom and pan ranges, relationship rows, the stance strip, and spoke positions are decided here, with no DOM, so tests can check them.
 * When to use: The charts dialog and its chart modules.
 * Expected outcome: Pure functions over `MatchChartsSnapshot`. This module does not read the database or log.
 * Exceptions: None.
 */

import {
  HEXES_TAKEN_WINDOW_TURNS,
  STATISTIC_MERCENARY_TYPES,
  STATISTIC_UNIT_TYPES,
  totalUnits,
  type MatchChartsSnapshot,
  type SideStatistics,
  type TurnStatistics,
} from './matchStatistics';
import type {
  ChartTooltipText,
  LineChartData,
  LineChartId,
  PanTurnRangeArgs,
  RelationshipRow,
  RelationshipStrip,
  SpokePosition,
  StripCell,
  TurnRange,
  ZoomTurnRangeArgs,
} from './matchChartSeriesTypes';

export type * from './matchChartSeriesTypes';

/**
 * How many turns old a stance report may be and still count as fresh.
 *
 * Purpose: A commander reports only when its view changes, so a report a few turns old still describes the present.
 * When to use: Deciding a relationship row's `age`.
 * Expected outcome: 3. The comparison allows for statistics being written one turn before that turn's talk round.
 * Exceptions: None.
 */
export const RELATIONSHIP_OLD_AFTER_TURNS = 3;

/**
 * Picks one side's value for a line chart.
 *
 * Purpose: Each chart reads a different field, and two of them are broken down by unit type.
 * When to use: Building a series value for one seat at one turn.
 * Expected outcome: A number, or null when the side has no value.
 * Exceptions: None.
 */
function sideValue(side: SideStatistics, chartId: LineChartId, unitType: string | null): number | null {
  switch (chartId) {
    case 'built-units':
      return unitType === null ? totalUnits(pickTypes(side.builtUnits, STATISTIC_UNIT_TYPES)) : (side.builtUnits[unitType] ?? 0);
    case 'mercenary-units':
      return unitType === null
        ? totalUnits(pickTypes(side.mercenaryUnits, STATISTIC_MERCENARY_TYPES))
        : (side.mercenaryUnits[unitType] ?? 0);
    case 'hexes':
      return side.hexes;
    case 'production':
      return side.productionPerTurn;
    case 'stored-points':
      return side.storedPoints;
    case 'treasury':
      return side.treasury;
    case 'upkeep':
      return side.upkeepPerTurn;
    case 'units-lost':
      return side.unitsLost;
    case 'model-cost':
      return side.costUsd;
  }
}

/**
 * Keeps only the listed unit types from a count record.
 *
 * Purpose: A total counts the chart's own types, whatever else the record holds.
 * When to use: Summing built or mercenary units.
 * Expected outcome: A record with the listed keys that exist.
 * Exceptions: None.
 */
function pickTypes(counts: Readonly<Record<string, number>>, types: readonly string[]): Record<string, number> {
  return Object.fromEntries(types.filter((type) => type in counts).map((type) => [type, counts[type]]));
}

/**
 * Builds the series for one line chart.
 *
 * Purpose: Gives every line chart the same shape: the recorded turns and one line per side.
 * When to use: Creating a chart, changing its selector, and refreshing it.
 * Expected outcome: Every recorded turn, and one series per seat in side order. The model cost chart lists AI seats only. A turn with no entry for a seat gives null.
 * Exceptions: None.
 */
export function lineChartData(snapshot: MatchChartsSnapshot, chartId: LineChartId, unitType: string | null): LineChartData {
  const seats = [...snapshot.seats]
    .sort((a, b) => a.seatOrder - b.seatOrder)
    .filter((seat) => chartId !== 'model-cost' || seat.kind === 'ai');
  return {
    turns: snapshot.turns.map((turn) => turn.turnNumber),
    series: seats.map((seat) => ({
      seatId: seat.seatId,
      values: snapshot.turns.map((turn) => {
        const side = turn.sides.find((entry) => entry.seatId === seat.seatId);
        return side ? sideValue(side, chartId, unitType) : null;
      }),
    })),
  };
}

/**
 * Builds the tooltip text for one turn of a chart.
 *
 * Purpose: The tooltip shows each side's value and a total in one wording everywhere.
 * When to use: A cursor hovering the turn at `index`.
 * Expected outcome: `Turn {n}`, one `{name}: {value}` line per series with `no data` for null, and `Total: {sum}` over the non-null values. Numbers use `toFixed(decimals)`.
 * Exceptions: None.
 */
export function chartTooltip(
  data: LineChartData,
  index: number,
  nameOf: (seatId: string) => string,
  decimals: number
): ChartTooltipText {
  const values = data.series.map((series) => ({ seatId: series.seatId, value: series.values[index] ?? null }));
  const sum = values.reduce((acc, entry) => acc + (entry.value ?? 0), 0);
  return {
    heading: `Turn ${data.turns[index]}`,
    lines: values.map((entry) => `${nameOf(entry.seatId)}: ${entry.value === null ? 'no data' : entry.value.toFixed(decimals)}`),
    total: `Total: ${sum.toFixed(decimals)}`,
  };
}

/**
 * Moves a range so it lies inside the full range without changing its span.
 *
 * Purpose: Zoom and pan share one clamp.
 * When to use: After computing a new left edge.
 * Expected outcome: A range of the given span inside `full`.
 * Exceptions: None.
 */
function clampedRange(min: number, span: number, full: TurnRange): TurnRange {
  const left = Math.min(Math.max(min, full.min), full.max - span);
  return { min: left, max: left + span };
}

/**
 * Zooms a turn range around a turn.
 *
 * Purpose: The wheel zooms around the pointer.
 * When to use: One wheel step over a chart or the strip.
 * Expected outcome: The span scaled by `factor`, never narrower than `minSpan`, with `anchor` at the same relative position, and inside `full`. A result as wide as `full` is `full`.
 * Exceptions: None.
 */
export function zoomedTurnRange(args: ZoomTurnRangeArgs): TurnRange {
  const { range, full, anchor, factor, minSpan } = args;
  const fullSpan = full.max - full.min;
  const span = range.max - range.min;
  const nextSpan = Math.max(minSpan, span * factor);
  if (nextSpan >= fullSpan) {
    return { min: full.min, max: full.max };
  }
  const ratio = span > 0 ? (anchor - range.min) / span : 0.5;
  return clampedRange(anchor - ratio * nextSpan, nextSpan, full);
}

/**
 * Shifts a turn range sideways.
 *
 * Purpose: Dragging pans a zoomed chart.
 * When to use: A drag over a chart or the strip.
 * Expected outcome: The range moved by `deltaTurns`, with the same span, inside `full`.
 * Exceptions: None.
 */
export function pannedTurnRange(args: PanTurnRangeArgs): TurnRange {
  const { range, full, deltaTurns } = args;
  return clampedRange(range.min + deltaTurns, range.max - range.min, full);
}

/**
 * Lists the commanders that can report on a subject.
 *
 * Purpose: The human never reports a stance, and a side does not report on itself.
 * When to use: Building rows and strip rows.
 * Expected outcome: AI seat ids other than the subject, in side order.
 * Exceptions: None.
 */
function reporterSeatIds(snapshot: MatchChartsSnapshot, subjectSeatId: string): string[] {
  return [...snapshot.seats]
    .sort((a, b) => a.seatOrder - b.seatOrder)
    .filter((seat) => seat.kind === 'ai' && seat.seatId !== subjectSeatId)
    .map((seat) => seat.seatId);
}

/**
 * Finds one reporter's stored report on a subject in one turn.
 *
 * Purpose: Rows and the strip read the same report.
 * When to use: Looking up a pair in a turn's relationships.
 * Expected outcome: The report, or undefined.
 * Exceptions: None.
 */
function reportFor(turn: TurnStatistics | undefined, reporterSeatId: string, subjectSeatId: string) {
  return turn?.relationships.find((entry) => entry.seatId === reporterSeatId && entry.towardSeatId === subjectSeatId);
}

/**
 * Sums the hexes one side took from another over the recent window.
 *
 * Purpose: The Taken column shows recent aggression, not the whole match.
 * When to use: Building a relationship row.
 * Expected outcome: The sum over turns after `lastTurn - HEXES_TAKEN_WINDOW_TURNS` whose `hexesTaken` is known, or null when none is known.
 * Exceptions: None.
 */
function hexesTakenInWindow(turns: readonly TurnStatistics[], lastTurn: number, reporter: string, subject: string): number | null {
  const known = turns.filter((turn) => turn.turnNumber > lastTurn - HEXES_TAKEN_WINDOW_TURNS && turn.hexesTaken !== null);
  if (known.length === 0) {
    return null;
  }
  return known.reduce(
    (sum, turn) =>
      sum +
      (turn.hexesTaken ?? [])
        .filter((entry) => entry.bySeatId === reporter && entry.fromSeatId === subject)
        .reduce((inner, entry) => inner + entry.hexes, 0),
    0
  );
}

/**
 * Builds the relationship rows for one subject side at the last recorded turn.
 *
 * Purpose: The row card and the spokes show how each commander regards the subject now.
 * When to use: Drawing one relationship stack.
 * Expected outcome: One row per AI seat other than the subject, in side order. A report fills stance, trust, threat, and its turn. `age` is `fresh` when `lastTurn - 1 - reportedTurn` is at most `RELATIONSHIP_OLD_AFTER_TURNS`, `old` otherwise, and `none` with no report.
 * Exceptions: None.
 */
export function relationshipRows(snapshot: MatchChartsSnapshot, subjectSeatId: string): RelationshipRow[] {
  const last = snapshot.turns[snapshot.turns.length - 1];
  const lastTurn = last?.turnNumber ?? snapshot.currentTurnNumber;
  return reporterSeatIds(snapshot, subjectSeatId).map((reporterSeatId) => {
    const report = reportFor(last, reporterSeatId, subjectSeatId);
    const fresh = report !== undefined && lastTurn - 1 - report.reportedTurn <= RELATIONSHIP_OLD_AFTER_TURNS;
    return {
      reporterSeatId,
      stance: report?.stance ?? null,
      trust: report?.trust ?? null,
      threat: report?.threat ?? null,
      hexesTaken: hexesTakenInWindow(snapshot.turns, lastTurn, reporterSeatId, subjectSeatId),
      reportedTurn: report?.reportedTurn ?? null,
      age: report === undefined ? 'none' : fresh ? 'fresh' : 'old',
    };
  });
}

/**
 * Builds the stance strip for one subject side.
 *
 * Purpose: The strip shows each commander's stance toward the subject over every recorded turn.
 * When to use: Creating the strip and changing its subject.
 * Expected outcome: One row per AI seat other than the subject. A cell's stance is the reporter's stance in that turn's relationships, or null. `reportedThisTurn` is true when the report's turn is later than the same pair's in the previous recorded turn, or when the previous turn had none. For the first recorded turn it is true when `reportedTurn >= turnNumber - 1`, because statistics are written before that turn's talk round and a report lands one turn behind.
 * Exceptions: None.
 */
export function relationshipStrip(snapshot: MatchChartsSnapshot, subjectSeatId: string): RelationshipStrip {
  return {
    turns: snapshot.turns.map((turn) => turn.turnNumber),
    rows: reporterSeatIds(snapshot, subjectSeatId).map((reporterSeatId) => ({
      reporterSeatId,
      cells: snapshot.turns.map((turn, index): StripCell => {
        const report = reportFor(turn, reporterSeatId, subjectSeatId);
        if (report === undefined) {
          return { stance: null, reportedThisTurn: false };
        }
        const previous = index > 0 ? reportFor(snapshot.turns[index - 1], reporterSeatId, subjectSeatId) : undefined;
        const reportedThisTurn =
          index === 0
            ? report.reportedTurn >= turn.turnNumber - 1
            : previous === undefined || report.reportedTurn > previous.reportedTurn;
        return { stance: report.stance, reportedThisTurn };
      }),
    })),
  };
}

/**
 * Places reporter nodes evenly on a circle.
 *
 * Purpose: The spoke graph puts the subject in the center and each reporter on a ring.
 * When to use: Drawing one relationship graph.
 * Expected outcome: `count` points around the origin, the first straight up (negative y), going clockwise on screen. Zero gives an empty list.
 * Exceptions: None.
 */
export function spokePositions(count: number, radius: number): SpokePosition[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}
