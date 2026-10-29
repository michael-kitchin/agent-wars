/**
 * Screen-space edges and tick segments for a fortified polygon.
 *
 * Purpose: The map, the battle view, and the legend share one way of finding real corners and placing inward ticks.
 * When to use: Before stroking ticks. Drawing and color stay with the caller.
 * Expected outcome: Clockwise edges on screen, and ticks that point toward the mean of the corners.
 * Exceptions: None. Fewer than three points yields no edges.
 */

/** How many ticks sit on one lit edge. */
export const FORTIFICATION_TICKS_PER_EDGE = 4;

/**
 * Screen distance below which two boundary points are the same vertex.
 *
 * Purpose: H3 rings repeat the first point at the end, and projection can leave near-duplicates.
 * When to use: `fortificationEdges`, before measuring corners.
 * Expected outcome: 0.5 pixels.
 * Exceptions: None.
 */
export const FORTIFICATION_DUPLICATE_POINT_PX = 0.5;

/**
 * A point in screen pixels.
 *
 * Purpose: Tick geometry is independent of the map projection.
 * When to use: Boundary rings and tick endpoints.
 * Expected outcome: `x` grows right and `y` grows down.
 * Exceptions: None.
 */
export interface ScreenPoint {
  /**
   * Horizontal screen position.
   *
   * Contract: Grows to the right.
   * When to use: A boundary corner or a tick end.
   * Expected outcome: Pixels.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * Vertical screen position.
   *
   * Contract: Grows downward.
   * When to use: A boundary corner or a tick end.
   * Expected outcome: Pixels. A clockwise ring then has positive shoelace area.
   * Exceptions: None.
   */
  readonly y: number;
}

/**
 * One tick, from the boundary toward the interior.
 *
 * Purpose: The canvas stroke needs a segment, not a polygon.
 * When to use: The result of `fortificationTickSegments`.
 * Expected outcome: `(x1, y1)` is on the edge. `(x2, y2)` is inward.
 * Exceptions: None.
 */
export interface TickSegment {
  /**
   * Horizontal start, on the edge.
   *
   * Contract: Screen pixels, growing right.
   * When to use: The outer end of one tick.
   * Expected outcome: A point on the boundary.
   * Exceptions: None.
   */
  readonly x1: number;
  /**
   * Vertical start, on the edge.
   *
   * Contract: Screen pixels, growing down.
   * When to use: The outer end of one tick.
   * Expected outcome: A point on the boundary.
   * Exceptions: None.
   */
  readonly y1: number;
  /**
   * Horizontal end, inward.
   *
   * Contract: Screen pixels, growing right.
   * When to use: The inner end of one tick.
   * Expected outcome: The inner end. A vertical tick can share `x1`.
   * Exceptions: None.
   */
  readonly x2: number;
  /**
   * Vertical end, inward.
   *
   * Contract: Screen pixels, growing down.
   * When to use: The inner end of one tick.
   * Expected outcome: The inner end. A horizontal tick can share `y1`.
   * Exceptions: None.
   */
  readonly y2: number;
}

/**
 * Drops near-duplicate boundary points.
 *
 * Purpose: A repeated closing point would invent a zero-length edge.
 * When to use: The first step of `fortificationEdges`.
 * Expected outcome: Consecutive points are at least `FORTIFICATION_DUPLICATE_POINT_PX` apart, and the last point is not the first.
 * Exceptions: None.
 */
function dropDuplicatePoints(points: readonly ScreenPoint[]): ScreenPoint[] {
  const kept: ScreenPoint[] = [];
  for (const point of points) {
    const previous = kept[kept.length - 1];
    if (previous && distance(previous, point) < FORTIFICATION_DUPLICATE_POINT_PX) continue;
    kept.push(point);
  }
  const first = kept[0];
  const last = kept[kept.length - 1];
  if (first && last && kept.length > 1 && distance(first, last) < FORTIFICATION_DUPLICATE_POINT_PX) kept.pop();
  return kept;
}

/**
 * Signed shoelace area.
 *
 * Purpose: Screen y grows down, so a clockwise ring has a positive area.
 * When to use: Before walking edges.
 * Expected outcome: Positive when the ring is clockwise on screen.
 * Exceptions: None.
 */
function signedScreenArea(points: readonly ScreenPoint[]): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return sum;
}

/**
 * Absolute turn at one vertex.
 *
 * Purpose: Real hex corners turn about 60 degrees. A point inserted on an edge barely turns.
 * When to use: Ranking boundary points.
 * Expected outcome: Radians in `[0, pi]`.
 * Exceptions: None. A zero-length side turns 0.
 */
function turnAngle(previous: ScreenPoint, current: ScreenPoint, next: ScreenPoint): number {
  const ax = current.x - previous.x;
  const ay = current.y - previous.y;
  const bx = next.x - current.x;
  const by = next.y - current.y;
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
}

