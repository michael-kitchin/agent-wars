import { cellToLatLng } from 'h3-js';
import { alignLngToReference, clampLatForWebMercatorDisplay } from '../map/hexGrid';
import {
  AI_ORDER_LINE_COLOR,
  COUNT_BADGE_OFFSET,
  ORDER_ARROW_SIZE,
  ORDER_LINE_COLOR,
  ORDER_LINE_WIDTH,
  PLAYER_COLORS,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  UNIT_RADIUS,
  UNIT_TYPE_LABELS,
} from '../core/constants';
import { getLeafletGlobal, hexCenterPx, hexCenterPxRelativeTo } from '../map/mapUtils';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import type { GameStateSnapshot, HumanStandingOrderSnapshot, TacticalPendingMarchRow } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildTacticalMarchDraftDestinationPreview } from '../../shared/tacticalMarchHoverPreview';
import type { ResolutionPlaybackMove } from '../core/types';
import { latLngAlongPolylineByArcFraction } from '../../shared/pathPolylineInterp.js';
import { drawOneUnitMarker } from './unitDrawing';

/**
 * Defines the `drawLineArrow` function shape (export function drawLineArrow().

 * Purpose: Supports maintainability by documenting why `drawLineArrow` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `drawArrowheadOnly` function shape (export function drawArrowheadOnly( ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, color: string, op).

 * Purpose: Supports maintainability by documenting why `drawArrowheadOnly` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `strokePolylineSkippingWrap` function shape (export function strokePolylineSkippingWrap( ctx: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, wrapJumpThresholdPx: number ): voi).

 * Purpose: Supports maintainability by documenting why `strokePolylineSkippingWrap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `drawStandingOrderLines` function shape (export function drawStandingOrderLines( ctx: CanvasRenderingContext2D, orders: HumanStandingOrderSnapshot[], units: GameStateSnapshot['units'], excl).

 * Purpose: Supports maintainability by documenting why `drawStandingOrderLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Draws semi-transparent planned march polylines for human tactical draft orders (Ready not yet pressed).
 *
 * Purpose: Mirrors strategic `drawStandingOrderLines` / hover styling so drafted res4 moves remain visible under units.
 * When to use: Only from the tactical `drawGameScene` branch while `S.tacticalPendingMarches` is non-empty.
 * Expected outcome: One route per draft row from snapshot `h3Index` to `destinationH3Index` at full opacity (matching strategic standing-order lines), solid for current-turn movement and dashed for future-turn continuation, using the same terrain-aware path as hover and commit.
 * Exceptions: Skips rows when the sub-unit row is missing or `buildTacticalMarchDraftDestinationPreview` yields no drawable segments.
 */
export function drawTacticalPendingMarchPlanLines(
  ctx: CanvasRenderingContext2D,
  battle: TacticalBattleSnapshot,
  pendingMarches: readonly TacticalPendingMarchRow[]
): void {
  if (pendingMarches.length === 0) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  ctx.save();
  for (const row of pendingMarches) {
    const sub = battle.subUnits.find((u) => u.id === row.subUnitId && u.player === 'human');
    if (!sub) continue;
    const fromH3 = sub.h3Index;
    const toH3 = row.destinationH3Index;
    if (fromH3 === toH3) continue;
    const useCached =
      row.cachedSegments &&
      row.cachedSegments.length > 0 &&
      row.pathH3Indexes?.[0] === fromH3;
    const preview = useCached
      ? { valid: true, segments: row.cachedSegments }
      : buildTacticalMarchDraftDestinationPreview(battle, row.subUnitId, toH3).preview;
    if (!preview.valid || preview.segments.length === 0) continue;
    let lastPenultimate: { x: number; y: number } | null = null;
    let lastPoint: { x: number; y: number } | null = null;
    for (const seg of preview.segments) {
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
  ctx.restore();
}

/**
 * Defines the `drawResolutionMoveLines` function shape (export function drawResolutionMoveLines( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, moves: ResolutionPlaybackMove[],).

 * Purpose: Supports maintainability by documenting why `drawResolutionMoveLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  const L = getLeafletGlobal();
  for (const move of moves) {
    const isHumanMove = move.player === 'human';
    const lineColor = move.player === 'human' ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR;
    const path = move.pathH3Indexes;
    if (path && path.length >= 2 && map) {
      const points = path.map((h) => {
        const [lat, lng] = cellToLatLng(h);
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = ORDER_LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      const hPen = path[path.length - 2]!;
      const hLast = path[path.length - 1]!;
      const fromPt = hexCenterPx(hPen);
      const toPt = hexCenterPxRelativeTo(hPen, hLast);
      if (isHumanMove && includeArrowForHuman) {
        drawArrowheadOnly(ctx, fromPt, toPt, lineColor, { tipAtTargetCenter: true });
        continue;
      }
      if (isHumanMove) {
        continue;
      }
      drawArrowheadOnly(ctx, fromPt, toPt, lineColor, { tipAtTargetCenter: true });
      continue;
    }
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
    drawArrowheadOnly(ctx, from, to, lineColor);
  }
  ctx.restore();
}

/**
 * Defines the `drawMovingUnits` function shape (export function drawMovingUnits( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, moves: ResolutionPlaybackMove[], hexLi).

 * Purpose: Supports maintainability by documenting why `drawMovingUnits` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  const groupedMoves = new Map<
    string,
    {
      move: ResolutionPlaybackMove;
      count: number;
      unitTypes: Set<string>;
    }
  >();
  for (const move of moves) {
    const groupKey = `${move.player}|${move.fromH3Index}|${move.toH3Index}`;
    const existing = groupedMoves.get(groupKey);
    if (existing) {
      existing.count += 1;
      existing.unitTypes.add(move.unitType);
      continue;
    }
    groupedMoves.set(groupKey, { move, count: 1, unitTypes: new Set([move.unitType]) });
  }

  for (const group of groupedMoves.values()) {
    const move = group.move;
    const path = move.pathH3Indexes;
    let lat: number;
    let lng: number;
    if (path && path.length >= 2) {
      const refLng = cellToLatLng(path[0]!)[1];
      const coords = path.map((h) => {
        const [la, ln] = cellToLatLng(h);
        return { lat: la, lng: ln };
      });
      ({ lat, lng } = latLngAlongPolylineByArcFraction(refLng, coords, progress));
    } else {
      const [lat0, lng0] = cellToLatLng(move.fromH3Index);
      const [lat1, lng1] = cellToLatLng(move.toH3Index);
      const lng1Aligned = alignLngToReference(lng1, lng0);
      lat = lat0 + progress * (lat1 - lat0);
      lng = lng0 + progress * (lng1Aligned - lng0);
    }
    const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
    const color = PLAYER_COLORS[move.player] ?? '#333';
    const label = group.unitTypes.size > 1 ? '*' : (UNIT_TYPE_LABELS[move.unitType] ?? '?');
    drawOneUnitMarker(ctx, p.x, p.y, color, label, '#fff', move.player);
    if (group.count > 1) {
      drawOneUnitMarker(ctx, p.x + STACK_OFFSET_X, p.y + STACK_OFFSET_Y, color, label, '#fff', move.player);
      const badgeX = p.x + COUNT_BADGE_OFFSET;
      const badgeY = p.y - COUNT_BADGE_OFFSET;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeText(String(group.count), badgeX, badgeY);
      ctx.fillStyle = '#000';
      ctx.fillText(String(group.count), badgeX, badgeY);
    }
  }
}
