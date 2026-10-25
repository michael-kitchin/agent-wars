/**
 * Places the terrain legend and the toast band among the chrome at the top of the map. The rules are in
 * `src/shared/mapChromePlacement.ts`; this module measures the page and applies them.
 *
 * Purpose: The legend's width comes from the page, so it is measured, not assumed. The toast band's right edge is the map's.
 * When to use: Through `layoutMapChrome`.
 * Expected outcome: Inline `left` and `top` on `#terrain-legend`. The message band gets `left: auto`, a pixel `width`,
 *   and `right`. While the new-game setup panel is open over the map, the band keeps clear of it unless the open
 *   message toast's tab row is wider than the gap.
 * Exceptions: None; missing elements are skipped.
 */
import { legendPopoverPosition, messageToastBandWidth, toastBandSpan } from '../../shared/mapChromePlacement';

/**
 * Moves the open legend beside or under the minimap panel, then fits the toast band between the chrome on the left
 * and the map's right edge.
 *
 * Purpose: Keeps the legend on the map and the message band clear of the panel and the legend, with the same right inset
 *   whether the console is open or collapsed. The update toast anchors itself at the lower right and is not placed here.
 * When to use: After the maps are created, after the legend opens or closes, and whenever the map changes size.
 * Expected outcome: An open legend sits beside the panel when it fits, otherwise under it. The band's width is
 *   `messageToastBandWidth`: the gap beside that chrome, or one third of the map, whichever is smaller, unless the
 *   open message toast's tab row is wider. It stays anchored on the right inset and inside the map's insets. Switching
 *   tabs does not change that width. On a narrow map, or when the tab row needs it, the band may overlap the left chrome.
 *   A closed legend is left where it was.
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
  let tabRowOuterWidth = messageTabRowOuterWidth();
  let width = messageToastBandWidth({ mapWidth: mapBox.width, available, tabRowOuterWidth });
  band.style.left = 'auto';
  band.style.right = `${span.right}px`;
  band.style.width = `${width}px`;
  const bar = document.querySelector('#ai-strategy-toast:not(.hidden) .ai-strategy-tab-bar');
  if (bar instanceof HTMLElement && bar.scrollWidth > bar.clientWidth) {
    tabRowOuterWidth += bar.scrollWidth - bar.clientWidth;
    width = messageToastBandWidth({ mapWidth: mapBox.width, available, tabRowOuterWidth });
    band.style.width = `${width}px`;
  }
}

/**
 * The border-box width the message toast needs so its tab row stays on one line.
 *
 * Purpose: `layoutMapChrome` grows the band past one third of the map only when those tabs need it.
 * When to use: While `#ai-strategy-toast` is visible. A hidden toast has no measurable row.
 * Expected outcome: The sum of the tab buttons' border boxes, plus the dismiss control, the toast's horizontal
 *   padding, gap, and border, rounded up. 0 when the toast is missing, hidden, or has no tab buttons. Button widths
 *   are measured directly so a stretched bar does not report the band's current width.
 * Exceptions: None.
 */
function messageTabRowOuterWidth(): number {
  const toast = document.getElementById('ai-strategy-toast');
  if (!(toast instanceof HTMLElement) || toast.classList.contains('hidden')) return 0;
  const bar = toast.querySelector('.ai-strategy-tab-bar');
  if (!(bar instanceof HTMLElement)) return 0;
  let buttonsWidth = 0;
  for (const button of bar.querySelectorAll('button')) {
    if (button instanceof HTMLElement) buttonsWidth += button.getBoundingClientRect().width;
  }
  if (buttonsWidth <= 0) return 0;
  const dismiss = document.getElementById('ai-strategy-toast-dismiss');
  const style = getComputedStyle(toast);
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const gap = Number.parseFloat(style.columnGap) || Number.parseFloat(style.gap) || 0;
  const border = (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0);
  const dismissWidth = dismiss instanceof HTMLElement ? dismiss.getBoundingClientRect().width : 0;
  return Math.ceil(buttonsWidth + dismissWidth + padding + gap + border);
}
