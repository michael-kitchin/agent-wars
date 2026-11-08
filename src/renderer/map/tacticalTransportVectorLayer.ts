/**
 * Leaflet road/rail display polylines from bundled vector JSON when tactical is visible (non-gameplay).
 * Boolean side masks are not drawn on canvas; this layer is the only map road/rail line display.
 */

import { rendererSharedState as S } from '../core/state';
import { DEFAULT_MAP_THEME_ID, mapThemeById, type MapTheme } from '../../shared/mapThemes';
import { drawReferenceLng } from '../../shared/mapExtent';
import { alignLatLngRunToDrawReference } from './hexGrid';
import {
  TACTICAL_MAP_OVERLAY_VECTOR_RAIL_CENTER_OPACITY,
  TACTICAL_MAP_OVERLAY_VECTOR_RAIL_CENTER_WEIGHT,
  TACTICAL_MAP_OVERLAY_VECTOR_RAIL_DASH_ARRAY,
  TACTICAL_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY,
  TACTICAL_MAP_OVERLAY_VECTOR_RAIL_HALO_WEIGHT,
  TACTICAL_MAP_OVERLAY_VECTOR_ROAD_CENTER_WEIGHT,
  TACTICAL_MAP_OVERLAY_VECTOR_ROAD_OUTLINE_WEIGHT,
  TACTICAL_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY,
} from '../../shared/tacticalMapOverlayConstants';
import { shouldRenderTacticalHexes } from './terrainView';
import { getLeafletGlobal } from './mapHelpers';
import { getMainLeafletMapForProjection } from './leafletMainMapProjection';

/**
 * Documents the module-scope binding `vectorLayer` (vectorLayer: unknown | null).

 * Purpose: Retains the currently built Leaflet layer group so visibility toggles do not rebuild every frame.
 * When to use: Managed only by `syncTacticalTransportVectorLeafletLayer`.
 * Expected outcome: Null before first build or after teardown; otherwise an `L.LayerGroup` instance.
 * Exceptions: None.
 */
let vectorLayer: unknown | null = null;

/**
 * Documents the module-scope binding `vectorLayerAttached` (vectorLayerAttached: boolean).

 * Purpose: Tracks whether `vectorLayer` is currently attached to the main map.
 * When to use: Updated in `syncTacticalTransportVectorLeafletLayer` add/remove branches.
 * Expected outcome: True only when map holds the layer.
 * Exceptions: None.
 */
let vectorLayerAttached = false;

/**
 * Hides road and rail lines while the new-game overlay is open.
 *
 * Purpose: Those lines belong to the loaded match. The preview must not leave them on top of another map.
 * When to use: Set true before a preview frame and false before a match frame.
 * Expected outcome: `syncTacticalTransportVectorLeafletLayer` removes the layer while this is true.
 * Exceptions: None.
 */
let vectorsSuppressed = false;

/**
 * Tells the road and rail layer whether the new-game preview is covering the map.
 *
 * Purpose: The preview frame does not draw the match, so the match's lines have to be removed explicitly.
 * When to use: Once per frame, before `syncTacticalTransportVectorLeafletLayer`.
 * Expected outcome: The next sync hides the lines while `suppressed` is true, and may show them again when it is false.
 * Exceptions: None.
 */
export function setTacticalTransportVectorsSuppressed(suppressed: boolean): void {
  vectorsSuppressed = suppressed;
}

/**
 * Row list that `alignedRows` was built from.
 *
 * Purpose: Hydration replaces the row array, so identity tells the sync when to realign and rebuild.
 * When to use: Compared with `S.tacticalTransportVectorOverlayRows` in `syncTacticalTransportVectorLeafletLayer`.
 * Expected outcome: Null before the first build.
 * Exceptions: None.
 */
let alignedSourceRows: typeof S.tacticalTransportVectorOverlayRows | null = null;

/**
 * Draw reference that `alignedRows` was built for.
 *
 * Purpose: Entering or leaving a battle moves the draw frame, so the rows must move with it.
 * When to use: Compared with `drawReferenceLng()` in `syncTacticalTransportVectorLeafletLayer`.
 * Expected outcome: Null on the global map outside a battle, and before the first build.
 * Exceptions: None.
 */
