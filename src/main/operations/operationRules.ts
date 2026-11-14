/**
 * Limits for how many sea operations run and how far the engine searches for one.
 *
 * Purpose: The candidate search and the turn advance share one set of bounds.
 * When to use: When listing landings or deciding that a phase has lasted long enough.
 * Expected outcome: Fixed integers. Nothing in this file reads the database or the map.
 * Exceptions: None.
 */

/**
 * Active sea operations one seat may have on a small map.
 *
 * Purpose: Larger matches multiply this by `GAME_SIZE_MULTIPLIER`.
 * When to use: The launch loop, once per seat per turn.
 * Expected outcome: 1, before the size multiplier.
 * Exceptions: None.
 */
export const OPERATION_MAX_SEA_PER_SIZE = 1;

/**
 * Fewest ground units worth putting on ships.
 *
 * Purpose: A landing of one unit is not started, and a muster that never gathers two units is given up.
 * When to use: The candidate search and the muster timeout.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const OPERATION_MIN_GROUND_UNITS = 2;

/**
 * Seaports tested as a muster port.
 *
 * Purpose: The search stays bounded on a map with many ports.
 * When to use: After the ports nearest the ground units have been found, and again when a return picks a home port.
 * Expected outcome: 6.
 * Exceptions: None.
 */
export const OPERATION_MUSTER_CANDIDATE_LIMIT = 6;

/**
 * Farthest a ground unit marches to a muster port.
 *
 * Purpose: Units farther than this stay with the army.
 * When to use: The land-step search from the units and from each port.
 * Expected outcome: 8. A unit at exactly this many steps can still muster.
 * Exceptions: None.
 */
export const OPERATION_MUSTER_MAX_LAND_STEPS = 8;

/**
 * Cities tested for a sea route.
 *
 * Purpose: Pathfinding stops after this many cities even when more are known.
 * When to use: The candidate search, counting cities that have no route as well as cities that do.
 * Expected outcome: 8.
 * Exceptions: None.
 */
export const OPERATION_OBJECTIVE_TEST_LIMIT = 8;

/**
 * How many sea landings the menu letters can name.
 *
 * Purpose: The candidate search and the reply share one cap, and each row needs a letter.
 * When to use: The candidate search, after the city order is fixed, and when a letter is checked.
 * Expected outcome: 5. `OPERATION_OPTION_LETTERS` has the same length.
 * Exceptions: None.
 */
export const OPERATION_MENU_SIZE = 5;

/**
 * Letters for the rows of Operation Options, in row order.
 *
 * Purpose: The briefing and the reply name a row by the same letter.
 * When to use: Printing the table and reading a launch command.
 * Expected outcome: `A` through `E`. The length matches `OPERATION_MENU_SIZE`.
 * Exceptions: None.
 */
export const OPERATION_OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

/**
 * Turns in `muster` before going with whoever has arrived, or giving up.
 *
 * Purpose: A force that never gathers does not wait forever.
 * When to use: When elapsed turns, which are zero on the tick the phase began, reach this value.
 * Expected outcome: 10. Enough units already at the port continue. Fewer than the minimum abandon the operation.
 * Exceptions: None.
 */
export const OPERATION_MUSTER_TIMEOUT_TURNS = 10;

/**
 * Turns in `transit` before the ships turn back.
 *
 * Purpose: A voyage that cannot reach the landing does not sail forever.
 * When to use: When elapsed turns reach this value, or the objective is no longer an enemy city and is not ours.
 * Expected outcome: 20. The ships enter `return`.
 * Exceptions: None.
 */
export const OPERATION_TRANSIT_TIMEOUT_TURNS = 20;

/**
 * Turns in `assault` before the operation ends.
 *
 * Purpose: A landing that cannot take the city stops receiving new orders from the operation.
 * When to use: When elapsed turns reach this value and the seat still does not control the objective.
 * Expected outcome: 6. The operation ends and the units keep the march they already have.
 * Exceptions: None.
 */
export const OPERATION_ASSAULT_TIMEOUT_TURNS = 6;
