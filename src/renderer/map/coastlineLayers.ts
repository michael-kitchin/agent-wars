/**
 * Coastline, land underlay, and water mask for the main map, plus a coarse coastline on the minimap.
 *
 * Purpose: The hairline sits on the same water edge as the tiles. Past the tiles' native zoom, flat land under the tiles and water over them keep that edge crisp.
 * When to use: Bind once after the Leaflet maps exist. Apply a theme when the legend changes. The native-zoom callback enables the mask.
 * Expected outcome: The main map has a 1.5 px coastline. The minimap has the coarsest coastline at 1 px and no mask.
 * Exceptions: A missing document or a rejected document logs one error and leaves that layer empty.
 */

import { FLAT_LAND_GRAY, type MapTheme } from '../../shared/mapThemes';
import {
  coastlineLodForZoom,
  parseCoastEdgeMaskPack,
  parseCoastlinePack,
  visibleCellRefs,
} from '../../shared/vectorPackDecode';
import type { CoastEdgeMaskPack, CoastlinePack, VectorViewBounds } from '../../shared/vectorPackTypes';
import { getActiveMapTheme } from './activeMapTheme';
import {
  createBucketedVectorLayer,
  type BucketedVectorLayer,
  type VectorCell,
  type VectorHostMap,
  type VectorLeaflet,
  type VectorPathStyle,
} from './bucketedVectorLayer';
import {
  VECTOR_CELL_CAP,
  loadBasemapVectorText,
  noteVectorCellCap,
  vectorLines,
  vectorPolygons,
} from './vectorLayerGeometry';
import { landUnderlayFilterCss } from './mapThemeFilters';

/**
 * Main-map coastline width.
 *
 * Purpose: Wide enough to cover a fine gap between the line and the land tiles, and still a hairline.
 * When to use: The main coastline style. Raise it by 0.25, and stop at 2, only when a gap shows at zoom 6.
 * Expected outcome: 1.5 px, round caps, no dash.
 * Exceptions: None.
 */
const COASTLINE_WEIGHT_PX = 1.5;

/**
 * Minimap coastline width.
 *
 * Purpose: The minimap is small. A heavier line would fill the water.
 * When to use: The minimap coastline style only.
 * Expected outcome: 1 px.
 * Exceptions: None.
 */
const MINIMAP_COASTLINE_WEIGHT_PX = 1;

/**
 * Same-color stroke that hides the crack between adjacent mask cells.
 *
 * Purpose: The cells meet on an edge. Antialiasing would otherwise leave a line.
 * When to use: The land underlay and the water mask.
 * Expected outcome: A 1 px stroke in the fill color.
 * Exceptions: None.
 */
const MASK_SEAM_WEIGHT_PX = 1;

let coastPack: CoastlinePack | null = null;
let maskPack: CoastEdgeMaskPack | null = null;
let nativeZoom = 7;
let maskLoadStarted = false;
let bound = false;
let mainMap: VectorHostMap | null = null;
let coastLayer: BucketedVectorLayer | null = null;
let underlayLayer: BucketedVectorLayer | null = null;
let maskLayer: BucketedVectorLayer | null = null;
let miniLayer: BucketedVectorLayer | null = null;

/**
 * Flat gray used as the underlay fill. The pane filter turns it into the theme color.
 *
 * Purpose: The underlay is not a tile image, so it starts from the same gray the land tiles use.
 * When to use: The underlay path style.
 * Expected outcome: `rgb(210, 210, 210)` while `FLAT_LAND_GRAY` is 210.
 * Exceptions: None.
 */
function flatLandColor(): string {
  return `rgb(${FLAT_LAND_GRAY}, ${FLAT_LAND_GRAY}, ${FLAT_LAND_GRAY})`;
}

/**
 * Line cells for one coastline band.
 *
 * Purpose: The main map picks a band from the zoom. The minimap always uses the first band.
 * When to use: As a layer source.
 * Expected outcome: One cell per visible key. A result of exactly `VECTOR_CELL_CAP` cells logs once.
 * Exceptions: None. A missing pack or band returns an empty list.
 */
