/**
 * Draws order lines (movement, ranged fire, air strike, and missile launch; queued, previewed, and played back) the same way: a light casing
 * first, then the colored line, and an optional arrowhead.
 *
 * Purpose: One drawing path, so every order line keeps the same outline and arrow.
 * When to use: Build an `OrderLineShape` and pass it to `drawOrderLine`.
 * Expected outcome: Canvas drawing only; nothing here reads game state.
 * Exceptions: None.
 */
import { ORDER_ARROW_SIZE, ORDER_LINE_CASING_COLOR, ORDER_LINE_CASING_PAD, ORDER_LINE_WIDTH } from '../core/constants';
import { orderArrowGeometry, orderEndsCoincide, type CanvasPoint } from '../../shared/orderArrowGeometry';

/**
 * The dash pattern for the part of a route beyond this turn or beat, in CSS pixels.
 *
 * Purpose: Movement routes and their previews draw this turn's part solid and the rest with this dash.
 * When to use: As the `dash` of a run that lies beyond this turn or beat.
 * Expected outcome: 6 px drawn, 4 px skipped.
 * Exceptions: None.
 */
export const ORDER_LINE_LATER_DASH: readonly number[] = [6, 4];

/**
 * The dash pattern for a planned missile launch, in CSS pixels.
 *
 * Purpose: A launch stays crimson with the other planned attacks, and the dot pattern is what tells it from a solid ranged arrow and a dashed air strike.
 * When to use: As the `dash` of a planned, hover, or playback missile arrow. The connector cap is round, so each mark reads as a dot.
 * Expected outcome: 2 px drawn, 6 px skipped.
 * Exceptions: None.
 */
export const ATTACK_LINE_DOT_DASH: readonly number[] = [2, 6];

/**
 * The dash pattern for a solid run.
 *
 * Purpose: Names the empty pattern so a run's style reads plainly.
 * When to use: As the `dash` of a run drawn solid.
 * Expected outcome: An empty array.
 * Exceptions: None.
 */
export const ORDER_LINE_SOLID: readonly number[] = [];

/**
 * One drawn run of an order line: canvas points joined in order, and the run's dash pattern.
 *
 * Purpose: A route can switch from solid to dashed part way; each part is its own run.
 * When to use: The `runs` of an `OrderLineShape`.
 * Expected outcome: Two or more points draw a line; fewer draw nothing.
 * Exceptions: None.
 */
export type OrderLineRun = {
  readonly points: readonly CanvasPoint[];
  readonly dash: readonly number[];
  /**
   * Draws the run as one line even when it is wider than half the canvas.
   *
   * Purpose: A missile arrow is often wider than half the canvas, and the wrap test would otherwise drop it. The target point is already placed the short way round.
   * When to use: Missile launches and missile playback.
   * Expected outcome: `traceRun` uses `lineTo` for every point.
   * Exceptions: None. Omitted means the date-line wrap test still applies.
   */
  readonly continuous?: boolean;
};

/**
 * Everything one order line draws: its runs and, optionally, an arrowhead from `orderArrowGeometry`.
 *
 * Purpose: The casing and the colored line must trace the same shape.
 * When to use: Build one per order line and pass it to `drawOrderLine`.
 * Expected outcome: Plain data; nothing is drawn until `drawOrderLine`.
 * Exceptions: None.
 */
export type OrderLineShape = {
  readonly runs: readonly OrderLineRun[];
  readonly arrow: ReturnType<typeof orderArrowGeometry> | null;
};

/**
 * Traces a run as one path, starting a new piece wherever it jumps across the map's date line.
 *
 * Purpose: A route that crosses the date line would otherwise draw a line across the whole map.
 * When to use: Only by `drawOrderLine`, once for the casing and once for the line.
 * Expected outcome: The current path holds the run; nothing is stroked here.
 * Exceptions: None.
 */
function traceRun(ctx: CanvasRenderingContext2D, points: readonly CanvasPoint[], continuous = false): void {
  const wrapJumpPx = ctx.canvas.width * 0.5;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const current = points[i]!;
    if (!continuous && Math.abs(current.x - points[i - 1]!.x) > wrapJumpPx) ctx.moveTo(current.x, current.y);
    else ctx.lineTo(current.x, current.y);
  }
}

/**
 * Traces an arrowhead as a closed triangle.
 *
 * Purpose: The casing and the colored arrowhead use the same outline.
 * When to use: Only by `drawOrderLine`.
 * Expected outcome: The current path holds the triangle; nothing is filled or stroked here.
 * Exceptions: None.
 */
