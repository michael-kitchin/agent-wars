/**
 * One uPlot line chart with wheel zoom, drag pan, a tooltip, and a double-click reset.
 *
 * Purpose: Every count over turns in the charts dialog is drawn the same way.
 * When to use: The charts dialog builds one per line chart.
 * Expected outcome: A handle that updates the data, resizes, and destroys the chart. Every rule that can be wrong lives in `matchChartSeries.ts`.
 * Exceptions: None.
 */

import uPlot from 'uplot';
import {
  chartTooltip,
  pannedTurnRange,
  zoomedTurnRange,
  type LineChartData,
  type TurnRange,
} from '../../shared/matchChartSeries';
import { MIN_ZOOM_SPAN_TURNS, WHEEL_ZOOM_IN_FACTOR } from './chartZoom';

/**
 * Tick spacings, in turns, the X axis may use.
 *
 * Purpose: Turns are whole numbers, so every tick is an integer.
 * When to use: The X axis options.
 * Expected outcome: Whole numbers from 1 upward.
 * Exceptions: None.
 */
const TURN_TICK_INCREMENTS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

/**
 * What a caller controls about a line chart.
 *
 * Contract: The host must be in the document, or at least have a size once the chart is shown.
 * When to use: `createLineChart`.
 * Expected outcome: Enough to build one chart.
 * Exceptions: None.
 */
export interface CreateLineChartArgs {
  /**
   * The element the chart is drawn inside.
   *
   * Contract: Empty and positioned, so the tooltip can sit inside it.
   * When to use: Mounting uPlot and the tooltip.
   * Expected outcome: An element.
   * Exceptions: None.
   */
  readonly host: HTMLElement;
  /**
   * The series to draw.
   *
   * Contract: From `lineChartData`.
   * When to use: The first draw.
   * Expected outcome: Turns and one series per side.
   * Exceptions: None.
   */
  readonly data: LineChartData;
  /**
   * The plot's width in CSS pixels.
   *
   * Contract: Positive.
   * When to use: The first draw.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * The plot's height in CSS pixels, axes included.
   *
   * Contract: Not above a quarter of the dialog less the title row.
   * When to use: The first draw.
   * Expected outcome: A number.
   * Exceptions: None.
   */
  readonly height: number;
  /**
   * Gives a side's line color.
   *
   * Contract: Returns a CSS color.
   * When to use: Each series' stroke.
   * Expected outcome: The side's `--seat-N-bar` color.
   * Exceptions: None.
   */
  readonly colorOf: (seatId: string) => string;
  /**
   * Gives a side's name.
   *
   * Contract: Returns the name shown on screen.
   * When to use: Series labels and tooltip lines.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * How many decimals the tooltip prints.
   *
   * Contract: 0 for counts, 2 for money.
   * When to use: `chartTooltip`.
   * Expected outcome: A whole number.
   * Exceptions: None.
   */
  readonly decimals: number;
}

/**
 * What a caller can do with a chart after it exists.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Refreshing, resizing, and closing the dialog.
 * Expected outcome: Three operations.
 * Exceptions: None.
 */
export interface LineChartHandle {
  /**
   * Replaces the data and keeps the zoom range when the chart is zoomed.
   *
   * Contract: A zoomed chart stays zoomed, clamped to the new turns.
   * When to use: A selector change and a refresh after a turn resolves.
   * Expected outcome: The chart redraws.
   * Exceptions: None.
   */
  update(data: LineChartData): void;
  /**
   * Resizes the plot.
   *
   * Contract: Sizes are in CSS pixels.
   * When to use: A window resize while the dialog is open.
   * Expected outcome: The chart redraws at the new size.
   * Exceptions: None.
   */
  resize(width: number, height: number): void;
  /**
   * Removes the chart, its tooltip, and its listeners.
   *
   * Contract: Safe to call once.
   * When to use: Closing the dialog.
   * Expected outcome: The host is empty.
   * Exceptions: None.
   */
  destroy(): void;
}

/**
 * Turns a series list into uPlot's column layout.
 *
 * Purpose: uPlot wants the X column first, then one column per series, with null as a gap.
 * When to use: The first draw and every update.
 * Expected outcome: `[turns, ...values]`.
 * Exceptions: None.
 */
function toUplotData(data: LineChartData): uPlot.AlignedData {
  return [[...data.turns], ...data.series.map((series) => [...series.values])];
}

/**
 * The full turn range of a data set.
 *
 * Purpose: Zoom and pan stay inside it.
 * When to use: Every wheel and drag step, and after an update.
 * Expected outcome: The first and last turn, or null with fewer than two turns.
 * Exceptions: None.
 */
function fullTurnRange(data: LineChartData): TurnRange | null {
  if (data.turns.length < 2) return null;
  return { min: data.turns[0], max: data.turns[data.turns.length - 1] };
}

