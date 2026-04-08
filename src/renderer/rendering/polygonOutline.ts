export interface ScreenPoint {
  x: number;
  y: number;
}

export function drawClosedPolygonPath(ctx: CanvasRenderingContext2D, points: readonly ScreenPoint[]): void {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

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
