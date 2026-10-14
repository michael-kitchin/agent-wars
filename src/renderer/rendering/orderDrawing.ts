import { cellToLatLng } from 'h3-js';
import type { AirStrikeAnimationMove, AirStrikeOrder, FerryOrder, GameStateSnapshot, RangedAttackOrder } from '../../shared/ipcTypes';
import type { RangedResolutionShotLine } from '../../shared/rangedResolutionShotLines';
import {
  filterShotLinesByVisibleEndpoints,
  resolutionShotLineStyle,
} from '../../shared/rangedResolutionShotLines';
import {
  RANGE_PERIMETER_AIR_STRIKE_COLOR,
  RANGE_PERIMETER_ALPHA,
  RANGE_PERIMETER_RANGED_COLOR,
  UNIT_RADIUS,
} from '../core/constants';
import { hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { drawHumanMarchStyleRouteSegments } from './pathDrawing';
import { drawOrderLine, straightOrderLineShape } from './orderLineStroke';
import {
  buildRangeOverlayDashArray,
  getCurrentRangeOverlayLineWidth,
  getRangeOverlayLineCap,
  type RangeOverlayStrokeKind,
} from './rangeOverlayStroke';
import type { ResolutionMove, ResolutionPlaybackMove } from '../core/types';

/**
 * Minimal attacker row for drawing pending ranged, air, and ferry order lines on the map canvas.
 *
 * Purpose: Lets tactical sub-units supply `id` + `h3Index` without pretending they are full strategic `units` rows.
 * When to use: Pass strategic `state.units` or tactical `subUnits` mapped to `{ id, h3Index }` into order overlay drawers.
 * Expected outcome: Same stroke geometry as the legacy strategic-only path when ids match pending order payloads.
 * Exceptions: None.
 */
export type PendingOrderLineUnit = { id: string; h3Index: string };

/**
 * Returns the static stroke style shared by planned support lines and their matching range perimeter.
 *
 * Purpose: Keeps planned, hover, resolution, and perimeter ranged/air-strike strokes on one color/dash contract while leaving dash animation to the perimeter only.
 * When to use: `drawRangePerimeterOverlay` (kind `'perimeter'`), `drawRangedAttackLines`, `drawRangedResolutionShotLines`, `drawAirStrikeLines`, and support-targeting hover previews (kind `'connector'`).
 * Expected outcome: Mode-colored 50/50 dash style with kind-specific cap; tactical width is `ORDER_LINE_WIDTH`; strategic perimeter is 2× home border and connectors are 1.5× home border. Perimeter dashes scale to 2× line width with butt caps so thick strokes still flow.
 * Exceptions: None.
 */
export function rangePerimeterStaticLineStyle(
  mode: 'ranged' | 'airStrike',
  kind: RangeOverlayStrokeKind = 'connector'
): {
  lineWidth: number;
  dash: [number, number];
  strokeColor: string;
  lineCap: 'butt' | 'round';
} {
  const lineWidth = getCurrentRangeOverlayLineWidth(kind);
  const strokeColor = mode === 'airStrike' ? RANGE_PERIMETER_AIR_STRIKE_COLOR : RANGE_PERIMETER_RANGED_COLOR;
  return {
    lineWidth,
    strokeColor,
    dash: buildRangeOverlayDashArray(lineWidth, kind, mode),
    lineCap: getRangeOverlayLineCap(kind),
  };
}

/**
 * Hex-center segment for support-order and resolution shot connectors.
 *
 * Purpose: Lets ranged, air-strike, and resolution drawers share one stroke setup without repeating canvas state.
 * When to use: Pass pairs of H3 indexes into `strokeSupportOrderLines`.
 * Expected outcome: Drawn from `fromH3Index` center toward `toH3Index` (dateline-aware relative center).
 * Exceptions: None.
 */
type SupportOrderLineSegment = { fromH3Index: string; toH3Index: string };

/**
 * Strokes dashed support-order connectors with the shared ranged or air-strike perimeter style.
 *
 * Purpose: Single path for planned, previewed, and resolution shot lines, so every ranged and air-strike line has the
 *   same color, dash, casing, and arrowhead.
 * When to use: From `drawRangedAttackLines`, `drawAirStrikeLines`, `drawRangedResolutionShotLines`, and the hover
 *   preview while Ranged or Strike is aiming.
 * Expected outcome: Each unequal endpoint pair is drawn from the origin's center toward the target, cased, dashed, at
 *   `RANGE_PERIMETER_ALPHA`, ending in the movement arrowhead whose tip stops a unit radius short of the target's center.
 *   Equal endpoints are skipped.
 * Exceptions: None.
 */
export function strokeSupportOrderLines(
  ctx: CanvasRenderingContext2D,
  mode: 'ranged' | 'airStrike',
  segments: readonly SupportOrderLineSegment[]
): void {
  if (segments.length === 0) return;
  const style = rangePerimeterStaticLineStyle(mode);
  const lineStyle = { color: style.strokeColor, width: style.lineWidth, cap: style.lineCap };
  ctx.save();
  ctx.globalAlpha = RANGE_PERIMETER_ALPHA;
  for (const segment of segments) {
    if (segment.fromH3Index === segment.toH3Index) continue;
    const from = hexCenterPx(segment.fromH3Index);
    const to = hexCenterPxRelativeTo(segment.fromH3Index, segment.toH3Index);
    drawOrderLine(ctx, straightOrderLineShape(from, to, UNIT_RADIUS, style.dash), lineStyle);
  }
  ctx.restore();
}

/**
 * Defines the `drawRangedAttackLines` function shape (export function drawRangedAttackLines( ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, ranged: RangedAttackOrder[], uni).

 * Purpose: Supports maintainability by documenting why `drawRangedAttackLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawRangedAttackLines(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  ranged: RangedAttackOrder[],
  units: readonly PendingOrderLineUnit[],
  hexList: string[] | undefined
): void {
  void canvasWidth;
  void canvasHeight;
  if (ranged.length === 0 || !hexList) return;
  const segments: SupportOrderLineSegment[] = [];
  for (const r of ranged) {
    const unit = units.find((u) => u.id === r.unitId);
    if (!unit) continue;
    segments.push({ fromH3Index: unit.h3Index, toH3Index: r.targetH3Index });
  }
  strokeSupportOrderLines(ctx, 'ranged', segments);
}

/**
 * Draws resolution-phase shot lines (direct fire + return fire) using planned ranged or air-strike strokes.
 *
 * Purpose: Shows attacker↔target connectors during the ranged lightning window only, matching pending order strokes.
 * When to use: `drawGameScene` when `inRangedLightning` and anim carries `rangedResolutionShotLines`.
 * Expected outcome: Ground edges use ranged style; air-only return-fire edges use air-strike style; fog may clip endpoints.
 * Exceptions: None.
 */
export function drawRangedResolutionShotLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly RangedResolutionShotLine[],
  hexList: string[] | undefined,
  visibleHexes?: ReadonlySet<string> | null
): void {
  if (lines.length === 0 || !hexList) return;
  const filtered = filterShotLinesByVisibleEndpoints(lines, visibleHexes);
  if (filtered.length === 0) return;
  const byStyle = {
    ranged: filtered.filter((l) => resolutionShotLineStyle(l) === 'ranged'),
    airStrike: filtered.filter((l) => resolutionShotLineStyle(l) === 'airStrike'),
  } as const;
  for (const mode of ['ranged', 'airStrike'] as const) {
    const group = byStyle[mode];
    if (group.length === 0) continue;
    strokeSupportOrderLines(
      ctx,
      mode,
      group.map((line) => ({ fromH3Index: line.fromH3Index, toH3Index: line.toH3Index }))
    );
  }
}

