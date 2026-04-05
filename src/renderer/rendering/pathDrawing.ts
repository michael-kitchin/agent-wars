import { cellToLatLng } from 'h3-js';
import { alignLngToReference, clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { AI_ORDER_LINE_COLOR, ORDER_ARROW_SIZE, ORDER_LINE_COLOR, ORDER_LINE_WIDTH, PLAYER_COLORS, UNIT_RADIUS, UNIT_TYPE_LABELS } from '../core/constants';
import { getLeafletGlobal, hexCenterPx, hexCenterPxRelativeTo } from '../map/mapUtils';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import type { GameStateSnapshot, HumanStandingOrderSnapshot } from '../../shared/ipcTypes';
import type { ResolutionPlaybackMove } from '../core/types';
import { drawOneUnitMarker } from './unitDrawing';

export function drawLineArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = UNIT_RADIUS + ORDER_ARROW_SIZE;
  const endX = to.x - ux * inset;
  const endY = to.y - uy * inset;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(endX, endY);
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  const ax = endX + ux * ORDER_ARROW_SIZE;
  const ay = endY + uy * ORDER_ARROW_SIZE;
  const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
  const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX - perpX, endY - perpY);
  ctx.lineTo(endX + perpX, endY + perpY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.stroke();
}

export function drawArrowheadOnly(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  options?: { tipAtTargetCenter?: boolean }
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const inset = options?.tipAtTargetCenter ? ORDER_ARROW_SIZE : UNIT_RADIUS + ORDER_ARROW_SIZE;
  const endX = to.x - ux * inset;
  const endY = to.y - uy * inset;
  const ax = endX + ux * ORDER_ARROW_SIZE;
  const ay = endY + uy * ORDER_ARROW_SIZE;
  const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
  const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(endX - perpX, endY - perpY);
  ctx.lineTo(endX + perpX, endY + perpY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.stroke();
}

export function strokePolylineSkippingWrap(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  wrapJumpThresholdPx: number
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const current = points[i]!;
    if (Math.abs(current.x - prev.x) > wrapJumpThresholdPx) {
      ctx.moveTo(current.x, current.y);
      continue;
    }
    ctx.lineTo(current.x, current.y);
  }
  ctx.stroke();
}

export function drawStandingOrderLines(
  ctx: CanvasRenderingContext2D,
  orders: HumanStandingOrderSnapshot[],
  units: GameStateSnapshot['units'],
  excludeUnitIds?: ReadonlySet<string> | null
): void {
  if (orders.length === 0) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  for (const order of orders) {
    if (excludeUnitIds?.has(order.unitId)) continue;
    const unit = units.find((u) => u.id === order.unitId && u.player === 'human');
    if (!unit) continue;
    const segments = order.routeSegments ?? [];
    if (segments.length === 0) {
      if (order.destinationH3Index) {
        drawLineArrow(
          ctx,
          hexCenterPx(unit.h3Index),
          hexCenterPxRelativeTo(unit.h3Index, order.destinationH3Index),
          ORDER_LINE_COLOR
        );
      }
      continue;
    }
    let lastPenultimate: { x: number; y: number } | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    for (const seg of segments) {
      if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
      const points = seg.hexes.map(([lat, lng]) => {
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      ctx.setLineDash(seg.turn <= 1 ? [] : [6, 4]);
      ctx.strokeStyle = ORDER_LINE_COLOR;
      ctx.lineWidth = ORDER_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      lastPenultimate = points[points.length - 2] ?? null;
      lastPoint = points[points.length - 1] ?? null;
    }
    ctx.setLineDash([]);
    if (lastPenultimate && lastPoint) {
      drawArrowheadOnly(ctx, lastPenultimate, lastPoint, ORDER_LINE_COLOR, { tipAtTargetCenter: true });
    }
  }
}

export function drawResolutionMoveLines(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  moves: ResolutionPlaybackMove[],
  hexList: string[] | undefined,
  opacity: number,
  options?: { includeArrowForHuman?: boolean }
): void {
  void canvasWidth;
  void canvasHeight;
  if (moves.length === 0 || !hexList || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  const includeArrowForHuman = options?.includeArrowForHuman === true;
  for (const move of moves) {
    const isHumanMove = move.player === 'human';
    const lineColor = move.player === 'human' ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR;
    const from = hexCenterPx(move.fromH3Index);
    const to = hexCenterPxRelativeTo(move.fromH3Index, move.toH3Index);
    if (isHumanMove && includeArrowForHuman) {
      drawLineArrow(ctx, from, to, lineColor);
      continue;
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const inset = isHumanMove ? 0 : UNIT_RADIUS + ORDER_ARROW_SIZE;
    const endX = to.x - ux * inset;
    const endY = to.y - uy * inset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (isHumanMove) continue;
    const ax = endX + ux * ORDER_ARROW_SIZE;
    const ay = endY + uy * ORDER_ARROW_SIZE;
    const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
    const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.closePath();
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawMovingUnits(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  moves: ResolutionPlaybackMove[],
  hexList: string[],
  progress: number
): void {
  if (moves.length === 0 || progress >= 1) return;
  void canvasWidth;
  void canvasHeight;
  void hexList;
  const map = getMainLeafletMap() as
    | { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  for (const move of moves) {
    const [lat0, lng0] = cellToLatLng(move.fromH3Index);
    const [lat1, lng1] = cellToLatLng(move.toH3Index);
    const lng1Aligned = alignLngToReference(lng1, lng0);
    const lat = lat0 + progress * (lat1 - lat0);
    const lng = lng0 + progress * (lng1Aligned - lng0);
    const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
    const color = PLAYER_COLORS[move.player] ?? '#333';
    const label = UNIT_TYPE_LABELS[move.unitType] ?? '?';
    drawOneUnitMarker(ctx, p.x, p.y, color, label, '#fff');
  }
}
