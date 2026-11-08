/**
 * Offline hillshade tile layer and the water color drawn under it.
 *
 * Purpose: The match map reads `agentwars-basemap` tiles. A theme sets the water color and recolors the land.
 * When to use: After the Leaflet maps exist. Call `bindOfflineBasemap` once, then `setBasemapGameMap` when the match map changes, and `applyBasemapTheme` when the theme changes.
 * Expected outcome: One tile layer on each map. Changing theme does not remount the tiles.
 * Exceptions: A failed native-zoom IPC uses zoom 7 and logs the error. Tile errors show one toast per session.
 */

import { DEFAULT_MAP_THEME_ID, type MapTheme, mapThemeById } from '../../shared/mapThemes';
import { WEB_MERCATOR_MAX_ABS_LAT } from '../../shared/webMercator';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { landTileFilterCss } from './mapThemeFilters';

/**
 * Provider id shared by every map theme.
 *
 * Purpose: A theme change must not look like a basemap swap.
 * When to use: When recording which provider the Leaflet maps are showing.
 * Expected outcome: The string `offline_hillshade`.
 * Exceptions: None.
 */
export const OFFLINE_HILLSHADE_ID = 'offline_hillshade';

const WATER_PANE = 'basemapWater';
const GRID_PANE = 'basemapGrid';

/**
 * Dash pattern for a source-tile line that is not a reference edge.
 *
 * Purpose: The equator, the prime meridian, and the antimeridian stay solid. Every other edge is dashed.
 * When to use: As Leaflet `dashArray` on those dashed lines.
 * Expected outcome: A 2 px stroke and a 3 px gap.
 * Exceptions: None.
 */
const GRID_DASH = '2 3';

/**
 * Longitude of each GMTED tile edge, in degrees.
 *
 * Purpose: The elevation tiles are 30° wide, and their joins are baked into the hillshade.
 * When to use: When drawing meridians. 0 and ±180 are solid.
 * Expected outcome: Thirteen meridians from -180 through 180.
 * Exceptions: None.
 */
const SOURCE_MERIDIANS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180] as const;

/**
 * Latitude of each drawn parallel, in degrees.
 *
 * Purpose: The elevation tiles are 20° tall, so the joins are at 10°, 30°, 50°, and 70° on each side of the equator. The equator itself is not a join; it is the solid reference parallel.
 * When to use: When drawing parallels. Only 0 is solid.
 * Expected outcome: Nine parallels. The pole is omitted because Mercator does not reach it.
 * Exceptions: None.
 */
const SOURCE_PARALLELS = [-70, -50, -30, -10, 0, 10, 30, 50, 70] as const;

/**
 * Leaflet surface this layer needs.
 *
 * Purpose: Avoids importing the map module, which calls back into this one.
 * When to use: The maps created in `initWorldLeafletMaps`.
 * Expected outcome: Pane and tile-layer methods. Missing methods are skipped.
 * Exceptions: None.
 */
interface OfflineBasemapMap {
  /**
   * Creates a named pane.
   *
   * Contract: Returns the pane element. Optional when the test double has no panes.
   * When to use: Once per map for the water color, and once on the main map for the elevation-tile lines.
   * Expected outcome: An element whose style this module sets.
   * Exceptions: None.
   */
  createPane?: (name: string) => HTMLElement;
  /**
   * Reads a pane by name.
   *
   * Contract: The element, or undefined when that pane was never created.
   * When to use: Before creating the water pane or the grid pane again, and when applying a filter.
   * Expected outcome: The existing pane or undefined.
   * Exceptions: None.
   */
  getPane?: (name: string) => HTMLElement | undefined;
  /**
   * Reads the standard Leaflet panes.
   *
   * Contract: At least the tile pane when the map has finished initializing.
   * When to use: When filtering the hillshade tiles.
   * Expected outcome: The tile pane element.
   * Exceptions: None.
   */
  getPanes?: () => { tilePane?: HTMLElement };
  /**
   * Reads the map's root element.
   *
   * Contract: The `.leaflet-container` for this map.
   * When to use: When placing the water color so it stays fixed while the map pane moves.
   * Expected outcome: The container element, or undefined when the map has no DOM root.
   * Exceptions: None.
   */
  getContainer?: () => HTMLElement;
  /**
   * Adds a layer to the map.
   *
   * Contract: Optional. The tile layer also has `addTo`.
   * When to use: If a caller prefers the map to own insertion.
   * Expected outcome: The layer is shown.
   * Exceptions: None.
   */
  addLayer?: (layer: unknown) => void;
  /**
   * Removes a layer from the map.
   *
   * Contract: Optional. A missing method means the previous layer is left in place.
   * When to use: Before replacing the tile layer.
   * Expected outcome: The previous layer is gone.
   * Exceptions: None.
   */
  removeLayer?: (layer: unknown) => void;
}