let alignedReferenceLng: number | null = null;

/**
 * Vector rows with each line aligned as one run in the active draw frame.
 *
 * Purpose: Roads and rails must draw on the same copy of the world as the battle hexes, and stay connected across 180°.
 * When to use: For bounds and polylines in place of the raw rows.
 * Expected outcome: Null before the first build; otherwise one row per source row, in the same order.
 * Exceptions: None.
 */
let alignedRows: typeof S.tacticalTransportVectorOverlayRows | null = null;

/**
 * Documents the module-scope binding `cachedRowBounds` (cachedRowBounds: RowBounds[] | null).

 * Purpose: Caches per-row geographic bounds so viewport culling can avoid rebuilding layers for offscreen rows.
 * When to use: Recomputed whenever `alignedRows` is rebuilt (during sync).
 * Expected outcome: Null before first cache build; otherwise in `alignedRows` index order.
 * Exceptions: None.
 */
let cachedRowBounds: RowBounds[] | null = null;

/**
 * Documents the module-scope binding `lastViewportKey` (lastViewportKey: string | null).

 * Purpose: Tracks quantized view state to avoid expensive rebuilds on tiny pan deltas.
 * When to use: Updated in `syncTacticalTransportVectorLeafletLayer` whenever culling window changes materially.
 * Expected outcome: Null before first visible sync; stable across minor camera movement.
 * Exceptions: None.
 */
let lastViewportKey: string | null = null;

/**
 * Road and rail colors for the next rebuild.
 *
 * Purpose: The polylines copy these colors when the layer is built. A theme change clears the viewport key so the next sync rebuilds even when the view did not move.
 * When to use: Read in `buildVectorLayerGroup`. Written by `setTacticalTransportTheme`.
 * Expected outcome: Standard colors until a theme is applied.
 * Exceptions: None.
 */
let transportColors = mapThemeById(DEFAULT_MAP_THEME_ID).transportLineColors;

/**
 * Stores the theme's road and rail colors and forces the next sync to rebuild the lines.
 *
 * Purpose: The layer otherwise rebuilds only when the view moves, so a theme change with no pan would keep the old ink.
 * When to use: From `applyActiveMapTheme`, after the label theme is set.
 * Expected outcome: The next `syncTacticalTransportVectorLeafletLayer` rebuilds the polylines with these colors.
 * Exceptions: None.
 */
export function setTacticalTransportTheme(theme: MapTheme): void {
  transportColors = theme.transportLineColors;
  lastViewportKey = null;
}

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
 * Defines the `computeRowBounds` function shape (function computeRowBounds(rows: typeof S.tacticalTransportVectorOverlayRows): RowBounds[]).

 * Purpose: Precomputes per-row min/max lat/lng envelopes to support viewport culling.
 * When to use: On row set changes before building visible Leaflet layers.
 * Expected outcome: One bounds object per input row.
 * Exceptions: None.
 */
