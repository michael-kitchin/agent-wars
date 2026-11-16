/**
 * The stance strip: one row of cells per reporting commander, one cell per turn.
 *
 * Purpose: Shows how each commander's stance toward one side changed over the match, and which turns carry a stance forward from an earlier report.
 * When to use: The charts dialog builds one strip with a subject selector.
 * Expected outcome: A canvas with DOM labels beside it. Wheel zooms, drag pans, double-click resets, and a tooltip names the stance per reporter.
 * Exceptions: None.
 */

import {
  pannedTurnRange,
  zoomedTurnRange,
  type RelationshipStrip,
  type TurnRange,
} from '../../shared/matchChartSeries';

/**
 * The height of one reporter's row when there is room.
 *
 * Purpose: Rows shrink from this height when the block would exceed a quarter of the dialog.
 * When to use: Sizing the strip.
 * Expected outcome: 22 pixels.
 * Exceptions: None.
 */
const ROW_HEIGHT_MAX = 22;

/**
 * The shortest a reporter's row may get.
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
 * The narrowest cell that still shows the stance's first letter.
 *
 * Purpose: A letter in a narrower cell cannot be read.
 * When to use: Drawing cells.
 * Expected outcome: 14 pixels.
 * Exceptions: None.
 */
const LETTER_MIN_CELL_WIDTH = 14;

/**
 * The smallest span, in turns, a wheel zoom may reach.
 *
 * Purpose: Matches the line charts.
 * When to use: The wheel handler.
 * Expected outcome: 2.
 * Exceptions: None.
 */
const MIN_ZOOM_SPAN_TURNS = 2;

/**
 * What a caller controls about the strip.
 *
 * Contract: The host is empty and in the document.
 * When to use: `createRelationshipTimeline`.
 * Expected outcome: Enough to build the strip.
 * Exceptions: None.
 */
export interface CreateRelationshipTimelineArgs {
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
   * When to use: Labels and tooltip lines.
   * Expected outcome: Text.
   * Exceptions: None.
   */
  readonly nameOf: (seatId: string) => string;
  /**
   * Gives a side's numbered flag.
   *
   * Contract: Returns a new element, or null.
   * When to use: Labels.
   * Expected outcome: A flag element or null.
   * Exceptions: None.
   */
  readonly flagOf: (seatId: string) => HTMLElement | null;
}

/**
 * What a caller can do with the strip.
 *
 * Contract: Calls after `destroy` do nothing.
 * When to use: Changing the subject, refreshing, resizing, and closing.
 * Expected outcome: Four operations.
 * Exceptions: None.
 */
