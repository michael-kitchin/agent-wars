import { strategicMovementHexesFor, weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import { tacticalHoverSolidEdgeCapByOriginH3 } from '../../shared/tacticalMarchHoverPreview';
import {
  ORDER_LINE_COLOR,
  ORDER_LINE_WIDTH,
  RANGE_PERIMETER_ALPHA,
} from '../core/constants';
import { clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { rangePerimeterStaticLineStyle } from './orderDrawing';
import { drawArrowheadOnly, strokePolylineSkippingWrap } from './pathDrawing';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal, hexCenterPx, hexCenterPxRelativeTo } from '../map/mapHelpers';
import { getMainLeafletMap } from '../map/worldLeafletMap';

/**
 * Draws the hover order preview for the current selection: a support line, or a march or ferry route with an arrow.
 *
 * Purpose: Shows where an order would go before the player commits it.
 * When to use: Once per scene draw while `S.hoverRoutePreview` is set.
 * Expected outcome: Ranged and strike targeting draw one dashed line per origin to the hovered target. Otherwise each
 *   origin stack draws its route solid for the part it covers this turn or beat and dashed beyond, with an arrowhead
 *   at the end. Air routes are solid throughout. On the strategic map the solid part is the slowest selected unit's
 *   weather-adjusted movement; in battle it comes from `tacticalHoverSolidEdgeCapByOriginH3`. An X marks the hovered
 *   hex when the preview says the order is invalid. Nothing is drawn without a preview or a map.
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
      ctx.lineCap = style.lineCap;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    }
  } else {
  if (!state && !tb) return;
  const solidEdgeCapByOriginH3 = tb
    ? tacticalHoverSolidEdgeCapByOriginH3(
        tb,
        S.selectedUnitIds,
        previewGroup.previews,
        S.hoverRoutePreview.hoveredH3Index ?? null
      )
    : new Map<string, number>();
  if (!tb && state) {
    const selectedHumanUnits = S.selectedUnitIds
      .map((id) => state.units.find((u) => u.id === id))
      .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === 'human');
    for (const unit of selectedHumanUnits) {
      const occupied = state.hexes.find((hex) => hex.h3Index === unit.h3Index);
      const movementRange = strategicMovementHexesFor({
        unitType: unit.unitType,
        weather: occupied?.weather,
        tags: unit.weatherTags,
        level: weatherBonusLevelOf(state),
      });
      const prior = solidEdgeCapByOriginH3.get(unit.h3Index);
      if (prior === undefined || movementRange < prior) {
        solidEdgeCapByOriginH3.set(unit.h3Index, movementRange);
      }
    }
  }
  const drawnOrigins = new Set<string>();
  if (previewGroup.validForAll) {
  for (const perUnit of previewGroup.previews) {
    const preview = perUnit.preview;
    if (preview.segments.length === 0) continue;
    const previewUnit = tb ? tb.subUnits.find((s) => s.id === perUnit.unitId) : state?.units.find((u) => u.id === perUnit.unitId);
    const originH3 = previewUnit?.h3Index;
    if (previewUnit && originH3) {
      if (drawnOrigins.has(originH3)) continue;
      drawnOrigins.add(originH3);
    }
    const previewEdgeCount = preview.segments.reduce((sum, seg) => {
      if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) return sum;
      return sum + seg.hexes.length - 1;
    }, 0);
    const perStackSolidCap =
      previewUnit && originH3 && previewUnit.unitType === 'air'
        ? Math.max(1, previewEdgeCount)
        : previewUnit && originH3 && solidEdgeCapByOriginH3.has(originH3)
          ? solidEdgeCapByOriginH3.get(originH3)!
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
