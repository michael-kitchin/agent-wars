/**
 * The Urban row of the terrain legend.
 *
 * Purpose: Urban is an overlay, so it is not one of the eight terrain kinds, but the map key still names it.
 * When to use: After the kind rows in `renderTerrainLegend`, and when painting an Urban tooltip chip.
 * Expected outcome: One opaque chip per map style, taken from that style's urban fill with the alpha removed.
 * Exceptions: None.
 */

import { appendLegendRow, applyLegendSwatchChrome } from './terrainLegendRow';

/**
 * Opaque Urban chips, one per map style.
 *
 * Purpose: The urban hex fill is translucent and would wash out on navy chrome.
 * When to use: The legend row and `.terrain-swatch` chips whose kind is `urban`.
 * Expected outcome: The solid form of that style's urban overlay fill.
 * Exceptions: An unknown style uses the default chip.
 */
const URBAN_SWATCH_COLOR: Readonly<Record<string, string>> = Object.freeze({
  default: '#827060',
  atlas: '#8d7a67',
  wargame: '#847061',
  scientific: '#897562',
});

/**
 * Returns the opaque Urban chip for one map style.
 *
 * Purpose: Tooltip chips and the legend row share the color that was active when they were drawn.
 * When to use: When assigning an Urban swatch background. Do not use this for hex fills.
 * Expected outcome: A hex color. An unknown style is the default chip.
 * Exceptions: None.
 */
export function urbanSwatchColor(styleId: string): string {
  return URBAN_SWATCH_COLOR[styleId] ?? URBAN_SWATCH_COLOR.default!;
}

/**
 * Appends the Urban legend row.
 *
 * Purpose: The eight kind rows come from the pipeline list. Urban follows them.
 * When to use: At the end of `renderTerrainLegend`.
 * Expected outcome: One row labeled Urban with the chip for `color`.
 * Exceptions: None.
 */
export function appendUrbanLegendRow(container: HTMLElement, color: string): void {
  const swatch = document.createElement('span');
  applyLegendSwatchChrome(swatch);
  swatch.style.background = color;
  appendLegendRow(container, swatch, 'Urban');
}
