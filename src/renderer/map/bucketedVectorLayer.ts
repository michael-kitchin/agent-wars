/**
 * A Leaflet line or polygon layer that keeps one path per visible vector cell.
 *
 * Purpose: Coastlines, the edge mask, and borders share this, so each feature is decoded once and dropped when it leaves the view.
 * When to use: For a pane that draws encoded vector cells. One layer is one path style.
 * Expected outcome: Panning adds and removes paths. A style change recolours the paths already on the map.
 * Exceptions: A Leaflet call that throws is logged once and leaves the paths already added.
 */

import type { VectorViewBounds } from '../../shared/vectorPackTypes';
import type { VectorLineGeometry, VectorPolygonGeometry } from './vectorLayerGeometry';

/**
 * How a path is stroked or filled.
 *
 * Purpose: One style object covers a solid line, a dashed line, and a filled cell with a seam stroke.
 * When to use: `setStyle` on a bucketed layer.
 * Expected outcome: `seamWeightPx` fills the path and strokes it in the same color. Null seam leaves a line.
 * Exceptions: None.
 */
export interface VectorPathStyle {
  /**
   * Stroke color, and the fill color when a seam weight is set.
   *
   * Contract: A CSS color.
   * When to use: From the active theme, or the flat land gray for the underlay.
   * Expected outcome: Leaflet uses it as `color` and, for a seam, as `fillColor`.
   * Exceptions: None.
   */
  readonly color: string;
  /**
   * Line width in pixels. Ignored when `seamWeightPx` is set.
   *
   * Contract: A positive number.
   * When to use: For coastlines and borders.
   * Expected outcome: Leaflet `weight`.
   * Exceptions: None.
   */
  readonly weight: number;
  /**
   * Dash pattern. Null is a solid line.
   *
   * Contract: A Leaflet dash string, or null.
   * When to use: Disputed borders and state borders. Coastlines stay null.
   * Expected outcome: Passed as `dashArray`, or omitted when null.
   * Exceptions: None.
   */
  readonly dashArray: string | null;
  /**
   * Leaflet simplification. Zero keeps the stored vertices.
   *
   * Contract: A non-negative number.
   * When to use: Zero for the coast and the mask. `0.5` for borders.
   * Expected outcome: Leaflet `smoothFactor`.
   * Exceptions: None.
   */
  readonly smoothFactor: number;
  /**
   * Same-color stroke width for a filled cell. Null means the path is a line.
   *
   * Contract: A positive pixel width, or null.
   * When to use: The land underlay and the water mask, so adjacent cells do not leave a crack.
   * Expected outcome: Fill opacity 1 and a stroke of this width. A line layer leaves this null.
   * Exceptions: None.
   */
  readonly seamWeightPx: number | null;
  /**
   * How strongly a line is painted. Omitted means fully opaque.
   *
   * Contract: A number from 0 to 1, or omitted.
   * When to use: Borders pass `borderLineOpacity`. Coastlines and filled cells omit it.
   * Expected outcome: Leaflet line `opacity`. A polygon ignores it and stays fill opacity 1.
   * Exceptions: None.
   */
  readonly opacity?: number;
}

/**
 * One visible cell and a function that decodes it.
 *
 * Purpose: The layer can skip a cell it already built.
 * When to use: As one element of a `VectorCellSource` result.
 * Expected outcome: `cacheKey` is stable for the same geometry. `build` returns that cell's lines or polygons.
 * Exceptions: None. `build` returns an empty array when the cell has nothing to draw.
 */
export interface VectorCell {
  /**
   * Identity of this cell's geometry for the current band and longitude copy.
   *
   * Contract: A string unique among the cells of one layer.
   * When to use: Compared with the paths already on the map.
   * Expected outcome: An unchanged key keeps its path.
   * Exceptions: None.
   */
  readonly cacheKey: string;
  /**
   * Decodes the cell.
   *
   * Contract: Returns line geometry for a line layer and polygon geometry for a polygon layer.
   * When to use: Only when `cacheKey` is not already drawn.
   * Expected outcome: The positions Leaflet should draw. Empty when there is nothing in the cell.
   * Exceptions: None.
   */
  readonly build: () => VectorLineGeometry | VectorPolygonGeometry;
}