/**
 * Tile layer handle.
 *
 * Purpose: Remove and listen without the full Leaflet types.
 * When to use: The object returned by `tileLayer`.
 * Expected outcome: `on`, `off`, and removal through the map.
 * Exceptions: None.
 */
interface OfflineTileLayer {
  /**
   * Subscribes to a Leaflet layer event.
   *
   * Contract: `tileerror` is the event this module listens for.
   * When to use: After the layer is created.
   * Expected outcome: The handler runs when a tile fails.
   * Exceptions: None.
   */
  on: (event: string, handler: () => void) => void;
  /**
   * Drops a Leaflet layer subscription.
   *
   * Contract: The same handler that was passed to `on`.
   * When to use: Before the layer is removed.
   * Expected outcome: That handler no longer runs.
   * Exceptions: None.
   */
  off: (event: string, handler: () => void) => void;
  /**
   * Inserts the layer into a map.
   *
   * Contract: Optional. Returns the same layer.
   * When to use: When the Leaflet build provides `addTo`.
   * Expected outcome: The tiles are requested.
   * Exceptions: None.
   */
  addTo?: (map: OfflineBasemapMap) => OfflineTileLayer;
}

interface OfflineLeaflet {
  /**
   * Builds a raster tile layer.
   *
   * Contract: The URL may contain `{z}`, `{x}`, and `{y}`. Options follow Leaflet's tile-layer options.
   * When to use: When the map id or native zoom changes.
   * Expected outcome: A layer that is not yet on a map.
   * Exceptions: None.
   */
  tileLayer: (url: string, options: Record<string, unknown>) => OfflineTileLayer;
  /**
   * Builds a polyline.
   *
   * Contract: Optional. Each position is `[latitude, longitude]`.
   * When to use: When drawing one elevation-tile edge.
   * Expected outcome: A path that is not yet on a map.
   * Exceptions: None.
   */
  polyline?: (
    positions: Array<[number, number]>,
    options: Record<string, unknown>,
  ) => { addTo?: (map: OfflineBasemapMap) => void; setStyle?: (style: { color: string }) => void };
}

let leafletRef: OfflineLeaflet | null = null;
let mainMap: OfflineBasemapMap | null = null;
let miniMap: OfflineBasemapMap | null = null;
let mainLayer: OfflineTileLayer | null = null;
let miniLayer: OfflineTileLayer | null = null;
let gameMapId = 'global';
let appliedKey = '';
let requestSerial = 0;
let basemapErrorShown = false;
let publishedNativeZoom = 7;
const gridLines: Array<{ setStyle?: (style: { color: string }) => void }> = [];
const nativeZoomListeners = new Set<(nativeZoom: number) => void>();

/**
 * Native zoom of the tile pyramid currently applied.
 *
 * Purpose: The coast edge mask turns on only past this zoom, because that is where the tiles start to stretch.
 * When to use: Before the first published answer, or from a caller that missed the listener.
 * Expected outcome: 7 until a map's native zoom is known, then that zoom.
 * Exceptions: None.
 */
export function getBasemapNativeZoom(): number {
  return publishedNativeZoom;
}

/**
 * Runs `listener` after each accepted native-zoom answer, including the first.
 *
 * Purpose: The edge mask is created in another module, and this module must not import it.
 * When to use: Once, after the maps are bound.
 * Expected outcome: The listener receives the zoom whenever a map request settles on one.
 * Exceptions: None. A listener that throws leaves the remaining listeners uncalled.
 */
export function onBasemapNativeZoomChanged(listener: (nativeZoom: number) => void): void {
  nativeZoomListeners.add(listener);
}

/**
 * Stores a native zoom and tells the listeners.
 *
 * Purpose: One place updates the getter and the mask together.
 * When to use: When `applyGameMap` accepts an answer, including a repeat of the same map.
 * Expected outcome: `getBasemapNativeZoom` returns `nativeZoom`, and every listener is called with it.
 * Exceptions: A listener that throws propagates to the caller.
 */
function publishBasemapNativeZoom(nativeZoom: number): void {
  publishedNativeZoom = nativeZoom;
  for (const listener of nativeZoomListeners) listener(nativeZoom);
}

