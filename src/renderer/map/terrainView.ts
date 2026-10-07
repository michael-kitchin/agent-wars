import { strategicCellAt } from '../../shared/h3Resolutions';
import { getHexBoundaryLatLngForLeafletOverlay } from './hexGrid';
import {
  BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT,
  MAIN_MAP_WHEEL_ZOOM_STEP,
  TACTICAL_HIDE_THRESHOLD_VIEW_FRACTION,
  TACTICAL_SHOW_THRESHOLD_VIEW_FRACTION,
} from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal } from './mapHelpers';
import { getMainLeafletMap } from './worldLeafletMap';
import { projectedPolygonOverlapsViewport } from '../rendering/renderGeometry';

/**
 * Defines the `computeStrategicHexFillFraction` function shape (export function computeStrategicHexFillFraction(): number).

 * Purpose: Supports maintainability by documenting why `computeStrategicHexFillFraction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeStrategicHexFillFraction(): number {
  if (!S.gameState || S.gameState.hexes.length === 0) return 0;
  const map = getMainLeafletMap() as
    | {
        getContainer: () => HTMLElement;
        containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
        latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
      }
    | null;
  if (!map) return 0;
  const L = getLeafletGlobal();
  const container = map.getContainer();
  const center = {
    x: Math.max(1, container.clientWidth) * 0.5,
    y: Math.max(1, container.clientHeight) * 0.5,
  };
  const centerLatLng = map.containerPointToLatLng(L.point(center.x, center.y));
  let sampleH3: string;
  try {
    sampleH3 = strategicCellAt(centerLatLng.lat, centerLatLng.lng);
  } catch {
    sampleH3 = S.gameState.hexes[0]!.h3Index;
  }
  if (!S.gameState.hexes.some((h) => h.h3Index === sampleH3)) {
    sampleH3 = S.gameState.hexes[0]!.h3Index;
  }
  const sampleBoundary = getHexBoundaryLatLngForLeafletOverlay(sampleH3);
  const pts = sampleBoundary.map(([lat, lng]) => map.latLngToContainerPoint(L.latLng(lat, lng)));
  if (pts.length === 0) return 0;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const viewW = Math.max(1, container.clientWidth);
  const viewH = Math.max(1, container.clientHeight);
  return Math.max((maxX - minX) / viewW, (maxY - minY) / viewH);
}

/**
 * Defines the `shouldRenderTacticalHexes` function shape (export function shouldRenderTacticalHexes(): boolean).

 * Purpose: Supports maintainability by documenting why `shouldRenderTacticalHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function shouldRenderTacticalHexes(): boolean {
  if (S.tacticalBattleSnapshot) return true;
  const fillFraction = computeStrategicHexFillFraction();
  if (S.tacticalVisible) {
    if (fillFraction <= TACTICAL_HIDE_THRESHOLD_VIEW_FRACTION) S.tacticalVisible = false;
    return S.tacticalVisible;
  }
  if (fillFraction >= TACTICAL_SHOW_THRESHOLD_VIEW_FRACTION) S.tacticalVisible = true;
  return S.tacticalVisible;
}

/**
 * Returns true when tactical detail zoom is active on the strategic map and unit markers should not be drawn or hit-tested.
 *
 * Purpose: Tactical battles always render tactical hexes but must still show units and stack callouts; strategic tactical zoom hides them for terrain inspection.
 * When to use: Canvas unit draws, stale-intel marker suppression, stack callout lifecycle, and map pointer hit-testing on unit icons.
 * Expected outcome: `true` only when `shouldRenderTacticalHexes()` is true and no tactical battle snapshot is active.
 * Exceptions: None.
 */
export function shouldHideStrategicMapUnitsForZoom(): boolean {
  return shouldRenderTacticalHexes() && !S.tacticalBattleSnapshot;
}

