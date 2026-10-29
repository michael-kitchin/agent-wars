/**
 * Corner finding and tick placement for a fortified polygon.
 *
 * Purpose: A bent border must still light the real sides, and ticks must point inward.
 * When to use: After changing `fortificationEdges` or `fortificationTickSegments`.
 * Expected outcome: The cases below.
 * Exceptions: None.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fortificationEdges,
  fortificationTickSegments,
  litFortificationEdgeCount,
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

test('lit edges follow the fortified share of the city', () => {
  assert.equal(litFortificationEdgeCount({ fortified: 0, intactCityCells: 21, edgeCount: 6 }), 0);
  assert.equal(litFortificationEdgeCount({ fortified: 1, intactCityCells: 145, edgeCount: 6 }), 1);
  assert.equal(litFortificationEdgeCount({ fortified: 9, intactCityCells: 21, edgeCount: 6 }), 3);
  assert.equal(litFortificationEdgeCount({ fortified: 21, intactCityCells: 21, edgeCount: 6 }), 6);
});

test('ticks point inward and the first edge starts at the top corner', () => {
  const hex = regularPolygon(6, 30);
  const edges = fortificationEdges(hex, 6);
  const top = hex.reduce((best, point) => (point.y < best.y ? point : best));
  assert.equal(edges[0]?.[0]?.x, top.x);
  assert.equal(edges[0]?.[0]?.y, top.y);
  const segments = fortificationTickSegments({ points: hex, cornerCount: 6, litEdgeCount: 6, tickLengthPx: 4 });
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