/**
 * Attaches the offline layers to both maps.
 *
 * Purpose: Init has the Leaflet factory and both map instances.
 * When to use: Once, from `initWorldLeafletMaps`, after both maps exist.
 * Expected outcome: A water pane and a tile layer on each map, and the elevation-tile lines on the main map, starting at `global` until `setBasemapGameMap` runs.
 * Exceptions: None. A missing factory is ignored.
 */
export function bindOfflineBasemap(leaflet: OfflineLeaflet, main: OfflineBasemapMap, mini: OfflineBasemapMap): void {
  leafletRef = leaflet;
  mainMap = main;
  miniMap = mini;
  ensureWaterPane(main);
  ensureWaterPane(mini);
  ensureSourceGrid(leaflet, main);
  void applyGameMap(gameMapId);
}

/**
 * Points both tile layers at one match map.
 *
 * Purpose: A region change is not a style change. The provider id stays `offline_hillshade`.
 * When to use: When the loaded match or the new-game preview changes map.
 * Expected outcome: Layers are replaced only when the map id or the native zoom changes. A failed IPC keeps zoom 7.
 * Exceptions: None. IPC failures are logged.
 */
export function setBasemapGameMap(nextMapId: string): void {
  const mapId = nextMapId || 'global';
  gameMapId = mapId;
  void applyGameMap(mapId);
}

/**
 * Paints the active theme on both maps.
 *
 * Purpose: Water is a flat color. Land is the theme filter on the tile pane, above the stylesheet contrast.
 *   Grid lines take the theme color directly, so the land filter does not gray them.
 * When to use: From `applyActiveMapTheme`, after the maps exist.
 * Expected outcome: Both water panes use `theme.waterColor`. Both tile panes use the land filter, and their
 *   child tiles have an empty inline filter so `contrast(1.4)` remains. The grid pane's filter is cleared
 *   and each grid line uses `theme.gridLineColor`.
 * Exceptions: None. A missing pane is skipped.
 */
export function applyBasemapTheme(theme: MapTheme): void {
  for (const map of [mainMap, miniMap]) {
    const water = map?.getPane?.(WATER_PANE);
    if (water) water.style.background = theme.waterColor;
    applyTileTheme(map?.getPanes?.()?.tilePane, landTileFilterCss(theme));
  }
  const grid = mainMap?.getPane?.(GRID_PANE);
  if (grid) grid.style.filter = '';
  for (const line of gridLines) line.setStyle?.({ color: theme.gridLineColor });
}

async function applyGameMap(mapId: string): Promise<void> {
  const serial = ++requestSerial;
  const nativeZoom = await nativeZoomFor(mapId);
  if (serial !== requestSerial || !leafletRef || !mainMap || !miniMap) return;
  publishBasemapNativeZoom(nativeZoom);
  const key = `${mapId}:${nativeZoom}`;
  if (key === appliedKey && mainLayer && miniLayer) return;
  appliedKey = key;
  const url = `agentwars-basemap://tiles/${mapId}/{z}/{x}/{y}.webp`;
  mainLayer = replaceLayer(leafletRef, mainMap, mainLayer, url, nativeZoom);
  miniLayer = replaceLayer(leafletRef, miniMap, miniLayer, url, nativeZoom);
}

function replaceLayer(
  leaflet: OfflineLeaflet,
  map: OfflineBasemapMap,
  current: OfflineTileLayer | null,
  url: string,
  nativeZoom: number,
): OfflineTileLayer {
  if (current) {
    current.off('tileerror', onTileError);
    try {
      map.removeLayer?.(current);
    } catch {
      /* layer already gone */
    }
  }
  const layer = leaflet.tileLayer(url, {
    maxZoom: 16,
    maxNativeZoom: nativeZoom,
    minZoom: 0,
  });
  layer.addTo?.(map);
  layer.on('tileerror', onTileError);
  return layer;
}

/**
 * Draws the elevation-tile edges on one map.
 *
 * Purpose: The joins are already in the hillshade. The lines sit above the tiles and move with the map, so the step reads as a grid.
 * When to use: Once, on the main map, from `bindOfflineBasemap`. The minimap stays clear of these lines.
 * Expected outcome: Solid lines at longitude 0 and ±180 and at the equator. Dashed lines on the other meridians and parallels. The pane takes no pointer input.
 * Exceptions: None. A map without a pane or a factory without polylines is skipped.
 */
