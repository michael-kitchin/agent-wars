/**
 * SVG filters that recolor gray land tiles into a theme.
 *
 * Purpose: The tiles stay gray. Contrast stays on the images. This filter supplies the theme color.
 * When to use: Before applying a theme, and when building the underlay's filter string.
 * Expected outcome: One filter per theme, referenced by `url(#map-theme-land-<id>)`.
 * Exceptions: None. A missing document body skips the insert.
 */

import { LAND_TILE_CONTRAST, MAP_THEMES, type MapTheme, landTransferFunctions } from '../../shared/mapThemes';

const SVG_ID = 'map-theme-filters';

/**
 * Inserts the land-color filters once.
 *
 * Purpose: The tile pane references these filters by id. Creating them twice would duplicate ids.
 * When to use: Before the first `landTileFilterCss` is assigned to a pane.
 * Expected outcome: One hidden SVG in `document.body`, with one `feComponentTransfer` per theme.
 *   Later calls do nothing. There is no alpha function, so transparent water stays transparent.
 * Exceptions: None. No body means no insert.
 */
export function ensureMapThemeSvgFilters(): void {
  if (document.getElementById(SVG_ID)) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = SVG_ID;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  for (const theme of MAP_THEMES) {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = `map-theme-land-${theme.id}`;
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const transfer = document.createElementNS('http://www.w3.org/2000/svg', 'feComponentTransfer');
    const functions = landTransferFunctions(theme);
    for (const [name, channel] of [
      ['feFuncR', functions.r],
      ['feFuncG', functions.g],
      ['feFuncB', functions.b],
    ] as const) {
      const fn = document.createElementNS('http://www.w3.org/2000/svg', name);
      fn.setAttribute('type', 'linear');
      fn.setAttribute('slope', String(channel.slope));
      fn.setAttribute('intercept', String(channel.intercept));
      transfer.appendChild(fn);
    }
    filter.appendChild(transfer);
    svg.appendChild(filter);
  }
  document.body.appendChild(svg);
}

/**
 * CSS filter that recolors a tile pane.
 *
 * Purpose: The stylesheet already contrasts the tile images. This is only the color step.
 * When to use: As the tile pane's `style.filter`.
 * Expected outcome: `url(#map-theme-land-<id>)`.
 * Exceptions: None. The filter element must already exist.
 */
export function landTileFilterCss(theme: MapTheme): string {
  return `url(#map-theme-land-${theme.id})`;
}

/**
 * CSS filter for the vector land underlay.
 *
 * Purpose: The underlay is not a tile image, so the stylesheet contrast does not reach it.
 * When to use: As the underlay pane's `style.filter`.
 * Expected outcome: Contrast first, then the theme color. CSS filters run left to right.
 * Exceptions: None.
 */
export function landUnderlayFilterCss(theme: MapTheme): string {
  return `contrast(${LAND_TILE_CONTRAST}) ${landTileFilterCss(theme)}`;
}
