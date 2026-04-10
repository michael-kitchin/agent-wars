import { MOVEMENT_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { ORDER_LINE_COLOR, ORDER_LINE_WIDTH } from '../core/constants';
import { clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { drawArrowheadOnly, strokePolylineSkippingWrap } from './pathDrawing';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal, hexCenterPx } from '../map/mapUtils';
import { getMainLeafletMap } from '../map/worldLeafletMap';

/**
 * Defines the `drawHoverRoutePreview` function shape (export function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawHoverRoutePreview(ctx: CanvasRenderingContext2D): void {
  if (!S.hoverRoutePreview || !S.gameState) return;
  const state = S.gameState;
  const previewGroup = S.hoverRoutePreview.data;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const selectedHumanUnits = S.selectedUnitIds
    .map((id) => state.units.find((u) => u.id === id))
    .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
  const slowestMovementRangeByOriginH3 = new Map<string, number>();
  for (const unit of selectedHumanUnits) {
    const movementRange = MOVEMENT_RANGE_BY_UNIT_TYPE[unit.unitType] ?? 1;
    const prior = slowestMovementRangeByOriginH3.get(unit.h3Index);
    if (prior === undefined || movementRange < prior) {
      slowestMovementRangeByOriginH3.set(unit.h3Index, movementRange);
    }
  }
  const drawnOrigins = new Set<string>();
  for (const perUnit of previewGroup.previews) {
    const preview = perUnit.preview;
    if (preview.segments.length === 0) continue;
    const previewUnit = state.units.find((u) => u.id === perUnit.unitId);
    if (previewUnit) {
      if (drawnOrigins.has(previewUnit.h3Index)) continue;
      drawnOrigins.add(previewUnit.h3Index);
    }
    const perStackSolidCap =
      previewUnit && slowestMovementRangeByOriginH3.has(previewUnit.h3Index)
        ? slowestMovementRangeByOriginH3.get(previewUnit.h3Index)!
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
