/**
 * Fortification queue identity, cost multiplier, and player-facing sentences.
 *
 * Purpose: Production, tooltips, the turn report, and the AI briefing share one spelling of the fortification item.
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

/** Place name when a hex has no naming tooltip. */
export const FORTIFICATION_UNNAMED_PLACE = 'an unnamed hex';

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
 * Formats one strategic-map fortification loss line.
 *
 * Purpose: The turn report names the hex, the hits absorbed, and what remains.
 * When to use: Once per hex that lost fortifications on the strategic map this turn.
 * Expected outcome: A sentence. Remaining 0 reads `none remain`.
 * Exceptions: None.
 */
export function formatFortificationReportLine(args: {
  readonly placeName: string;
  readonly lost: number;
  readonly remaining: number;
}): string {
  const hitWord = args.lost === 1 ? 'hit' : 'hits';
  const remainingPhrase =
    args.remaining === 0 ? 'none remain' : args.remaining === 1 ? '1 remains' : `${args.remaining} remain`;
  return `Fortifications at ${args.placeName} absorbed ${args.lost} ${hitWord}; ${remainingPhrase}.`;
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
 * Joins place names with a serial comma.
 *
 * Purpose: Paused-queue sentences match other Updates lists without importing the toast module.
 * When to use: Only from `formatFortificationQueuePausedLine`.
 * Expected outcome: One name, `A and B`, or `A, B, and C`.
 * Exceptions: None.
 */
function joinPlaceNames(placeNames: readonly string[]): string {
  if (placeNames.length <= 1) return placeNames[0] ?? '';
  if (placeNames.length === 2) return `${placeNames[0]} and ${placeNames[1]}`;
  return `${placeNames.slice(0, -1).join(', ')}, and ${placeNames[placeNames.length - 1]}`;
}

/**
 * Formats the Updates line for queues paused because every city cell is fortified.
 *
 * Purpose: The player sees which hexes stopped building.
 * When to use: When at least one hex paused for that reason.
 * Expected outcome: One sentence naming the hex or hexes.
 * Exceptions: None.
 */
export function formatFortificationQueuePausedLine(placeNames: readonly string[]): string {
  if (placeNames.length === 1) {
    return `Every city cell at ${placeNames[0]} is fortified, so its build queue is paused.`;
  }
  return `Every city cell is fortified at ${joinPlaceNames(placeNames)}, so their build queues are paused.`;
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
