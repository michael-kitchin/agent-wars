/**
 * The Fortified row of the terrain legend.
 *
 * Purpose: The tick pattern is not a terrain kind, but the map key still names it.
 * When to use: After the Rubble row in `renderTerrainLegend`.
 * Expected outcome: One row whose swatch is a small hexagon with four ticks on every edge, in the human seat's color.
 * Exceptions: None. A canvas without a 2D context still shows the label.
 */

import { FORTIFICATION_TICKS_PER_EDGE } from '../../shared/fortificationTickGeometry';
import { FORTIFIED_LEGEND_LABEL } from '../../shared/fortificationRules';
import { SEAT_PALETTES } from '../../shared/seatPalette';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { drawFortificationTicks } from './fortificationTickDrawing';
import { paletteForCurrentOwner } from './ownerColors';
import { appendLegendRow, applyLegendSwatchChrome } from './terrainLegendRow';

/**
 * Appends the Fortified legend row.
 *
 * Purpose: The pattern key follows Rubble.
 * When to use: At the end of `renderTerrainLegend`.
 * Expected outcome: One row labeled Fortified. The swatch is an 18 by 12 hexagon of radius 5.5, with four ticks on every edge. That is the full pattern. A partial hex on the map uses fewer ticks on those same edges.
 * Exceptions: None.
 */
export function appendFortifiedLegendRow(container: HTMLElement): void {
  const swatch = document.createElement('canvas');
  swatch.width = 18;
  swatch.height = 12;
  applyLegendSwatchChrome(swatch);
  const ctx = swatch.getContext('2d');
  if (ctx) {
    const points = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (index * Math.PI) / 3;
      points.push({ x: 9 + Math.sin(angle) * 5.5, y: 6 - Math.cos(angle) * 5.5 });
    }
    drawFortificationTicks(ctx, {
      points,
      cornerCount: 6,
      ticksPerEdge: FORTIFICATION_TICKS_PER_EDGE,
      color: paletteForCurrentOwner(HUMAN_SEAT_ID)?.map ?? SEAT_PALETTES[0]!.map,
      tickLengthPx: 2,
      lineWidthPx: 1,
    });
  }
  appendLegendRow(container, swatch, FORTIFIED_LEGEND_LABEL);
}
