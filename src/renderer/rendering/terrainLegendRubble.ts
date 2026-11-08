/**
 * The Rubble row of the terrain legend.
 *
 * Purpose: Rubble is an overlay, so it is not one of the eight terrain kinds, but the map key still names it.
 * When to use: After the Urban row in `renderTerrainLegend`, and when painting a Rubble tooltip chip.
 * Expected outcome: One opaque Urban-brown chip per map style, with a dark-red crosshatch.
 * Exceptions: None.
 */

import type { HexPaletteId } from '../../shared/mapThemes';
import { rubbleSwatchBackgroundImage } from '../../shared/terrainSwatchHtml';
import { appendLegendRow, applyLegendSwatchChrome } from './terrainLegendRow';
import { urbanSwatchColor } from './terrainLegendUrban';

/**
 * Paints one Rubble chip.
 *
 * Purpose: Tooltip chips and the legend row share the fill and hatch that were active when they were drawn.
 * When to use: When assigning a Rubble swatch background. Do not use this for hex fills.
 * Expected outcome: The opaque Urban brown for `styleId`, plus the shared crosshatch. An unknown style uses the default brown.
 * Exceptions: None.
 */
export function applyRubbleSwatchPaint(element: HTMLElement, paletteId: HexPaletteId): void {
  element.style.background = '';
  element.style.backgroundColor = urbanSwatchColor(paletteId);
  element.style.backgroundImage = rubbleSwatchBackgroundImage();
  element.style.backgroundRepeat = 'repeat';
}

/**
 * Appends the Rubble legend row.
 *
 * Purpose: The eight kind rows come from the pipeline list. Urban follows them, and Rubble follows Urban.
 * When to use: At the end of `renderTerrainLegend`, after `appendUrbanLegendRow`.
 * Expected outcome: One row labeled Rubble with the hatched chip for `styleId`.
 * Exceptions: None.
 */
export function appendRubbleLegendRow(container: HTMLElement, paletteId: HexPaletteId): void {
  const swatch = document.createElement('span');
  applyLegendSwatchChrome(swatch);
  applyRubbleSwatchPaint(swatch, paletteId);
  appendLegendRow(container, swatch, 'Rubble');
}
