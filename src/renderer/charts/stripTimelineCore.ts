/**
 * The shared machinery of a strip timeline: one row of cells per commander, one cell per turn.
 *
 * Purpose: The stance strip, the agreements strip, and the posture strip lay out labels, a canvas, an axis, zoom, pan, and a tooltip the same way. Only the cell painting and the tooltip text differ, so they are callbacks.
 * When to use: A strip module calls `createStripTimeline` with its cell type, a painter, and a tooltip callback.
 * Expected outcome: A canvas with DOM labels beside it. It opens on a window of at most 12 turns (`initialTurnWindow`). Wheel zooms, drag pans, double-click zooms all the way out, and a tooltip follows the pointer.
 * Exceptions: None.
 */

import { initialTurnWindow, refreshedTurnView, sameTurnRange, zoomExtentTurnRange } from '../../shared/chartTurnWindow';
import { pannedTurnRange, zoomedTurnRange, type TurnRange } from '../../shared/matchChartSeries';
import { MIN_ZOOM_SPAN_TURNS, WHEEL_ZOOM_IN_FACTOR, wholeTurnRange } from './chartZoom';
import type {
  CreateStripTimelineArgs,
  StripTimelineData,
  StripTimelineHandle,
  StripTooltipLine,
} from './stripTimelineTypes';

export type {
  CreateStripTimelineArgs,
  StripCellRect,
  StripTimelineData,
  StripTimelineHandle,
  StripTimelineRow,
  StripTooltipContent,
  StripTooltipLine,
} from './stripTimelineTypes';

/**
 * The height of one row when there is room.
 *
 * Purpose: Rows shrink from this height when the block would exceed a quarter of the dialog.
 * When to use: Sizing the strip.
 * Expected outcome: 22 pixels.
 * Exceptions: None.
 */
const ROW_HEIGHT_MAX = 22;

/**
 * The shortest a row may get.
 *
 * Purpose: A row under this height cannot be read.
 * When to use: Sizing the strip.
 * Expected outcome: 10 pixels.
 * Exceptions: None.
 */
const ROW_HEIGHT_MIN = 10;

/**
 * The height of the turn axis under the rows.
 *
 * Purpose: Reserves room for the tick numbers.
 * When to use: Sizing the strip and drawing the axis.
 * Expected outcome: 18 pixels.
 * Exceptions: None.
 */
const AXIS_HEIGHT = 18;

/**
 * The width of the label column beside the canvas.
 *
 * Purpose: Each row's flag and name sit here as DOM text.
 * When to use: Sizing the canvas.
 * Expected outcome: 120 pixels.
 * Exceptions: None.
 */
const LABEL_WIDTH = 120;

/**
 * Reads a CSS variable's value.
 *
 * Purpose: The canvas needs real colors, not `var()` references.
 * When to use: Each draw, and each painter that needs a theme color.
 * Expected outcome: The trimmed value, or the fallback when empty.
 * Exceptions: None.
 */