/**
 * Cells to draw for one view.
 *
 * Purpose: The layer does not know which document or band it is showing.
 * When to use: As `setSource`.
 * Expected outcome: The cells whose keys cover `view` at `zoom`.
 * Exceptions: None. An empty list clears the paths when the layer next syncs.
 */
export type VectorCellSource = (view: VectorViewBounds, zoom: number) => readonly VectorCell[];

/**
 * The Leaflet surface a bucketed layer needs.
 *
 * Purpose: The map modules keep their own Leaflet types. This is the slice used here.
 * When to use: The main map and the minimap, cast at the bind call.
 * Expected outcome: Panes, zoom, bounds, and view events.
 * Exceptions: None. A missing method makes the sync log once and stop.
 */
export interface VectorHostMap {
  /**
   * Creates a named pane.
   *
   * Contract: Leaflet `createPane`. Optional because the host type may not list it.
   * When to use: Once, when the layer is created.
   * Expected outcome: The pane element, or undefined when the map cannot create one.
   * Exceptions: None.
   */
  createPane?: (name: string) => HTMLElement;
  /**
   * Returns a pane by name.
   *
   * Contract: Leaflet `getPane`.
   * When to use: When a theme sets a pane filter.
   * Expected outcome: The pane element, or undefined.
   * Exceptions: None.
   */
  getPane?: (name: string) => HTMLElement | undefined;
  /**
   * Current zoom.
   *
   * Contract: Leaflet `getZoom`.
   * When to use: On each sync.
   * Expected outcome: The map zoom.
   * Exceptions: None.
   */
  getZoom?: () => number;
  /**
   * Current view bounds.
   *
   * Contract: An object with west, south, east, and north readers. Leaflet bounds have these.
   * When to use: On each sync.
   * Expected outcome: The bounds the cell source should cover.
   * Exceptions: None.
   */
  getBounds?: () => {
    getWest: () => number;
    getSouth: () => number;
    getEast: () => number;
    getNorth: () => number;
  };
  /**
   * Subscribes to a map event.
   *
   * Contract: Leaflet `on`.
   * When to use: For `moveend` and `zoomend`.
   * Expected outcome: The handler runs after that event.
   * Exceptions: None.
   */
  on?: (event: string, handler: () => void) => void;
}

/**
 * A path already on the map.
 *
 * Purpose: The layer restyles and removes paths without knowing the Leaflet class.
 * When to use: As the value stored per cell.
 * Expected outcome: `setStyle` changes paint. `remove` detaches the path.
 * Exceptions: None.
 */
interface VectorPath {
  /**
   * Repaints the path.
   *
   * Contract: Leaflet `setStyle`. Optional because a host may omit it.
   * When to use: After `setStyle` on the layer.
   * Expected outcome: The path uses the new color, width, and dash.
   * Exceptions: None.
   */
  setStyle?: (style: Record<string, unknown>) => void;
  /**
   * Attaches the path to a map.
   *
   * Contract: Leaflet `addTo`.
   * When to use: When a cell is drawn for the first time.
   * Expected outcome: The path is on the map and uses the layer's renderer.
   * Exceptions: None.
   */
  addTo?: (map: VectorHostMap) => void;
  /**
   * Detaches the path.
   *
   * Contract: Leaflet `remove`.
   * When to use: When a cell leaves the view or the layer is hidden.
   * Expected outcome: The path is gone. The last removal lets the canvas go too.
   * Exceptions: None.
   */
  remove?: () => void;
}

