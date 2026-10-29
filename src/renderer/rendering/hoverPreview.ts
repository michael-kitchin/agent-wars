import { strategicMovementHexesFor, weatherBonusLevelOf } from '../../shared/weatherBonusRules';
import { tacticalHoverSolidEdgeCapByOriginH3 } from '../../shared/tacticalMarchHoverPreview';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { MOVEMENT_HOVER_VALID_ALPHA, ORDER_LINE_WIDTH } from '../core/constants';
import { paletteForCurrentOwner } from './ownerColors';
import { clampLatForWebMercatorDisplay } from '../map/hexGrid';
import { strokeSupportOrderLines } from './orderDrawing';
import {
  ORDER_LINE_LATER_DASH,
  ORDER_LINE_SOLID,
  drawOrderLine,
  routeEndArrow,
  type OrderLineRun,
} from './orderLineStroke';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal, hexCenterPx } from '../map/mapHelpers';
import { getMainLeafletMap } from '../map/worldLeafletMap';

/**
 * Draws the hover order preview for the current selection: a support line, or a march or ferry route with an arrow.
 *
 * Purpose: Shows where an order would go before the player commits it.
 * When to use: Once per scene draw while `S.hoverRoutePreview` is set.
 * Expected outcome: Ranged, strike, and launch targeting draw one crimson arrow per origin toward the hovered target, as a
 *   queued attack of that kind looks: solid, dashed, or dotted. Otherwise each origin stack draws its route solid for the part it covers this turn or
 *   beat and dashed beyond, with an arrowhead at the end. Every line has the order-line casing. Air routes are solid
 *   throughout. On the strategic map the solid part is the slowest selected unit's weather-adjusted movement; in battle
 *   it comes from `tacticalHoverSolidEdgeCapByOriginH3`. An X marks the hovered hex when the preview says the order is
 *   invalid. Nothing is drawn without a preview or a map.
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
    const segments: Array<{ fromH3Index: string; toH3Index: string }> = [];
    for (const perUnit of previewGroup.previews) {
      const preview = perUnit.preview;
      if (!preview.valid || preview.segments.length === 0) continue;
      const originH3 =
        perUnit.originH3Index ??
        (tb
          ? tb.subUnits.find((s) => s.id === perUnit.unitId)?.h3Index
          : state?.units.find((u) => u.id === perUnit.unitId)?.h3Index);
      if (!originH3 || !targetH3 || originH3 === targetH3) continue;
      segments.push({ fromH3Index: originH3, toH3Index: targetH3 });
    }
    strokeSupportOrderLines(
      ctx,
      supportMode === 'ranged' ? 'ranged' : supportMode === 'missile' ? 'missile' : 'airStrike',
      segments
    );
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
      .filter((unit): unit is NonNullable<typeof unit> => !!unit && unit.player === HUMAN_SEAT_ID);
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
    const runs: OrderLineRun[] = [];
    for (const seg of preview.segments) {
      if (!Array.isArray(seg.hexes) || seg.hexes.length < 2) continue;
      const points = seg.hexes.map(([lat, lng]) => {
        const p = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(lat), lng));
        return { x: p.x, y: p.y };
      });
      const edgeCount = Math.max(0, points.length - 1);
      if (remainingSolidEdges >= edgeCount) {
        runs.push({ points, dash: ORDER_LINE_SOLID });
      } else if (remainingSolidEdges <= 0) {
        runs.push({ points, dash: ORDER_LINE_LATER_DASH });
      } else {
        // The solid part ends where this turn's movement runs out; the rest of the segment is dashed.
        const splitIndex = Math.min(points.length - 1, remainingSolidEdges);
        runs.push({ points: points.slice(0, splitIndex + 1), dash: ORDER_LINE_SOLID });
        runs.push({ points: points.slice(splitIndex), dash: ORDER_LINE_LATER_DASH });
      }
      remainingSolidEdges -= edgeCount;
      lastSegmentPenultimate = points[points.length - 2] ?? null;
      lastSegmentLast = points[points.length - 1] ?? null;
    }
    let arrow = lastSegmentPenultimate && lastSegmentLast ? routeEndArrow(lastSegmentPenultimate, lastSegmentLast) : null;
    if (!arrow && preview.arrowLatLng && preview.segments.length > 0) {
      const firstHex = preview.segments[0]?.hexes[0];
      if (firstHex) {
        const fromPoint = map.latLngToContainerPoint(L.latLng(clampLatForWebMercatorDisplay(firstHex[0]), firstHex[1]));
        const toPoint = map.latLngToContainerPoint(
          L.latLng(clampLatForWebMercatorDisplay(preview.arrowLatLng[0]), preview.arrowLatLng[1])
        );
        arrow = routeEndArrow({ x: fromPoint.x, y: fromPoint.y }, { x: toPoint.x, y: toPoint.y });
      }
    }
    ctx.save();
    ctx.globalAlpha = preview.valid ? MOVEMENT_HOVER_VALID_ALPHA : 0.75;
    drawOrderLine(ctx, { runs, arrow }, { color: paletteForCurrentOwner(HUMAN_SEAT_ID)?.map ?? '#115E59', width: ORDER_LINE_WIDTH });
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
    ctx.strokeStyle = paletteForCurrentOwner(HUMAN_SEAT_ID)?.map ?? '#115E59';
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}
