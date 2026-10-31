import { cellToLatLng } from 'h3-js';
import type { AirStrikeAnimationMove, AirStrikeOrder, FerryOrder, GameStateSnapshot, MissileLaunchOrder, RangedAttackOrder } from '../../shared/ipcTypes';
import type { RangedResolutionShotLine } from '../../shared/rangedResolutionShotLines';
import {
  filterShotLinesByVisibleEndpoints,
  resolutionShotLineStyle,
} from '../../shared/rangedResolutionShotLines';
import { isMissileUnitType } from '../../shared/missileRules';
import { MOVEMENT_HOVER_VALID_ALPHA, RANGE_PERIMETER_MISSILE_COLOR, UNIT_RADIUS } from '../core/constants';
import { hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { drawHumanMarchStyleRouteSegments } from './pathDrawing';
import { ATTACK_LINE_DOT_DASH, ORDER_LINE_SOLID, drawOrderLine, straightOrderLineShape } from './orderLineStroke';
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
 * Dash for an attack arrow.
 *
 * Purpose: Color and transparency are shared. The dash is what tells ranged fire, an air strike, and a launch apart, while planning and during playback.
 * When to use: `rangePerimeterStaticLineStyle` when the kind is a connector.
 * Expected outcome: Ranged is solid. An air strike keeps the equal solid-and-gap connector dash. A launch is `ATTACK_LINE_DOT_DASH`.
 * Exceptions: None.
 */
function attackConnectorDash(mode: 'ranged' | 'airStrike' | 'missile', lineWidth: number): readonly number[] {
  if (mode === 'ranged') return ORDER_LINE_SOLID;
  if (mode === 'missile') return ATTACK_LINE_DOT_DASH;
  return buildRangeOverlayDashArray(lineWidth, 'connector', 'airStrike');
}

/**
 * Returns the static stroke style for a reach outline or an attack arrow.
 *
 * Purpose: The outline keeps its animated dash. An attack arrow, queued, hovered, or played back, uses the missile crimson and a dash from `attackConnectorDash`.
 * When to use: `drawRangePerimeterOverlay` with kind `'perimeter'`. `strokeSupportOrderLines` with kind `'connector'`.
 * Expected outcome: Tactical width is `ORDER_LINE_WIDTH`. A strategic outline is 2× the home border and a connector is 1.5×. Outline dashes scale to 2× line width with butt caps. Connector caps stay round. The stroke color is always `RANGE_PERIMETER_MISSILE_COLOR`.
 * Exceptions: None.
 */
export function rangePerimeterStaticLineStyle(
  mode: 'ranged' | 'airStrike' | 'missile',
  kind: RangeOverlayStrokeKind = 'connector'
): {
  lineWidth: number;
  dash: readonly number[];
  strokeColor: string;
  lineCap: 'butt' | 'round';
} {
  const lineWidth = getCurrentRangeOverlayLineWidth(kind);
  const dash =
    kind === 'perimeter' ? buildRangeOverlayDashArray(lineWidth, kind, mode) : attackConnectorDash(mode, lineWidth);
  return {
    lineWidth,
    strokeColor: RANGE_PERIMETER_MISSILE_COLOR,
    dash,
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
 * Strokes attack arrows for planning and for resolution playback.
 *
 * Purpose: One path draws the casing and the arrowhead. Queued orders, hover previews, and playback attacks share it.
 * When to use: From `drawRangedAttackLines`, `drawAirStrikeLines`, `drawMissileLaunchLines`, the hover preview,
 *   `drawRangedResolutionShotLines`, and `drawResolutionOutboundAttackLines`.
 * Expected outcome: Each unequal endpoint pair runs from the origin's center toward the target and ends in the movement
 *   arrowhead, whose tip stops a unit radius short of the target's center. The arrow is crimson at
 *   `MOVEMENT_HOVER_VALID_ALPHA`: solid for ranged, dashed for an air strike, dotted for a launch. A launch stays one
 *   continuous arrow. Equal endpoints are skipped. An air unit's flight home is not drawn here.
 * Exceptions: None.
 */
export function strokeSupportOrderLines(
  ctx: CanvasRenderingContext2D,
  mode: 'ranged' | 'airStrike' | 'missile',
  segments: readonly SupportOrderLineSegment[]
): void {
  if (segments.length === 0) return;
  const style = rangePerimeterStaticLineStyle(mode, 'connector');
  const lineStyle = { color: style.strokeColor, width: style.lineWidth, cap: style.lineCap };
  ctx.save();
  ctx.globalAlpha = MOVEMENT_HOVER_VALID_ALPHA;
  for (const segment of segments) {
    if (segment.fromH3Index === segment.toH3Index) continue;
    const from = hexCenterPx(segment.fromH3Index);
    const to = hexCenterPxRelativeTo(segment.fromH3Index, segment.toH3Index);
    drawOrderLine(
      ctx,
      straightOrderLineShape(from, to, UNIT_RADIUS, style.dash, mode === 'missile' ? { continuous: true } : undefined),
      lineStyle
    );
  }
  ctx.restore();
}

/**
 * Builds origin-to-target segments for one pending support order list and strokes them.
 *
 * Purpose: Ranged, air-strike, and missile planning lines share the same unit lookup.
 * When to use: From those three drawers after they have chosen the stroke mode.
 * Expected outcome: No stroke when the list or the hex list is empty. Missing units are skipped.
 * Exceptions: None.
 */
function drawPendingSupportOrderLines(
  ctx: CanvasRenderingContext2D,
  mode: 'ranged' | 'airStrike' | 'missile',
  orders: readonly { readonly unitId: string; readonly targetH3Index: string }[],
  units: readonly PendingOrderLineUnit[],
  hexList: readonly string[] | undefined
): void {
  if (orders.length === 0 || !hexList) return;
  const segments: SupportOrderLineSegment[] = [];
  for (const order of orders) {
    const unit = units.find((row) => row.id === order.unitId);
    if (!unit) continue;
    segments.push({ fromH3Index: unit.h3Index, toH3Index: order.targetH3Index });
  }
  strokeSupportOrderLines(ctx, mode, segments);
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
  drawPendingSupportOrderLines(ctx, 'ranged', ranged, units, hexList);
}

/**
 * Draws resolution-phase shot lines (direct fire + return fire) with the planning attack stroke.
 *
 * Purpose: Shows attacker-to-target connectors during the ranged lightning window only.
 * When to use: `drawGameScene` when `inRangedLightning` and anim carries `rangedResolutionShotLines`.
 * Expected outcome: Ground fire is a solid crimson arrow and air-only return fire is a dashed crimson arrow, both at
 *   `MOVEMENT_HOVER_VALID_ALPHA`. Fog may clip endpoints.
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
 * Draws the outbound air-strike and missile flights for one resolution playback frame.
 *
 * Purpose: Those flights are attacks, so they use the same crimson arrows as the queued orders. The flight home does not.
 * When to use: `drawGameScene` while `inAirStrikeOutbound`, with `airStrikeOutboundMoves`. Missiles are in that list and do not return.
 * Expected outcome: Each air unit draws a dashed crimson arrow to its target. Each missile draws a dotted crimson arrow, continuous
 *   so a long flight is not dropped. Both use `MOVEMENT_HOVER_VALID_ALPHA`. Nothing is drawn without moves or a hex list.
 * Exceptions: None.
 */
export function drawResolutionOutboundAttackLines(
  ctx: CanvasRenderingContext2D,
  moves: readonly ResolutionPlaybackMove[],
  hexList: readonly string[] | undefined
): void {
  if (moves.length === 0 || !hexList) return;
  const air: SupportOrderLineSegment[] = [];
  const missiles: SupportOrderLineSegment[] = [];
  for (const move of moves) {
    const segment = { fromH3Index: move.fromH3Index, toH3Index: move.toH3Index };
    if (isMissileUnitType(move.unitType)) missiles.push(segment);
    else air.push(segment);
  }
  strokeSupportOrderLines(ctx, 'airStrike', air);
  strokeSupportOrderLines(ctx, 'missile', missiles);
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
  drawPendingSupportOrderLines(ctx, 'airStrike', airStrikes, units, hexList);
}

/**
 * Draws pending missile launches as crimson one-way arrows.
 *
 * Purpose: A queued launch stays on the map until Ready, including when the arrow is wider than the window.
 * When to use: From `drawPendingSupportOrderOverlays` when `S.pendingMissileLaunches` is not empty.
 * Expected outcome: One continuous dotted crimson arrow per launch, from the missile's hex to its target, at `MOVEMENT_HOVER_VALID_ALPHA`.
 * Exceptions: Skips a row whose missile is not in `units`.
 */
export function drawMissileLaunchLines(
  ctx: CanvasRenderingContext2D,
  launches: MissileLaunchOrder[],
  units: readonly PendingOrderLineUnit[],
  hexList: string[] | undefined
): void {
  drawPendingSupportOrderLines(ctx, 'missile', launches, units, hexList);
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