function coastCells(view: VectorViewBounds, zoom: number, firstBandOnly: boolean): readonly VectorCell[] {
  const pack = coastPack;
  if (!pack) return [];
  const lod = firstBandOnly ? pack.lods[0] ?? null : coastlineLodForZoom(pack, zoom);
  if (!lod) return [];
  const lodIndex = pack.lods.indexOf(lod);
  const refs = visibleCellRefs(view, lod.cellDeg, VECTOR_CELL_CAP);
  noteVectorCellCap(refs.length);
  return refs.map((ref) => ({
    cacheKey: `${lodIndex}|${ref.key}|${ref.lngOffset}`,
    build: () => vectorLines(lod.cells[ref.key] ?? [], pack.quantumDeg, ref.lngOffset),
  }));
}

/**
 * Mask polygons for the visible cells.
 *
 * Purpose: Land and water are separate layers so each can sit on its own side of the tiles.
 * When to use: As the underlay source with `'land'`, and the mask source with `'water'`.
 * Expected outcome: One polygon cell per visible key that has that side. The cap logs once.
 * Exceptions: None. A missing pack returns an empty list.
 */
function maskCells(view: VectorViewBounds, side: 'land' | 'water'): readonly VectorCell[] {
  const pack = maskPack;
  if (!pack) return [];
  const refs = visibleCellRefs(view, pack.cellDeg, VECTOR_CELL_CAP);
  noteVectorCellCap(refs.length);
  return refs.map((ref) => ({
    cacheKey: `mask|${ref.key}|${ref.lngOffset}`,
    build: () => vectorPolygons(pack.cells[ref.key]?.[side] ?? [], pack.quantumDeg, ref.lngOffset),
  }));
}

/**
 * Enables the mask and underlay only past the tiles' native zoom, then redraws the coast.
 *
 * Purpose: At the native zoom the tiles are already sharp. The mask exists to cover the stretched edge.
 * When to use: On zoom, pan, and when the native zoom is published.
 * Expected outcome: Both mask layers are enabled only when the main zoom is greater than `nativeZoom`.
 *   The first time that happens, the mask document starts loading.
 * Exceptions: None. A missing map does nothing.
 */
function refreshCoastLayers(): void {
  if (!mainMap) return;
  const pastNative = (mainMap.getZoom?.() ?? 0) > nativeZoom;
  if (pastNative) void ensureMaskLoaded();
  underlayLayer?.setEnabled(pastNative);
  maskLayer?.setEnabled(pastNative);
  coastLayer?.sync();
  miniLayer?.sync();
}

/**
 * Loads the mask document the first time the mask is needed.
 *
 * Purpose: The mask is larger than the view and is unused until the map zooms past the tiles.
 * When to use: From `refreshCoastLayers` when the zoom is past native.
 * Expected outcome: One load. A null or rejected document logs one error and leaves the mask empty.
 *   A parsed document draws on the next sync.
 * Exceptions: None. Failures are logged.
 */
async function ensureMaskLoaded(): Promise<void> {
  if (maskLoadStarted) return;
  maskLoadStarted = true;
  const text = await loadBasemapVectorText('coast_edge_mask');
  if (text == null) return;
  try {
    maskPack = parseCoastEdgeMaskPack(JSON.parse(text));
  } catch (error) {
    console.error('[agent-wars] coast edge mask document rejected', error);
    return;
  }
  underlayLayer?.sync();
  maskLayer?.sync();
}

/**
 * Loads the coastline document.
 *
 * Purpose: The hairline can draw as soon as the maps exist.
 * When to use: Once, from `bindCoastlineLayers`.
 * Expected outcome: A parsed pack redraws both coastline layers. Null or a bad document logs one error.
 * Exceptions: None. Failures are logged.
 */
async function loadCoastlines(): Promise<void> {
  const text = await loadBasemapVectorText('coastlines');
  if (text == null) return;
  try {
    coastPack = parseCoastlinePack(JSON.parse(text));
  } catch (error) {
    console.error('[agent-wars] coastlines document rejected', error);
    return;
  }
  coastLayer?.sync();
  miniLayer?.sync();
}

