import { cellToLatLng } from 'h3-js';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import {
  longitudeIntervalFromCenters,
  mapExtentBoxForHexes,
  setMapExtentReferenceLng,
  type MapExtentBox,
} from '../../shared/mapExtent';
import { WEB_MERCATOR_MAX_ABS_LAT } from './hexGrid';
import { getMainLeafletMap, getMiniLeafletMap } from './worldLeafletMap';

/**
 * Leaflet surface this module needs for pan limits.
 *
 * Purpose: Avoids depending on the full map type while still setting bounds and zoom locks.
 * When to use: Cast `getMainLeafletMap()` and the minimap the same way.
 * Expected outcome: Missing methods are skipped.
 * Exceptions: None.
 */
interface ExtentMap {
  /**
   * Fits the map to a bounds box.
   *
   * Contract: Optional because a map stub in tests may omit it.
   * When to use: The first apply of a regional extent, and a resize recompute.
   * Expected outcome: The view shows the box. `animate: false` avoids a camera glide.
   * Exceptions: None.
   */
  fitBounds?: (bounds: unknown, options?: { padding?: number[]; animate?: boolean }) => void;
  /**
   * Sets the pan limit.
   *
   * Contract: Optional. Viscosity stays at the value the map was created with.
   * When to use: Every apply, including a restore that does not refit.
   * Expected outcome: Panning stops at the box.
   * Exceptions: None.
   */
  setMaxBounds?: (bounds: unknown) => void;
  /**
   * Sets the minimum zoom.
   *
   * Contract: Optional. The regional lock is the zoom `fitBounds` just chose.
   * When to use: After a fit, and when restoring the global minimum of 1.5.
   * Expected outcome: The player cannot zoom out past that value.
   * Exceptions: None.
   */
  setMinZoom?: (zoom: number) => void;
  /**
   * Sets the maximum zoom.
   *
   * Contract: Optional. Regional play keeps the map's existing maximum.
   * When to use: Only if a caller needs to restore a saved maximum.
   * Expected outcome: Zoom-in stops at that value.
   * Exceptions: None.
   */
  setMaxZoom?: (zoom: number) => void;
  /**
   * Reads the current zoom.
   *
   * Contract: Optional. Used immediately after a fit.
   * When to use: To lock the minimum zoom to the fitted zoom.
   * Expected outcome: The zoom Leaflet settled on.
   * Exceptions: None.
   */
  getZoom?: () => number;
  /**
   * Subscribes to a map event.
   *
   * Contract: Optional. The resize listener is attached once.
   * When to use: On the first regional apply.
   * Expected outcome: The handler runs when the container size changes.
   * Exceptions: None.
   */
  on?: (event: string, handler: () => void) => void;
  /**
   * Leaflet options this module writes.
   *
   * Contract: Optional. Only `worldCopyJump` is changed.
   * When to use: Regional apply sets it false. Global apply sets it true.
   * Expected outcome: The flag matches the loaded map.
   * Exceptions: None.
   */
  options?: { worldCopyJump?: boolean };
}

/**
 * Last extent applied to the maps.
 *
 * Purpose: Leaving a tactical battle restores this extent instead of the whole world.
 * When to use: Read from `restoreLoadedMapExtent` only.
 * Expected outcome: `'world'` until a regional snapshot is applied.
 * Exceptions: None.
 */
let active: 'world' | MapExtentBox = 'world';

/**
 * Skips repeat fits when the same footprint is applied again.
 *
 * Purpose: A later snapshot of the same map must not yank the camera back to the fit.
 * When to use: Compared inside `syncMapExtentToSnapshot`.
 * Expected outcome: Changes when the map id or the first and last hex change.
 * Exceptions: None.
 */
let appliedKey = '';

/**
 * True after the resize listener is attached.
 *
 * Purpose: Container resizes must recompute the regional minimum zoom once.
 * When to use: Set on the first regional apply.
 * Expected outcome: The listener is registered at most once.
 * Exceptions: None.
 */
let resizeListenerAttached = false;

