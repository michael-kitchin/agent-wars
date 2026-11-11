/**
 * Fortification queue identity, cost multiplier, and player-facing sentences.
 *
 * Purpose: Production, tooltips, and the AI briefing share one spelling of the fortification item.
 * When to use: Any label or sentence about fortifying a city cell. Cost lookup stays in `fortificationCostPerCell`.
 * Expected outcome: Stable strings. Formatters return one sentence or one label fragment.
 * Exceptions: None.
 */

/** Queue and Keep-building value for one fortification. Not a unit type. */
export const FORTIFICATION_QUEUE_ITEM = 'fortification' as const;

/**
 * Infantry-cost multiplier for one fortified cell.
 *
 * Purpose: The price stays tied to the map's infantry cost.
 * When to use: `fortificationCostPerCell`.
 * Expected outcome: 1, so a cell costs the same as one infantry unit.
 * Exceptions: None.
 */
export const FORTIFICATION_COST_INFANTRY_MULTIPLIER = 1;

/** Select-option label for a fortification queue row. */
export const FORTIFICATION_QUEUE_ITEM_LABEL = 'Fortification';

/** Hex-tooltip label for the fortified-cell count. */
export const FORTIFIED_TOOLTIP_LABEL = 'Fortified';

/** Legend label for the tick pattern. */
export const FORTIFIED_LEGEND_LABEL = 'Fortified';

/** Cell-tooltip variant when the cell itself is fortified. */
export const FORTIFIED_CELL_VARIANT_LABEL = 'Fortified urban';

/** March-rejection sentence when a destination cell is fortified by another owner. */
export const FORTIFIED_CELL_BLOCKED_REASON = 'Enemy fortifications block that cell. Destroy them with fire first.';

/** Hover chip when a destination cell is fortified by another owner. */
export const FORTIFIED_CELL_BLOCKED_HOVER = 'Blocked: Fortified';

/** Rejection when a hex has no intact city cell left to fortify. */
export const FORTIFICATION_NOT_AVAILABLE_REASON = 'This hex has no intact city cell to fortify.';

/** Briefing column header for fortified / intact city cells. */
export const FORTIFIED_COLUMN_HEADER = 'Fortified';

/** Tactical-map legend fragment appended after the urban glyph. */
export const FORTIFIED_MAP_LEGEND_FRAGMENT = ', F/f fortified city cell (F = yours)';

/**
 * Formats the hex-tooltip value for fortified and intact city cells.
 *
 * Purpose: The tooltip states how much of the city is fortified.
 * When to use: After the Production line, when the fortified count is above 0.
 * Expected outcome: `N of M city cell` or `city cells`.
 * Exceptions: None.
 */
export function formatFortifiedTooltipValue(fortified: number, intactCityCells: number): string {
  const noun = intactCityCells === 1 ? 'city cell' : 'city cells';
  return `${fortified} of ${intactCityCells} ${noun}`;
}

/**
 * Formats how many city cells production fortified this turn.
 *
 * Purpose: The Updates section reports new fortifications the same way it reports deployments.
 * When to use: When the human seat fortified at least one cell.
 * Expected outcome: `1 city cell fortified.` or `N city cells fortified.`
 * Exceptions: None.
 */
export function formatFortificationsBuiltLine(count: number): string {
  return count === 1 ? '1 city cell fortified.' : `${count} city cells fortified.`;
}

/**
 * Formats the Hex Features fragment for a fortified count.
 *
 * Purpose: The AI briefing names fortifications beside the urban count.
 * When to use: When the explored fortified count is above 0.
 * Expected outcome: `N fortified`.
 * Exceptions: None.
 */
export function formatFortifiedFeaturePart(n: number): string {
  return `${n} fortified`;
}
