/**
 * Leaflet main map + minimap (global `L` from static/vendor/leaflet). The offline hillshade lives in basemapLayer.ts.
 */

import { bindAdminBorderLayers } from './adminBorderLayers';
import { bindOfflineBasemap, onBasemapNativeZoomChanged } from './basemapLayer';
import type { VectorHostMap, VectorLeaflet } from './bucketedVectorLayer';
import { bindCoastlineLayers, setCoastEdgeMaskNativeZoom } from './coastlineLayers';
import {
  WEB_MERCATOR_MAX_ABS_LAT,
  alignLngToDrawReference,
  alignLngToReference,
  clampLatForWebMercatorDisplay,
} from './hexGrid';

/**
 * Minimal Leaflet lat/lng point shape used only for vendor-global `L` calls in this module.
 *
 * Purpose: Avoids `any` while matching the subset of Leaflet used at runtime from `static/vendor/leaflet`.
 * When to use: Only as a structural stand-in until `@types/leaflet` is adopted project-wide (see `.spec/file-size-decomposition-plan-v1.md`).
 * Expected outcome: Coordinates flow through `latLngToContainerPoint` and bounds helpers without unsafe casts.
 * Exceptions: None.
 */
type VendorLatLng = { lat: number; lng: number };

/**
 * Minimal Leaflet bounds surface used for basemap viewport syncing.
 *
 * Purpose: Types bounds returned by `getBounds` without importing the full Leaflet type graph offline.
 * When to use: When computing spans for the minimap viewport rectangle.
 * Expected outcome: North-east and south-west corners are readable for span math.
 * Exceptions: None.
 */
type VendorLatLngBounds = {
  getNorthEast: () => VendorLatLng;
  getSouthWest: () => VendorLatLng;
};

/**
 * Minimal Leaflet map instance surface used by the main and mini maps.
 *
 * Purpose: Encodes only the methods this module calls on `L.map(...)` results.
 * When to use: For module-level `mainMap` / `miniMap` and helpers that touch map panes.
 * Expected outcome: TypeScript catches missing methods during refactors; unknown panes stay optional.
 * Exceptions: None.
 */
type VendorLeafletMap = {
  removeLayer: (layer: unknown) => void;
  on: (ev: string, handler: () => void) => void;
  getBounds: () => VendorLatLngBounds;
  fitBounds: (b: VendorLatLngBounds, opts?: { padding?: number[]; animate?: boolean }) => void;
  doubleClickZoom: { disable: () => void };
  getZoom: () => number;
  setZoom: (z: number) => void;
  latLngToContainerPoint: (ll: VendorLatLng) => { x: number; y: number };
  invalidateSize: (opts?: { animate?: boolean }) => void;
  getPanes?: () => { tilePane?: HTMLElement };
};

/**
 * Raster tile layer handle returned by `tileLayer` with only the events this module registers.
 *
 * Purpose: Supports safe `tileerror` subscription and teardown during basemap fallback.
 * When to use: Inside `mountRasterBasemap` only.
 * Expected outcome: `on` / `off` remain typed without pulling plugin-specific fields.
 * Exceptions: None.
 */
type VendorRasterLayer = {
  on: (ev: string, handler: () => void) => void;
  off: (ev: string, handler: () => void) => void;
  addTo: (map: VendorLeafletMap) => VendorRasterLayer;
};

type VendorTileLayerFactory = {
  addTo: (map: VendorLeafletMap) => VendorRasterLayer;
};

/**
 * Viewport rectangle overlay on the minimap mirroring the main map bounds.
 *
 * Purpose: Types the return of `rectangle(...).addTo(miniMap)` for sync updates.
 * When to use: When `zoomedIn` shows the main-map viewport on the minimap.
 * Expected outcome: `setBounds` updates without casting through `any`.
 * Exceptions: None.
 */
type VendorViewportRect = {
  remove: () => void;
  setBounds: (b: VendorLatLngBounds) => void;
};

