/**
 * Places the terrain legend and the toast band among the chrome at the top of the map. The rules are in
 * `src/shared/mapChromePlacement.ts`; this module measures the page and applies them.
 *
 * Purpose: The legend's width and the zoom buttons' position come from the page, so they are measured, not assumed.
 * When to use: Through `layoutMapChrome`.
 * Expected outcome: Inline `left`, `top`, and `right` on `#terrain-legend` and `#map-toast-band`. While the new-game
 *   setup panel is open over the map, the band also keeps clear of it.
 * Exceptions: None; missing elements are skipped.
 */
import { legendPopoverPosition, toastBandSpan } from '../../shared/mapChromePlacement';

/**
 * Moves the open legend beside or under the minimap panel, then fits the toast band between the chrome on the left
 * and the zoom buttons.
 *
 * Purpose: Keeps the legend on the map and the toasts clear of the panel, the legend, and the zoom buttons at any size.
 * When to use: After the maps are created, after the legend opens or closes, and whenever the map changes size.
 * Expected outcome: An open legend sits beside the panel when it fits, otherwise under it. The band sits right of the
 *   panel, or of the legend when the legend is beside it, or of the open new-game panel when that reaches farther, and
 *   left of the zoom buttons; on a narrow map it spans the top of the map instead. A closed legend is left where it was.
 * Exceptions: None. Does nothing without `#canvas-container` or `#minimap-panel`.
 */
export function layoutMapChrome(): void {
  const map = document.getElementById('canvas-container');
  const panel = document.getElementById('minimap-panel');
  if (!map || !panel) return;
  const mapBox = map.getBoundingClientRect();
  const panelBox = panel.getBoundingClientRect();
  const panelRight = panelBox.right - mapBox.left;
  let leftObstacleRight = panelRight;

  const legend = document.getElementById('terrain-legend');
  if (legend && !legend.hidden) {
    const place = legendPopoverPosition({
      mapWidth: mapBox.width,
      panelRight,
      panelBottom: panelBox.bottom - mapBox.top,
      legendWidth: legend.offsetWidth,
    });
    legend.style.left = `${place.left}px`;
    legend.style.top = `${place.top}px`;
    if (place.beside) leftObstacleRight = place.left + legend.offsetWidth;
  }
  const dialog = document.getElementById('game-over-overlay');
  if (dialog && !dialog.classList.contains('hidden')) {
    leftObstacleRight = Math.max(leftObstacleRight, dialog.getBoundingClientRect().right - mapBox.left);
  }

  const band = document.getElementById('map-toast-band');
  if (!band) return;
  const zoomBox = document.querySelector('#main-map .leaflet-control-zoom')?.getBoundingClientRect();
  const span = toastBandSpan({
    mapWidth: mapBox.width,
    leftObstacleRight,
    rightObstacleLeft: zoomBox && zoomBox.width > 0 ? zoomBox.left - mapBox.left : mapBox.width,
  });
  band.style.left = `${span.left}px`;
  band.style.right = `${span.right}px`;
}
