/**
 * Leaflet main map + minimap (global `L` from static/vendor/leaflet). Basemap definitions and fallback
 * order live in basemapProvider.ts.
 */

import { getRasterBasemapChain } from './basemapProvider';
import { WEB_MERCATOR_MAX_ABS_LAT, clampLatForWebMercatorDisplay } from './hexGrid';

// Leaflet is loaded from static bundle; keep maps loosely typed for compatibility with global `L`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mainMap: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let miniMap: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let viewportRect: any = null;
/** Invoked whenever the main map view changes; drives overlay redraw in lockstep with the basemap. */
let onMainViewChanged: (() => void) | null = null;

function notifyMainViewChanged(): void {
  syncMinimapViewportRect();
  onMainViewChanged?.();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getL(): any {
  const Lref = (globalThis as unknown as { L?: unknown }).L;
  if (!Lref) throw new Error('Leaflet not loaded: include static/vendor/leaflet/leaflet.js before renderer.js');
  return Lref;
}

/**
 * Attaches one raster basemap layer, advancing through the provider chain on tile errors.
 */
function mountRasterBasemap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Lref: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  showAttribution: boolean,
  chainIndex: number
): void {
  const chain = getRasterBasemapChain();
  if (chainIndex >= chain.length) {
    showBasemapErrorToast();
    return;
  }
  const spec = chain[chainIndex]!;
  let switched = false;
  const layer = Lref
    .tileLayer(spec.urlTemplate, {
      attribution: showAttribution ? spec.attributionHtml : '',
      subdomains: spec.subdomains ?? 'abc',
      maxZoom: spec.maxZoom ?? 19,
      minZoom: spec.minZoom ?? 0,
    })
    .addTo(map);

  const onTileError = () => {
    if (switched) return;
    switched = true;
    layer.off('tileerror', onTileError);
    try {
      map.removeLayer(layer);
    } catch {
      /* ignore */
    }
    console.warn('[agent-wars] Basemap tile error; trying next provider', {
      failedId: spec.id,
      nextIndex: chainIndex + 1,
    });
    mountRasterBasemap(Lref, map, showAttribution, chainIndex + 1);
  };
  layer.on('tileerror', onTileError);
}

/**
 * Creates the main world map and minimap, wires tile layers (with fallback chain) and viewport sync.
 * Call once after DOM is ready. `onViewChanged` runs on every pan/zoom step (and after resize) so the
 * hex overlay stays aligned with tiles; Leaflet zoom/fade/inertia on the main map are reduced for the same reason.
 */
export function initWorldLeafletMaps(
  mainContainerId: string,
  minimapContainerId: string,
  onViewChanged: () => void
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

  mountRasterBasemap(Lref, mainMap, true, 0);

  mainMap.fitBounds(worldBounds, { padding: [2, 2], animate: false });
  mainMap.doubleClickZoom.disable();

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

  mountRasterBasemap(Lref, miniMap, false, 0);

  miniMap.fitBounds(worldBounds, { padding: [1, 1], animate: false });
  miniMap.setZoom(miniMap.getZoom());

  mainMap.on('move', notifyMainViewChanged);
  mainMap.on('zoom', notifyMainViewChanged);
  mainMap.on('moveend', notifyMainViewChanged);
  mainMap.on('zoomend', notifyMainViewChanged);

  syncMinimapViewportRect();
}

let basemapErrorShown = false;

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
 * Updates the minimap rectangle to match the main map viewport, or removes it when zoomed out to world scale.
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
      color: '#2e5a7b',
      weight: 2,
      fill: false,
      interactive: false,
    }).addTo(miniMap);
  } else {
    viewportRect.setBounds(mainBounds);
  }
}

/**
 * Returns the active Leaflet main map, or null before init.
 */
export function getMainLeafletMap(): unknown {
  return mainMap;
}

/**
 * Applies a CSS filter to the main raster basemap container.
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
 * Converts an H3 cell center to overlay canvas coordinates (CSS pixels, top-left origin).
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
 * Invalidates Leaflet size after the map container is resized.
 */
export function invalidateLeafletMapSizes(): void {
  mainMap?.invalidateSize({ animate: false });
  miniMap?.invalidateSize({ animate: false });
  notifyMainViewChanged();
}
