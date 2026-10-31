import { tacticalChildrenOf } from '../../shared/h3Resolutions';
import { strategicMapFillTerrainKind } from '../../shared/landTraversalStrategic';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { strategicOverlayBandOffsetPx } from '../../shared/inspectionStatusIconLine';
import {
  isHexOwnershipVisibleToPerspective,
  ownershipPerspective,
  resolveHomeRegionOwnerIdentity,
  resolveOwnershipBorderStyle,
  type OwnershipBorderStyle,
} from '../../shared/homeRegionRules';
import { getHexBoundaryLatLngForLeafletOverlay } from '../map/hexGrid';
import { drawClosedPolygonPath } from './polygonOutline';
import { getActiveHexStrokeStyle, fillHexTerrain } from './terrainVisualStyles';
import { drawTerrainInfrastructureGlyphs, TACTICAL_TERRAIN_INFRA_GLYPH_AREA_SCALE } from './terrainInfrastructureOverlay';
import { drawFortifiedCellTicks } from './fortificationTickDrawing';
import { drawBattleFootprintInfrastructureGlyphs, paintBattleFootprintTerrain } from './tacticalBattleTerrainPaint';
import { OWNERSHIP_BORDER_ALPHA } from '../core/constants';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  drawOutlinedHomeRegionOwnershipBorders,
  ownershipStyleIsOutlined,
  resolveOwnershipBorderColor,
} from './homeRegionBorderDrawing';

export { drawOutlinedHomeRegionOwnershipBorders };
import { paletteForCurrentOwner } from './ownerColors';
import { getLeafletGlobal, hexCenterPx } from '../map/mapHelpers';
import {
  projectHexBoundaryToContainerPoints,
  shouldConsiderTacticalChildrenForViewport,
  shouldDrawTacticalChildHexInViewport,
  shouldRenderTacticalHexes,
  spanForProjectedHex,
} from '../map/terrainView';
import { rendererSharedState as S } from '../core/state';
import { getMainLeafletMap } from '../map/worldLeafletMap';
import { areControlBordersShown } from '../map/mapViewModeState';

/**
 * Returns the map zoom stroke scale factor used for terrain and ownership borders.
 *
 * Purpose: Centralizes the zoom-to-stroke mapping shared by terrain hexes and home-region outlines.
 * When to use: Any canvas stroke that should track Leaflet zoom like `drawTerrainHexes`.
 * Expected outcome: Value in `[0.88, 1.22]` for typical game zoom levels.
 * Exceptions: None.
 */
export function getMapZoomStrokeScale(zoom: number): number {
  return Math.max(0.88, Math.min(1.22, 1.22 - ((zoom - 2) * (0.32 / 8))));
}

/**
 * Returns the solid outer home-region ownership border width in screen pixels.
 *
 * Purpose: Single source for home outer ring width at the current map zoom; strategic ranged/air-strike overlays also scale from this value.
 * When to use: `drawOutlinedHomeRegionOwnershipBorders` and `getRangePerimeterOutlineLineWidth` / `getRangeSupportPlanLineWidth`.
 * Expected outcome: `Math.max(stroke.width * zoomScale * 3, 2.7)` matching pre-extraction behavior.
 * Exceptions: None.
 */
export function getHomeRegionOwnershipLineWidth(zoom: number): number {
  const stroke = getActiveHexStrokeStyle();
  const zoomStrokeScale = getMapZoomStrokeScale(zoom);
  return Math.max(stroke.width * zoomStrokeScale * 3, 2.7);
}

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
   * Specifies the contract for the `getStrategicDominantTerrainKind` member (getStrategicDominantTerrainKind: (h3: string, parentKind: string) => string;).

   * Contract: Describes stable behavior for callers of `getStrategicDominantTerrainKind` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
getStrategicDominantTerrainKind: (h3: string, parentKind: string) => string;
    /**
   * Specifies the contract for the `isMapInspectionModeHeld` member (isMapInspectionModeHeld: () => boolean;).

   * Contract: Describes stable behavior for callers of `isMapInspectionModeHeld` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
isMapInspectionModeHeld: () => boolean;
    /**
   * Specifies the contract for the `infraGlyphsAllowedForStrategicHex` member (infraGlyphsAllowedForStrategicHex: (h3: string) => boolean;).

   * Contract: Describes stable behavior for callers of `infraGlyphsAllowedForStrategicHex` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infraGlyphsAllowedForStrategicHex: (h3: string) => boolean;
    /**
   * Specifies the contract for the `infraGlyphsAllowedForTacticalChild` member (infraGlyphsAllowedForTacticalChild: (parentH3: string, childH3: string) => boolean;).

   * Contract: Describes stable behavior for callers of `infraGlyphsAllowedForTacticalChild` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
infraGlyphsAllowedForTacticalChild: (parentH3: string, childH3: string) => boolean;
}

/**
 * Defines the `buildControlByHex` function shape (function buildControlByHex(state: GameStateSnapshot): Map<string, string | null>).

 * Purpose: Supports maintainability by documenting why `buildControlByHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function buildControlByHex(state: GameStateSnapshot): Map<string, string | null> {
  return new Map((state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId]));
}


/**
 * Draws the world map's hexes: terrain fill, the grid stroke, and the borders that mark who controls each hex.
 *
 * Purpose: The base layer of the strategic map, under units, labels, and icons.
 * When to use: Once per strategic frame. A battle and battle-detail zoom draw their own hexes.
 * Expected outcome: Nothing in a battle, at battle-detail zoom, or without a map. Explored hexes are filled unless T
 *   is held. While Control is on, ownership borders follow `resolveOwnershipBorderStyle`; while it is off, every hex
 *   gets only the normal grid stroke.
 * Exceptions: None.
 */
