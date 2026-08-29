/**
 * Leaflet road/rail display polylines from bundled vector JSON when res4 is visible (non-gameplay).
 * Boolean side masks are not drawn on canvas; this layer is the only map road/rail line display.
 */

import { rendererSharedState as S } from '../core/state';
import {
  RES4_MAP_OVERLAY_VECTOR_RAIL_CENTER_OPACITY,
  RES4_MAP_OVERLAY_VECTOR_RAIL_CENTER_WEIGHT,
  RES4_MAP_OVERLAY_VECTOR_RAIL_DASH_ARRAY,
  RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY,
  RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_WEIGHT,
  RES4_MAP_OVERLAY_VECTOR_ROAD_CENTER_WEIGHT,
  RES4_MAP_OVERLAY_VECTOR_ROAD_OUTLINE_WEIGHT,
  RES4_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY,
} from '../../shared/res4MapOverlayConstants';
import { shouldRenderRes4Hexes } from './terrainView';
import { getLeafletGlobal } from './mapHelpers';
import { getMainLeafletMapForProjection } from './leafletMainMapProjection';

/**
 * Documents the module-scope binding `vectorLayer` (vectorLayer: unknown | null).

 * Purpose: Retains the currently built Leaflet layer group so visibility toggles do not rebuild every frame.
 * When to use: Managed only by `syncRes4TransportVectorLeafletLayer`.
 * Expected outcome: Null before first build or after teardown; otherwise an `L.LayerGroup` instance.
 * Exceptions: None.
 */
let vectorLayer: unknown | null = null;

/**
 * Documents the module-scope binding `vectorLayerAttached` (vectorLayerAttached: boolean).

 * Purpose: Tracks whether `vectorLayer` is currently attached to the main map.
 * When to use: Updated in `syncRes4TransportVectorLeafletLayer` add/remove branches.
 * Expected outcome: True only when map holds the layer.
 * Exceptions: None.
 */
let vectorLayerAttached = false;

/**
 * Documents the module-scope binding `lastRowCount` (lastRowCount: number).

 * Purpose: Allows cheap rebuild checks when renderer receives refreshed vector rows.
 * When to use: Compare to `S.res4TransportVectorOverlayRows.length` before creating a new layer group.
 * Expected outcome: `-1` before first successful build.
 * Exceptions: None.
 */
let lastRowCount = -1;

/**
 * Documents the module-scope binding `cachedRowBounds` (cachedRowBounds: RowBounds[] | null).

 * Purpose: Caches per-row geographic bounds so viewport culling can avoid rebuilding layers for offscreen rows.
 * When to use: Recomputed only when vector row count changes (during sync).
 * Expected outcome: Null before first cache build; otherwise aligned with `S.res4TransportVectorOverlayRows` index order.
 * Exceptions: None.
 */
let cachedRowBounds: RowBounds[] | null = null;

/**
 * Documents the module-scope binding `lastViewportKey` (lastViewportKey: string | null).

 * Purpose: Tracks quantized view state to avoid expensive rebuilds on tiny pan deltas.
 * When to use: Updated in `syncRes4TransportVectorLeafletLayer` whenever culling window changes materially.
 * Expected outcome: Null before first visible sync; stable across minor camera movement.
 * Exceptions: None.
 */
let lastViewportKey: string | null = null;

/**
 * Documents the `LatLngTuple` type alias as a named contract surface (type LatLngTuple = [number, number]).

 * Purpose: Makes local map-geometry helper signatures readable while staying explicit about WGS84 tuple order.
 * When to use: Internal helpers in this module.
 * Expected outcome: Tuple values are `[lat, lng]`.
 * Exceptions: None.
 */
type LatLngTuple = [number, number];

/**
 * Documents the `RowBounds` type alias as a named contract surface (type RowBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number }).

 * Purpose: Captures one row's geographic envelope for fast viewport intersection tests.
 * When to use: Built once per row in `computeRowBounds`.
 * Expected outcome: Inclusive min/max bounds for latitude and longitude.
 * Exceptions: None.
 */
type RowBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/**
 * Documents the `ViewportBounds` type alias as a named contract surface (type ViewportBounds = { south: number; north: number; west: number; east: number }).

 * Purpose: Normalizes Leaflet bounds into primitive numbers for fast comparisons and stable keying.
 * When to use: Derived from map bounds in `getViewportBounds`.
 * Expected outcome: South <= north and west/east reflect the current map window.
 * Exceptions: None.
 */
type ViewportBounds = { south: number; north: number; west: number; east: number };

/**
 * Defines the `computeRowBounds` function shape (function computeRowBounds(rows: typeof S.res4TransportVectorOverlayRows): RowBounds[]).

 * Purpose: Precomputes per-row min/max lat/lng envelopes to support viewport culling.
 * When to use: On row set changes before building visible Leaflet layers.
 * Expected outcome: One bounds object per input row.
 * Exceptions: None.
 */
function computeRowBounds(rows: typeof S.res4TransportVectorOverlayRows): RowBounds[] {
  return rows.map((row) => {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const [lat, lng] of row.points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    return { minLat, maxLat, minLng, maxLng };
  });
}

/**
 * Defines the `intersectsViewport` function shape (function intersectsViewport(row: RowBounds, viewport: ViewportBounds): boolean).

 * Purpose: Fast axis-aligned intersection test to keep only rows that could be visible.
 * When to use: Before creating Leaflet polylines for a frame's culling window.
 * Expected outcome: True when envelopes overlap, false when fully offscreen.
 * Exceptions: None.
 */
function intersectsViewport(row: RowBounds, viewport: ViewportBounds): boolean {
  return !(row.maxLat < viewport.south || row.minLat > viewport.north || row.maxLng < viewport.west || row.minLng > viewport.east);
}

/**
 * Defines the `quantizedViewportKey` function shape (function quantizedViewportKey(viewport: ViewportBounds, zoom: number): string).

 * Purpose: Coarsens camera state so layer rebuilds happen on meaningful movement, not every redraw tick.
 * When to use: During sync before deciding whether to rebuild the visible layer subset.
 * Expected outcome: Stable string key for nearby pans at the same zoom.
 * Exceptions: None.
 */
function quantizedViewportKey(viewport: ViewportBounds, zoom: number): string {
  const latSpan = Math.max(1e-6, viewport.north - viewport.south);
  const lngSpan = Math.max(1e-6, viewport.east - viewport.west);
  const latStep = Math.max(0.12, latSpan / 16);
  const lngStep = Math.max(0.12, lngSpan / 16);
  const q = (v: number, step: number): number => Math.round(v / step);
  return [Math.round(zoom * 10), q(viewport.south, latStep), q(viewport.north, latStep), q(viewport.west, lngStep), q(viewport.east, lngStep)].join(':');
}

/**
 * Defines the `expandedViewport` function shape (function expandedViewport(viewport: ViewportBounds): ViewportBounds).

 * Purpose: Adds a modest margin around the camera window to avoid line pop-in at the exact edge while panning.
 * When to use: Immediately before row intersection checks.
 * Expected outcome: Slightly larger bounds envelope than current viewport.
 * Exceptions: None.
 */
function expandedViewport(viewport: ViewportBounds): ViewportBounds {
  const latPad = Math.max(0.2, (viewport.north - viewport.south) * 0.12);
  const lngPad = Math.max(0.2, (viewport.east - viewport.west) * 0.12);
  return {
    south: viewport.south - latPad,
    north: viewport.north + latPad,
    west: viewport.west - lngPad,
    east: viewport.east + lngPad,
  };
}

/**
 * Defines the `buildVectorLayerGroup` function shape (function buildVectorLayerGroup(map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number }; containerPointToLatLng: (pt: unknown) => { lat: number; lng: number }; }, rows: typeof S.res4TransportVectorOverlayRows, L: { layerGroup: (...args: unknown[]) => unknown; polyline: (...args: unknown[]) => unknown }): unknown).

 * Purpose: Converts visible vector rows into a Leaflet layer group with road-under-rail styling and dashed rail centers.
 * When to use: Lazily from `syncRes4TransportVectorLeafletLayer` when rows or quantized viewport changes.
 * Expected outcome: Non-interactive layer group; roads use semi-opaque outlines; rails use 50% white halos and 75% opaque dashed black centers.
 * Exceptions: None.
 */
