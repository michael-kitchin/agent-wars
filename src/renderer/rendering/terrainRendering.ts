import { tacticalChildrenOf } from '../../shared/h3Resolutions';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { strategicOverlayBandOffsetPx } from '../../shared/inspectionStatusIconLine';
import {
  isHexOwnershipVisibleToPerspective,
  resolveHomeRegionOwnerIdentity,
  resolveOwnershipBorderStyle,
  type HomeRegionOwnerIdentity,
  type OwnershipBorderStyle,
} from '../../shared/homeRegionRules';
import { getHexBoundaryLatLngForLeafletOverlay } from '../map/hexGrid';
import { getActiveHexStrokeStyle, fillHexTerrain } from './terrainVisualStyles';
import { drawTerrainInfrastructureGlyphs, TACTICAL_TERRAIN_INFRA_GLYPH_AREA_SCALE } from './terrainInfrastructureOverlay';
import { MULTI_PLAYER_FILL, OWNERSHIP_BORDER_ALPHA, PLAYER_COLORS } from '../core/constants';
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
 * Maps current hex control to the outer solid ownership border color.
 *
 * Purpose: Home-region hexes use controller color on the outside edge, independent of home-region membership.
 * When to use: Outlined home borders and any caller that needs control-only coloring.
 * Expected outcome: Human/opponent player colors; uncontrolled hexes use neutral multi-player gray.
 * Exceptions: None.
 */
function resolveControllerBorderColor(controllerPlayerId: string | null | undefined): string {
  if (controllerPlayerId === 'human') return PLAYER_COLORS.human;
  if (controllerPlayerId === 'opponent') return PLAYER_COLORS.opponent;
  return MULTI_PLAYER_FILL;
}

/**
 * Maps home-region owner identity to the inner dashed border color.
 *
 * Purpose: Inner home borders show declared home-region ownership, not current control.
 * When to use: Outlined home-region border pass after `resolveHomeRegionOwnerIdentity`.
 * Expected outcome: Human/opponent colors for exclusive home hexes; intersection hexes use neutral gray.
 * Exceptions: None.
 */
function resolveHomeRegionOwnerBorderColor(identity: HomeRegionOwnerIdentity): string | null {
  if (identity === 'human') return PLAYER_COLORS.human;
  if (identity === 'opponent') return PLAYER_COLORS.opponent;
  if (identity === 'both') return MULTI_PLAYER_FILL;
  return null;
}

/**
 * Draws dual-line home-region ownership borders: solid outer (controller) and dashed inner (home owner).
 *
 * Purpose: Implements the split-color home border contract without duplicating path/inset logic.
 * When to use: Whenever `resolveOwnershipBorderStyle` returns an `outlined*` token.
 * Expected outcome: Outer ring uses controller color; inset dashed ring uses home-region owner color.
 * Exceptions: None.
 */
