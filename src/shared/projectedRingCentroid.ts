/**
 * Screen-space center of a projected hex ring.
 *
 * Purpose: City labels and inspection icons share one center for a ring of container points.
 * When to use: After a hex boundary has been projected and the ring is not empty.
 * Expected outcome: The arithmetic mean of the points, in the same order. An empty ring returns NaN coordinates.
 * Exceptions: None.
 */

/**
 * Returns the arithmetic mean of projected points.
 *
 * Purpose: A label or icon row sits on the center of the hex ring.
 * When to use: When `points` is a non-empty projected boundary.
 * Expected outcome: `{ x, y }` is the mean. An empty list returns NaN for both.
 * Exceptions: None.
 */
export function projectedRingCentroid(
  points: readonly { readonly x: number; readonly y: number }[],
): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
  }
  const count = points.length;
  return { x: sx / count, y: sy / count };
}
