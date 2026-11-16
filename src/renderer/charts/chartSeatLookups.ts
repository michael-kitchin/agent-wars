/**
 * How the charts name, flag, and color a side.
 *
 * Purpose: Every chart and the legend present a side the same way.
 * When to use: `chartsDialog.ts`, once per snapshot.
 * Expected outcome: Lookups over a snapshot's seats, and the shared legend.
 * Exceptions: None.
 */

import type { MatchChartsSnapshot } from '../../shared/matchStatistics';
import { SEAT_PALETTES } from '../../shared/seatPalette';
import { createMessagePartyFlag } from '../chrome/sideNumberFlag';

/**
 * Gives a side's line color.
 *
 * Purpose: A side's line and swatch use its `--seat-N-bar` color, which reads on the dark face.
 * When to use: Lines, swatches, and the legend.
 * Expected outcome: The variable's value, or the palette's bar color when the variable is empty.
 * Exceptions: None.
 */
function seatColor(seatOrder: number): string {
  const fromCss = getComputedStyle(document.documentElement).getPropertyValue(`--seat-${seatOrder}-bar`).trim();
  return fromCss || (SEAT_PALETTES[seatOrder - 1]?.forceBar ?? '#9CA3AF');
}

/**
 * The helpers that name and mark a side in every chart.
 *
 * Contract: Built from one snapshot.
 * When to use: Passed to the stacks, the strip, and the line charts.
 * Expected outcome: Name, flag, color, and seat number lookups.
 * Exceptions: None.
 */
export interface SeatLookups {
  /**
   * Gives a side's name.
   *
   * Contract: Falls back to the seat id.
   * When to use: Labels.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Gives a side's numbered flag.
   *
   * Contract: A new element each call, or null.
   * When to use: Labels.
   * Expected outcome: A flag or null.
   * Exceptions: None.
   */
  readonly flagOf: (seatId: string) => HTMLElement | null;
  /**
   * Gives a side's line color.
   *
   * Contract: A CSS color.
   * When to use: Lines and swatches.
   * Expected outcome: A color string.
   * Exceptions: None.
   */
  readonly colorOf: (seatId: string) => string;
  /**
   * Gives a side's number.
   *
   * Contract: The seat order, starting at 1.
   * When to use: Spoke nodes.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly seatNumberOf: (seatId: string) => number;
}

/**
 * Builds the lookups for a snapshot.
 *
 * Purpose: Every chart names and colors a side the same way.
 * When to use: Each time the body is built or refreshed.
 * Expected outcome: Lookups over the snapshot's seats.
 * Exceptions: None.
 */
export function seatLookups(snapshot: MatchChartsSnapshot): SeatLookups {
  const seats = snapshot.seats.map((seat) => ({ seatId: seat.seatId, seatOrder: seat.seatOrder }));
  const byId = new Map(snapshot.seats.map((seat) => [seat.seatId, seat]));
  return {
    nameOf: (seatId) => byId.get(seatId)?.name ?? seatId,
    flagOf: (seatId) => createMessagePartyFlag(seatId, seats),
    colorOf: (seatId) => seatColor(byId.get(seatId)?.seatOrder ?? 1),
    seatNumberOf: (seatId) => byId.get(seatId)?.seatOrder ?? 1,
  };
}

/**
 * Builds the legend shared by the line charts.
 *
 * Purpose: Each side's swatch, flag, and name appear once above the first line chart.
 * When to use: Building the body.
 * Expected outcome: A list element.
 * Exceptions: None.
 */
export function buildLegend(snapshot: MatchChartsSnapshot, lookups: SeatLookups): HTMLElement {
  const legend = document.createElement('ul');
  legend.className = 'charts-legend';
  for (const seat of [...snapshot.seats].sort((a, b) => a.seatOrder - b.seatOrder)) {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'charts-legend-swatch';
    swatch.style.background = lookups.colorOf(seat.seatId);
    const flag = lookups.flagOf(seat.seatId);
    const name = document.createElement('span');
    name.textContent = seat.name;
    item.append(swatch, ...(flag === null ? [name] : [flag, name]));
    legend.appendChild(item);
  }
  return legend;
}
