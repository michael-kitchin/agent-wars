/**
 * H3 resolution of the strategic world map.
 *
 * Purpose: One shared value so strategic map, metadata, and briefing code do not each hard-code resolution 1.
 * When to use: Anywhere a res1 strategic cell is required.
 * Expected outcome: Always 1.
 * Exceptions: None.
 */
export const STRATEGIC_H3_RESOLUTION = 1;

/**
 * H3 resolution of the tactical battle grid.
 *
 * Purpose: One shared value so tactical snapshot, hover, and birth-cell code do not each hard-code resolution 4.
 * When to use: Anywhere a res4 tactical cell is required.
 * Expected outcome: Always 4.
 * Exceptions: None.
 */
export const TACTICAL_H3_RESOLUTION = 4;