/**
 * Minimal factory shape for the global `L` object loaded from the Leaflet vendor bundle.
 *
 * Purpose: Centralizes the narrow contract for `getL()` instead of using `any` everywhere.
 * When to use: Whenever this module calls `L.map`, `L.tileLayer`, `L.latLngBounds`, etc.
 * Expected outcome: Call sites stay aligned with the CDN Leaflet build actually shipped.
 * Exceptions: Throws when `globalThis.L` is missing.
 */
export type GlobalLeafletFactory = {
  map: (el: HTMLElement, options?: Record<string, unknown>) => VendorLeafletMap;
  latLngBounds: (sw: VendorLatLng, ne: VendorLatLng) => VendorLatLngBounds;
  latLng: (lat: number, lng: number) => VendorLatLng;
  tileLayer: (url: string, options?: Record<string, unknown>) => VendorTileLayerFactory;
  rectangle: (bounds: VendorLatLngBounds, options?: Record<string, unknown>) => { addTo: (map: VendorLeafletMap) => VendorViewportRect };
  control: {
    scale: (options?: Record<string, unknown>) => { addTo: (map: VendorLeafletMap) => void };
    zoom: (options?: Record<string, unknown>) => { addTo: (map: VendorLeafletMap) => void };
  };
  point: (x: number, y: number) => unknown;
};