function ensureSourceGrid(leaflet: OfflineLeaflet, map: OfflineBasemapMap): void {
  if (!leaflet.polyline || map.getPane?.(GRID_PANE)) return;
  const pane = map.createPane?.(GRID_PANE);
  if (!pane) return;
  pane.style.zIndex = '250';
  pane.style.pointerEvents = 'none';
  for (const longitude of SOURCE_MERIDIANS) {
    const line = leaflet.polyline(meridianPositions(longitude), gridStroke(longitude === 0 || Math.abs(longitude) === 180));
    line?.addTo?.(map);
    if (line) gridLines.push(line);
  }
  for (const latitude of SOURCE_PARALLELS) {
    const line = leaflet.polyline(parallelPositions(latitude), gridStroke(latitude === 0));
    line?.addTo?.(map);
    if (line) gridLines.push(line);
  }
}

/**
 * Builds the two ends of one meridian.
 *
 * Purpose: A meridian is a straight north-south edge. Two points are enough.
 * When to use: From `ensureSourceGrid`.
 * Expected outcome: The Web Mercator latitude limits at `longitude`.
 * Exceptions: None.
 */
function meridianPositions(longitude: number): Array<[number, number]> {
  return [
    [-WEB_MERCATOR_MAX_ABS_LAT, longitude],
    [WEB_MERCATOR_MAX_ABS_LAT, longitude],
  ];
}

/**
 * Builds the two ends of one parallel.
 *
 * Purpose: A parallel is a straight east-west edge. Two points are enough.
 * When to use: From `ensureSourceGrid`.
 * Expected outcome: Longitude -180 and 180 at `latitude`.
 * Exceptions: None.
 */
function parallelPositions(latitude: number): Array<[number, number]> {
  return [
    [latitude, -180],
    [latitude, 180],
  ];
}

/**
 * Stroke options for one source-tile line.
 *
 * Purpose: Reference edges stay solid. The remaining edges are dashed so the grid stays light.
 * When to use: From `ensureSourceGrid`. `solid` is true for longitude 0, longitude ±180, and the equator.
 * Expected outcome: A 1 px line on `basemapGrid`. Dashed when `solid` is false.
 * Exceptions: None.
 */
function gridStroke(solid: boolean): Record<string, unknown> {
  const stroke: Record<string, unknown> = {
    pane: GRID_PANE,
    color: mapThemeById(DEFAULT_MAP_THEME_ID).gridLineColor,
    weight: 1,
    opacity: 1,
    interactive: false,
    smoothFactor: 0,
  };
  if (!solid) stroke.dashArray = GRID_DASH;
  return stroke;
}

/**
 * Puts a full-size water color behind the tiles.
 *
 * Purpose: Ocean pixels in the hillshade are transparent. An empty Leaflet pane has no box, so its background never paints and the map's gray shows through.
 * When to use: Once per map, before the first tile layer.
 * Expected outcome: A pane covering the map container, behind the moving map pane, filled with the active theme's water color.
 * Exceptions: None. A map without pane methods is skipped.
 */
function ensureWaterPane(map: OfflineBasemapMap): void {
  if (map.getPane?.(WATER_PANE)) return;
  const pane = map.createPane?.(WATER_PANE);
  if (!pane) return;
  const container = map.getContainer?.();
  if (container) container.insertBefore(pane, container.firstChild);
  pane.style.position = 'absolute';
  pane.style.inset = '0';
  pane.style.width = '100%';
  pane.style.height = '100%';
  pane.style.zIndex = '190';
  pane.style.pointerEvents = 'none';
  pane.style.background = mapThemeById(DEFAULT_MAP_THEME_ID).waterColor;
}

/**
 * Puts the land-color filter on a tile pane without removing contrast.
 *
 * Purpose: The theme recolors the pane. Land contrast is a stylesheet rule on the tile images, so an inline filter must be cleared with an empty string. `none` would remove that contrast.
 * When to use: From `applyBasemapTheme`, for each map's tile pane.
 * Expected outcome: The pane uses `filter`. Tile images keep `contrast(1.4)` from `shellChrome.css`.
 * Exceptions: None. A missing pane is skipped.
 */
function applyTileTheme(pane: HTMLElement | undefined, filter: string): void {
  if (!pane) return;
  const filtered = pane.querySelectorAll<HTMLElement>('.leaflet-layer, .leaflet-tile');
  for (const el of filtered) el.style.filter = '';
  pane.style.filter = filter;
}

function onTileError(): void {
  if (basemapErrorShown) return;
  basemapErrorShown = true;
  showMapToast('Some map tiles failed to load. The game remains playable; try again later.', { isError: false });
}

async function nativeZoomFor(mapId: string): Promise<number> {
  const ask = window.gameApi?.basemapNativeZoom;
  if (!ask) return 7;
  try {
    const result = await ask(mapId);
    return result?.nativeZoom === 9 ? 9 : 7;
  } catch (err) {
    console.error('[agent-wars] basemap native zoom failed', err);
    return 7;
  }
}
