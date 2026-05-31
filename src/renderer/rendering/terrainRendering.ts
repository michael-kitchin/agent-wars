import { cellToChildren } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  isHexOwnershipVisibleToPerspective,
  resolveOwnershipBorderStyle,
  type OwnershipBorderStyle,
} from '../../shared/homeRegionRules';
import { getHexBoundaryLatLngForLeafletOverlay } from '../map/hexGrid';
import { getActiveHexStrokeStyle, fillHexTerrain } from './terrainVisualStyles';
import { drawTerrainInfrastructureGlyphs, RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE } from './terrainInfrastructureOverlay';
import { DETAIL_H3_RESOLUTION, MULTI_PLAYER_FILL, PLAYER_COLORS } from '../core/constants';
import { getLeafletGlobal, hexCenterPx } from '../map/mapUtils';
import {
  projectHexBoundaryToContainerPoints,
  shouldConsiderRes4ChildrenForViewport,
  shouldDrawRes4ChildHexInViewport,
  shouldRenderRes4Hexes,
  spanForProjectedHex,
} from '../map/terrainView';
import { rendererSharedState as S } from '../core/state';
import { getMainLeafletMap } from '../map/worldLeafletMap';

/**
 * Documents the `TerrainRenderingDeps` interface as a named contract surface (interface TerrainRenderingDeps).

 * Purpose: Supports maintainability by documenting why `TerrainRenderingDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface TerrainRenderingDeps {
    /**
   * Specifies the contract for the `getExploredHexSet` member (getExploredHexSet: (state: GameStateSnapshot | null) => Set<string>;).

   * Contract: Describes stable behavior for callers of `getExploredHexSet` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getExploredHexSet: (state: GameStateSnapshot | null) => Set<string>;
    /**
   * Specifies the contract for the `getRes1DominantTerrainKind` member (getRes1DominantTerrainKind: (h3: string, parentKind: string) => string;).

   * Contract: Describes stable behavior for callers of `getRes1DominantTerrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getRes1DominantTerrainKind: (h3: string, parentKind: string) => string;
    /**
   * Specifies the contract for the `isMapInspectionModeHeld` member (isMapInspectionModeHeld: () => boolean;).

   * Contract: Describes stable behavior for callers of `isMapInspectionModeHeld` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isMapInspectionModeHeld: () => boolean;
    /**
   * Specifies the contract for the `infraGlyphsAllowedForRes1Hex` member (infraGlyphsAllowedForRes1Hex: (h3: string) => boolean;).

   * Contract: Describes stable behavior for callers of `infraGlyphsAllowedForRes1Hex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infraGlyphsAllowedForRes1Hex: (h3: string) => boolean;
    /**
   * Specifies the contract for the `infraGlyphsAllowedForRes4Child` member (infraGlyphsAllowedForRes4Child: (parentH3: string, childH3: string) => boolean;).

   * Contract: Describes stable behavior for callers of `infraGlyphsAllowedForRes4Child` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infraGlyphsAllowedForRes4Child: (parentH3: string, childH3: string) => boolean;
}

/**
 * Defines the `buildControlByHex` function shape (function buildControlByHex(state: GameStateSnapshot): Map<string, string | null>).

 * Purpose: Supports maintainability by documenting why `buildControlByHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildControlByHex(state: GameStateSnapshot): Map<string, string | null> {
  return new Map((state.res1Control ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
}

/**
 * Maps a shared ownership border style token to a concrete render color.
 *
 * Purpose: Keeps border-color mapping centralized so home and non-home ownership rendering remains consistent.
 * When to use: Strategic border rendering after ownership style classification.
 * Expected outcome: Human/opponent styles map to player colors and neutral maps to mixed-player gray.
 * Exceptions: `none` returns null.
 */
function resolveOwnershipBorderColor(style: OwnershipBorderStyle): string | null {
  if (style === 'normalControlledByHuman' || style === 'outlinedControlledByHuman') return PLAYER_COLORS.human;
  if (style === 'normalControlledByOpponent' || style === 'outlinedControlledByOpponent') return PLAYER_COLORS.opponent;
  if (style === 'outlinedNeutral') return MULTI_PLAYER_FILL;
  return null;
}

/**
 * Builds an inward-offset polygon approximation for drawing inner home-region ownership lines.
 *
 * Purpose: Supports home-border dual-line styling by moving each vertex toward centroid by a fixed screen-pixel inset.
 * When to use: After drawing the primary home ownership border when an inner parallel line is required.
 * Expected outcome: Returns a same-vertex-count polygon inset toward center; falls back to original vertices for degenerate points.
 * Exceptions: None.
 */