export interface RelationshipTimelineHandle {
  /**
   * Replaces the strip and keeps the zoom range when zoomed.
   *
   * Contract: A strip with no rows shows `No AI commander reports on this side.`.
   * When to use: A subject change and a refresh.
   * Expected outcome: The strip redraws.
   * Exceptions: None.
   */
  update(strip: RelationshipStrip): void;
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

/**
 * Reads a CSS variable's value.
 *
 * Purpose: The canvas needs real colors, not `var()` references.
 * When to use: Each draw.
 * Expected outcome: The trimmed value, or the fallback when empty.
 * Exceptions: None.
 */
function cssColor(name: string, fallback: string): string {
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
 * Creates the stance strip.
 *
 * Purpose: Draws every reporter's stance per turn, with carried-over stances lighter than fresh reports.
 * When to use: The charts dialog, once.
 * Expected outcome: A handle. Nothing is drawn until `update` is called.
 * Exceptions: None.
 */
export function createRelationshipTimeline(args: CreateRelationshipTimelineArgs): RelationshipTimelineHandle {
  let size = { width: args.width, height: args.height };
  let strip: RelationshipStrip = { turns: [], rows: [] };
  let view: TurnRange | null = null;
  let dragStart: { readonly x: number; readonly range: TurnRange } | null = null;
  const labels = document.createElement('div');
  labels.className = 'charts-strip-labels';
  const canvas = document.createElement('canvas');
  canvas.className = 'charts-strip-canvas';
  const empty = document.createElement('p');
  empty.className = 'charts-empty';
  empty.textContent = 'No AI commander reports on this side.';
  empty.hidden = true;
  const tooltip = document.createElement('div');
  tooltip.className = 'charts-tooltip';
  tooltip.hidden = true;
  args.host.append(labels, canvas, empty, tooltip);

  /**
   * Gives the full turn range of the strip.
   *
   * Purpose: Zoom and pan stay inside it.
   * When to use: Each wheel step, drag step, and draw.
   * Expected outcome: The first and last turn, or null with no turns.
   * Exceptions: None.
   */
  const fullRange = (): TurnRange | null =>
    strip.turns.length === 0 ? null : { min: strip.turns[0], max: strip.turns[strip.turns.length - 1] };

  /**
   * Gives the visible range, or the full range when not zoomed.
   *
   * Purpose: Drawing, zoom, and pan start from what is shown.
   * When to use: Everywhere the strip reads its range.
   * Expected outcome: A range, or null with no turns.
   * Exceptions: None.
   */
  const visibleRange = (): TurnRange | null => view ?? fullRange();

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
   * Purpose: Each reporter's flag and name sit beside its row as DOM text.
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
        const flag = args.flagOf(row.reporterSeatId);
        const name = document.createElement('span');
        name.textContent = args.nameOf(row.reporterSeatId);
        line.append(...(flag === null ? [name] : [flag, name]));
        return line;
      })
    );
  };

  /**
   * Draws the cells and the axis on the canvas.
   *
   * Purpose: A fresh report is a solid cell, a carried stance is the same color at 45% opacity, and no report is an outline.
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
    if (context === null || range === null) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const turnCount = range.max - range.min + 1;
    const cellWidth = plotWidth() / turnCount;
    const rowPx = rowHeight();
    const muted = cssColor('--chrome-muted', '#b7c4d4');
    context.font = '11px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    strip.rows.forEach((row, rowIndex) => {
      strip.turns.forEach((turn, index) => {
        if (turn < range.min || turn > range.max) return;
        const cell = row.cells[index];
        const x = (turn - range.min) * cellWidth;
        const y = rowIndex * rowPx;
        if (cell.stance === null) {
          context.strokeStyle = muted;
          context.lineWidth = 1;
          context.strokeRect(x + 0.5, y + 0.5, Math.max(0, cellWidth - 1), rowPx - 1);
          return;
        }
        context.globalAlpha = cell.reportedThisTurn ? 1 : 0.45;
        context.fillStyle = cssColor(`--stance-${cell.stance}`, '#9AA5A3');
        context.fillRect(x, y, cellWidth, rowPx - 1);
        context.globalAlpha = 1;
        if (cellWidth >= LETTER_MIN_CELL_WIDTH) {
          context.fillStyle = '#10161d';
          context.fillText(cell.stance.charAt(0).toUpperCase(), x + cellWidth / 2, y + rowPx / 2);
        }
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
   * Purpose: One place sets `view`, so the strip and its range agree.
   * When to use: Wheel, drag, and double-click.
   * Expected outcome: `view` is null for the full range, otherwise the range.
   * Exceptions: None.
   */
  const showRange = (range: TurnRange): void => {
    const full = fullRange();
    view = full !== null && range.min <= full.min && range.max >= full.max ? null : range;
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
    if (range === null) return 0;
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
    if (full === null || range === null) return;
    const factor = event.deltaY < 0 ? 0.8 : 1.25;
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
    if (range === null || event.button !== 0) return;
    dragStart = { x: event.clientX, range };
    canvas.setPointerCapture(event.pointerId);
  };

  /**
   * Fills and places the tooltip for the turn under the pointer.
   *
   * Purpose: Names each reporter's stance and whether it was reported this turn.
   * When to use: Each `pointermove` that is not a drag.
   * Expected outcome: The tooltip shows, or hides when the pointer is not on a recorded turn.
   * Exceptions: None.
   */
  const showTooltip = (event: PointerEvent): void => {
    const index = strip.turns.indexOf(Math.round(turnAt(event.clientX)));
    if (index < 0) {
      tooltip.hidden = true;
      return;
    }
    const heading = document.createElement('div');
    heading.className = 'charts-tooltip-heading';
    heading.textContent = `Turn ${strip.turns[index]}`;
    const lines = strip.rows.map((row) => {
      const cell = row.cells[index];
      const name = args.nameOf(row.reporterSeatId);
      const line = document.createElement('div');
      line.className = 'charts-tooltip-line';
      line.textContent =
        cell.stance === null
          ? `${name}: no report`
          : `${name}: ${cell.stance} (${cell.reportedThisTurn ? 'reported this turn' : 'from an earlier turn'})`;
      return line;
    });
    tooltip.replaceChildren(heading, ...lines);
    tooltip.hidden = false;
    const bounds = args.host.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const left = x + 12 + tooltip.offsetWidth > args.host.clientWidth ? x - 12 - tooltip.offsetWidth : x + 12;
    tooltip.style.left = `${Math.max(0, left)}px`;
    tooltip.style.top = `${Math.max(0, y + 12)}px`;
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
    if (dragStart !== null && full !== null) {
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
   * Purpose: A double-click resets the zoom.
   * When to use: The `dblclick` listener.
   * Expected outcome: The full range is visible.
   * Exceptions: None.
   */
  const onDoubleClick = (): void => {
    view = null;
    render();
  };

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerEnd);
  canvas.addEventListener('pointercancel', onPointerEnd);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('dblclick', onDoubleClick);

  return {
    update(next: RelationshipStrip): void {
      strip = next;
      const full = fullRange();
      if (view !== null && full !== null) {
        view = zoomedTurnRange({ range: view, full, anchor: view.min, factor: 1, minSpan: MIN_ZOOM_SPAN_TURNS });
        if (view.min <= full.min && view.max >= full.max) view = null;
      } else {
        view = null;
      }
      render();
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
