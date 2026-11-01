/**
 * The stored choice for drawing what AI commanders could see at planning time.
 *
 * Purpose: The new-game checkbox and the stored match setting share one parser.
 * When to use: Starting a match, and reading `sight_cues` back.
 * Expected outcome: Helpers do not read the database. Callers pass the value they already have.
 * Exceptions: None. This module does not import the main-process logger.
 */

/**
 * `game_config` key for the Sight cues checkbox.
 *
 * Purpose: A match remembers whether observed playback opens with sight lines.
 * When to use: Writing the row at match start, and reading it back.
 * Expected outcome: The string `sight_cues`.
 * Exceptions: None.
 */
export const SIGHT_CUES_CONFIG_KEY = 'sight_cues';

/**
 * `game_config` key for the units each AI seat saw last planning.
 *
 * Purpose: A beam is a new contact only when its target was not in this list.
 * When to use: Reading and writing that memory. A new match deletes the row.
 * Expected outcome: The string `sight_cue_seen_units`.
 * Exceptions: None.
 */
export const SIGHT_CUE_SEEN_UNITS_CONFIG_KEY = 'sight_cue_seen_units';

/**
 * Choice stored when a new game does not name one.
 *
 * Purpose: A fresh match shows sight lines while it is being observed.
 * When to use: `sightCuesForRequest` and the new-game checkbox.
 * Expected outcome: `true`.
 * Exceptions: None.
 */
export const DEFAULT_SIGHT_CUES = true;

/**
 * Choice used when a saved match has no row.
 *
 * Purpose: An old save keeps today's playback and does not add the opening stage.
 * When to use: `sightCuesFromStored`.
 * Expected outcome: `false`.
 * Exceptions: None.
 */
export const STORED_SIGHT_CUES_WHEN_MISSING = false;

/**
 * The choice to store when a match starts.
 *
 * Purpose: A boolean is stored as itself. Anything else stores on.
 * When to use: `resetGameForNewMatch` with the start payload.
 * Expected outcome: `false` only when the payload is the boolean `false`.
 * Exceptions: None.
 */
export function sightCuesForRequest(value: unknown): boolean {
  return typeof value === 'boolean' ? value : DEFAULT_SIGHT_CUES;
}

/**
 * The choice stored in `game_config`.
 *
 * Purpose: `'1'` is on. Anything else, including a missing row, is off.
 * When to use: After reading the `sight_cues` row.
 * Expected outcome: `true` only for the string `'1'`.
 * Exceptions: None.
 */
export function sightCuesFromStored(value: unknown): boolean {
  if (value === '1') return true;
  if (value === '0') return false;
  return STORED_SIGHT_CUES_WHEN_MISSING;
}
