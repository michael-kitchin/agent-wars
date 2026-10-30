/**
 * Credits queue identity and the sentences that name credits added to a treasury.
 *
 * Purpose: Production, the turn report, and later mercenary copy share one spelling of the credits item.
 * When to use: Any label or sentence about turning production into credits. The production-point price stays in `creditsItemCost`.
 * Expected outcome: Stable strings. `CREDITS_PER_ITEM` is the global infantry price, on every map.
 * Exceptions: None.
 */

import { GLOBAL_GAME_MAP } from './activeGameMap';

/** Queue and Keep-building value for one credits purchase. Not a unit type. */
export const CREDITS_QUEUE_ITEM = 'credits' as const;

/**
 * Infantry-cost multiplier for one credits purchase, in production points.
 *
 * Purpose: The production price stays tied to the active map's infantry cost.
 * When to use: `creditsItemCost`.
 * Expected outcome: 1, so one item costs the same production as one infantry unit.
 * Exceptions: None.
 */
export const CREDITS_ITEM_INFANTRY_MULTIPLIER = 1;

/**
 * Credits added to the treasury for one completed credits item.
 *
 * Purpose: A credit is worth the same on every map, so this uses the global infantry price, not the active map.
 * When to use: Production when a credits item completes, and any sentence that quotes that yield.
 * Expected outcome: 20.
 * Exceptions: None.
 */
export const CREDITS_PER_ITEM = GLOBAL_GAME_MAP.rules.infantryCost * CREDITS_ITEM_INFANTRY_MULTIPLIER;

/** Select-option label for a credits queue row. */
export const CREDITS_QUEUE_ITEM_LABEL = 'Credits';

/** Rejection when a hex has no production to turn into credits. */
export const CREDITS_NOT_AVAILABLE_REASON = 'This hex has no production to turn into credits.';

/**
 * Formats the Updates line for credits added to the human treasury.
 *
 * Purpose: The turn report names how many credits production added.
 * When to use: When the human seat gained at least one credit this turn.
 * Expected outcome: `1 credit added to the treasury.` or `N credits added to the treasury.`
 * Exceptions: None.
 */
export function formatCreditsAddedLine(count: number): string {
  return count === 1 ? '1 credit added to the treasury.' : `${count} credits added to the treasury.`;
}
