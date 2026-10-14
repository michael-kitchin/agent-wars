/**
 * The map view the player chose in the mode column. This module holds that choice for the rest of the session; it is
 * not saved, so the app opens on the Weather view each time.
 *
 * Purpose: The mode column writes the choice and the drawing code reads it, without either importing the other.
 * When to use: Through `getMapViewMode` and `setMapViewMode`.
 * Expected outcome: `DEFAULT_MAP_VIEW_MODE` until the player picks another view.
 * Exceptions: None.
 */
import { DEFAULT_MAP_VIEW_MODE, type MapViewMode } from '../../shared/mapViewMode';

/**
 * The view chosen in the mode column.
 *
 * Purpose: The single record of the choice for this session.
 * When to use: Only through `getMapViewMode` and `setMapViewMode`.
 * Expected outcome: Starts as `DEFAULT_MAP_VIEW_MODE`.
 * Exceptions: None.
 */
let mapViewMode: MapViewMode = DEFAULT_MAP_VIEW_MODE;

/**
 * Returns the map view the player chose.
 *
 * Purpose: Drawing code and the mode column's buttons follow the same choice.
 * When to use: Each time the inspection view is decided, and when the mode column redraws its buttons.
 * Expected outcome: `'weather'` or `'tech'`.
 * Exceptions: None.
 */
export function getMapViewMode(): MapViewMode {
  return mapViewMode;
}

/**
 * Records the map view the player chose.
 *
 * Purpose: The choice lasts for the session, across turns, battles, and new matches.
 * When to use: Only from the mode column's Weather and Tech buttons.
 * Expected outcome: Later calls to `getMapViewMode` return `mode`. Nothing is redrawn here.
 * Exceptions: None.
 */
export function setMapViewMode(mode: MapViewMode): void {
  mapViewMode = mode;
}