function distance(from: ScreenPoint, to: ScreenPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * Splits a boundary into edges between its real corners.
 *
 * Purpose: Regional borders bend, and the ticks belong on the hex's sides rather than on those bends.
 * When to use: Before choosing how many edges to light.
 * Expected outcome: One polyline per corner, clockwise, starting at the topmost corner. Ties use the smaller `x`. An empty list when fewer than three points remain.
 * Exceptions: None.
 */
export function fortificationEdges(points: readonly ScreenPoint[], cornerCount: number): ScreenPoint[][] {
  const ring = dropDuplicatePoints(points);
  if (ring.length < 3) return [];
  if (signedScreenArea(ring) < 0) ring.reverse();
  const ranked = ring.map((point, index) => ({
    index,
    angle: turnAngle(ring[(index - 1 + ring.length) % ring.length]!, point, ring[(index + 1) % ring.length]!),
  }));
  ranked.sort((left, right) => right.angle - left.angle || left.index - right.index);
  const chosenCount = Math.min(Math.max(0, cornerCount), ring.length);
  const chosen = ranked
    .slice(0, chosenCount)
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  if (chosen.length === 0) return [];
  let startSlot = 0;
  for (let slot = 1; slot < chosen.length; slot += 1) {
    const point = ring[chosen[slot]!]!;
    const best = ring[chosen[startSlot]!]!;
    if (point.y < best.y || (point.y === best.y && point.x < best.x)) startSlot = slot;
  }
  const ordered = [...chosen.slice(startSlot), ...chosen.slice(0, startSlot)];
  return ordered.map((from, slot) => {
    const to = ordered[(slot + 1) % ordered.length]!;
    const edge: ScreenPoint[] = [];
    let index = from;
    while (true) {
      edge.push(ring[index]!);
      if (index === to) break;
      index = (index + 1) % ring.length;
      if (edge.length > ring.length) break;
    }
    return edge;
  });
}

/**
 * How many edges show ticks.
 *
 * Purpose: A partly fortified city lights a share of its sides, and a fully fortified city lights all of them.
 * When to use: After counting fortified and intact city cells.
 * Expected outcome: 0 when nothing is fortified. Otherwise the rounded share, clamped to `1..edgeCount`.
 * Exceptions: None.
 */
export function litFortificationEdgeCount(args: {
  readonly fortified: number;
  readonly intactCityCells: number;
  readonly edgeCount: number;
}): number {
  if (args.fortified <= 0 || args.edgeCount <= 0) return 0;
  const share = Math.round((args.edgeCount * args.fortified) / Math.max(args.intactCityCells, args.fortified));
  return Math.min(args.edgeCount, Math.max(1, share));
}

/**
 * Places inward ticks on the first lit edges.
 *
 * Purpose: Each lit side gets the same number of ticks, spaced along its length.
 * When to use: After `fortificationEdges` and `litFortificationEdgeCount`.
 * Expected outcome: `litEdgeCount * FORTIFICATION_TICKS_PER_EDGE` segments. Each tick points toward the mean of the corners.
 * Exceptions: None. No edges yields no segments.
 */
export function fortificationTickSegments(args: {
  readonly points: readonly ScreenPoint[];
  readonly cornerCount: number;
  readonly litEdgeCount: number;
  readonly tickLengthPx: number;
}): TickSegment[] {
  const edges = fortificationEdges(args.points, args.cornerCount);
  const corners = edges.map((edge) => edge[0]).filter((point): point is ScreenPoint => point != null);
  const lit = edges.slice(0, Math.max(0, args.litEdgeCount));
  if (corners.length === 0) return [];
  const center = meanPoint(corners);
  const segments: TickSegment[] = [];
  for (const edge of lit) {
    const length = polylineLength(edge);
    if (length <= 0) continue;
    for (let tick = 1; tick <= FORTIFICATION_TICKS_PER_EDGE; tick += 1) {
      const at = pointAlong(edge, (length * tick) / (FORTIFICATION_TICKS_PER_EDGE + 1));
      if (!at) continue;
      const inward = inwardNormal(at.dx, at.dy, at.point, center);
      segments.push({
        x1: at.point.x,
        y1: at.point.y,
        x2: at.point.x + inward.x * args.tickLengthPx,
        y2: at.point.y + inward.y * args.tickLengthPx,
      });
    }
  }
  return segments;
}

function meanPoint(points: readonly ScreenPoint[]): ScreenPoint {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function polylineLength(points: readonly ScreenPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) length += distance(points[index - 1]!, points[index]!);
  return length;
}

function pointAlong(
  points: readonly ScreenPoint[],
  distanceAlong: number
): { readonly point: ScreenPoint; readonly dx: number; readonly dy: number } | null {
  let remaining = distanceAlong;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const span = distance(from, to);
    if (span <= 0) continue;
    if (remaining <= span || index === points.length - 1) {
      const t = Math.min(1, remaining / span);
      return {
        point: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t },
        dx: to.x - from.x,
        dy: to.y - from.y,
      };
    }
    remaining -= span;
  }
  return null;
}

function inwardNormal(dx: number, dy: number, origin: ScreenPoint, center: ScreenPoint): ScreenPoint {
  const span = Math.hypot(dx, dy) || 1;
  let x = -dy / span;
  let y = dx / span;
  if (x * (center.x - origin.x) + y * (center.y - origin.y) < 0) {
    x = -x;
    y = -y;
  }
  return { x, y };
}
