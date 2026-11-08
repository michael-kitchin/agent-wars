/**
 * Paints the active theme onto the map.
 *
 * Purpose: One call updates the water, the land, the grid, the coastline, the borders, and the place names.
 * When to use: After the maps exist, and again when the legend changes the theme.
 * Expected outcome: Both maps show the active theme. Tiles stay mounted.
 * Exceptions: None. A missing pane is skipped by the layer it belongs to.
 */

import { getActiveMapTheme } from './activeMapTheme';
import { applyAdminBorderTheme } from './adminBorderLayers';
import { applyBasemapTheme } from './basemapLayer';
import { applyCoastlineTheme } from './coastlineLayers';
import { setMapLabelTheme } from './mapLabelLayer';
import { ensureMapThemeSvgFilters } from './mapThemeFilters';

/**
 * Applies the active theme to every surface that exists.
 *
 * Purpose: Init and the legend share this, so a new surface is added in one place.
 * When to use: After `initWorldLeafletMaps`, and from the legend callback before the redraw.
 * Expected outcome: Filters exist. The basemap, the coastline, the borders, and the place names use the active theme.
 * Exceptions: None.
 */
export function applyActiveMapTheme(): void {
  ensureMapThemeSvgFilters();
  const theme = getActiveMapTheme();
  applyBasemapTheme(theme);
  applyCoastlineTheme(theme);
  applyAdminBorderTheme(theme);
  setMapLabelTheme(theme);
}
