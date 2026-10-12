/**
 * March-preview reasons that name why a destination was refused.
 *
 * Purpose: The blocked-hover copy matches these sentences exactly, so a later wording change cannot be mistaken for terrain.
 * When to use: The preview that refuses the hover, and the copy that turns that refusal into `Blocked:`.
 * Expected outcome: One stable sentence per refusal. The player-facing terrain word is chosen by the copy, not by this sentence.
 * Exceptions: None.
 */

/**
 * A battle cell the selected unit cannot enter.
 *
 * Purpose: Distinguishes a terrain block from a cell that is merely out of reach.
 * When to use: When the battle march plan cannot reach the hovered cell and that cell blocks this unit.
 * Expected outcome: The hover copy names the hovered terrain.
 * Exceptions: None.
 */
export const TACTICAL_DESTINATION_BLOCKS_ENTRY_REASON = 'This unit cannot enter that terrain.';

/**
 * A world hex where a naval unit cannot berth.
 *
 * Purpose: Distinguishes an inland hex from a water hex that simply has no route.
 * When to use: When naval occupancy fails for the hovered hex.
 * Expected outcome: The hover copy names the hovered terrain.
 * Exceptions: None.
 */
export const NAVAL_DESTINATION_NOT_OCCUPIABLE_REASON = 'Naval destination is not occupiable.';

/**
 * A destination the unit may enter, with no route.
 *
 * Purpose: Keeps every non-entry failure on one label.
 * When to use: When a strategic march preview has no other, more specific reason.
 * Expected outcome: The hover copy says `Blocked: Unreachable`.
 * Exceptions: None.
 */
export const STRATEGIC_DESTINATION_UNREACHABLE_REASON = 'Destination is unreachable.';