function drawOutlinedHomeRegionOwnershipBorders(
  ctx: CanvasRenderingContext2D,
  pts: readonly { x: number; y: number }[],
  args: {
    controllerPlayerId: string | null | undefined;
    homeOwnerIdentity: HomeRegionOwnerIdentity;
    ownershipLineWidth: number;
  }
): void {
  ctx.save();
  ctx.globalAlpha = OWNERSHIP_BORDER_ALPHA;
  const outerColor = resolveControllerBorderColor(args.controllerPlayerId);
  const innerColor = resolveHomeRegionOwnerBorderColor(args.homeOwnerIdentity) ?? outerColor;
  const drawClosedPath = (points: readonly { x: number; y: number }[]): void => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  };
  drawClosedPath(pts);
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = args.ownershipLineWidth;
  ctx.setLineDash([]);
  ctx.stroke();
  const innerPts = buildInsetPolygonPoints(pts, args.ownershipLineWidth * 1.5);
  const innerLineWidth = Math.max(args.ownershipLineWidth * 0.5, 1);
  drawClosedPath(innerPts);
  ctx.strokeStyle = innerColor;
  ctx.lineWidth = innerLineWidth;
  ctx.setLineDash([innerLineWidth * 2.6, innerLineWidth * 1.8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Maps a shared ownership border style token to a concrete render color for normal (non-home) borders.
 *
 * Purpose: Keeps border-color mapping centralized so non-home ownership rendering remains consistent.
 * When to use: Strategic border rendering for hexes that use normal single-line ownership styles.
 * Expected outcome: Human/opponent styles map to player colors and neutral maps to mixed-player gray.
 * Exceptions: `none` returns null.
 */
function resolveOwnershipBorderColor(style: OwnershipBorderStyle): string | null {
  if (style === 'normalControlledByHuman') return PLAYER_COLORS.human;
  if (style === 'normalControlledByOpponent') return PLAYER_COLORS.opponent;
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
  const perspective = S.gameState.playerPerspective === 'opponent' ? 'opponent' : 'human';
  for (const hx of S.gameState.hexes) {
    const boundary = getHexBoundaryLatLngForLeafletOverlay(hx.h3Index);
    const pts = boundary.map(([lat, lng]: [number, number]) => {
      const p = map.latLngToContainerPoint(L.latLng(lat, lng));
      return { x: p.x, y: p.y };
    });
    const kind = deps.getStrategicDominantTerrainKind(
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
    if (ownershipStyle !== 'none') {
      const ownershipLineWidth = getHomeRegionOwnershipLineWidth(zoom);
      if (ownershipStyle.startsWith('outlined')) {
        drawOutlinedHomeRegionOwnershipBorders(ctx, pts, {
          controllerPlayerId: controlByHex.get(hx.h3Index),
          homeOwnerIdentity: resolveHomeRegionOwnerIdentity({
            h3Index: hx.h3Index,
            humanHomeRegionHexes: S.gameState.humanHomeRegionHexes,
            aiHomeRegionHexes: S.gameState.aiHomeRegionHexes,
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
      ctx.strokeStyle = PLAYER_COLORS.human;
      ctx.lineWidth = Math.max(1.8, 2.2 * zoomStrokeScale);
      ctx.stroke();
    }
  }
}

/**
 * Defines the `drawTacticalTerrainHexes` function shape (export function drawTacticalTerrainHexes(ctx: CanvasRenderingContext2D, deps: TerrainRenderingDeps): void).

 * Purpose: Supports maintainability by documenting why `drawTacticalTerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
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
  const container = map.getContainer();
  const viewportWidth = Math.max(1, container.clientWidth);
  const viewportHeight = Math.max(1, container.clientHeight);
  const stroke = getActiveHexStrokeStyle();
  const tactical = S.tacticalBattleSnapshot;
  for (const parent of S.gameState.hexes) {
    if (tactical && parent.h3Index !== tactical.enclosingStrategicH3Index) continue;
    if (!tactical && !exploredHexes.has(parent.h3Index)) continue;
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
  if (!shouldRenderTacticalHexes()) return;
  const map = getMainLeafletMap() as { latLngToContainerPoint: (ll: unknown) => { x: number; y: number }; getZoom?: () => number } | null;
  if (!map) return;
  const L = getLeafletGlobal();
  const zoom = typeof map.getZoom === 'function' ? map.getZoom() : 4;
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
        humanHomeRegionHexes: state.humanHomeRegionHexes,
        aiHomeRegionHexes: state.aiHomeRegionHexes,
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
  for (const parent of S.gameState.hexes) {
    if (tactical && parent.h3Index !== tactical.enclosingStrategicH3Index) continue;
    let children = S.tacticalChildrenByParent.get(parent.h3Index);
    if (!children) {
      children = tacticalChildrenOf(parent.h3Index);
      S.tacticalChildrenByParent.set(parent.h3Index, children);
    }
    if (!shouldConsiderTacticalChildrenForViewport(parent.h3Index, map, L, viewportWidth, viewportHeight)) continue;
    for (const child of children) {
      if (!tactical && !deps.infraGlyphsAllowedForTacticalChild(parent.h3Index, child)) continue;
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
