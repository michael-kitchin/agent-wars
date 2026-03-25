/**
 * Raster basemap definitions for Leaflet (URL template, attribution, subdomains).
 * Order in RASTER_BASEMAP_ORDER is the runtime fallback sequence on tile load failures.
 * Swap or extend providers here without touching map wiring (see worldLeafletMap.ts).
 *
 * Providers are chosen for variety (color vs grayscale vs dark) while avoiding label layers;
 * political boundaries may appear faintly on some OSM-derived rasters at high zoom.
 */

/** One XYZ raster provider usable with L.tileLayer. */
export interface RasterBasemapDefinition {
  /** Stable id for logs and terrain-style mapping. */
  id: string;
  /** Human-readable label (settings UI / debugging). */
  displayName: string;
  urlTemplate: string;
  /** HTML attribution snippet (shown on the main map only; keep terms-compliant). */
  attributionHtml: string;
  /** Leaflet tileLayer `subdomains` option, if any. */
  subdomains?: string;
  maxZoom?: number;
  minZoom?: number;
}

/**
 * Full fallback chain: primary for a given terrain style is selected by id; on tile errors we try
 * the next entries in this array.
 */
export const RASTER_BASEMAP_ORDER: readonly RasterBasemapDefinition[] = [
  {
    id: 'carto_light_nolabels',
    displayName: 'Carto Positron (no labels)',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}.png',
    attributionHtml:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
    minZoom: 0,
  },
  {
    id: 'carto_voyager_nolabels',
    displayName: 'Carto Voyager (no labels)',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
    attributionHtml:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
    minZoom: 0,
  },
  {
    id: 'carto_dark_nolabels',
    displayName: 'Carto Dark (no labels)',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}.png',
    attributionHtml:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
    minZoom: 0,
  },
  {
    id: 'esri_world_shaded_relief',
    displayName: 'Esri World Shaded Relief',
    urlTemplate:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attributionHtml: 'Tiles &copy; Esri &mdash; Source: Esri, Garmin, GEBCO, NOAA NGDC, and other contributors',
    maxZoom: 13,
    minZoom: 0,
  },
  {
    id: 'osm_mapnik',
    displayName: 'OpenStreetMap Standard',
    urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attributionHtml: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19,
    minZoom: 0,
  },
];

/**
 * Returns the ordered list of basemap providers (primary first for a given start index, then fallbacks).
 */
export function getRasterBasemapChain(): readonly RasterBasemapDefinition[] {
  return RASTER_BASEMAP_ORDER;
}

/**
 * Resolves a stable provider id to the first index in the fallback chain used when mounting tiles.
 * Unknown ids map to 0 (light Carto) so the map always gets a valid starting layer.
 */
export function getRasterBasemapChainStartIndex(providerId: string): number {
  const i = RASTER_BASEMAP_ORDER.findIndex((d) => d.id === providerId);
  return i >= 0 ? i : 0;
}