/**
 * The Leaflet constructors the layer uses.
 *
 * Purpose: The vendor global is not imported. The bind call passes `L`.
 * When to use: `createBucketedVectorLayer`.
 * Expected outcome: A canvas renderer plus polyline and polygon constructors.
 * Exceptions: None. A missing constructor logs once and draws nothing.
 */
export interface VectorLeaflet {
  /**
   * Builds a canvas renderer.
   *
   * Contract: Leaflet `canvas`.
   * When to use: Once per layer.
   * Expected outcome: A renderer bound to the layer's pane.
   * Exceptions: None.
   */
  canvas?: (options: { pane: string; padding: number }) => { remove?: () => void };
  /**
   * Builds a polyline.
   *
   * Contract: Leaflet `polyline`.
   * When to use: For a line layer.
   * Expected outcome: A path that can be added to the map.
   * Exceptions: None.
   */
  polyline?: (latlngs: VectorLineGeometry, options: Record<string, unknown>) => VectorPath;
  /**
   * Builds a polygon.
   *
   * Contract: Leaflet `polygon`.
   * When to use: For a fill layer.
   * Expected outcome: A path that can be added to the map.
   * Exceptions: None.
   */
  polygon?: (latlngs: VectorPolygonGeometry, options: Record<string, unknown>) => VectorPath;
}

/**
 * Construction options for one bucketed layer.
 *
 * Purpose: Pane, shape, and the map stay fixed. Style and source change later.
 * When to use: `createBucketedVectorLayer`.
 * Expected outcome: One pane and one renderer.
 * Exceptions: None.
 */
export interface BucketedVectorLayerOptions {
  /**
   * Map that owns the pane.
   *
   * Contract: A `VectorHostMap`.
   * When to use: The main map or the minimap.
   * Expected outcome: Paths are added to this map.
   * Exceptions: None.
   */
  readonly map: VectorHostMap;
  /**
   * Leaflet constructors.
   *
   * Contract: A `VectorLeaflet`.
   * When to use: The same `L` that created `map`.
   * Expected outcome: Paths use a canvas renderer.
   * Exceptions: None.
   */
  readonly leaflet: VectorLeaflet;
  /**
   * Pane name. Leaflet prefixes it in the DOM class.
   *
   * Contract: A string without spaces.
   * When to use: A name such as `basemapCoast`.
   * Expected outcome: The pane class is `leaflet-<name>-pane`.
   * Exceptions: None.
   */
  readonly paneName: string;
  /**
   * Pane z-index inside the map pane.
   *
   * Contract: A number.
   * When to use: The stack position for this layer.
   * Expected outcome: The pane's `style.zIndex`.
   * Exceptions: None.
   */
  readonly paneZIndex: number;
  /**
   * Line or filled polygon.
   *
   * Contract: `'line'` or `'polygon'`.
   * When to use: Lines for coasts and borders. Polygons for the mask.
   * Expected outcome: The matching Leaflet constructor.
   * Exceptions: None.
   */
  readonly shape: 'line' | 'polygon';
}

/**
 * The handle a feature module keeps.
 *
 * Purpose: Style, source, and visibility change without rebuilding the pane.
 * When to use: After `createBucketedVectorLayer`.
 * Expected outcome: `sync` matches the paths to the current view.
 * Exceptions: None. A sync that throws is logged once.
 */
