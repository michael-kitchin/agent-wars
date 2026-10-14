import { cellToLatLng } from 'h3-js';
import { alignLngToReference, clampLatForWebMercatorDisplay } from '../map/hexGrid';
import {
  AI_ORDER_LINE_COLOR,
  COUNT_BADGE_OFFSET,
  ORDER_LINE_COLOR,
  ORDER_LINE_WIDTH,
  PLAYER_COLORS,
  STACK_OFFSET_X,
  STACK_OFFSET_Y,
  UNIT_RADIUS,
  UNIT_TYPE_LABELS,
} from '../core/constants';
import { getLeafletGlobal, hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import type { HumanOrderPreviewSegment } from '../../shared/ipc/humanOrderPreviewTypes';
import type { GameStateSnapshot, HumanStandingOrderSnapshot, TacticalPendingMarchRow } from '../../shared/ipcTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { buildTacticalMarchDraftDestinationPreview } from '../../shared/tacticalMarchHoverPreview';
import type { ResolutionPlaybackMove } from '../core/types';
import { latLngAlongPolylineByArcFraction } from '../../shared/pathPolylineInterp.js';
import { drawOneUnitMarker } from './unitDrawing';
import {
  ORDER_LINE_LATER_DASH,
  ORDER_LINE_SOLID,
  drawOrderLine,
  routeEndArrow,
  straightOrderLineShape,
  type OrderLineRun,
} from './orderLineStroke';

/**
 * Draws a straight movement line from one unit marker toward another, with the movement arrowhead.
 *
 * Purpose: Standing orders without a route, and played-back moves that need an arrow, share this look.
 * When to use: `from` and `to` are hex centers in canvas pixels, and a unit marker may sit at `to`.
 * Expected outcome: A cased line in `color` that stops at the arrow's base, and an arrowhead whose tip stops a unit
 *   radius short of `to`.
 * Exceptions: None.
 */
export function drawLineArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string
): void {
  drawOrderLine(ctx, straightOrderLineShape(from, to, UNIT_RADIUS), { color, width: ORDER_LINE_WIDTH });
}

/**
 * Strokes human march-style route segments (solid turn-1, dashed continuation) with a terminal arrowhead.
 *
 * Purpose: Single visual contract for standing orders, tactical draft marches, pending ferry lines, and matching hover previews.
 * When to use: Any committed or planned human movement polyline that should match ground march line styling.
 * Expected outcome: One cased line at `ORDER_LINE_COLOR` / `ORDER_LINE_WIDTH`, solid for turn 1 and dashed after, with an
 *   arrowhead whose tip is the route's last hex center.
 * Exceptions: Skips segments with fewer than two lat/lng points; no-op when Leaflet map is unavailable.
 */
export function drawHumanMarchStyleRouteSegments(
  ctx: CanvasRenderingContext2D,
  segments: readonly HumanOrderPreviewSegment[],
  options?: { globalAlpha?: number }
): void {
  if (segments.length === 0) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const runs: OrderLineRun[] = [];
  for (const seg of segments) {
    if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
    const points = seg.hexes.map(([lat, lng]) => {
      const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
      return { x: p.x, y: p.y };
    });
    runs.push({ points, dash: seg.turn <= 1 ? ORDER_LINE_SOLID : ORDER_LINE_LATER_DASH });
  }
  const lastPoints = runs[runs.length - 1]?.points;
  const arrow = lastPoints ? routeEndArrow(lastPoints[lastPoints.length - 2]!, lastPoints[lastPoints.length - 1]!) : null;
  ctx.save();
  if (options?.globalAlpha !== undefined) {
    ctx.globalAlpha = options.globalAlpha;
  }
  drawOrderLine(ctx, { runs, arrow }, { color: ORDER_LINE_COLOR, width: ORDER_LINE_WIDTH });
  ctx.restore();
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
    drawHumanMarchStyleRouteSegments(ctx, segments);
  }
}

/**
 * Draws semi-transparent planned march polylines for human tactical draft orders (Ready not yet pressed).
 *
 * Purpose: Mirrors strategic `drawStandingOrderLines` / hover styling so drafted tactical moves remain visible under units.
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
    drawHumanMarchStyleRouteSegments(ctx, preview.segments);
  }
  ctx.restore();
}

/**
 * Draws the lines of the moves being played back, each from its origin along its path.
 *
 * Purpose: During playback the player sees where every unit, theirs and the opponent's, is going.
 * When to use: From the scene draw while a resolution playback is running.
 * Expected outcome: One cased line per move, in the mover's color, at `opacity`. A move with a path follows that path.
 *   When it has an arrowhead, the tip is the path's last hex center. A move with no path runs straight: to the
 *   destination's center when it has no arrowhead, or to an arrowhead whose tip stops a unit radius short when it has
 *   one. The opponent's moves have an arrowhead. The player's have one only when `includeArrowForHuman` is set, which
 *   is an air-strike flight.
 * Exceptions: None. Draws nothing without moves, a hex list, or a positive opacity.
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
    const withArrow = !isHumanMove || includeArrowForHuman;
    const style = { color: isHumanMove ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR, width: ORDER_LINE_WIDTH };
    const path = move.pathH3Indexes;
    if (path && path.length >= 2 && map) {
      const points = path.map((h) => {
        const [lat, lng] = cellToLatLng(h);
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      const hPen = path[path.length - 2]!;
      const arrow = withArrow ? routeEndArrow(hexCenterPx(hPen), hexCenterPxRelativeTo(hPen, path[path.length - 1]!)) : null;
      drawOrderLine(ctx, { runs: [{ points, dash: ORDER_LINE_SOLID }], arrow }, style);
      continue;
    }
    const from = hexCenterPx(move.fromH3Index);
    const to = hexCenterPxRelativeTo(move.fromH3Index, move.toH3Index);
    const shape = withArrow
      ? straightOrderLineShape(from, to, UNIT_RADIUS)
      : { runs: [{ points: [from, to], dash: ORDER_LINE_SOLID }], arrow: null };
    drawOrderLine(ctx, shape, style);
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
