/**
 * The chat panel's size limits and the rule that keeps a dragged size inside them.
 *
 * Purpose: The grip in the panel's top-left corner can be dragged anywhere, and the panel must stay usable and inside the map. One module holds the numbers so a reviewer can read and test them together.
 * When to use: `clampChatPanelSize`, from the chat panel's resize grip.
 * Expected outcome: Pure functions and constants. Nothing touches the DOM.
 * Exceptions: None.
 */

/**
 * The narrowest the panel can be dragged, in CSS pixels.
 *
 * Purpose: Leaves the bar room for the expand control, the side list, a usable message field, and the send button. It is also the narrowest message dialog band (`TOAST_BAND_MIN_WIDTH`).
 * When to use: Through `clampChatPanelSize`.
 * Expected outcome: 280.
 * Exceptions: None.
 */
export const CHAT_PANEL_MIN_WIDTH = 280;

/**
 * The widest the panel can be dragged, in CSS pixels.
 *
 * Purpose: Keeps the panel from covering most of the map. This is the selection panel's limit as well.
 * When to use: Through `clampChatPanelSize`.
 * Expected outcome: 640.
 * Exceptions: None.
 */
export const CHAT_PANEL_MAX_WIDTH = 640;

/**
 * The shortest the expanded panel can be dragged, in CSS pixels.
 *
 * Purpose: Keeps the entry bar and a few history lines visible.
 * When to use: Through `clampChatPanelSize`.
 * Expected outcome: 140.
 * Exceptions: None.
 */
export const CHAT_PANEL_MIN_HEIGHT = 140;

/**
 * How much shorter than the map the panel must stay, in CSS pixels.
 *
 * Purpose: The panel sits 12 px in from the map's edges at the top and the bottom.
 * When to use: Through `clampChatPanelSize`.
 * Expected outcome: 24.
 * Exceptions: None.
 */
export const CHAT_PANEL_MAP_MARGIN = 24;

/**
 * Keeps a dragged panel size inside its limits.
 *
 * Purpose: The grip can be dragged anywhere; the panel must stay usable and inside the map.
 * When to use: On every pointer move while the grip is dragged, with the map container's current height.
 * Expected outcome: Width from 280 to 640. Height from 140 to the map height minus 24; on a map too short for that range the height is 140. Both are rounded to whole pixels.
 * Exceptions: None.
 *
 * @param size The width and height the pointer asks for.
 * @param mapHeight The map container's height in CSS pixels.
 */
export function clampChatPanelSize(
  size: { readonly width: number; readonly height: number },
  mapHeight: number
): { readonly width: number; readonly height: number } {
  const maxHeight = Math.max(CHAT_PANEL_MIN_HEIGHT, mapHeight - CHAT_PANEL_MAP_MARGIN);
  return {
    width: Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, Math.round(size.width))),
    height: Math.min(maxHeight, Math.max(CHAT_PANEL_MIN_HEIGHT, Math.round(size.height))),
  };
}