/**
 * Documents the module-scope binding `mainMap` (mainMap: VendorLeafletMap | null).

 * Purpose: Supports maintainability by documenting why `mainMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let mainMap: VendorLeafletMap | null = null;
/**
 * Documents the module-scope binding `miniMap` (miniMap: VendorLeafletMap | null).

 * Purpose: Supports maintainability by documenting why `miniMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let miniMap: VendorLeafletMap | null = null;
/**
 * Documents the module-scope binding `viewportRect` (viewportRect: VendorViewportRect | null).

 * Purpose: Supports maintainability by documenting why `viewportRect` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let viewportRect: VendorViewportRect | null = null;
/**
 * Documents the module-scope binding `onMainViewChanged` (onMainViewChanged: (()).

 * Purpose: Supports maintainability by documenting why `onMainViewChanged` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let onMainViewChanged: (() => void) | null = null;

/**
 * Defines the `notifyMainViewChanged` function shape (function notifyMainViewChanged(): void).

 * Purpose: Supports maintainability by documenting why `notifyMainViewChanged` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function notifyMainViewChanged(): void {
  syncMinimapViewportRect();
  onMainViewChanged?.();
}

/**
 * Defines the `getL` function shape (function getL(): GlobalLeafletFactory).

 * Purpose: Supports maintainability by documenting why `getL` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getL(): GlobalLeafletFactory {
  const leafletRef = (globalThis as unknown as { L?: GlobalLeafletFactory }).L;
  if (!leafletRef) throw new Error('Leaflet not loaded: include static/vendor/leaflet/leaflet.js before renderer.js');
  return leafletRef;
}

/**
 * Defines the `initWorldLeafletMaps` function shape (export function initWorldLeafletMaps( mainContainerId: string, minimapContainerId: string, onViewChanged: () => void, initialBasemapProviderId?: str).

 * Purpose: Supports maintainability by documenting why `initWorldLeafletMaps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function initWorldLeafletMaps(
  mainContainerId: string,
  minimapContainerId: string,
  onViewChanged: () => void,
  initialBasemapProviderId?: string
): void {
  onMainViewChanged = onViewChanged;
  const leafletRef = getL();

  const mainEl = document.getElementById(mainContainerId);
  const miniEl = document.getElementById(minimapContainerId);
  if (!mainEl || !miniEl) {
    console.error('[agent-wars] initWorldLeafletMaps: missing map container elements', {
      mainContainerId,
      minimapContainerId,
      hasMain: !!mainEl,
      hasMinimap: !!miniEl,
    });
    return;
  }

  /* Match EPSG:3857 tile extent so pan limits align with projection (H3 can exceed ±85° in WGS84). */
  const worldBounds = leafletRef.latLngBounds(
    leafletRef.latLng(-WEB_MERCATOR_MAX_ABS_LAT, -180),
    leafletRef.latLng(WEB_MERCATOR_MAX_ABS_LAT, 180)
  );

  mainMap = leafletRef.map(mainEl, {
    minZoom: 1.5,
    maxZoom: 12,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 80,
    /* Max bounds keep the world view inside ±180°; the drag wrap would pull a battle drawn past 180° to another copy. */
    worldCopyJump: false,
    maxBounds: worldBounds,
    maxBoundsViscosity: 1,
    /* App-owned WASD/arrow screen pan; avoid Leaflet’s default keyboard panBy. */
    keyboard: false,
    /* The main map zooms from the wheel, from Shift-drag, and from the +/− buttons added below. There is no second control. */
    zoomControl: false,
    /* Elevation and Natural Earth credits stay in the notices file. The map does not print them. */
    attributionControl: false,
    /* Keep raster tiles and canvas overlay in lockstep (no CSS zoom/pan lag vs hex draw). */
    zoomAnimation: false,
    fadeAnimation: false,
    inertia: false,
  });

  const initialId = initialBasemapProviderId ?? 'offline_hillshade';
  if (initialId !== 'offline_hillshade') {
    console.error('[agent-wars] the hillshade is the only basemap', initialId);
  }

  mainMap.fitBounds(worldBounds, { padding: [2, 2], animate: false });
  mainMap.doubleClickZoom.disable();
  try {
    // Show real-world distance on the scale, to the left of the zoom buttons.
    leafletRef.control
      .scale({
        position: 'bottomright',
        metric: true,
        imperial: true,
        maxWidth: 120,
      })
      .addTo(mainMap);
  } catch {
    /* scale control not available in some Leaflet builds */
  }
  /* Leaflet inserts a bottom control at the front of the corner, so adding zoom after the scale puts it on the right. */
  leafletRef.control.zoom({ position: 'bottomright' }).addTo(mainMap);

  miniMap = leafletRef.map(miniEl, {
    minZoom: 0,
    maxZoom: 2,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
  });

  bindOfflineBasemap(leafletRef as unknown as Parameters<typeof bindOfflineBasemap>[0], mainMap, miniMap);
  const vectorLeaflet = leafletRef as unknown as VectorLeaflet;
  const vectorMain = mainMap as unknown as VectorHostMap;
  bindCoastlineLayers(vectorLeaflet, vectorMain, miniMap as unknown as VectorHostMap);
  bindAdminBorderLayers(vectorLeaflet, vectorMain);
  onBasemapNativeZoomChanged(setCoastEdgeMaskNativeZoom);

  miniMap.fitBounds(worldBounds, { padding: [1, 1], animate: false });
  miniMap.setZoom(miniMap.getZoom());

  mainMap.on('move', notifyMainViewChanged);
  mainMap.on('zoom', notifyMainViewChanged);
  mainMap.on('moveend', notifyMainViewChanged);
  mainMap.on('zoomend', notifyMainViewChanged);

  syncMinimapViewportRect();
}

/**
 * Draws or hides the rectangle that shows the main view on the minimap.
 *
 * Purpose: The player can see which part of the overview the main map is framing.
 * When to use: After the main map or the minimap moves or zooms.
 * Expected outcome: No rectangle when the main view covers nearly the whole overview. Otherwise one 2 px opaque
 *   rectangle in `--chrome-border`, or `#5a7090` when that token cannot be read, with no fill, that does not take
 *   the pointer.
 * Exceptions: None. Returns immediately when either map is missing.
 */
