/**
 * The narrowest the panel can be dragged, in CSS pixels. This module holds the selection panel's size limits and the
 * rule that keeps a dragged size inside them, so a reviewer can read and test them in one place.
 *
 * Purpose: Leaves the summary bar room for its two lines of text beside the strike target list, Cancel, and the close
 *   control.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 400.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MIN_WIDTH = 400;

/**
 * The widest the panel can be dragged, in CSS pixels.
 *
 * Purpose: Keeps the panel from covering most of the map.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 640.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MAX_WIDTH = 640;

/**
 * The shortest the panel can be dragged, in CSS pixels.
 *
 * Purpose: Keeps the summary bar and at least one unit row visible.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 140.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MIN_HEIGHT = 140;

/**
 * How much shorter than the map the panel must stay, in CSS pixels.
 *
 * Purpose: The panel sits 12 px in from the map's edges at the top and the bottom.
 * When to use: Through `clampSelectionPanelSize`.
 * Expected outcome: 24.
 * Exceptions: None.
 */
export const SELECTION_PANEL_MAP_MARGIN = 24;

/**
 * Keeps a dragged panel size inside its limits.
 *
 * Purpose: The grip can be dragged anywhere; the panel must stay usable and inside the map.
 * When to use: On every pointer move while the grip is dragged, with the map container's current height.
 * Expected outcome: Width from 400 to 640. Height from 140 to the map height minus 24; on a map too short for
 *   that range the height is 140.
 * Exceptions: None.
 */
export function clampSelectionPanelSize(
  size: { readonly width: number; readonly height: number },
  mapHeight: number
): { readonly width: number; readonly height: number } {
  const maxHeight = Math.max(SELECTION_PANEL_MIN_HEIGHT, mapHeight - SELECTION_PANEL_MAP_MARGIN);
  return {
    width: Math.min(SELECTION_PANEL_MAX_WIDTH, Math.max(SELECTION_PANEL_MIN_WIDTH, Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(SELECTION_PANEL_MIN_HEIGHT, Math.round(size.height))),
  };
}
