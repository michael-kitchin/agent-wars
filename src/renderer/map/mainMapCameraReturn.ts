/**
 * The main map's camera and loaded extent, saved when the new-game screen opens over a match and put back when the
 * player closes that screen.
 *
 * Purpose: The new-game preview frames its own map and changes the pan and zoom limits. Closing the screen must show
 *   the match as the player left it, on the world map or in a battle.
 * When to use: `saveMainMapCameraForReturn` as the screen opens over a match, `returnMainMapCamera` when the player
 *   closes it, and `forgetMainMapCameraForReturn` when the match under it is replaced or ends.
 * Expected outcome: At most one saved camera at a time.
 * Exceptions: None; a missing map is skipped.
 */
import type { MapExtentBox } from '../../shared/mapExtent';
import { applyLoadedMapExtent, loadedMapExtentTarget } from './mapExtent';
import { getMainLeafletMap } from './worldLeafletMap';

/**
 * The Leaflet calls this module makes on the main map.
 *
 * Purpose: Encodes only the methods and options used here, without depending on the full map type.
 * When to use: Cast `getMainLeafletMap()` to it.
 * Expected outcome: Missing methods are skipped.
 * Exceptions: None.
 */
type CameraMap = {
  getCenter?: () => unknown;
  getZoom?: () => number;
  getMinZoom?: () => number;
  getMaxZoom?: () => number;
  setMinZoom?: (zoom: number) => void;
  setMaxZoom?: (zoom: number) => void;
  setMaxBounds?: (bounds: unknown) => void;
  setView?: (center: unknown, zoom: number, options?: { animate?: boolean }) => void;
  options?: { maxBounds?: unknown; worldCopyJump?: boolean };
};

/**
 * Everything needed to put the main map back as the match had it.
 *
 * Purpose: In a battle the pan limit and the zoom limits are the battle's, not the loaded map's, so all are saved.
 * When to use: Written by `saveMainMapCameraForReturn`; read by `returnMainMapCamera`.
 * Expected outcome: Values read from Leaflet and from `loadedMapExtentTarget`.
 * Exceptions: None.
 */
interface SavedCamera {
  /**
   * The loaded extent the match had applied.
   *
   * Contract: `'world'` or the box `loadedMapExtentTarget` returned when the camera was saved.
   * When to use: Read when the camera is restored, before the view moves.
   * Expected outcome: The canvas uses the match's box again.
   * Exceptions: None.
   */
  readonly extent: 'world' | MapExtentBox;
  /**
   * The map's centre, as Leaflet returned it.
   *
   * Contract: The value `getCenter` returned when the camera was saved.
   * When to use: Read when the camera is restored.
   * Expected outcome: `setView` receives the same centre.
   * Exceptions: None.
   */
  readonly center: unknown;
  /**
   * The map's zoom.
   *
   * Contract: The value `getZoom` returned when the camera was saved.
   * When to use: Read when the camera is restored.
   * Expected outcome: `setView` receives the same zoom.
   * Exceptions: None.
   */
  readonly zoom: number;
  /**
   * The lowest zoom the match allowed.
   *
   * Contract: The value `getMinZoom` returned when the camera was saved.
   * When to use: Read when the camera is restored.
   * Expected outcome: `setMinZoom` receives the same limit.
   * Exceptions: None.
   */
  readonly minZoom: number;
  /**
   * The highest zoom the match allowed.
   *
   * Contract: The value `getMaxZoom` returned when the camera was saved.
   * When to use: Read when the camera is restored.
   * Expected outcome: `setMaxZoom` receives the same limit.
   * Exceptions: None.
   */
  readonly maxZoom: number;
  /**
   * The pan limit the match had set, or null for none.
   *
   * Contract: The `maxBounds` option when the camera was saved.
   * When to use: Read when the camera is restored.
   * Expected outcome: `setMaxBounds` receives the same limit.
   * Exceptions: None.
   */
  readonly maxBounds: unknown;
  /**
   * Whether the map jumped between world copies.
   *
   * Contract: The `worldCopyJump` option when the camera was saved.
   * When to use: Read when the camera is restored.
   * Expected outcome: The option is written back as it was.
   * Exceptions: None.
   */
  readonly worldCopyJump: boolean;
}

/**
 * The camera saved for the match waiting under the new-game screen.
 *
 * Purpose: One saved camera, for the one match that can be waiting.
 * When to use: Only through the functions below.
 * Expected outcome: Null while no match is waiting.
 * Exceptions: None.
 */
let saved: SavedCamera | null = null;

/**
 * Saves the main map's camera, limits, and loaded extent.
 *
 * Purpose: The new-game preview is about to move the camera and change the limits.
 * When to use: As the new-game screen opens over a live match, before the preview loads.
 * Expected outcome: The current camera is saved, replacing any earlier one. Without a map, nothing is saved.
 * Exceptions: None.
 */
export function saveMainMapCameraForReturn(): void {
  const map = getMainLeafletMap() as CameraMap | null;
  if (!map?.getCenter || !map.getZoom || !map.getMinZoom || !map.getMaxZoom) {
    saved = null;
    return;
  }
  saved = {
    extent: loadedMapExtentTarget(),
    center: map.getCenter(),
    zoom: map.getZoom(),
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    maxBounds: map.options?.maxBounds ?? null,
    worldCopyJump: map.options?.worldCopyJump === true,
  };
}

/**
 * Puts the saved camera, limits, and loaded extent back, and drops the saved copy.
 *
 * Purpose: Closing the new-game screen shows the match as the player left it.
 * When to use: After the screen has closed and the map has taken its new size.
 * Expected outcome: Returns true when a camera was put back. The loaded extent is applied again, then the saved pan
 *   limit, zoom limits, and world-copy setting, then the centre and zoom, without animation. Returns false, and changes
 *   nothing, when no camera was saved or the map is missing.
 * Exceptions: None.
 */
export function returnMainMapCamera(): boolean {
  const camera = saved;
  saved = null;
  const map = getMainLeafletMap() as CameraMap | null;
  if (!camera || !map) return false;
  applyLoadedMapExtent(camera.extent, true);
  if (map.options) map.options.worldCopyJump = camera.worldCopyJump;
  map.setMaxBounds?.(camera.maxBounds);
  map.setMinZoom?.(camera.minZoom);
  map.setMaxZoom?.(camera.maxZoom);
  map.setView?.(camera.center, camera.zoom, { animate: false });
  return true;
}

/**
 * Drops the saved camera without using it.
 *
 * Purpose: A replaced or finished match must not pull the camera back later.
 * When to use: When the match under the new-game screen is replaced or ends.
 * Expected outcome: No camera is saved.
 * Exceptions: None.
 */
export function forgetMainMapCameraForReturn(): void {
  saved = null;
}
