import { cellToChildren } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { getHexBoundaryLatLngForLeafletOverlay } from '../map/hexGrid';
import { getActiveHexStrokeStyle, fillHexTerrain } from './terrainVisualStyles';
import { drawTerrainInfrastructureGlyphs, RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE } from './terrainInfrastructureOverlay';
import { DETAIL_H3_RESOLUTION } from '../core/constants';
import { getLeafletGlobal, hexCenterPx } from '../map/mapUtils';
import {
  projectHexBoundaryToContainerPoints,
  projectedPolygonOverlapsViewport,
  shouldRenderRes4Hexes,
  spanForProjectedHex,
} from '../map/terrainView';
import { rendererSharedState as S } from '../core/state';
import { getMainLeafletMap } from '../map/worldLeafletMap';

interface TerrainRenderingDeps {
  getExploredHexSet: (state: GameStateSnapshot | null) => Set<string>;
  getRes1DominantTerrainKind: (h3: string, parentKind: string) => string;
  isMapInspectionModeHeld: () => boolean;
  infraGlyphsAllowedForRes1Hex: (h3: string) => boolean;
  infraGlyphsAllowedForRes4Child: (parentH3: string, childH3: string) => boolean;
}

export function drawTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {
  if (!S.gameState) return;
  const exploredHexes = deps.getExploredHexSet(S.gameState);
  const res4Active = shouldRenderRes4Hexes();
  if (res4Active) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const mapWithZoom = map as { getZoom?: () => number };
  const zoom = typeof mapWithZoom.getZoom === 'function' ? mapWithZoom.getZoom() : 4;
  const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
  const L = getLeafletGlobal();
  for (const hx of S.gameState.hexes) {
    const boundary = getHexBoundaryLatLngForLeafletOverlay(hx.h3Index);
    const pts = boundary.map(([lat, lng]: [number, number]) => {
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: p.x, y: p.y };
    });
    const kind = deps.getRes1DominantTerrainKind(
      hx.h3Index,
      hx.terrainKind ??
        (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : hx.terrain === 'wetlands' ? 'wetlands' : 'plains')
    );
    const drawClosedPath = (): void => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    const explored = exploredHexes.has(hx.h3Index);
    if (explored && !deps.isMapInspectionModeHeld()) {
      fillHexTerrain(ctx, kind, drawClosedPath, {
        fillAndHatchAlphaScale: !res4Active && S.hoveredHexH3 === hx.h3Index ? 2 : 1,
        landHoverFill: !res4Active && S.hoveredHexH3 === hx.h3Index && kind === 'plains',
        isUrban: false,
      });
    }
    const stroke = getActiveHexStrokeStyle();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * zoomStrokeScale;
    drawClosedPath();
    ctx.stroke();
    if (S.selectedHexIndex === hx.h3Index) {
      drawClosedPath();
      ctx.strokeStyle = '#2e5a7b';
      ctx.lineWidth = Math.max(1.8, 2.2 * zoomStrokeScale);
      ctx.stroke();
    }
  }
}

export function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {
  if (!S.gameState || !shouldRenderRes4Hexes()) return;
  const exploredHexes = deps.getExploredHexSet(S.gameState);
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
        getContainer: () => { clientWidth: number; clientHeight: number };
      }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const container = map.getContainer();
  const viewportWidth = Math.max(1, container.clientWidth);
  const viewportHeight = Math.max(1, container.clientHeight);
  const stroke = getActiveHexStrokeStyle();
  for (const parent of S.gameState.hexes) {
    if (!exploredHexes.has(parent.h3Index)) continue;
    const parentPts = projectHexBoundaryToContainerPoints(parent.h3Index, map, L);
    if (!projectedPolygonOverlapsViewport(parentPts, viewportWidth, viewportHeight)) continue;
    const parentKind =
      parent.terrainKind ??
      (parent.terrain === 'water' ? 'water' : parent.terrain === 'coastal' ? 'coastal' : parent.terrain === 'wetlands' ? 'wetlands' : 'plains');
    let children = S.res4ChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = cellToChildren(parent.h3Index, DETAIL_H3_RESOLUTION);
      S.res4ChildrenByParent.set(parent.h3Index, children);
    }
    for (const child of children) {
      const override = S.res4TerrainOverridesByH3.get(child);
      const terrainKind = override?.terrainKind ?? parentKind;
      const isUrban = override?.isUrban ?? false;
      const isRubble = override?.isRubble ?? false;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!projectedPolygonOverlapsViewport(pts, viewportWidth, viewportHeight)) continue;
      const drawClosedPath = (): void => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!;
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      };
      if (!deps.isMapInspectionModeHeld()) {
        fillHexTerrain(ctx, terrainKind, drawClosedPath, {
          fillAndHatchAlphaScale: S.hoveredDetailHexH3 === child ? 2 : 1,
          landHoverFill: S.hoveredDetailHexH3 === child && terrainKind === 'plains',
          isUrban,
          isRubble,
        });
      }
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = Math.max(0.28, stroke.width * 0.62);
      drawClosedPath();
      ctx.stroke();
    }
  }
}