export function syncMinimapViewportRect(): void {
  if (!mainMap || !miniMap) return;
  const leafletRef = getL();
  const mainBounds = mainMap.getBounds();
  const miniBounds = miniMap.getBounds();

  const mainSpan =
    Math.abs(mainBounds.getNorthEast().lat - mainBounds.getSouthWest().lat) +
    Math.abs(mainBounds.getNorthEast().lng - mainBounds.getSouthWest().lng);
  const miniSpan =
    Math.abs(miniBounds.getNorthEast().lat - miniBounds.getSouthWest().lat) +
    Math.abs(miniBounds.getNorthEast().lng - miniBounds.getSouthWest().lng);

  const zoomedIn = mainSpan < miniSpan * 0.92;

  if (!zoomedIn) {
    if (viewportRect) {
      viewportRect.remove();
      viewportRect = null;
    }
    return;
  }

  if (!viewportRect) {
    viewportRect = leafletRef.rectangle(mainBounds, {
      color: getComputedStyle(document.documentElement).getPropertyValue('--chrome-border').trim() || '#5a7090',
      weight: 2,
      opacity: 1,
      fill: false,
      interactive: false,
    }).addTo(miniMap);
  } else {
    viewportRect.setBounds(mainBounds);
  }
}

/**
 * Defines the `getMainLeafletMap` function shape (export function getMainLeafletMap(): VendorLeafletMap | null).

 * Purpose: Supports maintainability by documenting why `getMainLeafletMap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getMainLeafletMap(): VendorLeafletMap | null {
  return mainMap;
}

/**
 * Returns the overview map, which does not accept pan or zoom input.
 *
 * Purpose: Regional extent fitting must include the minimap as well as the main map.
 * When to use: From the map-extent applier only.
 * Expected outcome: The minimap created in `initWorldLeafletMaps`, or null before init.
 * Exceptions: None.
 */
export function getMiniLeafletMap(): VendorLeafletMap | null {
  return miniMap;
}

/**
 * Projects one hex center to main-map container pixels.
 *
 * Purpose: Units, chips, symbols, and markers sit on hex centers, on the same copy of the world as the hex outlines.
 * When to use: Through `hexCenterPx` for any marker anchored on one hex.
 * Expected outcome: The center's pixel position, with longitude moved into the active draw frame. `{ x: 0, y: 0 }`
 *   when the main map is missing.
 * Exceptions: None beyond `latLngFn`.
 */
export function hexCenterToOverlayPoint(
  h3Index: string,
  latLngFn: (idx: string) => [number, number]
): { x: number; y: number } {
  if (!mainMap) return { x: 0, y: 0 };
  const leafletRef = getL();
  const [lat, lng] = latLngFn(h3Index);
  const p = mainMap.latLngToContainerPoint(leafletRef.latLng(clampLatForWebMercatorDisplay(lat), alignLngToDrawReference(lng)));
  return { x: p.x, y: p.y };
}

/**
 * Defines the `hexCenterToOverlayPointWithReferenceLng` function shape (export function hexCenterToOverlayPointWithReferenceLng( h3Index: string, referenceLngDegrees: number, latLngFn: (idx: string) => [number, number] ):).

 * Purpose: Supports maintainability by documenting why `hexCenterToOverlayPointWithReferenceLng` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hexCenterToOverlayPointWithReferenceLng(
  h3Index: string,
  referenceLngDegrees: number,
  latLngFn: (idx: string) => [number, number]
): { x: number; y: number } {
  if (!mainMap) return { x: 0, y: 0 };
  const leafletRef = getL();
  const [lat, lng] = latLngFn(h3Index);
  const lngAligned = alignLngToReference(lng, referenceLngDegrees);
  const p = mainMap.latLngToContainerPoint(
    leafletRef.latLng(clampLatForWebMercatorDisplay(lat), lngAligned)
  );
  return { x: p.x, y: p.y };
}

/**
 * Defines the `invalidateLeafletMapSizes` function shape (export function invalidateLeafletMapSizes(): void).

 * Purpose: Supports maintainability by documenting why `invalidateLeafletMapSizes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function invalidateLeafletMapSizes(): void {
  mainMap?.invalidateSize({ animate: false });
  miniMap?.invalidateSize({ animate: false });
  notifyMainViewChanged();
}