/**
 * Reads a chrome color variable from the page.
 *
 * Purpose: uPlot draws axes on a canvas, so their colors cannot come from CSS.
 * When to use: Building the axis options.
 * Expected outcome: The variable's value, or the fallback when it is empty.
 * Exceptions: None.
 */
function chromeColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Builds the tooltip element for one chart.
 *
 * Purpose: The tooltip is one `div` inside the host, filled from `chartTooltip`.
 * When to use: Once per chart.
 * Expected outcome: A hidden, absolutely positioned element appended to the host.
 * Exceptions: None.
 */
function createTooltipElement(host: HTMLElement): HTMLDivElement {
  const tooltip = document.createElement('div');
  tooltip.className = 'charts-tooltip';
  tooltip.hidden = true;
  host.appendChild(tooltip);
  return tooltip;
}

/**
 * Fills the tooltip with a turn's heading, a line per side, and the total.
 *
 * Purpose: The tooltip text comes from `chartTooltip` and reaches the page through `textContent` only.
 * When to use: Each time the cursor lands on a turn.
 * Expected outcome: The tooltip's children are replaced.
 * Exceptions: None.
 */
function fillTooltip(tooltip: HTMLElement, args: CreateLineChartArgs, data: LineChartData, index: number): void {
  const text = chartTooltip(data, index, args.nameOf, args.decimals);
  const heading = document.createElement('div');
  heading.className = 'charts-tooltip-heading';
  heading.textContent = text.heading;
  const rows = data.series.map((series, row) => {
    const line = document.createElement('div');
    line.className = 'charts-tooltip-line';
    const swatch = document.createElement('span');
    swatch.className = 'charts-tooltip-swatch';
    swatch.style.background = args.colorOf(series.seatId);
    const label = document.createElement('span');
    label.textContent = text.lines[row];
    line.append(swatch, label);
    return line;
  });
  const total = document.createElement('div');
  total.className = 'charts-tooltip-total';
  total.textContent = text.total;
  tooltip.replaceChildren(heading, ...rows, total);
}

/**
 * Keeps the tooltip inside the host's edges next to the cursor.
 *
 * Purpose: A tooltip near the right or bottom edge must flip to the cursor's other side.
 * When to use: After the tooltip is filled and shown.
 * Expected outcome: `left` and `top` are set in host pixels.
 * Exceptions: None.
 */
function placeTooltip(tooltip: HTMLElement, host: HTMLElement, cursorX: number, cursorY: number): void {
  const gap = 12;
  const left = cursorX + gap + tooltip.offsetWidth > host.clientWidth ? cursorX - gap - tooltip.offsetWidth : cursorX + gap;
  const top = cursorY + gap + tooltip.offsetHeight > host.clientHeight ? cursorY - gap - tooltip.offsetHeight : cursorY + gap;
  tooltip.style.left = `${Math.max(0, left)}px`;
  tooltip.style.top = `${Math.max(0, top)}px`;
}

/**
 * Creates one line chart.
 *
 * Purpose: Draws every side's value per turn with a per-side tooltip, wheel zoom around the pointer, drag pan, and a double-click that shows every turn.
 * When to use: The charts dialog, once per line chart.
 * Expected outcome: A handle. With one turn or none the chart still draws, a single point or an empty plot, and does not throw.
 * Exceptions: None.
 */
