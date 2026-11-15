/**
 * Which keys zoom the main map, and by how much.
 *
 * Purpose: The on-screen zoom buttons are gone. These keys take their place, and they share the map's zoom step.
 * When to use: The global keydown handler, and the main map's `zoomDelta`.
 * Expected outcome: One step in or out, or no zoom.
 * Exceptions: None.
 */

/**
 * One step of the main map's zoom, matching its `zoomDelta`.
 *
 * Purpose: One key press matches one step of the removed zoom button.
 * When to use: `zoomDelta` on the main map, and `zoomMainMapByKeyStep`.
 * Expected outcome: `0.5`.
 * Exceptions: None.
 */
export const MAP_KEYBOARD_ZOOM_STEP = 0.5;

/**
 * The zoom direction for one key, when the key is a zoom key and no browser modifier is held.
 *
 * Purpose: Shift stays allowed, because `+` needs Shift on many layouts. Ctrl, Alt, and Meta stay with the browser.
 * When to use: The global keydown handler, after the repeat check and before the modifier gate.
 * Expected outcome: `1` to zoom in, `-1` to zoom out, or null when the key is not a zoom key or a browser modifier is held.
 * Exceptions: None.
 */
export function mapZoomKeyStep(args: {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}): 1 | -1 | null {
  if (args.ctrlKey || args.altKey || args.metaKey) return null;
  if (args.key === '+' || args.key === '=' || args.code === 'NumpadAdd') return 1;
  if (args.key === '-' || args.code === 'NumpadSubtract') return -1;
  return null;
}