export function hasVisibleRes1InfrastructureGlyphs(
  h3Index: string,
  res4On: boolean,
  unitHexes: Set<string>,
  deps: TerrainRenderingDeps
): boolean {
  void unitHexes;
  return !res4On && deps.infraGlyphsAllowedForRes1Hex(h3Index) && (S.terrainInfraRes1Airport.has(h3Index) || S.terrainInfraRes1Seaport.has(h3Index));
}

export function computeRes1OverlayTextY(
  h3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  L: { latLng: (lat: number, lng: number) => unknown },
  hasOffsetFeatures: boolean
): number {
  const center = hexCenterPx(h3Index);
  if (!hasOffsetFeatures) return center.y;
  const pts = projectHexBoundaryToContainerPoints(h3Index, map, L);
  return center.y + spanForProjectedHex(pts) * 0.24;
}

export function drawTerrainInfrastructureOverlays(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {
  if (!S.gameState) return;
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
        getContainer: () => { clientWidth: number; clientHeight: number };
        getZoom?: () => number;
      }
    | null;
  if (!map) return;
  const mapWithZoom = map as { getZoom?: () => number };
  const zoom = typeof mapWithZoom.getZoom === 'function' ? mapWithZoom.getZoom() : 4;
  const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
  const outlineScreenPx = Math.max(0.5, 0.58 * zoomStrokeScale);
  const L = getLeafletGlobal();
  const res4On = shouldRenderRes4Hexes();

  if (!res4On) {
    for (const hx of S.gameState.hexes) {
      if (!deps.infraGlyphsAllowedForRes1Hex(hx.h3Index)) continue;
      const ap = S.terrainInfraRes1Airport.has(hx.h3Index);
      const pt = S.terrainInfraRes1Seaport.has(hx.h3Index);
      if (!ap && !pt) continue;
      const boundary = getHexBoundaryLatLngForLeafletOverlay(hx.h3Index);
      const pts = boundary.map(([lat, lng]: [number, number]) => {
        const p = map.latLngToContainerPoint(L.latLng(lat, lng));
        return { x: p.x, y: p.y };
      });
      drawTerrainInfrastructureGlyphs(ctx, pts, {
        showAirport: ap,
        showSeaport: pt,
        outlineScreenPx,
        centerYOffsetPx: spanForProjectedHex(pts) * -0.14,
      });
    }
    return;
  }

  const container = map.getContainer();
  const viewportWidth = Math.max(1, container.clientWidth);
  const viewportHeight = Math.max(1, container.clientHeight);
  for (const parent of S.gameState.hexes) {
    let children = S.res4ChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = cellToChildren(parent.h3Index, DETAIL_H3_RESOLUTION);
      S.res4ChildrenByParent.set(parent.h3Index, children);
    }
    const parentPts = projectHexBoundaryToContainerPoints(parent.h3Index, map, L);
    if (!projectedPolygonOverlapsViewport(parentPts, viewportWidth, viewportHeight)) continue;
    for (const child of children) {
      if (!deps.infraGlyphsAllowedForRes4Child(parent.h3Index, child)) continue;
      const ap = S.terrainInfraRes4Airport.has(child);
      const pt = S.terrainInfraRes4Seaport.has(child);
      if (!ap && !pt) continue;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!projectedPolygonOverlapsViewport(pts, viewportWidth, viewportHeight)) continue;
      drawTerrainInfrastructureGlyphs(ctx, pts, {
        showAirport: ap,
        showSeaport: pt,
        outlineScreenPx,
        glyphAreaScale: RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE,
      });
    }
  }
}