function buildInsetPolygonPoints(
  pts: readonly { x: number; y: number }[],
  insetPx: number
): { x: number; y: number }[] {
  if (pts.length === 0 || insetPx <= 0) return [...pts];
  let sumX = 0;
  let sumY = 0;
  for (const p of pts) {
    sumX += p.x;
    sumY += p.y;
  }
  const cx = sumX / pts.length;
  const cy = sumY / pts.length;
  return pts.map((p) => {
    const dx = cx - p.x;
    const dy = cy - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) return { x: p.x, y: p.y };
    const appliedInset = Math.min(insetPx, dist * 0.35);
    const t = appliedInset / dist;
    return { x: p.x + dx * t, y: p.y + dy * t };
  });
}

/**
 * Defines the `drawTerrainHexes` function shape (export function drawTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void).

 * Purpose: Supports maintainability by documenting why `drawTerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {
  if (!S.gameState) return;
  if (S.tacticalBattleSnapshot) return;
  const exploredHexes = deps.getExploredHexSet(S.gameState);
  const res4Active = shouldRenderRes4Hexes();
  if (res4Active) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const mapWithZoom = map as { getZoom?: () => number };
  const zoom = typeof mapWithZoom.getZoom === 'function' ? mapWithZoom.getZoom() : 4;
  const zoomStrokeScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
  const L = getLeafletGlobal();
  const visibleHexes = S.gameState.visibleHexes ? new Set(S.gameState.visibleHexes) : new Set(S.gameState.hexes.map((h) => h.h3Index));
  const controlByHex = buildControlByHex(S.gameState);
  const perspective = S.gameState.playerPerspective === 'opponent' ? 'opponent' : 'human';
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
    const ownershipVisible = isHexOwnershipVisibleToPerspective({
      h3Index: hx.h3Index,
      playerPerspective: perspective,
      visibleHexes,
      humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
      aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
      intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
    });
    const ownershipStyle = resolveOwnershipBorderStyle({
      h3Index: hx.h3Index,
      controllerPlayerId: controlByHex.get(hx.h3Index),
      isOwnershipVisible: ownershipVisible,
      humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
      aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
      intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
    });
    const ownershipColor = resolveOwnershipBorderColor(ownershipStyle);
    ctx.strokeStyle = ownershipStyle.startsWith('outlined') ? 'rgba(0, 0, 0, 0)' : stroke.color;
    ctx.lineWidth = stroke.width * zoomStrokeScale;
    drawClosedPath();
    ctx.stroke();
    if (ownershipColor && ownershipStyle !== 'none') {
      const ownershipLineWidth = Math.max(stroke.width * zoomStrokeScale * 3, 2.7);
      drawClosedPath();
      ctx.strokeStyle = ownershipColor;
      ctx.lineWidth = ownershipLineWidth;
      ctx.stroke();
      if (ownershipStyle.startsWith('outlined')) {
        const innerPts = buildInsetPolygonPoints(pts, ownershipLineWidth * 1.5);
        const innerLineWidth = Math.max(ownershipLineWidth * 0.5, 1);
        ctx.beginPath();
        for (let i = 0; i < innerPts.length; i++) {
          const p = innerPts[i]!;
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = ownershipColor;
        ctx.lineWidth = innerLineWidth;
        ctx.setLineDash([innerLineWidth * 2.6, innerLineWidth * 1.8]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (S.selectedHexIndex === hx.h3Index) {
      drawClosedPath();
      ctx.strokeStyle = PLAYER_COLORS.human;
      ctx.lineWidth = Math.max(1.8, 2.2 * zoomStrokeScale);
      ctx.stroke();
    }
  }
}

/**
 * Defines the `drawRes4TerrainHexes` function shape (export function drawRes4TerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void).

 * Purpose: Supports maintainability by documenting why `drawRes4TerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  const tactical = S.tacticalBattleSnapshot;
  for (const parent of S.gameState.hexes) {
    if (tactical && parent.h3Index !== tactical.enclosingRes1H3Index) continue;
    if (!tactical && !exploredHexes.has(parent.h3Index)) continue;
    if (!shouldConsiderRes4ChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
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
      if (!shouldDrawRes4ChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
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

/**
 * Defines the `drawScenarioHomeRegionOutlines` function shape (export function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawScenarioHomeRegionOutlines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void {
  const state = S.gameState;
  if (!state) return;
  const homeRegionHexes = [...new Set([...(state.humanHomeRegionHexes ?? []), ...(state.aiHomeRegionHexes ?? [])])];
  if (homeRegionHexes.length === 0) return;
  if (!shouldRenderRes4Hexes()) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number }; getZoom?: () => number } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 4;
  const zoomScale = Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
  const perspective = state.playerPerspective === 'opponent' ? 'opponent' : 'human';
  const visibleHexes = state.visibleHexes ? new Set(state.visibleHexes) : new Set(state.hexes.map((h) => h.h3Index));
  const controlByHex = buildControlByHex(state);
  for (const h3Index of homeRegionHexes) {
    const ownershipVisible = isHexOwnershipVisibleToPerspective({
      h3Index,
      playerPerspective: perspective,
      visibleHexes,
      humanHomeRegionHexes: state.humanHomeRegionHexes,
      aiHomeRegionHexes: state.aiHomeRegionHexes,
      intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
    });
    const style = resolveOwnershipBorderStyle({
      h3Index,
      controllerPlayerId: controlByHex.get(h3Index),
      isOwnershipVisible: ownershipVisible,
      humanHomeRegionHexes: state.humanHomeRegionHexes,
      aiHomeRegionHexes: state.aiHomeRegionHexes,
      intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
    });
    if (style === 'none') continue;
    const color = resolveOwnershipBorderColor(style);
    if (!color) continue;
    const boundary = getHexBoundaryLatLngForLeafletOverlay(h3Index);
    const pts = boundary.map(([lat, lng]: [number, number]) => {
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: p.x, y: p.y };
    });
    const drawClosedPath = (): void => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    drawClosedPath();
    ctx.strokeStyle = color;
    const ownershipLineWidth = Math.max(getActiveHexStrokeStyle().width * zoomScale * 3, 2.7);
    ctx.lineWidth = ownershipLineWidth;
    ctx.stroke();
    const innerPts = buildInsetPolygonPoints(pts, ownershipLineWidth * 1.5);
    const innerLineWidth = Math.max(ownershipLineWidth * 0.5, 1);
    ctx.beginPath();
    for (let i = 0; i < innerPts.length; i++) {
      const p = innerPts[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = innerLineWidth;
    ctx.setLineDash([innerLineWidth * 2.6, innerLineWidth * 1.8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/**
 * Defines the `hasVisibleRes1InfrastructureGlyphs` function shape (export function hasVisibleRes1InfrastructureGlyphs( h3Index: string, res4On: boolean, unitHexes: Set<string>, deps: TerrainRenderingDeps ): boolean).

 * Purpose: Supports maintainability by documenting why `hasVisibleRes1InfrastructureGlyphs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hasVisibleRes1InfrastructureGlyphs(
  h3Index: string,
  res4On: boolean,
  unitHexes: Set<string>,
  deps: TerrainRenderingDeps
): boolean {
  void unitHexes;
  return !res4On && deps.infraGlyphsAllowedForRes1Hex(h3Index) && (S.terrainInfraRes1Airport.has(h3Index) || S.terrainInfraRes1Seaport.has(h3Index));
}

/**
 * Defines the `computeRes1OverlayTextY` function shape (export function computeRes1OverlayTextY( h3Index: string, map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }, L: { latLng: (lat).

 * Purpose: Supports maintainability by documenting why `computeRes1OverlayTextY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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

/**
 * Defines the `drawTerrainInfrastructureOverlays` function shape (export function drawTerrainInfrastructureOverlays(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void).

 * Purpose: Renders res1/res4 airport and seaport glyphs on the overlay canvas (skipped entirely while map inspection T is held).
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
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
  // Map inspection (T held): omit airport/seaport canvas glyphs so centered hex codes stay readable.
  if (deps.isMapInspectionModeHeld()) return;
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
  const tactical = S.tacticalBattleSnapshot;
  for (const parent of S.gameState.hexes) {
    if (tactical && parent.h3Index !== tactical.enclosingRes1H3Index) continue;
    let children = S.res4ChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = cellToChildren(parent.h3Index, DETAIL_H3_RESOLUTION);
      S.res4ChildrenByParent.set(parent.h3Index, children);
    }
    if (!shouldConsiderRes4ChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
    for (const child of children) {
      if (!tactical && !deps.infraGlyphsAllowedForRes4Child(parent.h3Index, child)) continue;
      const ap = S.terrainInfraRes4Airport.has(child);
      const pt = S.terrainInfraRes4Seaport.has(child);
      if (!ap && !pt) continue;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!shouldDrawRes4ChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
      drawTerrainInfrastructureGlyphs(ctx, pts, {
        showAirport: ap,
        showSeaport: pt,
        outlineScreenPx,
        glyphAreaScale: RES4_TERRAIN_INFRA_GLYPH_AREA_SCALE,
      });
    }
  }
}
