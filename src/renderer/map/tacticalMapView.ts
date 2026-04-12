import { getHexBoundaryLatLngForLeafletOverlay, WEB_MERCATOR_MAX_ABS_LAT } from './hexGrid';
import { getLeafletGlobal } from './mapUtils';
import { getMainLeafletMap } from './worldLeafletMap';
import { rendererSharedState as S } from '../core/state';

type LeafletMapLike = {
  getMinZoom?: () => number;
  getMaxZoom?: () => number;
  setMinZoom?: (z: number) => void;
  setMaxZoom?: (z: number) => void;
  setMaxBounds?: (b: unknown) => void;
  getBounds?: () => { getSouthWest: () => { lat: number; lng: number }; getNorthEast: () => { lat: number; lng: number } };
  fitBounds?: (b: unknown, opts?: { padding?: number[]; animate?: boolean }) => void;
  flyToBounds?: (
    b: unknown,
    opts?: { padding?: number[]; duration?: number; maxZoom?: number; animate?: boolean }
  ) => void;
};

/**
 * Tightens Leaflet pan/zoom limits to the tactical footprint and animates a zoomed-in view.
 */
export function enterTacticalMapView(childRes4H3Indexes: string[]): void {
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
  for (const h3 of childRes4H3Indexes) {
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

  if (S.preTacticalLeafletMinZoom == null && typeof map.getMinZoom === 'function') {
    S.preTacticalLeafletMinZoom = map.getMinZoom();
  }
  if (S.preTacticalLeafletMaxZoom == null && typeof map.getMaxZoom === 'function') {
    S.preTacticalLeafletMaxZoom = map.getMaxZoom();
  }
  if (typeof map.setMinZoom === 'function') map.setMinZoom(4);
  if (typeof map.setMaxZoom === 'function') map.setMaxZoom(12);
  if (typeof map.setMaxBounds === 'function') map.setMaxBounds(tacticalBounds);
  if (typeof map.flyToBounds === 'function') {
    map.flyToBounds(tacticalBounds, { padding: [24, 24], duration: 0.55, maxZoom: 12 });
  } else {
    map.fitBounds?.(tacticalBounds, { padding: [24, 24], animate: true });
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
  const worldBounds = L.latLngBounds(
    L.latLng(-WEB_MERCATOR_MAX_ABS_LAT, -180),
    L.latLng(WEB_MERCATOR_MAX_ABS_LAT, 180)
  );
  if (typeof map.setMaxBounds === 'function') map.setMaxBounds(worldBounds);
  if (typeof map.setMinZoom === 'function' && S.preTacticalLeafletMinZoom != null) {
    map.setMinZoom(S.preTacticalLeafletMinZoom);
  }
  if (typeof map.setMaxZoom === 'function' && S.preTacticalLeafletMaxZoom != null) {
    map.setMaxZoom(S.preTacticalLeafletMaxZoom);
  }
  S.preTacticalLeafletMinZoom = null;
  S.preTacticalLeafletMaxZoom = null;
}
