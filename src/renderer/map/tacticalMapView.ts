import { getHexBoundaryLatLngForLeafletOverlay, WEB_MERCATOR_MAX_ABS_LAT } from './hexGrid';
import { restoreLoadedMapExtent } from './mapExtent';
import { getLeafletGlobal } from './mapHelpers';
import { getMainLeafletMap } from './worldLeafletMap';
import { rendererSharedState as S } from '../core/state';
import { hidePlanningChromeToasts } from '../openRouter/openRouterUiHelpers';

type LeafletMapLike = {
  getMinZoom?: () => number;
  getMaxZoom?: () => number;
  getZoom?: () => number;
  setView?: (center: unknown, zoom: number) => void;
  setMinZoom?: (z: number) => void;
  setMaxZoom?: (z: number) => void;
  setMaxBounds?: (b: unknown) => void;
  getBounds?: () => { getSouthWest: () => { lat: number; lng: number }; getNorthEast: () => { lat: number; lng: number } };
  fitBounds?: (b: unknown, opts?: { padding?: number[]; animate?: boolean }) => void;
  flyToBounds?: (
    b: unknown,
    opts?: { padding?: number[]; duration?: number; maxZoom?: number; animate?: boolean }
  ) => void;
  once?: (event: string, fn: () => void) => unknown;
};

/**
 * Tightens Leaflet pan/zoom limits to the tactical footprint and animates a zoomed-in view.
 *
 * Purpose: Frames the tactical battle area when entering tactical mode from strategic.
 * When to use: After a tactical battle session starts and child tactical indexes are known.
 * Expected outcome: Map flies/fits to the tactical bounds, min/max zoom are adjusted,
 * and planning chrome toasts are dismissed once at entry (hide only; later shows still work).
 * Exceptions: No-ops when the Leaflet map, global, fitBounds, or bounds are unavailable.
 */
export function enterTacticalMapView(childTacticalH3Indexes: string[]): void {
  const map = getMainLeafletMap() as LeafletMapLike | null;
  const L = getLeafletGlobal() as
    | {
        latLngBounds: (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => unknown;
        latLng: (lat: number, lng: number) => unknown;
      }
    | null;
  if (!map || !L || typeof map.fitBounds !== 'function') return;

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;
  for (const h3 of childTacticalH3Indexes) {
    const boundary = getHexBoundaryLatLngForLeafletOverlay(h3);
    for (const [lat, lng] of boundary) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (minLat > maxLat) return;
  const padLat = Math.max(0.0005, (maxLat - minLat) * 0.08);
  const padLng = Math.max(0.0005, (maxLng - minLng) * 0.08);
  const sw = { lat: Math.max(-WEB_MERCATOR_MAX_ABS_LAT, minLat - padLat), lng: minLng - padLng };
  const ne = { lat: Math.min(WEB_MERCATOR_MAX_ABS_LAT, maxLat + padLat), lng: maxLng + padLng };
  const tacticalBounds = L.latLngBounds(L.latLng(sw.lat, sw.lng), L.latLng(ne.lat, ne.lng));
  hidePlanningChromeToasts();

  if (S.preTacticalLeafletMinZoom == null && typeof map.getMinZoom === 'function') {
    S.preTacticalLeafletMinZoom = map.getMinZoom();
  }
  if (S.preTacticalLeafletMaxZoom == null && typeof map.getMaxZoom === 'function') {
    S.preTacticalLeafletMaxZoom = map.getMaxZoom();
  }
  /** Midpoint between the prior closer cap (14) and the last bump (15). */
  const tacticalFlyMaxZoom = 14.5;
  const tacticalAbsoluteMaxZoom = 16;
  if (typeof map.setMaxZoom === 'function') map.setMaxZoom(tacticalAbsoluteMaxZoom);

  /**
   * Applies tight pan limits and locks min zoom to the zoom level after fitting the tactical footprint.
   * When to use: After `flyToBounds` / `fitBounds` has settled (timer for fly, `moveend` for fit fallback).
   */
  const finalizeTacticalViewZoomAndPan = (): void => {
    if (typeof map.setMaxBounds === 'function') map.setMaxBounds(tacticalBounds);
    if (typeof map.getZoom === 'function' && typeof map.setMinZoom === 'function') {
      map.setMinZoom(map.getZoom());
    }
  };

  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(tacticalBounds, { padding: [20, 20], duration: 0.55, maxZoom: tacticalFlyMaxZoom });
    // Timed finalize: `moveend` is unreliable here (e.g. `setMaxBounds` elsewhere can pre-empt, and this map
    // uses `zoomAnimation: false`, so fly completion sequencing varies).
    setTimeout(finalizeTacticalViewZoomAndPan, 750);
  } else {
    map.fitBounds?.(tacticalBounds, { padding: [20, 20], animate: true });
    if (typeof map.once === 'function') {
      map.once('moveend', finalizeTacticalViewZoomAndPan);
    } else {
      setTimeout(finalizeTacticalViewZoomAndPan, 200);
    }
  }
}

/**
 * Restores Leaflet pan/zoom limits after tactical mode ends.
 */
export function exitTacticalMapView(): void {
  const map = getMainLeafletMap() as LeafletMapLike | null;
  const L = getLeafletGlobal() as
    | {
        latLngBounds: (sw: { lat: number; lng: number }, ne: { lat: number; lng: number }) => unknown;
        latLng: (lat: number, lng: number) => unknown;
      }
    | null;
  if (!map || !L) {
    S.preTacticalLeafletMinZoom = null;
    S.preTacticalLeafletMaxZoom = null;
    return;
  }
  restoreLoadedMapExtent();
  if (typeof map.setMinZoom === 'function' && S.preTacticalLeafletMinZoom != null) {
    map.setMinZoom(S.preTacticalLeafletMinZoom);
  }
  if (typeof map.setMaxZoom === 'function' && S.preTacticalLeafletMaxZoom != null) {
    map.setMaxZoom(S.preTacticalLeafletMaxZoom);
  }
  S.preTacticalLeafletMinZoom = null;
  S.preTacticalLeafletMaxZoom = null;
  const home = S.strategicScenarioInitialLeafletView;
  if (home && typeof map.setView === 'function') {
    map.setView(L.latLng(home.lat, home.lng), home.zoom);
  } else {
    restoreLoadedMapExtent(true);
  }
}
