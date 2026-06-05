import { effectiveTacticalMovementPointBudgetForMarchLeg } from '../../shared/tacticalTerrainCombatModifiers';
import { tacticalMovementUnitTypeForPathfinding } from '../../shared/tacticalTerrainMovement';
import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import {
  ORDER_LINE_COLOR,
  ORDER_LINE_WIDTH,
  RANGE_PERIMETER_ALPHA,
} from '../core/constants';
import { clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { rangePerimeterStaticLineStyle } from './orderDrawing';
import { drawArrowheadOnly, strokePolylineSkippingWrap } from './pathDrawing';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal, hexCenterPx, hexCenterPxRelativeTo } from '../map/mapUtils';
import { getMainLeafletMap } from '../map/worldLeafletMap';

/**
 * Defines the `drawHoverRoutePreview` function shape (export function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void {
  if (!S.hoverRoutePreview) return;
  const state = S.gameState;
  const tb = S.tacticalBattleSnapshot;
  const previewGroup = S.hoverRoutePreview.data;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const supportMode = S.hoverRoutePreview.renderAsSupportTargeting;
  if (supportMode) {
    if (!state && !tb) return;
    const targetH3 = S.hoverRoutePreview.hoveredH3Index;
    const style = rangePerimeterStaticLineStyle(supportMode === 'ranged' ? 'ranged' : 'airStrike');
    for (const perUnit of previewGroup.previews) {
      const preview = perUnit.preview;
      if (!preview.valid || preview.segments.length === 0) continue;
      const originH3 =
        perUnit.originH3Index ??
        (tb
          ? tb.subUnits.find((s) => s.id === perUnit.unitId)?.h3Index
          : state?.units.find((u) => u.id === perUnit.unitId)?.h3Index);
      if (!originH3 || !targetH3 || originH3 === targetH3) continue;
      const from = hexCenterPx(originH3);
      const to = hexCenterPxRelativeTo(originH3, targetH3);
      ctx.save();
      ctx.globalAlpha = RANGE_PERIMETER_ALPHA;
      ctx.setLineDash(style.dash);
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
  } else {
  if (!state) return;
  const slowestMovementRangeByOriginH3 = new Map<string, number>();
  if (tb) {
    const hovered = S.hoverRoutePreview?.hoveredH3Index;
    for (const id of S.selectedUnitIds) {
      const u = tb.subUnits.find((s) => s.id === id);
      if (!u || u.player !== 'human') continue;
      const eff = u.h3Index;
      const moveType = hovered ? tacticalMovementUnitTypeForPathfinding(u, hovered) : u.unitType;
      const movementRange = effectiveTacticalMovementPointBudgetForMarchLeg(tb, u, tb.subUnits, moveType);
      const prior = slowestMovementRangeByOriginH3.get(eff);
      if (prior === undefined || movementRange < prior) {
        slowestMovementRangeByOriginH3.set(eff, movementRange);
      }
    }
  } else {
    const selectedHumanUnits = S.selectedUnitIds
      .map((id) => state.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
    for (const unit of selectedHumanUnits) {
      const movementRange = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
      const prior = slowestMovementRangeByOriginH3.get(unit.h3Index);
      if (prior === undefined || movementRange < prior) {
        slowestMovementRangeByOriginH3.set(unit.h3Index, movementRange);
      }
    }
  }
  const drawnOrigins = new Set<string>();
  for (const perUnit of previewGroup.previews) {
    const preview = perUnit.preview;
    if (preview.segments.length === 0) continue;
    const previewUnit = tb ? tb.subUnits.find((s) => s.id === perUnit.unitId) : state.units.find((u) => u.id === perUnit.unitId);
    const originH3 = previewUnit?.h3Index;
    if (previewUnit && originH3) {
      if (drawnOrigins.has(originH3)) continue;
      drawnOrigins.add(originH3);
    }
    const perStackSolidCap =
      previewUnit && originH3 && slowestMovementRangeByOriginH3.has(originH3)
        ? slowestMovementRangeByOriginH3.get(originH3)!
        : previewGroup.slowestMovementRange;
    let lastSegmentPenultimate: { x: number; y: number } | null = null;
    let lastSegmentLast: { x: number; y: number } | null = null;
    let remainingSolidEdges = perStackSolidCap;
    ctx.save();
    ctx.globalAlpha = preview.valid ? 0.55 : 0.75;
    for (const seg of preview.segments) {
      if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
      const points = seg.hexes.map(([lat, lng]) => {
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      const edgeCount = Math.max(0, points.length - 1);
      if (remainingSolidEdges >= edgeCount) {
        ctx.setLineDash([]);
        ctx.strokeStyle = ORDER_LINE_COLOR;
        ctx.lineWidth = ORDER_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      } else if (remainingSolidEdges <= 0) {
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = ORDER_LINE_COLOR;
        ctx.lineWidth = ORDER_LINE_WIDTH;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        strokePolylineSkippingWrap(ctx, points, ctx.canvas.width * 0.5);
      } else {
        const splitIndex = Math.min(points.length - 1, remainingSolidEdges);
        const solidPoints = points.slice(0, splitIndex + 1);
        if (solidPoints.length >= 2) {
          ctx.setLineDash([]);
          ctx.strokeStyle = ORDER_LINE_COLOR;
          ctx.lineWidth = ORDER_LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          strokePolylineSkippingWrap(ctx, solidPoints, ctx.canvas.width * 0.5);
        }
        const dashedPoints = points.slice(splitIndex);
        if (dashedPoints.length >= 2) {
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = ORDER_LINE_COLOR;
          ctx.lineWidth = ORDER_LINE_WIDTH;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          strokePolylineSkippingWrap(ctx, dashedPoints, ctx.canvas.width * 0.5);
        }
      }
      remainingSolidEdges -= edgeCount;
      lastSegmentPenultimate = points[points.length - 2] ?? null;
      lastSegmentLast = points[points.length - 1] ?? null;
    }
    ctx.setLineDash([]);
    if (lastSegmentPenultimate && lastSegmentLast) {
      drawArrowheadOnly(ctx, lastSegmentPenultimate, lastSegmentLast, ORDER_LINE_COLOR, {
        tipAtTargetCenter: true,
      });
    } else if (preview.arrowLatLng && preview.segments.length > 0) {
      const firstHex = preview.segments[0]?.hexes[0];
      if (firstHex) {
        const fromPoint = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(firstHex[0]), firstHex[1]));
        const toPoint = map.latLngToContainerPoint(
          L.latLng(clampLatForWebMercatorDisplay(preview.arrowLatLng[0]), preview.arrowLatLng[1])
        );
        drawArrowheadOnly(
          ctx,
          { x: fromPoint.x, y: fromPoint.y },
          { x: toPoint.x, y: toPoint.y },
          ORDER_LINE_COLOR,
          { tipAtTargetCenter: true }
        );
      }
    }
    ctx.restore();
  }
  }
  if (previewGroup.showInvalidMarker && S.hoveredHexH3) {
    const at = hexCenterPx(S.hoveredHexH3);
    ctx.beginPath();
    ctx.moveTo(at.x - 8, at.y - 8);
    ctx.lineTo(at.x + 8, at.y + 8);
    ctx.moveTo(at.x + 8, at.y - 8);
    ctx.lineTo(at.x - 8, at.y + 8);
    ctx.strokeStyle = ORDER_LINE_COLOR;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}
