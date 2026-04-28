/**
 * Leaflet main map + minimap (global `L` from static/vendor/leaflet). Basemap definitions and fallback
 * order live in basemapProvider.ts.
 */

import { ORDER_LINE_COLOR } from '../core/constants';
import { getRasterBasemapChain, getRasterBasemapChainStartIndex } from './basemapProvider';
import {
  WEB_MERCATOR_MAX_ABS_LAT,
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

/** Active tile layers so we can replace the basemap when the terrain style changes. */
/**
 * Documents the module-scope binding `mainBasemapLayer` (mainBasemapLayer: VendorRasterLayer | null).

 * Purpose: Supports maintainability by documenting why `mainBasemapLayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let mainBasemapLayer: VendorRasterLayer | null = null;
/**
 * Documents the module-scope binding `miniBasemapLayer` (miniBasemapLayer: VendorRasterLayer | null).

 * Purpose: Supports maintainability by documenting why `miniBasemapLayer` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let miniBasemapLayer: VendorRasterLayer | null = null;

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
  const Lref = (globalThis as unknown as { L?: GlobalLeafletFactory }).L;
  if (!Lref) throw new Error('Leaflet not loaded: include static/vendor/leaflet/leaflet.js before renderer.js');
  return Lref;
}

/**
 * Defines the `mountRasterBasemap` function shape (function mountRasterBasemap(Lref: GlobalLeafletFactory, map: VendorLeafletMap, showAttribution: boolean, chainIndex: number, target: 'main' | 'mini'): void).

 * Purpose: Supports maintainability by documenting why `mountRasterBasemap` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function mountRasterBasemap(
  Lref: GlobalLeafletFactory,
  map: VendorLeafletMap,
  showAttribution: boolean,
  chainIndex: number,
  target: 'main' | 'mini'
): void {
  const chain = getRasterBasemapChain();
  if (chainIndex >= chain.length) {
    showBasemapErrorToast();
    return;
  }
  const spec = chain[chainIndex]!;
  if (target === 'main' && mainBasemapLayer) {
    try {
      map.removeLayer(mainBasemapLayer);
    } catch {
      /* ignore */
    }
    mainBasemapLayer = null;
  }
  if (target === 'mini' && miniBasemapLayer) {
    try {
      map.removeLayer(miniBasemapLayer);
    } catch {
      /* ignore */
    }
    miniBasemapLayer = null;
  }
  let switched = false;
  const layerOpts: Record<string, unknown> = {
    attribution: showAttribution ? spec.attributionHtml : '',
    maxZoom: spec.maxZoom ?? 19,
    minZoom: spec.minZoom ?? 0,
  };
  if (spec.subdomains !== undefined) layerOpts.subdomains = spec.subdomains;
  const layer: VendorRasterLayer = Lref.tileLayer(spec.urlTemplate, layerOpts).addTo(map);
  if (target === 'main') mainBasemapLayer = layer;
  else miniBasemapLayer = layer;

  const onTileError = () => {
    if (switched) return;
    switched = true;
    layer.off('tileerror', onTileError);
    try {
      map.removeLayer(layer);
    } catch {
      /* ignore */
    }
    if (target === 'main') mainBasemapLayer = null;
    else miniBasemapLayer = null;
    console.warn('[agent-wars] Basemap tile error; trying next provider', {
      failedId: spec.id,
      nextIndex: chainIndex + 1,
    });
    mountRasterBasemap(Lref, map, showAttribution, chainIndex + 1, target);
  };
  layer.on('tileerror', onTileError);
}

