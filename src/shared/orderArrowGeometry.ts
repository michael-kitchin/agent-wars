/**
 * A point on the map canvas, in CSS pixels.
 *
 * Purpose: Order lines and their arrowheads are worked out in canvas pixels.
 * When to use: Inputs and results of `orderArrowGeometry`.
 * Expected outcome: Plain `x` and `y` numbers.
 * Exceptions: None.
 */
export type CanvasPoint = { readonly x: number; readonly y: number };

/**
 * How wide an arrowhead's base is, as a share of its length on each side of the line.
 *
 * Purpose: Keeps the movement arrow's proportions for every order line that gets an arrowhead.
 * When to use: Only by `orderArrowGeometry`.
 * Expected outcome: 0.6, so a 10 px arrow has a 12 px base.
 * Exceptions: None.
 */
const ARROW_HALF_BASE_RATIO = 0.6;

/**
 * Works out where an order line stops and where its arrowhead's three corners are.
 *
 * Purpose: Movement, ranged, and air-strike lines share one arrow shape, so the geometry is written once and tested.
 * When to use: For a line from `from` toward `to`. `tipInset` is how far short of `to` the arrow's tip stops: the unit
 *   radius when a unit marker sits at `to`, or 0 for a route that ends at a hex center.
 * Expected outcome: `tip` lies on the line, `tipInset` short of `to`. `lineEnd`, where the line stops, is
 *   `arrowSize` further back, in the middle of the arrow's base; `left` and `right` are the base's corners. When
 *   `from` and `to` are the same point, the arrow points along +x.
 * Exceptions: None.
 */
export function orderArrowGeometry(
  from: CanvasPoint,
  to: CanvasPoint,
  sizes: { readonly arrowSize: number; readonly tipInset: number }
): { readonly lineEnd: CanvasPoint; readonly tip: CanvasPoint; readonly left: CanvasPoint; readonly right: CanvasPoint } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = length > 0 ? dx / length : 1;
  const uy = length > 0 ? dy / length : 0;
  const tip = { x: to.x - ux * sizes.tipInset, y: to.y - uy * sizes.tipInset };
  const lineEnd = { x: tip.x - ux * sizes.arrowSize, y: tip.y - uy * sizes.arrowSize };
  const halfBase = sizes.arrowSize * ARROW_HALF_BASE_RATIO;
  return {
    lineEnd,
    tip,
    left: { x: lineEnd.x + uy * halfBase, y: lineEnd.y - ux * halfBase },
    right: { x: lineEnd.x - uy * halfBase, y: lineEnd.y + ux * halfBase },
  };
}

/**
 * True when two canvas points are the same spot.
 *
 * Purpose: A movement line from a unit to the hex it already occupies has no route, and must not leave an arrowhead.
 * When to use: Before building an arrow or a straight order line.
 * Expected outcome: True when the points are under half a pixel apart. A real hex step is many pixels, so it stays false.
 * Exceptions: None.
 */
export function orderEndsCoincide(from: CanvasPoint, to: CanvasPoint): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) < 0.5;
}