/**
 * Bounds used when a resize recomputes the minimum zoom.
 *
 * Purpose: The resize listener must follow the latest region, not the first one applied.
 * When to use: Written by `applyLoadedMapExtent` and read by the resize listener.
 * Expected outcome: Null on the global map.
 * Exceptions: None.
 */
let activeBounds: unknown = null;

/**
 * Minimum zoom locked after the regional fit.
 *
 * Purpose: Leaving tactical mode must not zoom out past the loaded map.
 * When to use: Written when a regional fit completes. Applied again when fit is skipped.
 * Expected outcome: Null on the global map.
 * Exceptions: None.
 */
let lockedMinZoom: number | null = null;

/**
 * Applies world limits or a regional box to the main map and minimap.
 *
 * Purpose: The player can pan and zoom inside the loaded map and no farther.
 * When to use: From snapshot sync, and with `fit: false` when restoring after tactical mode.
 * Expected outcome: Global uses minZoom 1.5, Mercator bounds, and worldCopyJump. Regional fits, then locks minZoom to that zoom.
 * Exceptions: Returns without throwing when Leaflet is not ready.
 */
export function applyLoadedMapExtent(target: 'world' | MapExtentBox, fit = true): void {
  active = target;
  const maps = extentMaps();
  if (!maps) return;
  if (target === 'world') {
    activeBounds = null;
    lockedMinZoom = null;
    setMapExtentReferenceLng(null);
    const bounds = worldBounds(maps.leaflet);
    applyToMap(maps.main, bounds, true, 1.5, fit);
    applyToMap(maps.mini, bounds, true, 0, fit);
    return;
  }
  setMapExtentReferenceLng(target.referenceLng);
  const bounds = maps.leaflet.latLngBounds(
    maps.leaflet.latLng(target.south, target.west, true),
    maps.leaflet.latLng(target.north, target.east, true)
  );
  activeBounds = bounds;
  if (fit) maps.main.setMinZoom?.(0);
  applyToMap(maps.main, bounds, false, null, fit);
  applyToMap(maps.mini, bounds, false, 0, fit);
  if (fit && maps.main.getZoom && maps.main.setMinZoom) {
    lockedMinZoom = maps.main.getZoom();
    maps.main.setMinZoom(lockedMinZoom);
  } else if (lockedMinZoom != null) {
    maps.main.setMinZoom?.(lockedMinZoom);
  }
  attachResize(maps.main);
}

/**
 * Puts the stored extent back after a tactical battle.
 *
 * Purpose: Tactical exit used to reopen the whole world.
 * When to use: From `exitTacticalMapView` before restoring the strategic camera.
 * Expected outcome: Max bounds and worldCopyJump match the loaded map. The camera itself is left to the caller.
 * Exceptions: None beyond `applyLoadedMapExtent`.
 */
export function restoreLoadedMapExtent(fit = false): void {
  applyLoadedMapExtent(active, fit);
}

/**
 * Fits a newly loaded footprint, or restores the world when the snapshot is empty.
 *
 * Purpose: Extent changes with the game map, not on every redraw.
 * When to use: At the start of applying a strategic snapshot, after the renderer profile is installed.
 * Expected outcome: Global and empty snapshots use world limits. Regional snapshots use the hex footprint.
 * Exceptions: None when the map is not created yet; the next snapshot retries because the key is not stored.
 */
export function syncMapExtentToSnapshot(state: GameStateSnapshot): void {
  const mapId = state.gameMap?.id ?? 'global';
  const first = state.hexes[0]?.h3Index ?? '';
  const last = state.hexes[state.hexes.length - 1]?.h3Index ?? '';
  const key = state.hexes.length === 0 ? `${mapId}:empty` : `${mapId}:${state.hexes.length}:${first}:${last}`;
  if (!extentMaps()) return;
  if (key === appliedKey) return;
  if (mapId === 'global' || state.hexes.length === 0) {
    applyLoadedMapExtent('world', true);
    appliedKey = key;
    return;
  }
  const longitudes = state.hexes.map((hex) => cellToLatLng(hex.h3Index)[1]);
  const box = mapExtentBoxForHexes(
    longitudeIntervalFromCenters(longitudes),
    state.hexes.map((hex) => hex.h3Index)
  );
  if (!box) return;
  applyLoadedMapExtent(box, true);
  appliedKey = key;
}

