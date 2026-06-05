/**
 * Pure H3 helpers to compute the outer perimeter of a set of hex cells as closed lat/lng loops.
 */

import {
  directedEdgeToBoundary,
  directedEdgeToCells,
  originToDirectedEdges,
} from 'h3-js';

/**
 * Defines the `endpointKey` function shape (function endpointKey(p: readonly [number, number]): string).
 *
 * Purpose: Rounds lat/lng endpoints so directed-edge segments chain reliably despite float noise.
 * When to use: Segment adjacency maps inside `chainSegmentsIntoLoops`.
 * Expected outcome: Stable string keys for matching segment endpoints.
 * Exceptions: None.
 */
function endpointKey(p: readonly [number, number]): string {
  return `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
}

type LatLngSegment = { readonly a: [number, number]; readonly b: [number, number] };

/**
 * Chains directed-edge boundary segments into one or more closed vertex loops.
 *
 * Purpose: Turns unordered exterior edge segments from `collectExteriorSegments` into drawable polygons.
 * When to use: After collecting perimeter segments for a hex set.
 * Expected outcome: Each loop lists vertices in order; first vertex need not repeat at end (canvas closes path).
 * Exceptions: Returns `[]` when `segments` is empty.
 */
function chainSegmentsIntoLoops(segments: readonly LatLngSegment[]): Array<Array<[number, number]>> {
  if (segments.length === 0) return [];

  const unused = new Set<number>(segments.map((_, i) => i));
  const neighbors = new Map<string, Array<{ idx: number; at: 'a' | 'b' }>>();
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    for (const [pt, at] of [
      [s.a, 'a'] as const,
      [s.b, 'b'] as const,
    ]) {
      const k = endpointKey(pt);
      const list = neighbors.get(k) ?? [];
      list.push({ idx: i, at });
      neighbors.set(k, list);
    }
  }

  const loops: Array<Array<[number, number]>> = [];

  while (unused.size > 0) {
    const startIdx = unused.values().next().value as number;
    unused.delete(startIdx);
    const startSeg = segments[startIdx]!;
    const loop: Array<[number, number]> = [startSeg.a, startSeg.b];
    let currentKey = endpointKey(startSeg.b);

    while (true) {
      const candidates = (neighbors.get(currentKey) ?? []).filter((c) => unused.has(c.idx));
      if (candidates.length === 0) break;
      const next = candidates[0]!;
      unused.delete(next.idx);
      const seg = segments[next.idx]!;
      if (endpointKey(seg.a) === currentKey) {
        loop.push(seg.b);
        currentKey = endpointKey(seg.b);
      } else {
        loop.push(seg.a);
        currentKey = endpointKey(seg.a);
      }
      if (currentKey === endpointKey(loop[0]!)) break;
    }

    if (loop.length >= 3) loops.push(loop);
  }

  return loops;
}

/**
 * Collects exterior directed-edge segments for a set of H3 cells (shared edge with outside omitted).
 *
 * Purpose: Feeds `chainSegmentsIntoLoops` with one segment per outward-facing cell edge.
 * When to use: Inside `computeUnionPerimeterLoops` only.
 * Expected outcome: Each segment is the lat/lng line along the cell side facing a neighbor not in `h3Indexes`.
 * Exceptions: Skips cells/edges that throw from h3-js.
 */
function collectExteriorSegments(h3Indexes: ReadonlySet<string>): LatLngSegment[] {
  const segments: LatLngSegment[] = [];
  for (const cell of h3Indexes) {
    let edges: string[];
    try {
      edges = originToDirectedEdges(cell);
    } catch {
      continue;
    }
    for (const edge of edges) {
      let cells: string[];
      try {
        cells = directedEdgeToCells(edge);
      } catch {
        continue;
      }
      const dest = cells[1];
      if (dest === undefined || h3Indexes.has(dest)) continue;
      let boundary: [number, number][];
      try {
        boundary = directedEdgeToBoundary(edge) as [number, number][];
      } catch {
        continue;
      }
      if (boundary.length < 2) continue;
      const a = boundary[0]!;
      const b = boundary[boundary.length - 1]!;
      segments.push({ a: [a[0], a[1]], b: [b[0], b[1]] });
    }
  }
  return segments;
}

/**
 * Returns closed perimeter loops (lat/lng vertices) around the union of `h3Indexes`.
 *
 * Purpose: Supplies map-overlay geometry for the selected-units range envelope without per-cell stroking.
 * When to use: After building the range hex set during ranged/strike planning mode.
 * Expected outcome: One loop per disjoint exterior boundary; empty input yields `[]`.
 * Exceptions: Never throws; malformed H3 input yields partial or empty loops.
 */
export function computeUnionPerimeterLoops(
  h3Indexes: ReadonlySet<string>
): Array<Array<[number, number]>> {
  if (h3Indexes.size === 0) return [];
  try {
    return chainSegmentsIntoLoops(collectExteriorSegments(h3Indexes));
  } catch {
    return [];
  }
}
