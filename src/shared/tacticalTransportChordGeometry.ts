/**
 * Pure geometry for tactical transport canvas overlays: infer edge-to-edge chords (and short spurs) from boolean side masks.
 *
 * Purpose: Keeps mask→screen mapping deterministic, testable, and independent of Canvas so pairing rules stay auditable.
 * When to use: From `tacticalCityOverlays` / terrain infrastructure overlay passes when drawing road/rail lines from `road_sides` / `rail_sides`.
 * Expected outcome: Segment endpoints lie on projected hex boundary midpoints; odd leftovers use a short inward spur.
 * Exceptions: Callers must supply `mask`, `order`, and `pts` with equal side count `n` (5 or 6); empty masks yield no segments.
 */

import { TACTICAL_MAP_OVERLAY_TRANSPORT_CHORD_SPUR_LENGTH_FACTOR } from './tacticalMapOverlayConstants';

/**
 * Documents the `ScreenPoint` interface as a named contract surface (export interface ScreenPoint).

 * Purpose: Names the minimal 2D point shape used for projected hex vertices and segment endpoints.
 * When to use: Arguments to `buildTransportChordSegments` and internal midpoint helpers.
 * Expected outcome: Immutable `x`/`y` numbers in container pixel space.
 * Exceptions: None.
 */
export interface ScreenPoint {
  /**
   * Specifies the contract for the `x` member (x: number;).

   * Contract: Container-space horizontal coordinate in pixels.
   * When to use: Whenever a projected map coordinate is needed for chord math.
   * Expected outcome: Finite number.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * Specifies the contract for the `y` member (y: number;).

   * Contract: Container-space vertical coordinate in pixels.
   * When to use: Whenever a projected map coordinate is needed for chord math.
   * Expected outcome: Finite number.
   * Exceptions: None.
   */
  readonly y: number;
}

/**
 * Documents the `TransportChordSegment` interface as a named contract surface (export interface TransportChordSegment).

 * Purpose: Describes one drawable open segment for road or rail strokes in screen space.
 * When to use: Output list from `buildTransportChordSegments` consumed by the canvas overlay pass.
 * Expected outcome: `isSpur` is true only for the odd-one-out short segment toward the centroid.
 * Exceptions: None.
 */
export interface TransportChordSegment {
  /**
   * Specifies the contract for the `ax` member (ax: number;).

   * Contract: Segment start x in container pixels.
   * When to use: Passed to canvas line drawing.
   * Expected outcome: Finite number.
   * Exceptions: None.
   */
  readonly ax: number;
  /**
   * Specifies the contract for the `ay` member (ay: number;).

   * Contract: Segment start y in container pixels.
   * When to use: Passed to canvas line drawing.
   * Expected outcome: Finite number.
   * Exceptions: None.
   */
  readonly ay: number;
  /**
   * Specifies the contract for the `bx` member (bx: number;).

   * Contract: Segment end x in container pixels.
   * When to use: Passed to canvas line drawing.
   * Expected outcome: Finite number.
   * Exceptions: None.
   */
  readonly bx: number;
  /**
   * Specifies the contract for the `by` member (by: number;).

   * Contract: Segment end y in container pixels.
   * When to use: Passed to canvas line drawing.
   * Expected outcome: Finite number.
   * Exceptions: None.
   */
  readonly by: number;
  /**
   * Specifies the contract for the `isSpur` member (isSpur: boolean;).

   * Contract: True when this segment is the inward spur for a lone unpaired active side (not a boundary chord).
   * When to use: Rail tie density heuristics in the renderer.
   * Expected outcome: Boolean aligned with export pairing policy.
   * Exceptions: None.
   */
  readonly isSpur: boolean;
}

/**
 * Returns mask slot indices with `true` entries, ascending (canonical side order).

 * Purpose: Normalizes active-side iteration for deterministic pairing.
 * When to use: First step of `buildTransportChordSegments`.
 * Expected outcome: Length between 0 and `mask.length`.
 * Exceptions: None; treats non-boolean entries as inactive.
 */
export function transportActiveSideIndices(mask: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === true) out.push(i);
  }
  return out;
}