export function drawTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {
  if (!S.gameState) return;
  if (S.tacticalBattleSnapshot) return;
  const exploredHexes = deps.getExploredHexSet(S.gameState);
  const tacticalActive = shouldRenderTacticalHexes();
  if (tacticalActive) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } } | null;
  if (!map) return;
  const mapWithZoom = map as { getZoom?: () => number };
  const zoom = typeof mapWithZoom.getZoom === 'function' ? mapWithZoom.getZoom() : 4;
  const zoomStrokeScale = getMapZoomStrokeScale(zoom);
  const L = getLeafletGlobal();
  const visibleHexes = S.gameState.visibleHexes ? new Set(S.gameState.visibleHexes) : new Set(S.gameState.hexes.map((h) => h.h3Index));
  const controlByHex = buildControlByHex(S.gameState);
  const perspective = ownershipPerspective(S.gameState.playerPerspective);
  const controlBordersShown = areControlBordersShown();
  for (const hx of S.gameState.hexes) {
    const boundary = getHexBoundaryLatLngForLeafletOverlay(hx.h3Index);
    const pts = boundary.map(([lat, lng]: [number, number]) => {
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: p.x, y: p.y };
    });
    const storedKind =
      hx.terrainKind ??
      (hx.terrain === 'water' ? 'water' : hx.terrain === 'coastal' ? 'coastal' : hx.terrain === 'wetlands' ? 'wetlands' : 'plains');
    const kind = strategicMapFillTerrainKind(storedKind, deps.getStrategicDominantTerrainKind(hx.h3Index, storedKind));
    const drawClosedPath = (): void => {
      drawClosedPolygonPath(ctx, pts);
    };
    const explored = exploredHexes.has(hx.h3Index);
    if (explored && !deps.isMapInspectionModeHeld()) {
      fillHexTerrain(ctx, kind, drawClosedPath, {
        fillAndHatchAlphaScale: !tacticalActive && S.hoveredHexH3 === hx.h3Index ? 2 : 1,
        landHoverFill: !tacticalActive && S.hoveredHexH3 === hx.h3Index && kind === 'plains',
        isUrban: false,
      });
    }
    const stroke = getActiveHexStrokeStyle();
    const ownershipVisible = isHexOwnershipVisibleToPerspective({
      h3Index: hx.h3Index,
      playerPerspective: perspective,
      visibleHexes,
      homeRegionHexesBySeat: S.gameState.homeRegionHexesBySeat,
      intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
    });
    const ownershipStyle: OwnershipBorderStyle = controlBordersShown
      ? resolveOwnershipBorderStyle({
          h3Index: hx.h3Index,
          controllerPlayerId: controlByHex.get(hx.h3Index),
          isOwnershipVisible: ownershipVisible,
          homeRegionHexesBySeat: S.gameState.homeRegionHexesBySeat,
          intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
        })
      : { kind: 'none' };
    const ownershipColor = resolveOwnershipBorderColor(ownershipStyle);
    ctx.strokeStyle = ownershipStyleIsOutlined(ownershipStyle) ? 'rgba(0, 0, 0, 0)' : stroke.color;
    ctx.lineWidth = stroke.width * zoomStrokeScale;
    drawClosedPath();
    ctx.stroke();
    if (ownershipStyle.kind !== 'none') {
      const ownershipLineWidth = getHomeRegionOwnershipLineWidth(zoom);
      if (ownershipStyleIsOutlined(ownershipStyle)) {
        drawOutlinedHomeRegionOwnershipBorders(ctx, pts, {
          controllerPlayerId: controlByHex.get(hx.h3Index),
          homeOwnerIdentity: resolveHomeRegionOwnerIdentity({
            h3Index: hx.h3Index,
            homeRegionHexesBySeat: S.gameState.homeRegionHexesBySeat,
            intersectingHomeRegionHexes: S.gameState.intersectingHomeRegionHexes,
          }),
          ownershipLineWidth,
        });
      } else if (ownershipColor) {
        ctx.save();
        ctx.globalAlpha = OWNERSHIP_BORDER_ALPHA;
        drawClosedPath();
        ctx.strokeStyle = ownershipColor;
        ctx.lineWidth = ownershipLineWidth;
        ctx.stroke();
        ctx.restore();
      }
    }
    if (S.selectedHexIndex === hx.h3Index) {
      drawClosedPath();
      ctx.strokeStyle = paletteForCurrentOwner(HUMAN_SEAT_ID)?.map ?? '#115E59';
      ctx.lineWidth = Math.max(1.8, 2.2 * zoomStrokeScale);
      ctx.stroke();
    }
  }
}