export function createLineChart(args: CreateLineChartArgs): LineChartHandle {
  let data = args.data;
  let view: TurnRange | null = null;
  const tooltip = createTooltipElement(args.host);
  const axisStroke = chromeColor('--chrome-muted', '#b7c4d4');
  const gridStroke = chromeColor('--chrome-divider', '#243246');
  const axis = { stroke: axisStroke, grid: { stroke: gridStroke, width: 1 }, ticks: { stroke: gridStroke, width: 1 } };
  const plot = new uPlot(
    {
      width: args.width,
      height: args.height,
      legend: { show: false },
      scales: { x: { time: false } },
      cursor: { drag: { x: false, y: false, setScale: false } },
      axes: [
        {
          ...axis,
          incrs: TURN_TICK_INCREMENTS,
          values: (_u, ticks) => ticks.map((tick) => (Number.isInteger(tick) ? String(tick) : '')),
        },
        { ...axis },
      ],
      series: [
        {},
        ...data.series.map((series) => ({
          label: args.nameOf(series.seatId),
          stroke: args.colorOf(series.seatId),
          width: 2,
          spanGaps: false,
        })),
      ],
      hooks: {
        setCursor: [
          (u) => {
            const index = u.cursor.idx;
            const left = u.cursor.left ?? -1;
            if (typeof index !== 'number' || left < 0 || data.turns[index] === undefined) {
              tooltip.hidden = true;
              return;
            }
            fillTooltip(tooltip, args, data, index);
            tooltip.hidden = false;
            placeTooltip(tooltip, args.host, u.over.offsetLeft + left, u.over.offsetTop + (u.cursor.top ?? 0));
          },
        ],
      },
    },
    toUplotData(data),
    args.host
  );

  /**
   * Applies a visible range and remembers it, or clears the zoom for the full range.
   *
   * Purpose: One place changes the X scale so `view` always matches what is drawn.
   * When to use: The wheel, drag, double-click, and update handlers.
   * Expected outcome: The X scale shows `range`.
   * Exceptions: None.
   */
  const showRange = (range: TurnRange): void => {
    const full = fullTurnRange(data);
    view = full !== null && range.min <= full.min && range.max >= full.max ? null : range;
    plot.setScale('x', range);
  };

  /**
   * Returns the visible range, or the full range when not zoomed.
   *
   * Purpose: Zoom and pan start from what is drawn.
   * When to use: The wheel and drag handlers.
   * Expected outcome: A range, or null with fewer than two turns.
   * Exceptions: None.
   */
  const currentRange = (): TurnRange | null => view ?? fullTurnRange(data);

  /**
   * Zooms around the pointer on a wheel step.
   *
   * Purpose: The wheel zooms the X axis and never scrolls the dialog while over a plot.
   * When to use: The `wheel` listener on the plot.
   * Expected outcome: The range narrows for a scroll up and widens for a scroll down.
   * Exceptions: None.
   */
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const full = fullTurnRange(data);
    const range = currentRange();
    if (full === null || range === null) return;
    const anchor = plot.posToVal(event.clientX - plot.over.getBoundingClientRect().left, 'x');
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_IN_FACTOR : 1 / WHEEL_ZOOM_IN_FACTOR;
    showRange(zoomedTurnRange({ range, full, anchor, factor, minSpan: MIN_ZOOM_SPAN_TURNS }));
  };

  let dragStart: { readonly x: number; readonly range: TurnRange } | null = null;

  /**
   * Starts a drag from the pointer's position.
   *
   * Purpose: Dragging pans a zoomed chart.
   * When to use: The `pointerdown` listener on the plot.
   * Expected outcome: The start position and range are remembered and the pointer is captured.
   * Exceptions: None.
   */
  const onPointerDown = (event: PointerEvent): void => {
    const range = currentRange();
    if (range === null || event.button !== 0) return;
    dragStart = { x: event.clientX, range };
    plot.over.setPointerCapture(event.pointerId);
  };

  /**
   * Pans by the distance the pointer has moved since the drag began.
   *
   * Purpose: Horizontal movement becomes a shift in turns.
   * When to use: The `pointermove` listener on the plot.
   * Expected outcome: The range shifts, inside the full range.
   * Exceptions: None.
   */
  const onPointerMove = (event: PointerEvent): void => {
    const full = fullTurnRange(data);
    if (dragStart === null || full === null) return;
    const turnsPerPixel = (dragStart.range.max - dragStart.range.min) / Math.max(1, plot.over.clientWidth);
    const deltaTurns = -(event.clientX - dragStart.x) * turnsPerPixel;
    showRange(pannedTurnRange({ range: dragStart.range, full, deltaTurns }));
  };

  /**
   * Ends a drag.
   *
   * Purpose: Releasing the pointer stops panning.
   * When to use: The `pointerup` and `pointercancel` listeners on the plot.
   * Expected outcome: No drag is in progress.
   * Exceptions: None.
   */
  const onPointerEnd = (): void => {
    dragStart = null;
  };

  /**
   * Shows every turn again.
   *
   * Purpose: A double-click resets the zoom.
   * When to use: The `dblclick` listener on the plot.
   * Expected outcome: The X scale shows the full range.
   * Exceptions: None.
   */
  const onDoubleClick = (): void => {
    const full = fullTurnRange(data);
    if (full !== null) showRange(full);
  };

  plot.over.addEventListener('wheel', onWheel, { passive: false });
  plot.over.addEventListener('pointerdown', onPointerDown);
  plot.over.addEventListener('pointermove', onPointerMove);
  plot.over.addEventListener('pointerup', onPointerEnd);
  plot.over.addEventListener('pointercancel', onPointerEnd);
  plot.over.addEventListener('dblclick', onDoubleClick);

  return {
    update(next: LineChartData): void {
      data = next;
      const full = fullTurnRange(next);
      const keep = view !== null && full !== null ? view : null;
      plot.setData(toUplotData(next), keep === null);
      if (keep !== null && full !== null) {
        showRange(zoomedTurnRange({ range: keep, full, anchor: keep.min, factor: 1, minSpan: MIN_ZOOM_SPAN_TURNS }));
      } else {
        view = null;
      }
    },
    resize(width: number, height: number): void {
      plot.setSize({ width, height });
    },
    destroy(): void {
      plot.over.removeEventListener('wheel', onWheel);
      plot.over.removeEventListener('pointerdown', onPointerDown);
      plot.over.removeEventListener('pointermove', onPointerMove);
      plot.over.removeEventListener('pointerup', onPointerEnd);
      plot.over.removeEventListener('pointercancel', onPointerEnd);
      plot.over.removeEventListener('dblclick', onDoubleClick);
      plot.destroy();
      tooltip.remove();
    },
  };
}
