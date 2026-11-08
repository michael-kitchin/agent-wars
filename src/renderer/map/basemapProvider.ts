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
   * HTML a caller could show as a map credit.
   *
   * Contract: The map does not display this. The elevation and Natural Earth credits stay in THIRD-PARTY-NOTICES.md, so
   *   the hillshade entry keeps an empty string.
   * When to use: Read only if a future surface is meant to print a credit. Do not pass it to a Leaflet attribution
   *   control.
   * Expected outcome: An empty string for the hillshade. A non-empty value would be a credit the map must still not
   *   print.
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
    id: 'offline_hillshade',
    displayName: 'Hillshade',
    urlTemplate: 'agentwars-basemap://tiles/{gameMapId}/{z}/{x}/{y}.webp',
    attributionHtml: '',
    maxZoom: 16,
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
