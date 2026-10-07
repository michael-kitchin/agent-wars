/**
 * Single narrowing step for Leaflet main-map calls that need bounds, zoom, and container projection.
 * When to use: Tactical vector Leaflet sync and tactical city canvas overlays; avoids repeating wide `as { ... }` shapes.
 */

import { getMainLeafletMap } from './worldLeafletMap';

/**
 * Narrow main-map surface for overlay projection (not a full Leaflet `Map` type).
 *
 * Purpose: Centralizes the cast once so tactical vector and city overlay modules share the same structural contract.
 * When to use: Only via `getMainLeafletMapForProjection()`; callers treat the result as opaque except for listed fields.
 * Expected outcome: Non-null map supports bounds, zoom, layer add/remove, and lat/lng↔container point conversion used by tactical overlays.
 * Exceptions: None.
 */
type MainMapProjection = {
  addLayer: (layer: unknown) => void;
  removeLayer: (layer: unknown) => void;
  getBounds: () => {
    getSouth: () => number;
    getNorth: () => number;
    getWest: () => number;
    getEast: () => number;
  };
  getZoom?: () => number;
  latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
  containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
  getContainer: () => { clientWidth: number; clientHeight: number };
};

/**
 * Returns the live main map narrowed for overlay projection, or null before the map exists.
 * When to use: Any tactical overlay path that previously cast `getMainLeafletMap()` to a custom map shape.
 * Expected outcome: Same runtime object as `getMainLeafletMap()`, typed for overlay helpers.
 * Exceptions: None.
 */
export function getMainLeafletMapForProjection(): MainMapProjection | null {
  return getMainLeafletMap() as MainMapProjection | null;
}