function computeRowBounds(rows: typeof S.tacticalTransportVectorOverlayRows): RowBounds[] {
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
 * Defines the `buildVectorLayerGroup` function shape (function buildVectorLayerGroup(map: { latLngToContainerPoint: (ll: unknown) => { x: number; y: number }; containerPointToLatLng: (pt: unknown) => { lat: number; lng: number }; }, rows: typeof S.tacticalTransportVectorOverlayRows, L: { layerGroup: (...args: unknown[]) => unknown; polyline: (...args: unknown[]) => unknown }): unknown).

 * Purpose: Converts visible vector rows into a Leaflet layer group with road-under-rail styling and dashed rail centers.
 * When to use: Lazily from `syncTacticalTransportVectorLeafletLayer` when rows or quantized viewport changes.
 * Expected outcome: Non-interactive layer group. Road outlines and centers, and rail halos and dashes, use the active theme's transport colors. Weights, opacities, and the rail dash stay as they are.
 * Exceptions: None.
 */
function buildVectorLayerGroup(
  _map: {
    latLngToContainerPoint: (ll: unknown) => { x: number; y: number };
    containerPointToLatLng: (pt: unknown) => { lat: number; lng: number };
  },
  rows: typeof S.tacticalTransportVectorOverlayRows,
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
          color: transportColors.roadOutline,
          weight: TACTICAL_MAP_OVERLAY_VECTOR_ROAD_OUTLINE_WEIGHT,
          opacity: TACTICAL_MAP_OVERLAY_VECTOR_TRANSPORT_HALO_OPACITY,
          interactive: false,
        })
      );
      layers.push(
        leaflet.polyline(latlngs, {
          color: transportColors.roadCenter,
          weight: TACTICAL_MAP_OVERLAY_VECTOR_ROAD_CENTER_WEIGHT,
          opacity: 1,
          interactive: false,
        })
      );
    } else {
      layers.push(
        leaflet.polyline(latlngs, {
          color: transportColors.railHalo,
          weight: TACTICAL_MAP_OVERLAY_VECTOR_RAIL_HALO_WEIGHT,
          opacity: TACTICAL_MAP_OVERLAY_VECTOR_RAIL_HALO_OPACITY,
          interactive: false,
        })
      );
      layers.push(
        leaflet.polyline(latlngs, {
          color: transportColors.railCenter,
          weight: TACTICAL_MAP_OVERLAY_VECTOR_RAIL_CENTER_WEIGHT,
          opacity: TACTICAL_MAP_OVERLAY_VECTOR_RAIL_CENTER_OPACITY,
          dashArray: TACTICAL_MAP_OVERLAY_VECTOR_RAIL_DASH_ARRAY,
          interactive: false,
        })
      );
    }
  }
  return leaflet.layerGroup(layers);
}

/**
 * Shows, hides, or rebuilds the road and rail layer for the current view.
 *
 * Purpose: Keeps optional vector layer visibility synchronized with tactical visibility and loaded vector rows.
 * When to use: Called every redraw tick before canvas overlay passes.
 * Expected outcome: Layer appears while tactical is visible and vector rows exist; hidden otherwise. Rows are realigned
 *   to the active draw frame when the row list or the draw reference changes, and the layer is rebuilt then or when the
 *   view moves materially.
 * Exceptions: None; no-ops when Leaflet map/global is unavailable.
 */
export function syncTacticalTransportVectorLeafletLayer(): void {
  const map = getMainLeafletMapForProjection();
  const L = getLeafletGlobal() as
    | {
        layerGroup: (...args: unknown[]) => unknown;
        polyline: (...args: unknown[]) => unknown;
      }
    | null;
  if (!map || !L) return;
  const shouldShow =
    !vectorsSuppressed && shouldRenderTacticalHexes() && S.tacticalTransportVectorOverlayRows.length > 0;
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
  const sourceRows = S.tacticalTransportVectorOverlayRows;
  const referenceLng = drawReferenceLng();
  const rowsChanged =
    !alignedRows || !cachedRowBounds || alignedSourceRows !== sourceRows || alignedReferenceLng !== referenceLng;
  if (rowsChanged) {
    alignedRows = sourceRows.map((row) => ({ ...row, points: alignLatLngRunToDrawReference(row.points) }));
    cachedRowBounds = computeRowBounds(alignedRows);
    alignedSourceRows = sourceRows;
    alignedReferenceLng = referenceLng;
  }
  if (!vectorLayer || rowsChanged || key !== lastViewportKey) {
    if (vectorLayer && vectorLayerAttached) {
      map.removeLayer(vectorLayer);
      vectorLayerAttached = false;
    }
    const view = expandedViewport(viewport);
    const visibleRows = alignedRows!.filter((_, idx) => intersectsViewport(cachedRowBounds![idx]!, view));
    vectorLayer = buildVectorLayerGroup(map, visibleRows, L);
    lastViewportKey = key;
  }
  if (vectorLayer && !vectorLayerAttached) {
    map.addLayer(vectorLayer);
    vectorLayerAttached = true;
  }
}
