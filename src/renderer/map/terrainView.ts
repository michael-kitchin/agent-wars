import { latLngToCell } from 'h3-js';
import { getHexBoundaryLatLngForLeafletOverlay } from './hexGrid';
import {
  BUILD_ENTRY_ZOOM_STEPS_FROM_DEFAULT,
  MAIN_MAP_WHEEL_ZOOM_STEP,
  RES4_HIDE_THRESHOLD_VIEW_FRACTION,
  RES4_SHOW_THRESHOLD_VIEW_FRACTION,
  WORLD_H3_RESOLUTION,
} from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { getLeafletGlobal } from './mapUtils';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Defines the `computeRes1HexFillFraction` function shape (export function computeRes1HexFillFraction(): number).

 * Purpose: Supports maintainability by documenting why `computeRes1HexFillFraction` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function computeRes1HexFillFraction(): number {
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
    sampleH3 = latLngToCell(centerLatLng.lat, centerLatLng.lng, WORLD_H3_RESOLUTION);
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
 * Defines the `shouldRenderRes4Hexes` function shape (export function shouldRenderRes4Hexes(): boolean).

 * Purpose: Supports maintainability by documenting why `shouldRenderRes4Hexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function shouldRenderRes4Hexes(): boolean {
  const fillFraction = computeRes1HexFillFraction();
  if (S.res4Visible) {
    if (fillFraction <= RES4_HIDE_THRESHOLD_VIEW_FRACTION) S.res4Visible = false;
    return S.res4Visible;
  }
  if (fillFraction >= RES4_SHOW_THRESHOLD_VIEW_FRACTION) S.res4Visible = true;
  return S.res4Visible;
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
  L: { latLng: (lat: number, lng: number) => unknown }
): { x: number; y: number }[] {
  const boundary = getHexBoundaryLatLngForLeafletOverlay(h3Index);
  return boundary.map(([lat, lng]: [number, number]) => {
    const p = map.latLngToContainerPoint(L.latLng(lat, lng));
    return { x: p.x, y: p.y };
  });
}

/**
 * Defines the `projectedPolygonOverlapsViewport` function shape (export function projectedPolygonOverlapsViewport().

 * Purpose: Supports maintainability by documenting why `projectedPolygonOverlapsViewport` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function projectedPolygonOverlapsViewport(
  pts: { x: number; y: number }[],
  viewportWidth: number,
  viewportHeight: number
): boolean {
  if (pts.length === 0) return false;
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
  return maxX >= 0 && maxY >= 0 && minX <= viewportWidth && minY <= viewportHeight;
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