/**
 * Draws tactical terrain hexes for the strategic map, or the battle footprint when a battle is open.
 *
 * Purpose: Battle cells include three rings beyond the enclosing hex, so that path paints `tacticalChildH3Indexes` directly.
 * When to use: Each map frame while tactical hexes should render.
 * Expected outcome: With a snapshot, every on-screen footprint cell is painted and the strategic parent loop is skipped. Without one, explored parents still gate geometric children.
 * Exceptions: None.
 */
export function drawTacticalTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void {
  if (!S.gameState || !shouldRenderTacticalHexes()) return;
  const exploredHexes = deps.getExploredHexSet(S.gameState);
  const map = getMainLeafletMap() as
    | {
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
        getContainer: () => { clientWidth: number; clientHeight: number };
      }
    | null;
  if (!map) return;
  const L = getLeafletGlobal();
  if (!L) return;
  const container = map.getContainer();
  const viewportWidth = Math.max(1, container.clientWidth);
  const viewportHeight = Math.max(1, container.clientHeight);
  const stroke = getActiveHexStrokeStyle();
  const tactical = S.tacticalBattleSnapshot;
  if (tactical) {
    const leaflet = L as { latLng: (lat: number, lng: number) => unknown };
    paintBattleFootprintTerrain(ctx, deps, tactical, map, leaflet, viewportWidth, viewportHeight, stroke);
    return;
  }
  for (const parent of S.gameState.hexes) {
    if (!exploredHexes.has(parent.h3Index)) continue;
    if (!shouldConsiderTacticalChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
    const parentKind =
      parent.terrainKind ??
      (parent.terrain === 'water' ? 'water' : parent.terrain === 'coastal' ? 'coastal' : parent.terrain === 'wetlands' ? 'wetlands' : 'plains');
    let children = S.tacticalChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = tacticalChildrenOf(parent.h3Index);
      S.tacticalChildrenByParent.set(parent.h3Index, children);
    }
    for (const child of children) {
      const override = S.tacticalTerrainOverridesByH3.get(child);
      const terrainKind = override?.terrainKind ?? parentKind;
      const isUrban = override?.isUrban ?? false;
      const isRubble = override?.isRubble ?? false;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!shouldDrawTacticalChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
      const drawClosedPath = (): void => {
        drawClosedPolygonPath(ctx, pts);
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
      if (override?.isFortified && !deps.isMapInspectionModeHeld()) {
        drawFortifiedCellTicks(ctx, pts, child);
      }
    }
  }
}

/**
 * Outlines the human and AI home regions at battle-detail zoom.
 *
 * Purpose: The world map's ownership borders are not drawn at that zoom, so the home regions get their own outline.
 * When to use: Once per frame from the scene pass.
 * Expected outcome: Nothing without a match, while Control is off, without home regions, or outside battle-detail
 *   zoom. Otherwise each home-region hex gets its outlined border.
 * Exceptions: None.
 */
export function drawScenarioHomeRegionOutlines(ctx: CanvasRenderingContext2D): void {
  const state = S.gameState;
  if (!state || !areControlBordersShown()) return;
  const homeRegionHexes = [...new Set(Object.values(state.homeRegionHexesBySeat ?? {}).flat())];
  if (homeRegionHexes.length === 0) return;
  if (!shouldRenderTacticalHexes()) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number }; getZoom?: () => number } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 4;
  const perspective = ownershipPerspective(state.playerPerspective);
  const visibleHexes = state.visibleHexes ? new Set(state.visibleHexes) : new Set(state.hexes.map((h) => h.h3Index));
  const controlByHex = buildControlByHex(state);
  for (const h3Index of homeRegionHexes) {
    const ownershipVisible = isHexOwnershipVisibleToPerspective({
      h3Index,
      playerPerspective: perspective,
      visibleHexes,
      homeRegionHexesBySeat: state.homeRegionHexesBySeat,
      intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
    });
    const style = resolveOwnershipBorderStyle({
      h3Index,
      controllerPlayerId: controlByHex.get(h3Index),
      isOwnershipVisible: ownershipVisible,
      homeRegionHexesBySeat: state.homeRegionHexesBySeat,
      intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
    });
    if (style.kind === 'none') continue;
    const boundary = getHexBoundaryLatLngForLeafletOverlay(h3Index);
    const pts = boundary.map(([lat, lng]: [number, number]) => {
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: p.x, y: p.y };
    });
    const ownershipLineWidth = getHomeRegionOwnershipLineWidth(zoom);
    drawOutlinedHomeRegionOwnershipBorders(ctx, pts, {
      controllerPlayerId: controlByHex.get(h3Index),
      homeOwnerIdentity: resolveHomeRegionOwnerIdentity({
        h3Index,
        homeRegionHexesBySeat: state.homeRegionHexesBySeat,
        intersectingHomeRegionHexes: state.intersectingHomeRegionHexes,
      }),
      ownershipLineWidth,
    });
  }
}