/**
 * Defines the `shouldShowBuildEntryZoom` function shape (export function shouldShowBuildEntryZoom(): boolean).

 * Purpose: Supports maintainability by documenting why `shouldShowBuildEntryZoom` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function shouldShowBuildEntryZoom(): boolean {
  const map = getMainLeafletMap() as { getZoom: () => number } | null;
  if (!map) return false;
  const currentZoom = map.getZoom();
  if (!Number.isFinite(currentZoom)) return false;
  if (S.buildEntryDefaultMapZoom == null) {
    S.buildEntryDefaultMapZoom = currentZoom;
  }
  const threshold =
    S.buildEntryDefaultMapZoom + BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT * MAIN_MAP_WHEEL_ZOOM_STEP;
  return currentZoom >= threshold;
}

/**
 * Defines the `hideBuildEntryLayer` function shape (export function hideBuildEntryLayer(layer: HTMLElement, clearHtml = true): void).

 * Purpose: Supports maintainability by documenting why `hideBuildEntryLayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hideBuildEntryLayer(layer: HTMLElement, clearHtml = true): void {
  layer.classList.add('hidden');
  layer.setAttribute('aria-hidden', 'true');
  if (clearHtml) {
    layer.innerHTML = '';
  }
  S.buildEntryButtonPointerInside = false;
  S.lastBuildEntryLayerKey = null;
}

/**
 * Defines the `projectHexBoundaryToContainerPoints` function shape (export function projectHexBoundaryToContainerPoints( h3Index: string, map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }, L: {).

 * Purpose: Supports maintainability by documenting why `projectHexBoundaryToContainerPoints` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function projectHexBoundaryToContainerPoints(
  h3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  leaflet: { latLng: (lat: number, lng: number) => unknown }
): { x: number; y: number }[] {
  const boundary = getHexBoundaryLatLngForLeafletOverlay(h3Index);
  return boundary.map(([lat, lng]: [number, number]) => {
    const p = map.latLngToContainerPoint(leaflet.latLng(lat, lng));
    return { x: p.x, y: p.y };
  });
}

/**
 * Defines the `shouldConsiderTacticalChildrenForViewport` function shape (export function shouldConsiderTacticalChildrenForViewport( parentStrategicH3Index: string, map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } }, L: { latLng: (lat: number, lng: number) => unknown }, viewportWidth: number, viewportHeight: number ): boolean).

 * Purpose: Single shared **parent** strategic viewport gate before iterating tactical children (terrain fills, infra glyphs, city overlays).
 * When to use: After tactical/exploration filters on the parent row and before `cellToChildren` / child projection work when the parent ring is fully offscreen.
 * Expected outcome: `true` iff the parent hex boundary intersects the Leaflet container viewport in screen space (same contract as `projectedPolygonOverlapsViewport`).
 * Exceptions: None; returns `false` when projection yields an empty ring.
 */
export function shouldConsiderTacticalChildrenForViewport(
  parentStrategicH3Index: string,
  map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number } },
  leaflet: { latLng: (lat: number, lng: number) => unknown },
  viewportWidth: number,
  viewportHeight: number
): boolean {
  const parentPts = projectHexBoundaryToContainerPoints(parentStrategicH3Index, map, leaflet);
  return projectedPolygonOverlapsViewport(parentPts, viewportWidth, viewportHeight);
}

/**
 * Defines the `shouldDrawTacticalChildHexInViewport` function shape (export function shouldDrawTacticalChildHexInViewport( pts: { x: number; y: number }[], viewportWidth: number, viewportHeight: number ): boolean).

 * Purpose: Named tactical **child** viewport cull that mirrors `shouldConsiderTacticalChildrenForViewport` naming; delegates to `projectedPolygonOverlapsViewport` without re-projecting.
 * When to use: Right after `projectHexBoundaryToContainerPoints(childH3, map, L)` when branching before fill/glyph/label work.
 * Expected outcome: `true` iff the child ring intersects the Leaflet container viewport in screen space.
 * Exceptions: None; empty `pts` yields `false` via `projectedPolygonOverlapsViewport`.
 */
export function shouldDrawTacticalChildHexInViewport(
  pts: { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number
): boolean {
  return projectedPolygonOverlapsViewport(pts, viewportWidth, viewportHeight);
}

/**
 * Defines the `spanForProjectedHex` function shape (export function spanForProjectedHex(pts:).

 * Purpose: Supports maintainability by documenting why `spanForProjectedHex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function spanForProjectedHex(pts: { x: number; y: number }[]): number {
  if (pts.length === 0) return 1;
  let minX = pts[0]!.x;
  let maxX = pts[0]!.x;
  let minY = pts[0]!.y;
  let maxY = pts[0]!.y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.max(1, Math.min(maxX - minX, maxY - minY));
}
