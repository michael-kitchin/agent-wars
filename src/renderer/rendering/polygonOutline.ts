/**
 * Documents the `ScreenPoint` interface as a named contract surface (export interface ScreenPoint).

 * Purpose: Supports maintainability by documenting why `ScreenPoint` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface ScreenPoint {
    /**
   * Specifies the contract for the `x` member (x: number;).

   * Contract: Describes stable behavior for callers of `x` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
x: number;
    /**
   * Specifies the contract for the `y` member (y: number;).

   * Contract: Describes stable behavior for callers of `y` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
y: number;
}

/**
 * Defines the `drawClosedPolygonPath` function shape (export function drawClosedPolygonPath(ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[]): void).

 * Purpose: Supports maintainability by documenting why `drawClosedPolygonPath` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawClosedPolygonPath(ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[]): void {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/**
 * Defines the `strokeDualClosedPolygon` function shape (export function strokeDualClosedPolygon( ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[], styles: { underStrokeColor: string; u).

 * Purpose: Supports maintainability by documenting why `strokeDualClosedPolygon` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function strokeDualClosedPolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly ScreenPoint[],
  styles: {
    underStrokeColor: string;
    underStrokeWidth: number;
    topStrokeColor: string;
    topStrokeWidth: number;
  }
): void {
  drawClosedPolygonPath(ctx, points);
  ctx.strokeStyle = styles.underStrokeColor;
  ctx.lineWidth = styles.underStrokeWidth;
  ctx.stroke();
  ctx.strokeStyle = styles.topStrokeColor;
  ctx.lineWidth = styles.topStrokeWidth;
  ctx.stroke();
}
