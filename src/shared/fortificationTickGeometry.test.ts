/**
 * Corner finding and tick placement for a fortified polygon.
 *
 * Purpose: A bent border must still light the real sides, and ticks must point inward.
 * When to use: After changing `fortificationEdges`, `fortificationTicksPerEdge`, or `fortificationTickSegments`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fortificationEdges,
  fortificationTickSegments,
  fortificationTicksPerEdge,
  type ScreenPoint,
} from './fortificationTickGeometry';

function regularPolygon(sides: number, radius: number): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = (index * 2 * Math.PI) / sides;
    points.push({ x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius });
  }
  return points;
}

test('a hexagon keeps six edges when a side is bent or the ring repeats its start', () => {
  const hex = regularPolygon(6, 30);
  assert.equal(fortificationEdges(hex, 6).length, 6);
  const first = hex[0]!;
  const second = hex[1]!;
  const bent = [
    first,
    { x: (first.x + second.x) / 2 + 0.2, y: (first.y + second.y) / 2 },
    ...hex.slice(1),
  ];
  assert.equal(fortificationEdges(bent, 6).length, 6);
  assert.equal(fortificationEdges([...hex, first], 6).length, 6);
  assert.equal(fortificationEdges(regularPolygon(5, 30), 5).length, 5);
});

test('each edge gets the quartile share of ticks', () => {
  const ticks = (fortified: number, intactCityCells: number): number =>
    fortificationTicksPerEdge({ fortified, intactCityCells });
  assert.equal(ticks(0, 21), 0);
  assert.equal(ticks(-1, 21), 0);
  assert.equal(ticks(1, 145), 1);
  assert.equal(ticks(1, 4), 1);
  assert.equal(ticks(10, 50), 1);
  assert.equal(ticks(5, 27), 1);
  assert.equal(ticks(26, 100), 2);
  assert.equal(ticks(10, 24), 2);
  assert.equal(ticks(50, 100), 2);
  assert.equal(ticks(51, 100), 3);
  assert.equal(ticks(75, 100), 3);
  assert.equal(ticks(76, 100), 4);
  assert.equal(ticks(21, 21), 4);
  assert.equal(ticks(5, 0), 4);
});

test('ticks point inward and the first edge starts at the top corner', () => {
  const hex = regularPolygon(6, 30);
  const edges = fortificationEdges(hex, 6);
  const top = hex.reduce((best, point) => (point.y < best.y ? point : best));
  assert.equal(edges[0]?.[0]?.x, top.x);
  assert.equal(edges[0]?.[0]?.y, top.y);
  const segments = fortificationTickSegments({ points: hex, cornerCount: 6, ticksPerEdge: 4, tickLengthPx: 4 });
  assert.equal(segments.length, 24);
  let x = 0;
  let y = 0;
  for (const edge of edges) {
    x += edge[0]!.x;
    y += edge[0]!.y;
  }
  x /= edges.length;
  y /= edges.length;
  for (const segment of segments) {
    const start = Math.hypot(segment.x1 - x, segment.y1 - y);
    const end = Math.hypot(segment.x2 - x, segment.y2 - y);
    assert.ok(end < start);
  }
});

test('ticks sit on equal segments of every edge', () => {
  assertTickFractions(1, [1 / 2]);
  assertTickFractions(2, [1 / 3, 2 / 3]);
  assertTickFractions(3, [1 / 4, 1 / 2, 3 / 4]);
  assertTickFractions(4, [1 / 5, 2 / 5, 3 / 5, 4 / 5]);
  const pentagon = regularPolygon(5, 30);
  const pentagonTicks = fortificationTickSegments({ points: pentagon, cornerCount: 5, ticksPerEdge: 2, tickLengthPx: 4 });
  assert.equal(pentagonTicks.length, 10);
  assert.equal(fortificationTickSegments({ points: pentagon, cornerCount: 5, ticksPerEdge: 0, tickLengthPx: 4 }).length, 0);
});

test('one tick sits at the middle of a bent edge', () => {
  const hex = regularPolygon(6, 30);
  const first = hex[0]!;
  const second = hex[1]!;
  const bend = { x: (first.x + second.x) / 2 + 2, y: (first.y + second.y) / 2 };
  const points = [first, bend, ...hex.slice(1)];
  const segments = fortificationTickSegments({ points, cornerCount: 6, ticksPerEdge: 1, tickLengthPx: 4 });
  assert.equal(segments.length, 6);
  const edge = fortificationEdges(points, 6)[0]!;
  assert.equal(edge.length, 3);
  const expected = pointAtFraction(edge, 1 / 2);
  const tick = segments[0]!;
  assert.ok(Math.hypot(tick.x1 - expected.x, tick.y1 - expected.y) < 1e-6);
  const chord = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  assert.ok(Math.hypot(tick.x1 - chord.x, tick.y1 - chord.y) > 0.5);
});

/**
 * Checks that each straight side carries ticks at the given fractions of its length.
 *
 * Purpose: The share tests count ticks. This one checks where they sit.
 * When to use: From the equal-segment test.
 * Expected outcome: One inward segment per fraction on each of the six sides. The outer end is on the side.
 * Exceptions: AssertionError when a tick is missing or off its fraction.
 */
/**
 * A point a fraction of the way along a polyline.
 *
 * Purpose: The bent-edge test needs the midpoint of the side, measured along the bend.
 * When to use: From that test.
 * Expected outcome: The point at `fraction` of the polyline length. A zero-length side returns its first point.
 * Exceptions: None.
 */
function pointAtFraction(points: readonly ScreenPoint[], fraction: number): ScreenPoint {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  }
  let remaining = length * fraction;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    if (span <= 0) continue;
    if (remaining <= span || index === points.length - 1) {
      const t = Math.min(1, remaining / span);
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    remaining -= span;
  }
  return points[0]!;
}

/**
 * Checks that each straight side carries ticks at the given fractions of its length.
 *
 * Purpose: The share tests count ticks. This one checks where they sit.
 * When to use: From the equal-segment test.
 * Expected outcome: One segment per fraction on each of the six sides. The outer end is on the side.
 * Exceptions: AssertionError when a tick is missing or off its fraction.
 */
function assertTickFractions(ticksPerEdge: number, fractions: readonly number[]): void {
  const hex = regularPolygon(6, 30);
  const edges = fortificationEdges(hex, 6);
  const segments = fortificationTickSegments({ points: hex, cornerCount: 6, ticksPerEdge, tickLengthPx: 4 });
  assert.equal(segments.length, edges.length * ticksPerEdge);
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex]!;
    const start = edge[0]!;
    const end = edge[edge.length - 1]!;
    for (let tick = 0; tick < ticksPerEdge; tick += 1) {
      const segment = segments[edgeIndex * ticksPerEdge + tick]!;
      const fraction = fractions[tick]!;
      const expectedX = start.x + (end.x - start.x) * fraction;
      const expectedY = start.y + (end.y - start.y) * fraction;
      assert.ok(Math.hypot(segment.x1 - expectedX, segment.y1 - expectedY) < 1e-6);
    }
  }
}