/**
 * Defines the `drawAirStrikeLines` function shape (export function drawAirStrikeLines( ctx: CanvasRenderingContext2D, airStrikes: AirStrikeOrder[], units: GameStateSnapshot['units'], hexList: string[).

 * Purpose: Supports maintainability by documenting why `drawAirStrikeLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawAirStrikeLines(
  ctx: CanvasRenderingContext2D,
  airStrikes: AirStrikeOrder[],
  units: readonly PendingOrderLineUnit[],
  hexList: string[] | undefined
): void {
  if (airStrikes.length === 0 || !hexList) return;
  const segments: SupportOrderLineSegment[] = [];
  for (const strike of airStrikes) {
    const unit = units.find((u) => u.id === strike.unitId);
    if (!unit) continue;
    segments.push({ fromH3Index: unit.h3Index, toH3Index: strike.targetH3Index });
  }
  strokeSupportOrderLines(ctx, 'airStrike', segments);
}

/**
 * Draws pending human ferry orders using the same march-style polyline stroke as ground movement lines.
 *
 * Purpose: Keeps planned air ferry routes visually aligned with standing orders and march hover previews.
 * When to use: From `drawPendingSupportOrderOverlays` when `S.pendingFerryOrders` is non-empty.
 * Expected outcome: One solid turn-1 segment per ferry row with terminal arrowhead at destination hex center.
 * Exceptions: Skips rows when the unit row is missing or origin equals destination.
 */
