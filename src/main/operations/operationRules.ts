/**
 * Limits for how many sea operations run and how far the engine searches for one, and the engine's own launch rule.
 *
 * Purpose: The candidate search and the turn advance share one set of bounds.
 * When to use: When listing landings, deciding that a phase has lasted long enough, or deciding whether the engine may launch a row.
 * Expected outcome: Fixed integers and one pure rule. Nothing in this file reads the database or the map.
 * Exceptions: None.
 */

import type { OperationCandidate } from '../../shared/operationTypes';
import { logTrace } from '../logger';

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
 * Active campaign lifts one seat may have on a small map.
 *
 * Purpose: A campaign lift has its own slot, so it neither takes a raid's place nor waits behind one. Larger matches multiply this by `GAME_SIZE_MULTIPLIER`.
 * When to use: The campaign lift check, once per seat per turn.
 * Expected outcome: 1, before the size multiplier.
 * Exceptions: None.
 */
export const CAMPAIGN_LIFT_MAX_PER_SIZE = 1;

/**
 * Active air operations one seat may have on a small map.
 *
 * Purpose: Larger matches multiply this by `GAME_SIZE_MULTIPLIER`, separately from the sea cap.
 * When to use: The launch loop and the menu, once per seat per turn.
 * Expected outcome: 1, before the size multiplier.
 * Exceptions: None.
 */
export const OPERATION_MAX_AIR_PER_SIZE = 1;

/**
 * Air rows kept at the end of Operation Options when an air candidate exists.
 *
 * Purpose: Sea rows stay first, and a menu that also has air landings still fits in `OPERATION_MENU_SIZE`.
 * When to use: Combining the two candidate lists.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const OPERATION_MENU_AIR_ROWS = 2;

/**
 * Land rows kept at the front of Operation Options when a campaign city is available.
 *
 * Purpose: The land campaign uses most of the force, so its choices stay ahead of sea and air.
 * When to use: Combining the candidate lists for the commander's table.
 * Expected outcome: 2.
 * Exceptions: None.
 */
export const OPERATION_MENU_LAND_ROWS = 2;

/**
 * Turns in air `transit` before the infantry is unloaded and the operation ends.
 *
 * Purpose: A ferry or a drop that never finishes does not keep the air unit out of the fight forever.
 * When to use: When elapsed turns, which are zero on the tick the phase began, reach this value.
 * Expected outcome: 6. The infantry is unloaded on the carrier's hex and the operation ends.
 * Exceptions: None.
 */
export const OPERATION_AIR_TRANSIT_TIMEOUT_TURNS = 6;

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
 * Expected outcome: 10. A raid sails when the ships at the port can carry at least `SEA_RAID_TIMEOUT_MIN_SHARE` of its remaining troops and at least `OPERATION_MIN_GROUND_UNITS`; a campaign lift needs its own minimum. Otherwise the operation is abandoned.
 * Exceptions: None.
 */
export const OPERATION_MUSTER_TIMEOUT_TURNS = 10;

/**
 * Share of a raid's remaining troops the ships at the port must be able to carry when its muster times out.
 *
 * Purpose: A raid that sails with a fraction of its force is ground down on landing, so a short raid is called off instead.
 * When to use: `seaMusterReady`, for a raid whose muster has reached `OPERATION_MUSTER_TIMEOUT_TURNS`. Campaign lifts use their own `minGroundUnits`.
 * Expected outcome: 0.75. The raid sails when it can carry at least `ceil(0.75 × remaining troops)` and at least `OPERATION_MIN_GROUND_UNITS`.
 * Exceptions: None.
 */
export const SEA_RAID_TIMEOUT_MIN_SHARE = 0.75;

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

/**
 * Whether the engine may launch a sea or air row on its own.
 *
 * Purpose: The engine keeps its defender limit and never attacks a side the commander has an active pact with.
 * When to use: The offer clock and the engine's launch, on rows that are not land rows.
 * Expected outcome: False when the objective's holder is in `pactPartnerSeatIds`. Otherwise true when the row is clear or has at most `maxDefenders` defenders.
 * Exceptions: None.
 */
export function engineMayLaunchOperation(args: {
  readonly candidate: Pick<OperationCandidate, 'clear' | 'defenders'>;
  readonly maxDefenders: number;
  readonly objectiveHolderSeatId: string | null;
  readonly pactPartnerSeatIds: ReadonlySet<string>;
}): boolean {
  const pactHolder = args.objectiveHolderSeatId !== null && args.pactPartnerSeatIds.has(args.objectiveHolderSeatId);
  const mayLaunch = !pactHolder && (args.candidate.clear || args.candidate.defenders <= args.maxDefenders);
  logTrace('operationRules engineMayLaunchOperation', {
    objectiveHolderSeatId: args.objectiveHolderSeatId,
    pactHolder,
    mayLaunch,
  });
  return mayLaunch;
}