/**
 * Reads Leaflet and both maps.
 *
 * Purpose: Keeps the apply path free of a hard dependency when the page has no map yet.
 * When to use: Every public function in this module.
 * Expected outcome: Null when `L` or the main map is missing.
 * Exceptions: None.
 */
function extentMaps(): {
  leaflet: {
    latLng: (lat: number, lng: number, noWrap?: boolean) => unknown;
    latLngBounds: (sw: unknown, ne: unknown) => unknown;
  };
  main: ExtentMap;
  mini: ExtentMap | null;
} | null {
  const leaflet = (globalThis as unknown as {
    L?: {
      latLng: (lat: number, lng: number, noWrap?: boolean) => unknown;
      latLngBounds: (sw: unknown, ne: unknown) => unknown;
    };
  }).L;
  const main = getMainLeafletMap() as ExtentMap | null;
  if (!leaflet || !main) return null;
  const mini = getMiniLeafletMap() as ExtentMap | null;
  return { leaflet, main, mini };
}

/**
 * Builds the Mercator world bounds.
 *
 * Purpose: Global play and a failed regional load must still pan inside the projection.
 * When to use: When `applyLoadedMapExtent` is called with `'world'`.
 * Expected outcome: A Leaflet bounds covering ±85° and ±180°.
 * Exceptions: None.
 */
function worldBounds(leaflet: {
  latLng: (lat: number, lng: number, noWrap?: boolean) => unknown;
  latLngBounds: (sw: unknown, ne: unknown) => unknown;
}): unknown {
  return leaflet.latLngBounds(
    leaflet.latLng(-WEB_MERCATOR_MAX_ABS_LAT, -180),
    leaflet.latLng(WEB_MERCATOR_MAX_ABS_LAT, 180)
  );
}

/**
 * Writes one map's copy-jump flag, max bounds, and optional fit.
 *
 * Purpose: Main and minimap share the same geographic limit.
 * When to use: From `applyLoadedMapExtent` for each map.
 * Expected outcome: `worldCopyJump` matches the loaded mode. Fit runs only when requested.
 * Exceptions: Skips a null minimap.
 */
function applyToMap(
  map: ExtentMap | null,
  bounds: unknown,
  worldCopyJump: boolean,
  minZoom: number | null,
  fit: boolean
): void {
  if (!map) return;
  if (map.options) map.options.worldCopyJump = worldCopyJump;
  map.setMaxBounds?.(bounds);
  if (minZoom != null) map.setMinZoom?.(minZoom);
  if (fit) map.fitBounds?.(bounds, { padding: [2, 2], animate: false });
}

/**
 * Recomputes the regional minimum zoom when the container size changes.
 *
 * Purpose: A fitted zoom from a small window would be wrong after a resize.
 * When to use: Once, on the first regional apply.
 * Expected outcome: The listener refits and then locks minZoom to the new fitted zoom.
 * Exceptions: None.
 */
function attachResize(map: ExtentMap): void {
  if (resizeListenerAttached || !map.on) return;
  resizeListenerAttached = true;
  let recomputing = false;
  map.on('resize', () => {
    if (recomputing || active === 'world' || activeBounds == null) return;
    recomputing = true;
    try {
      const view = map as ExtentMap & {
        getCenter?: () => unknown;
        setView?: (center: unknown, zoom: number) => void;
      };
      const zoom = view.getZoom?.() ?? 0;
      const center = view.getCenter?.();
      view.setMinZoom?.(0);
      view.fitBounds?.(activeBounds, { padding: [2, 2], animate: false });
      const fitted = view.getZoom?.() ?? zoom;
      view.setMinZoom?.(fitted);
      if (center && view.setView) view.setView(center, Math.max(fitted, zoom));
    } finally {
      recomputing = false;
    }
  });
}