export function drawPendingFerryLines(
  ctx: CanvasRenderingContext2D,
  ferryOrders: FerryOrder[],
  units: readonly PendingOrderLineUnit[],
  hexList: string[] | undefined
): void {
  if (ferryOrders.length === 0 || !hexList) return;
  for (const ferry of ferryOrders) {
    const unit = units.find((u) => u.id === ferry.unitId);
    if (!unit) continue;
    if (unit.h3Index === ferry.destinationH3Index) continue;
    const [originLat, originLng] = cellToLatLng(unit.h3Index);
    const [destLat, destLng] = cellToLatLng(ferry.destinationH3Index);
    drawHumanMarchStyleRouteSegments(ctx, [
      {
        turn: 1,
        hexes: [
          [originLat, originLng],
          [destLat, destLng],
        ],
      },
    ]);
  }
}

/**
 * Defines the `buildResolutionPlaybackMoves` function shape (export function buildResolutionPlaybackMoves().

 * Purpose: Supports maintainability by documenting why `buildResolutionPlaybackMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildResolutionPlaybackMoves(
  moves: ResolutionMove[],
  units: GameStateSnapshot['units']
): ResolutionPlaybackMove[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  return moves
    .map((move) => {
      const unit = byId.get(move.unitId);
      if (!unit) return null;
      const base = {
        unitId: move.unitId,
        player: unit.player,
        unitType: unit.unitType,
        fromH3Index: move.fromH3Index,
        toH3Index: move.toH3Index,
      };
      if (move.pathH3Indexes && move.pathH3Indexes.length >= 2) {
        return { ...base, pathH3Indexes: move.pathH3Indexes };
      }
      return base;
    })
    .filter((move): move is ResolutionPlaybackMove => move !== null);
}

/**
 * Defines the `buildAirStrikeOutboundPlaybackMoves` function shape (export function buildAirStrikeOutboundPlaybackMoves().

 * Purpose: Supports maintainability by documenting why `buildAirStrikeOutboundPlaybackMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildAirStrikeOutboundPlaybackMoves(
  moves: AirStrikeAnimationMove[] | undefined
): ResolutionPlaybackMove[] {
  if (!moves || moves.length === 0) return [];
  return moves.map((move) => ({
    unitId: move.unitId,
    player: move.player,
    unitType: move.unitType,
    fromH3Index: move.fromH3Index,
    toH3Index: move.targetH3Index,
  }));
}

/**
 * Defines the `buildAirStrikeReturnPlaybackMoves` function shape (export function buildAirStrikeReturnPlaybackMoves().

 * Purpose: Supports maintainability by documenting why `buildAirStrikeReturnPlaybackMoves` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function buildAirStrikeReturnPlaybackMoves(
  moves: AirStrikeAnimationMove[] | undefined
): ResolutionPlaybackMove[] {
  if (!moves || moves.length === 0) return [];
  return moves
    .filter((move) => move.returnsToBase)
    .map((move) => ({
      unitId: move.unitId,
      player: move.player,
      unitType: move.unitType,
      fromH3Index: move.targetH3Index,
      toH3Index: move.fromH3Index,
    }));
}