/**
 * Attaches the coastline panes to both maps.
 *
 * Purpose: The main map gets the hairline, the underlay, and the mask. The minimap gets only the coarse hairline.
 * When to use: Once, after `bindOfflineBasemap`.
 * Expected outcome: Panes exist. Documents load in the background. A second call does nothing.
 * Exceptions: None.
 */
export function bindCoastlineLayers(leaflet: VectorLeaflet, main: VectorHostMap, mini: VectorHostMap): void {
  if (bound) return;
  bound = true;
  mainMap = main;
  coastLayer = createBucketedVectorLayer({
    map: main,
    leaflet,
    paneName: 'basemapCoast',
    paneZIndex: 260,
    shape: 'line',
  });
  underlayLayer = createBucketedVectorLayer({
    map: main,
    leaflet,
    paneName: 'basemapLandUnderlay',
    paneZIndex: 150,
    shape: 'polygon',
  });
  maskLayer = createBucketedVectorLayer({
    map: main,
    leaflet,
    paneName: 'basemapWaterMask',
    paneZIndex: 230,
    shape: 'polygon',
  });
  miniLayer = createBucketedVectorLayer({
    map: mini,
    leaflet,
    paneName: 'basemapCoast',
    paneZIndex: 260,
    shape: 'line',
  });
  coastLayer.setSource((view, zoom) => coastCells(view, zoom, false));
  underlayLayer.setSource((view) => maskCells(view, 'land'));
  maskLayer.setSource((view) => maskCells(view, 'water'));
  miniLayer.setSource((view, zoom) => coastCells(view, zoom, true));
  underlayLayer.setEnabled(false);
  maskLayer.setEnabled(false);
  applyCoastlineTheme(getActiveMapTheme());
  main.on?.('moveend', refreshCoastLayers);
  main.on?.('zoomend', refreshCoastLayers);
  mini.on?.('moveend', () => miniLayer?.sync());
  mini.on?.('zoomend', () => miniLayer?.sync());
  refreshCoastLayers();
  void loadCoastlines();
}

/**
 * Stores the tile native zoom and shows the mask only past it.
 *
 * Purpose: The basemap publishes this when a map's tile pyramid is known.
 * When to use: As the listener passed to `onBasemapNativeZoomChanged`.
 * Expected outcome: The mask and underlay follow `zoom > nativeZoom`. The stored zoom starts at 7 before the first answer.
 * Exceptions: None.
 */
export function setCoastEdgeMaskNativeZoom(zoom: number): void {
  nativeZoom = zoom;
  refreshCoastLayers();
}

/**
 * Paints the coastline and the mask in the active theme.
 *
 * Purpose: The water mask matches the water pane. The underlay uses the land filter. The hairline uses the theme's coast color.
 * When to use: From `applyActiveMapTheme`, after the layers are bound.
 * Expected outcome: Live paths restyle. The underlay pane's filter is contrast, then the theme. An unbound map does nothing.
 * Exceptions: None.
 */
export function applyCoastlineTheme(theme: MapTheme): void {
  const coastStyle: VectorPathStyle = {
    color: theme.coastlineColor,
    weight: COASTLINE_WEIGHT_PX,
    dashArray: null,
    smoothFactor: 0,
    seamWeightPx: null,
  };
  const seam = (color: string): VectorPathStyle => ({
    color,
    weight: 0,
    dashArray: null,
    smoothFactor: 0,
    seamWeightPx: MASK_SEAM_WEIGHT_PX,
  });
  coastLayer?.setStyle(coastStyle);
  miniLayer?.setStyle({ ...coastStyle, weight: MINIMAP_COASTLINE_WEIGHT_PX });
  underlayLayer?.setStyle(seam(flatLandColor()));
  underlayLayer?.setPaneFilter(landUnderlayFilterCss(theme));
  maskLayer?.setStyle(seam(theme.waterColor));
}