function buildVectorLayerGroup(
  _map: {
    latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
    containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
  },
  rows: typeof S.res4TransportVectorOverlayRows,
  leaflet: {
  layerGroup: (...args: unknown[]) => unknown;
  polyline: (...args: unknown[]) => unknown;
}): unknown {
  const layers: unknown[] = [];
  for (const row of rows) {
    if (!row.points || row.points.length < 2) continue;
    const latlngs = row.points.map((p) => [p[0], p[1]] as LatLngTuple);
    if (row.kind === 'road') {
      layers.push(
        leaflet.polyline(latlngs, {
          color: '#000000',
          weight: RES4_MAP_OVERLAY_VECTOR_ROAD_OUTLINE_WEIGHT,
          opacity: RES4_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY,
          interactive: false,
        })
      );
      layers.push(
        leaflet.polyline(latlngs, {
          color: '#ffffff',
          weight: RES4_MAP_OVERLAY_VECTOR_ROAD_CENTER_WEIGHT,
          opacity: 1,
          interactive: false,
        })
      );
    } else {
      layers.push(
        leaflet.polyline(latlngs, {
          color: '#ffffff',
          weight: RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_WEIGHT,
          opacity: RES4_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY,
          interactive: false,
        })
      );
      layers.push(
        leaflet.polyline(latlngs, {
          color: '#000000',
          weight: RES4_MAP_OVERLAY_VECTOR_RAIL_CENTER_WEIGHT,
          opacity: RES4_MAP_OVERLAY_VECTOR_RAIL_CENTER_OPACITY,
          dashArray: RES4_MAP_OVERLAY_VECTOR_RAIL_DASH_ARRAY,
          interactive: false,
        })
      );
    }
  }
  return leaflet.layerGroup(layers);
}

/**
 * Defines the `syncRes4TransportVectorLeafletLayer` function shape (export function syncRes4TransportVectorLeafletLayer(): void).

 * Purpose: Keeps optional vector layer visibility synchronized with res4 visibility and loaded vector rows.
 * When to use: Called every redraw tick before canvas overlay passes.
 * Expected outcome: Layer appears while res4 is visible and vector rows exist; hidden otherwise.
 * Exceptions: None; no-ops when Leaflet map/global is unavailable.
 */
export function syncRes4TransportVectorLeafletLayer(): void {
  const map = getMainLeafletMapForProjection();
  const L = getLeafletGlobal() as
    | {
        layerGroup: (...args: unknown[]) => unknown;
        polyline: (...args: unknown[]) => unknown;
      }
    | null;
  if (!map || !L) return;
  const shouldShow = shouldRenderRes4Hexes() && S.res4TransportVectorOverlayRows.length > 0;
  if (!shouldShow) {
    if (vectorLayer && vectorLayerAttached) {
      map.removeLayer(vectorLayer);
      vectorLayerAttached = false;
    }
    lastViewportKey = null;
    return;
  }
  const bounds = map.getBounds();
  const viewport: ViewportBounds = {
    south: bounds.getSouth(),
    north: bounds.getNorth(),
    west: bounds.getWest(),
    east: bounds.getEast(),
  };
  const key = quantizedViewportKey(viewport, typeof map.getZoom === 'function' ? map.getZoom() ?? 0 : 0);
  const rowsChanged = lastRowCount !== S.res4TransportVectorOverlayRows.length;
  if (rowsChanged || !cachedRowBounds) {
    cachedRowBounds = computeRowBounds(S.res4TransportVectorOverlayRows);
  }
  if (!vectorLayer || rowsChanged || key !== lastViewportKey) {
    if (vectorLayer && vectorLayerAttached) {
      map.removeLayer(vectorLayer);
      vectorLayerAttached = false;
    }
    const view = expandedViewport(viewport);
    const visibleRows = S.res4TransportVectorOverlayRows.filter((_, idx) => intersectsViewport(cachedRowBounds![idx]!, view));
    vectorLayer = buildVectorLayerGroup(map, visibleRows, L);
    lastRowCount = S.res4TransportVectorOverlayRows.length;
    lastViewportKey = key;
  }
  if (vectorLayer && !vectorLayerAttached) {
    map.addLayer(vectorLayer);
    vectorLayerAttached = true;
  }
}
