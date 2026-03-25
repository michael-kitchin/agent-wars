/**
 * Raster basemap definitions for Leaflet (URL template, attribution, subdomains).
 * Order in BASEMAP_PROVIDER_CHAIN is the runtime fallback sequence on tile load failures.
 * Swap or extend providers here without touching map wiring (see worldLeafletMap.ts).
 */

/** One XYZ raster provider usable with L.tileLayer. */
export interface RasterBasemapDefinition {
  /** Stable id for logs and future persisted preferences. */
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
 * Default stack: Carto Positron no-labels (minimal clutter, keyless), then OSM standard as backup.
 * OpenFreeMap and MapLibre vector styles need a different integration path; document in comments when added.
 */
export const BASEMAP_PROVIDER_CHAIN: readonly RasterBasemapDefinition[] = [
  {
    id: 'carto_positron_nolabels',
    displayName: 'Carto Positron (no labels)',
    urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/light_nolabels/{z}/{x}/{y}.png',
    attributionHtml:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
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
 * Returns the ordered list of basemap providers (primary first, then fallbacks).
 */
export function getRasterBasemapChain(): readonly RasterBasemapDefinition[] {
  return BASEMAP_PROVIDER_CHAIN;
}
