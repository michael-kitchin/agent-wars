/**
 * The column of map-mode buttons beside the minimap: Weather and Tech choose the map view, Control and Production are
 * disabled placeholders in the markup, and Legend opens or closes the terrain legend.
 *
 * Purpose: Keeps the buttons, the stored view, and the legend in step.
 * When to use: `wireMapModeColumn` once at startup.
 * Expected outcome: Exactly one of Weather and Tech reads as pressed, and Legend reads as pressed while the legend is
 *   open.
 * Exceptions: None; missing elements are skipped.
 */
import type { MapViewMode } from '../../shared/mapViewMode';
import { layoutMapChrome } from './mapChromeLayout';
import { getMapViewMode, setMapViewMode } from './mapViewModeState';

/**
 * Sets each button's pressed state from the stored view and the legend.
 *
 * Purpose: The buttons are the only sign of which view is on, so they must never disagree with it.
 * When to use: After the view changes or the legend opens or closes.
 * Expected outcome: `aria-pressed` on Weather and Tech matches the stored view; `aria-pressed` and `aria-expanded` on
 *   Legend match whether `#terrain-legend` is shown.
 * Exceptions: None.
 */
function syncMapModeColumn(): void {
  const mode = getMapViewMode();
  document.getElementById('map-mode-weather')?.setAttribute('aria-pressed', String(mode === 'weather'));
  document.getElementById('map-mode-tech')?.setAttribute('aria-pressed', String(mode === 'tech'));
  const legendOpen = document.getElementById('terrain-legend')?.hidden === false;
  const legendToggle = document.getElementById('map-legend-toggle');
  legendToggle?.setAttribute('aria-pressed', String(legendOpen));
  legendToggle?.setAttribute('aria-expanded', String(legendOpen));
}

/**
 * Switches the map to a view, unless it is already showing.
 *
 * Purpose: The view decides the terrain fill, the hex codes, and the status icons, which the canvas draws.
 * When to use: From the Weather and Tech buttons.
 * Expected outcome: The view is stored, the buttons follow, and the map is redrawn.
 * Exceptions: None.
 */
function chooseMapView(mode: MapViewMode, requestRedraw: () => void): void {
  if (getMapViewMode() === mode) return;
  setMapViewMode(mode);
  syncMapModeColumn();
  requestRedraw();
}

/**
 * Opens the terrain legend, or closes it if it is open.
 *
 * Purpose: The legend is a popover now, closed until the player asks for it.
 * When to use: From the Legend button.
 * Expected outcome: The legend shows or hides, the button follows, and the legend and the toast band are placed again.
 * Exceptions: None.
 */
function toggleTerrainLegend(): void {
  const legend = document.getElementById('terrain-legend');
  if (!legend) return;
  legend.hidden = !legend.hidden;
  syncMapModeColumn();
  layoutMapChrome();
}

/**
 * Wires the Weather, Tech, and Legend buttons.
 *
 * Purpose: The mode column's single setup point.
 * When to use: Once at startup, after the maps and the legend are built.
 * Expected outcome: Clicks change the view or the legend, and the buttons show the session's starting state.
 * Exceptions: None.
 */
export function wireMapModeColumn(requestRedraw: () => void): void {
  document.getElementById('map-mode-weather')?.addEventListener('click', () => chooseMapView('weather', requestRedraw));
  document.getElementById('map-mode-tech')?.addEventListener('click', () => chooseMapView('tech', requestRedraw));
  document.getElementById('map-legend-toggle')?.addEventListener('click', toggleTerrainLegend);
  syncMapModeColumn();
}