export interface BucketedVectorLayer {
  /**
   * Replaces the cell source and drops paths built from the previous one.
   *
   * Contract: The next `sync` uses this source. Null clears the layer.
   * When to use: If the document identity changes. A closure that reads a later assignment does not need this.
   * Expected outcome: Old paths are removed.
   * Exceptions: None.
   */
  setSource(source: VectorCellSource | null): void;
  /**
   * Replaces the path style and repaints paths already on the map.
   *
   * Contract: Does not decode cells again.
   * When to use: On a theme change.
   * Expected outcome: Live paths show the new style. Paths added later use it too.
   * Exceptions: None.
   */
  setStyle(style: VectorPathStyle): void;
  /**
   * Shows or hides the layer.
   *
   * Contract: False removes every path and the canvas. True draws the current view.
   * When to use: When the zoom band or the native-zoom mask turns on or off.
   * Expected outcome: A hidden layer leaves no canvas in its pane.
   * Exceptions: None.
   */
  setEnabled(enabled: boolean): void;
  /**
   * Sets the pane's CSS filter.
   *
   * Contract: A CSS filter string. Empty clears it.
   * When to use: The land underlay, whose gray fill is recolored by the theme filter.
   * Expected outcome: The pane's `style.filter` changes. Paths are not rebuilt.
   * Exceptions: None. A missing pane is skipped.
   */
  setPaneFilter(filter: string): void;
  /**
   * Adds cells that entered the view and removes cells that left.
   *
   * Contract: Uses the current source, style, and enabled flag.
   * When to use: On `moveend`, `zoomend`, and after a document loads.
   * Expected outcome: One path per visible cell that has geometry. An empty layer removes its canvas.
   * Exceptions: A thrown Leaflet error is logged once for this layer.
   */
  sync(): void;
}

/**
 * Skips a canvas redraw once Leaflet has deleted the drawing context.
 *
 * Purpose: Removing the renderer deletes `_ctx`, and a zoom event can still call `_update` or `_clear`. Those call
 *   `clearRect` on the missing context.
 * When to use: On the renderer from `leaflet.canvas`, before any path is added.
 * Expected outcome: A redraw with no context returns. A redraw with a context uses Leaflet's own method.
 * Exceptions: None.
 */
function ignoreRedrawWithoutContext(renderer: {
  remove?: () => void;
  _ctx?: unknown;
  _update?: () => void;
  _clear?: () => void;
  _draw?: () => void;
  _redraw?: () => void;
} | undefined): void {
  if (!renderer) return;
  const names = ['_update', '_clear', '_draw', '_redraw'] as const;
  for (const name of names) {
    const original = renderer[name];
    if (typeof original !== 'function') continue;
    renderer[name] = function redrawWhenContextExists(this: { _ctx?: unknown }) {
      if (!this._ctx) return;
      original.call(this);
    };
  }
}

/**
 * Creates the pane, the renderer, and the path cache.
 *
 * Purpose: Each feature module supplies cells. This module owns the Leaflet paths.
 * When to use: Once per pane.
 * Expected outcome: A layer with no paths until `sync`. The pane ignores pointer events.
 * Exceptions: None. A missing constructor is reported on the first sync.
 */