/**
 * Defines the `setMainBasemapByProviderId` function shape (export function setMainBasemapByProviderId(providerId: string): void).

 * Purpose: Supports maintainability by documenting why `setMainBasemapByProviderId` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setMainBasemapByProviderId(providerId: string): void {
  if (!mainMap || !miniMap) return;
  const Lref = getL();
  const startIdx = getRasterBasemapChainStartIndex(providerId);
  mountRasterBasemap(Lref, mainMap, true, startIdx, 'main');
  mountRasterBasemap(Lref, miniMap, false, startIdx, 'mini');
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
  const Lref = getL();

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
  const worldBounds = Lref.latLngBounds(
    Lref.latLng(-WEB_MERCATOR_MAX_ABS_LAT, -180),
    Lref.latLng(WEB_MERCATOR_MAX_ABS_LAT, 180)
  );

  mainMap = Lref.map(mainEl, {
    minZoom: 1.5,
    maxZoom: 12,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 80,
    worldCopyJump: true,
    maxBounds: worldBounds,
    maxBoundsViscosity: 1,
    /* Keep raster tiles and canvas overlay in lockstep (no CSS zoom/pan lag vs hex draw). */
    zoomAnimation: false,
    fadeAnimation: false,
    inertia: false,
  });

  const startIdx = getRasterBasemapChainStartIndex(initialBasemapProviderId ?? 'carto_light_nolabels');
  mountRasterBasemap(Lref, mainMap, true, startIdx, 'main');

  mainMap.fitBounds(worldBounds, { padding: [2, 2], animate: false });
  mainMap.doubleClickZoom.disable();
  try {
    // Show real-world distance context when Leaflet scale control is available.
    Lref.control
      .scale({
        metric: true,
        imperial: true,
        maxWidth: 120,
      })
      .addTo(mainMap);
  } catch {
    /* scale control not available in some Leaflet builds */
  }

  miniMap = Lref.map(miniEl, {
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

  mountRasterBasemap(Lref, miniMap, false, startIdx, 'mini');

  miniMap.fitBounds(worldBounds, { padding: [1, 1], animate: false });
  miniMap.setZoom(miniMap.getZoom());

  mainMap.on('move', notifyMainViewChanged);
  mainMap.on('zoom', notifyMainViewChanged);
  mainMap.on('moveend', notifyMainViewChanged);
  mainMap.on('zoomend', notifyMainViewChanged);

  syncMinimapViewportRect();
}

/**
 * Documents the module-scope binding `basemapErrorShown` (basemapErrorShown).

 * Purpose: Supports maintainability by documenting why `basemapErrorShown` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let basemapErrorShown = false;

/**
 * Defines the `showBasemapErrorToast` function shape (function showBasemapErrorToast(): void).

 * Purpose: Supports maintainability by documenting why `showBasemapErrorToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function showBasemapErrorToast(): void {
  if (basemapErrorShown) return;
  basemapErrorShown = true;
  const el = document.getElementById('map-toast');
  const textEl = document.getElementById('map-toast-text');
  if (el && textEl) {
    textEl.textContent =
      'Some map tiles failed to load (network or provider). The game remains playable; try again later.';
    el.classList.add('toast-info');
    el.classList.remove('hidden');
  }
}

/**
 * Defines the `syncMinimapViewportRect` function shape (export function syncMinimapViewportRect(): void).

 * Purpose: Supports maintainability by documenting why `syncMinimapViewportRect` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function syncMinimapViewportRect(): void {
  if (!mainMap || !miniMap) return;
  const Lref = getL();
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
    viewportRect = Lref.rectangle(mainBounds, {
      color: ORDER_LINE_COLOR,
      weight: 2,
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
 * Defines the `setMainBasemapFilter` function shape (export function setMainBasemapFilter(filter: string): void).

 * Purpose: Supports maintainability by documenting why `setMainBasemapFilter` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setMainBasemapFilter(filter: string): void {
  // Apply at ONE layer only (tile pane) to avoid compounded filters that wash out the map.
  const mapEl = document.getElementById('main-map');
  if (mapEl) mapEl.style.filter = '';
  try {
    const pane = mainMap?.getPanes?.()?.tilePane as HTMLElement | undefined;
    if (pane) {
      // Clear any previously applied per-tile filters from older builds.
      const oldFiltered = pane.querySelectorAll<HTMLElement>('.leaflet-layer, .leaflet-tile');
      for (const el of oldFiltered) el.style.filter = '';
      pane.style.filter = filter;
      return;
    }
  } catch {
    /* fall through to container fallback */
  }
  // Fallback for unexpected pane access failure.
  if (mapEl) mapEl.style.filter = filter;
}

/**
 * Defines the `hexCenterToOverlayPoint` function shape (export function hexCenterToOverlayPoint().

 * Purpose: Supports maintainability by documenting why `hexCenterToOverlayPoint` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hexCenterToOverlayPoint(
  h3Index: string,
  latLngFn: (idx: string) => [number, number]
): { x: number; y: number } {
  if (!mainMap) return { x: 0, y: 0 };
  const Lref = getL();
  const [lat, lng] = latLngFn(h3Index);
  const p = mainMap.latLngToContainerPoint(Lref.latLng(clampLatForWebMercatorDisplay(lat), lng));
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
  const Lref = getL();
  const [lat, lng] = latLngFn(h3Index);
  const lngAligned = alignLngToReference(lng, referenceLngDegrees);
  const p = mainMap.latLngToContainerPoint(
    Lref.latLng(clampLatForWebMercatorDisplay(lat), lngAligned)
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
