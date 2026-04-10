/**
 * Defines the `projectedPolygonOverlapsViewport` function shape (export function projectedPolygonOverlapsViewport().

 * Purpose: Supports maintainability by documenting why `projectedPolygonOverlapsViewport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function projectedPolygonOverlapsViewport(
  pts: { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number
): boolean {
  if (pts.length === 0) return false;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return maxX >= 0 && maxY >= 0 && minX <= viewportWidth && minY <= viewportHeight;
}

/**
 * Defines the `spanForProjectedHex` function shape (export function spanForProjectedHex(pts:).

 * Purpose: Supports maintainability by documenting why `spanForProjectedHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function spanForProjectedHex(pts: { x: number; y: number }[]): number {
  if (pts.length === 0) return 1;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(1, Math.min(maxX - minX, maxY - minY));
}
