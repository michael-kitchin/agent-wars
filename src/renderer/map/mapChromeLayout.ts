/**
 * Places the terrain legend and the toast band among the chrome at the top of the map. The rules are in
 * `src/shared/mapChromePlacement.ts`; this module measures the page and applies them.
 *
 * Purpose: The legend's width comes from the page, so it is measured, not assumed. The toast band's right edge is the map's.
 * When to use: Through `layoutMapChrome`.
 * Expected outcome: Inline `left` and `top` on `#terrain-legend`. The message band gets `left: auto`, a pixel `width`,
 *   and `right`. While the new-game setup panel is open over the map, the band also keeps clear of it.
 * Exceptions: None; missing elements are skipped.
 */
import { legendPopoverPosition, toastBandSpan } from '../../shared/mapChromePlacement';

/**
 * Moves the open legend beside or under the minimap panel, then fits the toast band between the chrome on the left
 * and the map's right edge.
 *
 * Purpose: Keeps the legend on the map and the message band clear of the panel and the legend, with the same right inset
 *   whether the console is open or collapsed. The update toast anchors itself at the lower right and is not placed here.
 * When to use: After the maps are created, after the legend opens or closes, and whenever the map changes size.
 * Expected outcome: An open legend sits beside the panel when it fits, otherwise under it. The band's width is the gap
 *   beside that chrome, or one third of the map, whichever is smaller, anchored on the right inset. A longer message
 *   does not change that width. On a narrow map the message band may overlap the left chrome and still stays within one third
 *   of the map. A closed legend is left where it was.
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
  const span = toastBandSpan({
    mapWidth: mapBox.width,
    leftObstacleRight,
    rightObstacleLeft: mapBox.width,
  });
  const available = mapBox.width - span.left - span.right;
  const width = Math.max(0, Math.min(available, mapBox.width / 3));
  band.style.left = 'auto';
  band.style.right = `${span.right}px`;
  band.style.width = `${width}px`;
}
