/**
 * How far map chrome stays from the map's edges, in CSS pixels. This module holds the placement rules for the chrome
 * that shares the top of the map: the minimap panel at the top-left, the terrain legend beside or under it, the toast
 * band against the map's right edge, and the new-game setup panel that floats over the map.
 *
 * Purpose: The minimap panel, the legend, and the toast band keep the same inset.
 * When to use: Through `legendPopoverPosition`, `toastBandSpan`, `messageToastBandWidth`, and `floatingPanelOffset`.
 * Expected outcome: 12.
 * Exceptions: None.
 */
export const MAP_CHROME_INSET = 12;

/**
 * The space between the minimap panel and the legend, in CSS pixels.
 *
 * Purpose: The legend reads as a separate panel that the Legend button opened.
 * When to use: Through `legendPopoverPosition`.
 * Expected outcome: 8.
 * Exceptions: None.
 */
export const MAP_CHROME_GAP = 8;

/**
 * The narrowest the toast band may be beside the panel, in CSS pixels.
 *
 * Purpose: Below this width the left offset moves to the map's inset, so the toast is not held in a thinner column.
 *   `messageToastBandWidth` may still widen the band past one third of the map when the opponent tab row needs it.
 * When to use: Through `toastBandSpan`.
 * Expected outcome: 280.
 * Exceptions: None.
 */
export const TOAST_BAND_MIN_WIDTH = 280;

/**
 * Places the terrain legend beside the minimap panel, or under it when the map is too narrow.
 *
 * Purpose: The legend opens to the right of the panel, as the layout asks, without running off a narrow map.
 * When to use: Each time the legend opens and each time the map changes size, with boxes measured relative to the
 *   map's top-left corner.
 * Expected outcome: `beside` is true when the legend fits right of the panel with the inset to spare; it then sits
 *   `MAP_CHROME_GAP` right of the panel, level with the map's top inset. Otherwise it sits at the left inset,
 *   `MAP_CHROME_GAP` under the panel.
 * Exceptions: None.
 */
export function legendPopoverPosition(input: {
  readonly mapWidth: number;
  readonly panelRight: number;
  readonly panelBottom: number;
  readonly legendWidth: number;
}): { readonly left: number; readonly top: number; readonly beside: boolean } {
  const besideLeft = input.panelRight + MAP_CHROME_GAP;
  if (besideLeft + input.legendWidth + MAP_CHROME_INSET <= input.mapWidth) {
    return { left: besideLeft, top: MAP_CHROME_INSET, beside: true };
  }
  return { left: MAP_CHROME_INSET, top: input.panelBottom + MAP_CHROME_GAP, beside: false };
}

/**
 * Finds the toast band's left and right offsets inside the map.
 *
 * Purpose: Toasts sit between the chrome at the top-left (the minimap panel, or the legend when it is open beside the
 *   panel) and the map's right edge. When that gap is under `TOAST_BAND_MIN_WIDTH`, the left offset moves to the map's
 *   inset so the toast is not held in a thinner column. The band's width is chosen by `messageToastBandWidth`.
 * When to use: Each time the map changes size and each time the legend opens or closes, with x positions measured from
 *   the map's left edge. Pass the map width as `rightObstacleLeft`.
 * Expected outcome: `left` and `right` are CSS offsets from the map's left and right edges, each keeping
 *   `MAP_CHROME_INSET` from the chrome beside it. When the space between is narrower than `TOAST_BAND_MIN_WIDTH`,
 *   `left` is the map's own inset instead and `overChrome` is true.
 * Exceptions: None.
 */
export function toastBandSpan(input: {
  readonly mapWidth: number;
  readonly leftObstacleRight: number;
  readonly rightObstacleLeft: number;
}): { readonly left: number; readonly right: number; readonly overChrome: boolean } {
  const right = Math.max(MAP_CHROME_INSET, input.mapWidth - input.rightObstacleLeft + MAP_CHROME_INSET);
  const left = input.leftObstacleRight + MAP_CHROME_INSET;
  if (input.mapWidth - left - right < TOAST_BAND_MIN_WIDTH) {
    return { left: MAP_CHROME_INSET, right, overChrome: true };
  }
  return { left, right, overChrome: false };
}

/**
 * Chooses the message band's width from the gap and the opponent tab row.
 *
 * Purpose: Short side names usually fit in one third of the map. Four of them on a narrower map do not, and the tabs stay on one line.
 * When to use: `layoutMapChrome`, after `toastBandSpan`. Pass 0 for `tabRowOuterWidth` while the message toast is hidden.
 * Expected outcome: The smaller of the gap and one third of the map, unless the tab row is wider. Then the row's width, and never more than the map minus `MAP_CHROME_INSET` on each side. A non-finite row width counts as 0.
 * Exceptions: None.
 */
export function messageToastBandWidth(input: {
  readonly mapWidth: number;
  readonly available: number;
  readonly tabRowOuterWidth: number;
}): number {
  const cap = Math.max(0, input.mapWidth - 2 * MAP_CHROME_INSET);
  const fitted = Math.max(0, Math.min(Math.max(0, input.available), input.mapWidth / 3));
  const row = Number.isFinite(input.tabRowOuterWidth) ? Math.max(0, input.tabRowOuterWidth) : 0;
  return Math.min(cap, Math.max(fitted, row));
}

/**
 * Keeps a floating panel inside the map, with the inset to spare.
 *
 * Purpose: A panel the player drags must stay reachable: its header and grip never leave the map.
 * When to use: While the new-game setup panel is dragged, when its height changes, and when the window changes size,
 *   with the wanted offsets measured from the map's top-left corner.
 * Expected outcome: `left` and `top` clamped to at least `MAP_CHROME_INSET`, and to at most the map's size less the
 *   panel's size and the inset. A panel larger than the map on an axis sits at the inset on that axis.
 * Exceptions: None.
 */
export function floatingPanelOffset(input: {
  readonly left: number;
  readonly top: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
}): { readonly left: number; readonly top: number } {
  const maxLeft = Math.max(MAP_CHROME_INSET, input.mapWidth - input.panelWidth - MAP_CHROME_INSET);
  const maxTop = Math.max(MAP_CHROME_INSET, input.mapHeight - input.panelHeight - MAP_CHROME_INSET);
  return {
    left: Math.min(maxLeft, Math.max(MAP_CHROME_INSET, input.left)),
    top: Math.min(maxTop, Math.max(MAP_CHROME_INSET, input.top)),
  };
}