/**
 * Defines the `hasVisibleStrategicInfrastructureGlyphs` function shape (export function hasVisibleStrategicInfrastructureGlyphs( h3Index: string, tacticalOn: boolean, unitHexes: Set<string>, deps: TerrainRenderingDeps ): boolean).

 * Purpose: Supports maintainability by documenting why `hasVisibleStrategicInfrastructureGlyphs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hasVisibleStrategicInfrastructureGlyphs(
  h3Index: string,
  tacticalOn: boolean,
  unitHexes: Set<string>,
  deps: TerrainRenderingDeps
): boolean {
  void unitHexes;
  return !tacticalOn && deps.infraGlyphsAllowedForStrategicHex(h3Index) && (S.terrainInfraStrategicAirport.has(h3Index) || S.terrainInfraStrategicSeaport.has(h3Index));
}

/**
 * Defines the `computeStrategicOverlayTextY` function shape (export function computeStrategicOverlayTextY( h3Index: string, map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }, L: { latLng: (lat).

 * Purpose: Supports maintainability by documenting why `computeStrategicOverlayTextY` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeStrategicOverlayTextY(
  h3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  leaflet: { latLng: (lat: number, lng: number) => unknown },
  hasOffsetFeatures: boolean
): number {
  const center = hexCenterPx(h3Index);
  if (!hasOffsetFeatures) return center.y;
  const pts = projectHexBoundaryToContainerPoints(h3Index, map, leaflet);
  return center.y + strategicOverlayBandOffsetPx(spanForProjectedHex(pts));
}

/**
 * Defines the `drawTerrainInfrastructureOverlays` function shape (export function drawTerrainInfrastructureOverlays(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void).

 * Purpose: Renders strategic/tactical airport and seaport glyphs on the overlay canvas (skipped entirely while map inspection T is held).
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
  const zoomStrokeScale = getMapZoomStrokeScale(zoom);
  const outlineScreenPx = Math.max(0.5, 0.58 * zoomStrokeScale);
  const L = getLeafletGlobal();
  const tacticalOn = shouldRenderTacticalHexes();

  if (!tacticalOn) {
    for (const hx of S.gameState.hexes) {
      if (!deps.infraGlyphsAllowedForStrategicHex(hx.h3Index)) continue;
      const ap = S.terrainInfraStrategicAirport.has(hx.h3Index);
      const pt = S.terrainInfraStrategicSeaport.has(hx.h3Index);
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
  if (tactical) {
    if (!L) return;
    const leaflet = L as { latLng: (lat: number, lng: number) => unknown };
    drawBattleFootprintInfrastructureGlyphs(ctx, tactical, map, leaflet, viewportWidth, viewportHeight, outlineScreenPx);
    return;
  }
  for (const parent of S.gameState.hexes) {
    let children = S.tacticalChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = tacticalChildrenOf(parent.h3Index);
      S.tacticalChildrenByParent.set(parent.h3Index, children);
    }
    if (!shouldConsiderTacticalChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
    for (const child of children) {
      if (!deps.infraGlyphsAllowedForTacticalChild(parent.h3Index, child)) continue;
      const ap = S.terrainInfraTacticalAirport.has(child);
      const pt = S.terrainInfraTacticalSeaport.has(child);
      if (!ap && !pt) continue;
      const pts = projectHexBoundaryToContainerPoints(child, map, L);
      if (!shouldDrawTacticalChildHexInViewport(pts, viewportWidth, viewportHeight)) continue;
      drawTerrainInfrastructureGlyphs(ctx, pts, {
        showAirport: ap,
        showSeaport: pt,
        outlineScreenPx,
        glyphAreaScale: TACTICAL_TERRAIN_INFRA_GLYPH_AREA_SCALE,
      });
    }
  }
}