/**
 * Returns the shortest ring distance in whole side steps between two mask slot indices on an n-gon.

 * Purpose: Chooses the farthest-apart pairing by maximizing this distance (more visually opposite on the hex/pent).
 * When to use: Inside `pairTransportMaskSides` when scoring candidate `b` for anchor `a`.
 * Expected outcome: Integer in `[0, floor(n/2)]`.
 * Exceptions: None; assumes `0 <= a < n` and `0 <= b < n`.
 */
export function ringStepDistanceBetweenSlots(a: number, b: number, n: number): number {
  const forward = (b - a + n) % n;
  return Math.min(forward, n - forward);
}

/**
 * Pairs active mask slots using the locked greedy policy: smallest remaining slot anchors, pair with farthest remaining by ring steps, tie-break lower index.

 * Purpose: Converts an active-side set into disjoint pairs plus at most one leftover for spur rendering.
 * When to use: From `buildTransportChordSegments` after sorting active indices.
 * Expected outcome: Each index appears in at most one pair; leftover is null when active count is even.
 * Exceptions: None.
 */
export function pairTransportMaskSides(
  activeSorted: readonly number[],
  n: number
): { pairs: [number, number][]; leftover: number | null } {
  const pool = [...activeSorted].sort((x, y) => x - y);
  const pairs: [number, number][] = [];
  while (pool.length >= 2) {
    pool.sort((x, y) => x - y);
    const a = pool.shift()!;
    let bestB = -1;
    let bestD = -1;
    for (const b of pool) {
      const d = ringStepDistanceBetweenSlots(a, b, n);
      if (d > bestD || (d === bestD && (bestB < 0 || b < bestB))) {
        bestD = d;
        bestB = b;
      }
    }
    if (bestB < 0) break;
    const idx = pool.indexOf(bestB);
    if (idx >= 0) pool.splice(idx, 1);
    pairs.push([a, bestB]);
  }
  const leftover = pool.length === 1 ? pool[0]! : null;
  return { pairs, leftover };
}

/**
 * Midpoint of the projected boundary edge for mask slot `slot` using forward-edge vertex order.

 * Purpose: Maps canonical mask index to screen-space edge midpoint for chord endpoints.
 * When to use: For each chord endpoint and spur anchor.
 * Expected outcome: Midpoint of `pts[order[slot]]`→`pts[(order[slot]+1)%pts.length]`.
 * Exceptions: None; callers must keep `order[slot]` in range.
 */
function sideMidpointForSlot(
  slot: number,
  order: readonly number[],
  pts: readonly ScreenPoint[]
): ScreenPoint {
  const ei = order[slot]!;
  const p0 = pts[ei]!;
  const p1 = pts[(ei + 1) % pts.length]!;
  return { x: 0.5 * (p0.x + p1.x), y: 0.5 * (p0.y + p1.y) };
}

/**
 * Builds screen-space chord and spur segments for one boolean side mask on one tactical cell.

 * Purpose: Replaces center-to-edge spokes with edge-to-edge chords inferred only from masks (no polyline payload).
 * When to use: Once per road mask and once per rail mask in the inspection overlay when `order` and `pts` are known.
 * Expected outcome: Empty list when no sides active; chords have `isSpur: false`; at most one spur with `isSpur: true`.
 * Exceptions: Returns empty when `mask.length` disagrees with `order.length` or `pts.length`.
 */
export function buildTransportChordSegments(
  mask: readonly boolean[],
  order: readonly number[],
  pts: readonly ScreenPoint[],
  centroid: ScreenPoint
): TransportChordSegment[] {
  const n = mask.length;
  if (n !== order.length || n !== pts.length || n < 5) return [];

  const active = transportActiveSideIndices(mask);
  if (active.length === 0) return [];

  const { pairs, leftover } = pairTransportMaskSides(active, n);
  const out: TransportChordSegment[] = [];
  const f = TACTICAL_MAP_OVERLAY_TRANSPORT_CHORD_SPUR_LENGTH_FACTOR;

  for (const [a, b] of pairs) {
    const ma = sideMidpointForSlot(a, order, pts);
    const mb = sideMidpointForSlot(b, order, pts);
    out.push({ ax: ma.x, ay: ma.y, bx: mb.x, by: mb.y, isSpur: false });
  }

  if (leftover !== null) {
    const m = sideMidpointForSlot(leftover, order, pts);
    out.push({
      ax: m.x,
      ay: m.y,
      bx: m.x + f * (centroid.x - m.x),
      by: m.y + f * (centroid.y - m.y),
      isSpur: true,
    });
  }

  return out;
}
