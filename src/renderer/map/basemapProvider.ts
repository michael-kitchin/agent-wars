/**
 * Documents the `RasterBasemapDefinition` interface as a named contract surface (export interface RasterBasemapDefinition).

 * Purpose: Supports maintainability by documenting why `RasterBasemapDefinition` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export interface RasterBasemapDefinition {
    /**
   * Specifies the contract for the `id` member (id: string;).

   * Contract: Describes stable behavior for callers of `id` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
id: string;
    /**
   * Specifies the contract for the `displayName` member (displayName: string;).

   * Contract: Describes stable behavior for callers of `displayName` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
displayName: string;
    /**
   * Specifies the contract for the `urlTemplate` member (urlTemplate: string;).

   * Contract: Describes stable behavior for callers of `urlTemplate` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
urlTemplate: string;
    /**
   * Specifies the contract for the `attributionHtml` member (attributionHtml: string;).

   * Contract: Describes stable behavior for callers of `attributionHtml` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
attributionHtml: string;
    /**
   * Specifies the contract for the `subdomains` member (subdomains?: string;).

   * Contract: Describes stable behavior for callers of `subdomains` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
subdomains?: string;
    /**
   * Specifies the contract for the `maxZoom` member (maxZoom?: number;).

   * Contract: Describes stable behavior for callers of `maxZoom` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
maxZoom?: number;
    /**
   * Specifies the contract for the `minZoom` member (minZoom?: number;).

   * Contract: Describes stable behavior for callers of `minZoom` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
minZoom?: number;
}

/**
 * Documents the module-scope binding `RASTER_BASEMAP_ORDER` (RASTER_BASEMAP_ORDER: readonly RasterBasemapDefinition[]).

 * Purpose: Supports maintainability by documenting why `RASTER_BASEMAP_ORDER` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
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
 * Defines the `getRasterBasemapChain` function shape (export function getRasterBasemapChain(): readonly RasterBasemapDefinition[]).

 * Purpose: Supports maintainability by documenting why `getRasterBasemapChain` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRasterBasemapChain(): readonly RasterBasemapDefinition[] {
  return RASTER_BASEMAP_ORDER;
}

/**
 * Defines the `getRasterBasemapChainStartIndex` function shape (export function getRasterBasemapChainStartIndex(providerId: string): number).

 * Purpose: Supports maintainability by documenting why `getRasterBasemapChainStartIndex` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRasterBasemapChainStartIndex(providerId: string): number {
  const i = RASTER_BASEMAP_ORDER.findIndex((d) => d.id === providerId);
  return i >= 0 ? i : 0;
}