function traceArrow(ctx: CanvasRenderingContext2D, arrow: ReturnType<typeof orderArrowGeometry>): void {
  ctx.beginPath();
  ctx.moveTo(arrow.tip.x, arrow.tip.y);
  ctx.lineTo(arrow.left.x, arrow.left.y);
  ctx.lineTo(arrow.right.x, arrow.right.y);
  ctx.closePath();
}

/**
 * Draws one order line: the whole casing first, then the colored runs and the arrowhead.
 *
 * Purpose: Drawing every casing before any color keeps the outline from cutting across the line where an arrowhead or
 *   a dashed run begins.
 * When to use: For every movement, ranged, air-strike, and missile line, queued, previewed, or played back. Set
 *   `globalAlpha` on the context first when the line is translucent.
 * Expected outcome: The runs are stroked with `style.color` at `style.width`, each with its own dash, and the
 *   arrowhead is filled and outlined in the same color at the movement line's width. Under all of it is a solid pale
 *   casing `ORDER_LINE_CASING_PAD` wider on each side. The context's line settings are restored afterwards.
 * Exceptions: None. Runs with fewer than two points are skipped.
 */
export function drawOrderLine(
  ctx: CanvasRenderingContext2D,
  shape: OrderLineShape,
  style: { readonly color: string; readonly width: number; readonly cap?: CanvasLineCap }
): void {
  const runs = shape.runs.filter((run) => run.points.length >= 2);
  if (runs.length === 0 && !shape.arrow) return;
  ctx.save();
  ctx.lineJoin = 'round';

  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = ORDER_LINE_CASING_COLOR;
  ctx.fillStyle = ORDER_LINE_CASING_COLOR;
  ctx.lineWidth = style.width + ORDER_LINE_CASING_PAD * 2;
  for (const run of runs) {
    traceRun(ctx, run.points, run.continuous === true);
    ctx.stroke();
  }
  if (shape.arrow) {
    ctx.lineWidth = ORDER_LINE_WIDTH + ORDER_LINE_CASING_PAD * 2;
    traceArrow(ctx, shape.arrow);
    ctx.fill();
    ctx.stroke();
  }

  ctx.lineCap = style.cap ?? 'round';
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color;
  ctx.lineWidth = style.width;
  for (const run of runs) {
    ctx.setLineDash([...run.dash]);
    traceRun(ctx, run.points, run.continuous === true);
    ctx.stroke();
  }
  if (shape.arrow) {
    ctx.setLineDash([]);
    ctx.lineWidth = ORDER_LINE_WIDTH;
    traceArrow(ctx, shape.arrow);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Builds the shape of a straight order line with an arrowhead at its far end.
 *
 * Purpose: Most order lines are one straight run; this keeps their arrow geometry in one place.
 * When to use: For a line from `from` to `to` in canvas pixels. `tipInset` is the unit radius when a unit marker
 *   sits at `to`, or 0 for a hex center.
 * Expected outcome: One run from `from` to the arrow's base, with `dash`, and the arrowhead. When `from` and `to` are the
 *   same point, no run and no arrowhead.
 * Exceptions: None.
 */
export function straightOrderLineShape(
  from: CanvasPoint,
  to: CanvasPoint,
  tipInset: number,
  dash: readonly number[] = ORDER_LINE_SOLID,
  options?: { readonly continuous?: boolean }
): OrderLineShape {
  if (orderEndsCoincide(from, to)) return { runs: [], arrow: null };
  const arrow = orderArrowGeometry(from, to, { arrowSize: ORDER_ARROW_SIZE, tipInset });
  return { runs: [{ points: [from, arrow.lineEnd], dash, ...(options?.continuous ? { continuous: true } : {}) }], arrow };
}

/**
 * Builds the arrowhead for the end of a route, pointing from its second-to-last point to its last.
 *
 * Purpose: Route arrows end on the destination hex's center, as the movement arrows always have.
 * When to use: For the last two points of a route's last run.
 * Expected outcome: An arrowhead whose tip is `to`, or null when `from` and `to` are the same point.
 * Exceptions: None.
 */
export function routeEndArrow(from: CanvasPoint, to: CanvasPoint): ReturnType<typeof orderArrowGeometry> | null {
  if (orderEndsCoincide(from, to)) return null;
  return orderArrowGeometry(from, to, { arrowSize: ORDER_ARROW_SIZE, tipInset: 0 });
}