export function createBucketedVectorLayer(options: BucketedVectorLayerOptions): BucketedVectorLayer {
  const pane = options.map.getPane?.(options.paneName) ?? options.map.createPane?.(options.paneName);
  if (pane) {
    pane.style.zIndex = String(options.paneZIndex);
    pane.style.pointerEvents = 'none';
  }
  const renderer = options.leaflet.canvas?.({ pane: options.paneName, padding: 0.5 });
  ignoreRedrawWithoutContext(renderer);
  const paths = new Map<string, VectorPath>();
  let source: VectorCellSource | null = null;
  let style: VectorPathStyle = {
    color: '#000000',
    weight: 1,
    dashArray: null,
    smoothFactor: 0,
    seamWeightPx: null,
  };
  let enabled = true;
  let loggedSyncError = false;
  let loggedMissingConstructor = false;

  /**
   * Leaflet options for the current style.
   *
   * Purpose: Line layers and seam-filled polygons do not share one option set.
   * When to use: When adding a path and when restyling one.
   * Expected outcome: A polygon fills in `style.color` and strokes only when a seam weight is set. A line uses weight, dash, round caps, and `style.opacity`, or 1 when that is omitted.
   * Exceptions: None.
   */
  function pathOptions(): Record<string, unknown> {
    if (options.shape === 'polygon') {
      return {
        renderer,
        interactive: false,
        smoothFactor: 0,
        fill: true,
        fillColor: style.color,
        fillOpacity: 1,
        stroke: style.seamWeightPx != null,
        color: style.color,
        weight: style.seamWeightPx ?? 0,
      };
    }
    const line: Record<string, unknown> = {
      renderer,
      interactive: false,
      smoothFactor: style.smoothFactor,
      stroke: true,
      color: style.color,
      weight: style.weight,
      opacity: style.opacity ?? 1,
      lineCap: 'round',
      lineJoin: 'round',
      fill: false,
    };
    if (style.dashArray != null) line.dashArray = style.dashArray;
    return line;
  }

  /**
   * Removes every path and the canvas.
   *
   * Purpose: A disabled layer, or a replaced source, must not leave the previous drawing.
   * When to use: From `setEnabled`, `setSource`, and a sync that has nothing to draw.
   * Expected outcome: The pane has no canvas.
   * Exceptions: None. A missing `remove` is skipped.
   */
  function clearPaths(): void {
    for (const path of paths.values()) path.remove?.();
    paths.clear();
    renderer?.remove?.();
  }

  /**
   * Matches paths to the current view.
   *
   * Purpose: The public `sync` logs a failure. This function does the work.
   * When to use: From `sync` only.
   * Expected outcome: New cells gain a path. Cells that left lose theirs. An empty result removes the canvas.
   * Exceptions: Throws when the map or Leaflet call throws. `sync` catches that.
   */
  function syncUncaught(): void {
    if (!enabled || !source) {
      clearPaths();
      return;
    }
    const bounds = options.map.getBounds?.();
    if (!bounds || !renderer) {
      if (!renderer && !loggedMissingConstructor) {
        loggedMissingConstructor = true;
        console.error('[agent-wars] vector layer has no canvas renderer', options.paneName);
      }
      return;
    }
    const view: VectorViewBounds = {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    };
    const cells = source(view, options.map.getZoom?.() ?? 0);
    const live = new Set<string>();
    const paint = pathOptions();
    for (const cell of cells) {
      live.add(cell.cacheKey);
      if (paths.has(cell.cacheKey)) continue;
      const geometry = cell.build();
      if (geometry.length === 0) continue;
      const path = options.shape === 'line'
        ? options.leaflet.polyline?.(geometry as VectorLineGeometry, paint)
        : options.leaflet.polygon?.(geometry as VectorPolygonGeometry, paint);
      if (!path) continue;
      path.addTo?.(options.map);
      paths.set(cell.cacheKey, path);
    }
    for (const [key, path] of paths) {
      if (live.has(key)) continue;
      path.remove?.();
      paths.delete(key);
    }
    if (paths.size === 0) renderer.remove?.();
  }

  /**
   * Runs a sync and remembers the first failure.
   *
   * Purpose: A bad bounds read must not throw into the map event.
   * When to use: Every public call that syncs.
   * Expected outcome: One console error for this layer, then later syncs try again without logging.
   * Exceptions: None.
   */
  function sync(): void {
    try {
      syncUncaught();
    } catch (error) {
      if (loggedSyncError) return;
      loggedSyncError = true;
      console.error('[agent-wars] vector layer sync failed', options.paneName, error);
    }
  }

  return {
    setSource(next: VectorCellSource | null): void {
      source = next;
      clearPaths();
      sync();
    },
    setStyle(next: VectorPathStyle): void {
      style = next;
      const paint = pathOptions();
      for (const path of paths.values()) path.setStyle?.(paint);
    },
    setEnabled(next: boolean): void {
      enabled = next;
      sync();
    },
    setPaneFilter(filter: string): void {
      const target = options.map.getPane?.(options.paneName);
      if (target) target.style.filter = filter;
    },
    sync,
  };
}
