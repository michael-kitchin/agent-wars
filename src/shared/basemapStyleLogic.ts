/**
 * Pure helpers for raster basemap remount skip and Wargame tile-pane CSS filters.
 */

/**
 * CSS filter applied to Leaflet tile panes when the Atlas terrain style is active.
 *
 * Purpose: Distinguishes Atlas from Default without `hue-rotate`, which turns Esri ocean cyan into magenta.
 * When to use: Pass the return value of `basemapCssFilterForStyle` into the map tile-pane filter API.
 * Expected outcome: Exact string `saturate(0.78) contrast(1.2) brightness(1.03)`.
 * Exceptions: None.
 */
export const ATLAS_BASEMAP_CSS_FILTER = 'saturate(0.78) contrast(1.2) brightness(1.03)';

/**
 * CSS filter applied to Leaflet tile panes when the Scientific terrain style is active.
 *
 * Purpose: Flattens the shared Esri hillshade to grayscale so Scientific is distinct from Default and Atlas.
 * When to use: Pass the return value of `basemapCssFilterForStyle` into the map tile-pane filter API.
 * Expected outcome: Exact string `grayscale(1) contrast(1.18) brightness(1.08)`.
 * Exceptions: None.
 */
export const SCIENTIFIC_BASEMAP_CSS_FILTER = 'grayscale(1) contrast(1.18) brightness(1.08)';

/**
 * CSS filter applied to Leaflet tile panes when the Wargame terrain style is active.
 *
 * Purpose: Darkens the shared Esri hillshade without a separate tile host or API key.
 * When to use: Pass the return value of `basemapCssFilterForStyle` into the map tile-pane filter API.
 * Expected outcome: Exact string `invert(1) hue-rotate(180deg)`.
 * Exceptions: None.
 */
export const WARGAME_BASEMAP_CSS_FILTER = 'invert(1) hue-rotate(180deg)';

/**
 * Whether Leaflet raster layers should be torn down and recreated for a provider id.
 *
 * Purpose: Style switches that keep the same XYZ host must not flash-reload tiles.
 * When to use: Via `basemapNeedsRemountForMaps`, or in tests of the single-map predicate.
 * Expected outcome: `true` when `currentId` is null or differs from `nextId`; `false` when they are equal.
 * Exceptions: None.
 */
export function basemapNeedsRemount(currentId: string | null, nextId: string): boolean {
  return currentId !== nextId;
}

/**
 * Whether main and minimap raster layers should be recreated together for a provider id.
 *
 * Purpose: The two maps can fall back independently; skipping remount based only on the main map would leave a stale minimap.
 * When to use: In `setMainBasemapByProviderId` before mounting either map.
 * Expected outcome: `false` only when both maps already show `nextProviderId`; `true` if either is null or different.
 * Exceptions: None.
 */
export function basemapNeedsRemountForMaps(
  mainProviderId: string | null,
  miniProviderId: string | null,
  nextProviderId: string
): boolean {
  return basemapNeedsRemount(mainProviderId, nextProviderId) || basemapNeedsRemount(miniProviderId, nextProviderId);
}

/**
 * CSS filter string for a terrain visual style id.
 *
 * Purpose: Named styles share one hillshade host; tile-pane filters are what make Atlas, Scientific, and Wargame readable as different looks.
 * When to use: On map init and whenever the terrain style select changes.
 * Expected outcome: The matching exported filter constant, or `''` for `'default'` and unknown ids.
 * Exceptions: None. Unknown or empty ids are treated as Default (no filter).
 */
export function basemapCssFilterForStyle(styleId: string): string {
  if (styleId === 'wargame') return WARGAME_BASEMAP_CSS_FILTER;
  if (styleId === 'atlas') return ATLAS_BASEMAP_CSS_FILTER;
  if (styleId === 'scientific') return SCIENTIFIC_BASEMAP_CSS_FILTER;
  return '';
}