export function stripCssColor(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/**
 * Picks a tick step so labels stay at least 40 pixels apart.
 *
 * Purpose: The axis shows integer turns without crowding.
 * When to use: Drawing the axis.
 * Expected outcome: A whole number of turns from 1 upward.
 * Exceptions: None.
 */
function tickStep(cellWidth: number): number {
  return Math.max(1, Math.ceil(40 / Math.max(1, cellWidth)));
}

/**
 * Builds the elements of a tooltip's lines.
 *
 * Purpose: A line can open with a bold lead-in, and consecutive bullet lines read as one list under the line above them.
 * When to use: `showTooltip`, with the lines the caller returned.
 * Expected outcome: A `div` for each plain line, with its lead in a `charts-tooltip-lead` span, and one `ul.charts-tooltip-list` of `li` items for each run of bullet lines. Every text is set with `textContent`.
 * Exceptions: None.
 */
function tooltipLineElements(lines: readonly StripTooltipLine[]): HTMLElement[] {
  const elements: HTMLElement[] = [];
  let list: HTMLUListElement | null = null;
  for (const entry of lines) {
    if (entry.bullet === true) {
      if (list === null) {
        list = document.createElement('ul');
        list.className = 'charts-tooltip-list';
        elements.push(list);
      }
      const item = document.createElement('li');
      item.textContent = entry.text;
      list.append(item);
      continue;
    }
    list = null;
    const line = document.createElement('div');
    line.className = entry.emphasis ? 'charts-tooltip-line charts-tooltip-emphasis' : 'charts-tooltip-line';
    if (entry.lead !== undefined) {
      const lead = document.createElement('span');
      lead.className = 'charts-tooltip-lead';
      lead.textContent = entry.lead;
      line.append(lead, document.createTextNode(` ${entry.text}`));
    } else {
      line.textContent = entry.text;
    }
    elements.push(line);
  }
  return elements;
}

/**
 * Creates a strip timeline.
 *
 * Purpose: Lays out the labels, canvas, axis, tooltip, zoom, and pan once, and leaves cell painting and tooltip text to the caller.
 * When to use: The stance strip and the agreements strip, once each.
 * Expected outcome: A handle. Nothing is drawn until `update` is called.
 * Exceptions: None.
 */
export function createStripTimeline<Cell>(args: CreateStripTimelineArgs<Cell>): StripTimelineHandle<Cell> {
  const { paintCell } = args;
  let size = { width: args.width, height: args.height };
  let strip: StripTimelineData<Cell> = { turns: [], rows: [] };
  let view: TurnRange | null = null;
  let dragStart: { readonly x: number; readonly range: TurnRange } | null = null;
  const labels = document.createElement('div');
  labels.className = 'charts-strip-labels';
  const canvas = document.createElement('canvas');
  canvas.className = 'charts-strip-canvas';
  const empty = document.createElement('p');
  empty.className = 'charts-empty';
  empty.textContent = args.emptyText;
  empty.hidden = true;
  const tooltip = document.createElement('div');
  tooltip.className = 'charts-tooltip';
  tooltip.hidden = true;
  args.host.append(labels, canvas, empty, tooltip);

  /**
   * Gives the widest turn range of the strip.
   *
   * Purpose: Zoom and pan stay inside it. A strip shorter than the opening window keeps that window's blank space on the right.
   * When to use: Each wheel step, drag step, and double-click.
   * Expected outcome: The first turn through the last, widened to the opening window for a short strip.
   * Exceptions: None.
   */
  const fullRange = (): TurnRange => zoomExtentTurnRange(strip.turns);

  /**
   * Gives the window the strip opens on and follows until the player zooms or pans.
   *
   * Purpose: At most 12 turns show. A short strip fills in from the left edge, and a long one shows its newest turns.
   * When to use: `visibleRange`, `showRange`, and `update`.
   * Expected outcome: The opening window for the current turns.
   * Exceptions: None.
   */
  const openingRange = (): TurnRange => initialTurnWindow(strip.turns);

  /**
   * Gives the visible range, or the opening window when the player has not zoomed or panned.
   *
   * Purpose: Drawing, zoom, and pan start from what is shown.
   * When to use: Everywhere the strip reads its range.
   * Expected outcome: A range.
   * Exceptions: None.
   */
  const visibleRange = (): TurnRange => view ?? openingRange();

  /**
   * Chooses the row height that fits the available height.
   *
   * Purpose: The strip and its axis never exceed the height it was given.
   * When to use: Each draw.
   * Expected outcome: A height from `ROW_HEIGHT_MIN` to `ROW_HEIGHT_MAX`.
   * Exceptions: None.
   */
  const rowHeight = (): number =>
    Math.min(ROW_HEIGHT_MAX, Math.max(ROW_HEIGHT_MIN, Math.floor((size.height - AXIS_HEIGHT) / Math.max(1, strip.rows.length))));

  /**
   * Gives the canvas's plot width.
   *
   * Purpose: The canvas takes what the label column leaves.
   * When to use: Each draw and each pointer calculation.
   * Expected outcome: A positive width.
   * Exceptions: None.
   */
  const plotWidth = (): number => Math.max(1, size.width - LABEL_WIDTH);

  /**
   * Rebuilds the label column to match the rows.
   *
   * Purpose: Each row's flag and name sit beside its row as DOM text.
   * When to use: Each draw.
   * Expected outcome: One label per row at the row height.
   * Exceptions: None.
   */
  const drawLabels = (): void => {
    const height = rowHeight();
    labels.style.width = `${LABEL_WIDTH}px`;
    labels.replaceChildren(
      ...strip.rows.map((row) => {
        const line = document.createElement('div');
        line.className = 'charts-strip-label';
        line.style.height = `${height}px`;
        const flag = args.flagOf(row.seatId);
        const name = document.createElement('span');
        name.textContent = args.nameOf(row.seatId);
        line.append(...(flag === null ? [name] : [flag, name]));
        return line;
      })
    );
  };

  /**
   * Draws the cells and the axis on the canvas.
   *
   * Purpose: Each visible cell is painted by the caller's painter between `save` and `restore`, then the turn axis is drawn.
   * When to use: After every change to the data, range, or size.
   * Expected outcome: The canvas shows the visible turns.
   * Exceptions: None.
   */
  const draw = (): void => {
    const range = visibleRange();
    const ratio = window.devicePixelRatio || 1;
    const height = rowHeight() * strip.rows.length + AXIS_HEIGHT;
    canvas.width = Math.floor(plotWidth() * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${plotWidth()}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext('2d');
    if (context === null) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const turnCount = range.max - range.min + 1;
    const cellWidth = plotWidth() / turnCount;
    const rowPx = rowHeight();
    const muted = stripCssColor('--chrome-muted', '#b7c4d4');
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    strip.rows.forEach((row, rowIndex) => {
      strip.turns.forEach((turn, index) => {
        if (turn < range.min || turn > range.max) return;
        const cell = row.cells[index];
        const x = (turn - range.min) * cellWidth;
        const y = rowIndex * rowPx;
        context.save();
        paintCell(context, cell, { x, y, width: cellWidth, height: rowPx });
        context.restore();
      });
    });
    const axisTop = rowPx * strip.rows.length;
    context.fillStyle = muted;
    const step = tickStep(cellWidth);
    strip.turns.forEach((turn) => {
      if (turn < range.min || turn > range.max || (turn - range.min) % step !== 0) return;
      context.fillText(String(turn), (turn - range.min) * cellWidth + cellWidth / 2, axisTop + AXIS_HEIGHT / 2);
    });
  };

  /**
   * Redraws the labels, canvas, and empty message.
   *
   * Purpose: One call brings every part up to date.
   * When to use: After `update`, `resize`, and any zoom or pan.
   * Expected outcome: The strip shows the data, or the one-sentence form when there are no rows.
   * Exceptions: None.
   */
  const render = (): void => {
    // A redraw (new data, zoom, resize) can move the cell under a resting pointer, so the old tooltip is dropped.
    tooltip.hidden = true;
    const hasRows = strip.rows.length > 0;
    empty.hidden = hasRows;
    canvas.hidden = !hasRows;
    labels.hidden = !hasRows;
    if (!hasRows) return;
    drawLabels();
    draw();
  };

  /**
   * Applies a new visible range.
   *
   * Purpose: One place sets `view`, so the strip and its range agree. The range is rounded to whole turns, so cells fill the canvas and the turn labels stay on their cells after a zoom or a pan.
   * When to use: Wheel, drag, double-click, and update.
   * Expected outcome: `view` is null for the opening window, otherwise the range rounded by `wholeTurnRange`.
   * Exceptions: None.
   */
  const showRange = (range: TurnRange): void => {
    const whole = wholeTurnRange(range, fullRange());
    view = sameTurnRange(whole, openingRange()) ? null : whole;
    render();
  };

  /**
   * Finds the turn under a horizontal pointer position.
   *
   * Purpose: The wheel anchors on it and the tooltip reads it.
   * When to use: Pointer handlers.
   * Expected outcome: A turn number, possibly outside the strip.
   * Exceptions: None.
   */
  const turnAt = (clientX: number): number => {
    const range = visibleRange();
    const cellWidth = plotWidth() / (range.max - range.min + 1);
    return range.min + (clientX - canvas.getBoundingClientRect().left) / cellWidth - 0.5;
  };

  /**
   * Zooms around the pointer on a wheel step.
   *
   * Purpose: The wheel zooms the strip and does not scroll the dialog.
   * When to use: The `wheel` listener on the canvas.
   * Expected outcome: The visible range narrows or widens.
   * Exceptions: None.
   */
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const full = fullRange();
    const range = visibleRange();
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_IN_FACTOR : 1 / WHEEL_ZOOM_IN_FACTOR;
    showRange(zoomedTurnRange({ range, full, anchor: turnAt(event.clientX), factor, minSpan: MIN_ZOOM_SPAN_TURNS }));
  };

  /**
   * Starts a drag.
   *
   * Purpose: Dragging pans a zoomed strip.
   * When to use: The `pointerdown` listener on the canvas.
   * Expected outcome: The start position and range are remembered.
   * Exceptions: None.
   */
  const onPointerDown = (event: PointerEvent): void => {
    const range = visibleRange();
    if (event.button !== 0) return;
    dragStart = { x: event.clientX, range };
    canvas.setPointerCapture(event.pointerId);
  };

  /**
   * Gives the row index under a vertical pointer position.
   *
   * Purpose: The tooltip callback may describe one row.
   * When to use: `showTooltip`.
   * Expected outcome: A row index, or null when the pointer is above the first row or over the axis.
   * Exceptions: None.
   */
  const rowIndexAt = (clientY: number): number | null => {
    const index = Math.floor((clientY - canvas.getBoundingClientRect().top) / rowHeight());
    return index < 0 || index >= strip.rows.length ? null : index;
  };

  /**
   * Moves a wrapping tooltip above the pointer when it would pass the bottom of the dialog body.
   *
   * Purpose: The dialog body scrolls, so a tooltip past its bottom edge is cut off.
   * When to use: `showTooltip`, for strips that set `wrapTooltip`.
   * Expected outcome: The tooltip's top is raised so its bottom edge stays in view, never above the body's visible top.
   * Exceptions: None.
   */
  const keepTooltipInView = (pointerY: number): void => {
    const body = args.host.closest('.charts-dialog-body');
    const visibleBottom = body?.getBoundingClientRect().bottom ?? window.innerHeight;
    if (tooltip.getBoundingClientRect().bottom <= visibleBottom) return;
    const hostTop = args.host.getBoundingClientRect().top;
    const visibleTop = (body?.getBoundingClientRect().top ?? 0) - hostTop;
    tooltip.style.top = `${Math.max(visibleTop, pointerY - 12 - tooltip.offsetHeight)}px`;
  };

  /**
   * Fills and places the tooltip for the cell under the pointer.
   *
   * Purpose: Asks the caller for the tooltip content and draws it near the pointer.
   * When to use: Each `pointermove` that is not a drag.
   * Expected outcome: The tooltip shows, or hides when the pointer is not on a recorded turn or the caller returns null.
   * Exceptions: None.
   */
  const showTooltip = (event: PointerEvent): void => {
    const index = strip.turns.indexOf(Math.round(turnAt(event.clientX)));
    const content = index < 0 ? null : args.tooltipAt(index, rowIndexAt(event.clientY));
    if (content === null) {
      tooltip.hidden = true;
      return;
    }
    const heading = document.createElement('div');
    heading.className = 'charts-tooltip-heading';
    heading.textContent = content.heading;
    const lines = tooltipLineElements(content.lines);
    tooltip.className = args.wrapTooltip === true ? 'charts-tooltip charts-tooltip-wrap' : 'charts-tooltip';
    tooltip.replaceChildren(heading, ...lines);
    tooltip.hidden = false;
    // Measure at the origin: an absolutely placed box is as wide as the room right of its `left`, so a stale
    // `left` near the right edge would wrap the tooltip into a narrow column and hide the need to flip it.
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    const bounds = args.host.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const left = x + 12 + tooltip.offsetWidth > args.host.clientWidth ? x - 12 - tooltip.offsetWidth : x + 12;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${Math.max(0, y + 12)}px`;
    if (args.wrapTooltip === true) keepTooltipInView(y);
  };

  /**
   * Pans while dragging, or shows the tooltip otherwise.
   *
   * Purpose: One move listener serves both.
   * When to use: The `pointermove` listener on the canvas.
   * Expected outcome: The range shifts, or the tooltip follows the pointer.
   * Exceptions: None.
   */
  const onPointerMove = (event: PointerEvent): void => {
    const full = fullRange();
    if (dragStart !== null) {
      const turnsPerPixel = (dragStart.range.max - dragStart.range.min + 1) / plotWidth();
      showRange(pannedTurnRange({ range: dragStart.range, full, deltaTurns: -(event.clientX - dragStart.x) * turnsPerPixel }));
      return;
    }
    showTooltip(event);
  };

  /**
   * Ends a drag.
   *
   * Purpose: Releasing the pointer stops panning.
   * When to use: The `pointerup` and `pointercancel` listeners.
   * Expected outcome: No drag is in progress.
   * Exceptions: None.
   */
  const onPointerEnd = (): void => {
    dragStart = null;
  };

  /**
   * Hides the tooltip when the pointer leaves the canvas.
   *
   * Purpose: The tooltip only shows over the strip.
   * When to use: The `pointerleave` listener.
   * Expected outcome: The tooltip is hidden.
   * Exceptions: None.
   */
  const onPointerLeave = (): void => {
    tooltip.hidden = true;
  };

  /**
   * Shows every turn again.
   *
   * Purpose: A double-click zooms all the way out.
   * When to use: The `dblclick` listener.
   * Expected outcome: The full range is visible, which is the opening window for a short strip.
   * Exceptions: None.
   */
  const onDoubleClick = (): void => {
    showRange(fullRange());
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('dblclick', onDoubleClick);

  return {
    update(next: StripTimelineData<Cell>): void {
      const kept = refreshedTurnView({ view, previousTurns: strip.turns, nextTurns: next.turns, minSpan: MIN_ZOOM_SPAN_TURNS });
      strip = next;
      showRange(kept ?? openingRange());
    },
    resize(width: number, height: number): void {
      size = { width, height };
      render();
    },
    destroy(): void {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('dblclick', onDoubleClick);
      args.host.replaceChildren();
    },
  };
}
