/**
 * The shapes of the posture fit advice.
 *
 * Purpose: The fit rules, the Fit lines, and the attention flag share one description of each enemy's fit.
 * When to use: Import the types from here wherever the posture advice is built or read.
 * Expected outcome: Type declarations only.
 * Exceptions: None.
 */

import type { Posture } from '../../shared/postureTypes';

/**
 * What the fit rules need to know about one enemy.
 *
 * Purpose: One shape serves the fit list and the fit line.
 * When to use: As the argument of `postureFitsFor`, and as part of a `PostureFitRow`.
 * Expected outcome: Plain values.
 * Exceptions: None.
 */
export interface PostureFitFacts {
  /**
   * The land steps from the enemy's home to the nearest force of the seat's ground units.
   *
   * Contract: The land steps to the `landForce`-th nearest own ground unit that is not embarked, or null when `landForce` is 0 or fewer than `landForce` such units are within `CAMPAIGN_REACH_LIMIT_STEPS`.
   * When to use: Choosing between overland and the sea postures, and the reach text of the Fit line.
   * Expected outcome: A non-negative integer or null.
   * Exceptions: None.
   */
  readonly landSteps: number | null;
  /**
   * The size of the force `landSteps` measures.
   *
   * Contract: The smaller of `CAMPAIGN_ASSAULT_MIN_UNITS` and the seat's own ground units that are not embarked. 0 when the seat has none.
   * When to use: The reach text of the Fit line.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly landForce: number;
  /**
   * Whether the seat could sail a force to the enemy's home.
   *
   * Contract: True when the seat holds an embark-legal port and the home has a city hex with a landing. No route is measured.
   * When to use: Choosing between maritime and strangle.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly seaReachable: boolean;
  /**
   * The enemy's infantry and armor standing on its home hexes, from what the seat sees.
   *
   * Contract: A non-negative integer.
   * When to use: The blitz limit and the required force for a landing.
   * Expected outcome: A count.
   * Exceptions: None.
   */
  readonly garrison: number;
  /**
   * The most ground units a maritime posture could land at once.
   *
   * Contract: The smaller of twice the naval cap and the maritime lift share of the seat's ground units.
   * When to use: Judging whether a landing can beat the garrison.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly maritimeCapacity: number;
}

/**
 * One active enemy's fit, with the facts it came from.
 *
 * Purpose: The Fit line and the attention flag read the same decision.
 * When to use: Each row of a `PostureFitReport`.
 * Expected outcome: Plain values.
 * Exceptions: None.
 */
export interface PostureFitRow {
  /**
   * The enemy's seat id.
   *
   * Contract: A seat id of an active enemy.
   * When to use: Matching the holder of a campaign target.
   * Expected outcome: Compared as is.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * The name shown for the enemy.
   *
   * Contract: Its home region name, or its seat id when it has none.
   * When to use: The Fit line and the attention flag.
   * Expected outcome: Printed as is.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * Whether the seat has an active pact with the enemy.
   *
   * Contract: A boolean.
   * When to use: The `(active pact)` mark.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly pactPartner: boolean;
  /**
   * What the fit rules were given.
   *
   * Contract: The facts `fits` was decided from.
   * When to use: The Fit line's reach text.
   * Expected outcome: Plain values.
   * Exceptions: None.
   */
  readonly facts: PostureFitFacts;
  /**
   * The postures that fit, best first.
   *
   * Contract: The result of `postureFitsFor(facts)`.
   * When to use: The Fit line and the attention flag.
   * Expected outcome: A non-empty list.
   * Exceptions: None.
   */
  readonly fits: readonly Posture[];
}

/**
 * The Posture section's advice for one seat.
 *
 * Purpose: One build serves the Fit lines and the attention flag.
 * When to use: Returned by `buildPostureFitReport`.
 * Expected outcome: The Ships line and one row per active enemy in seat order.
 * Exceptions: None.
 */
export interface PostureFitReport {
  /**
   * The Ships line.
   *
   * Contract: The output of `postureShipsLine`.
   * When to use: First of the Posture section's advice lines.
   * Expected outcome: One bullet.
   * Exceptions: None.
   */
  readonly shipsLine: string;
  /**
   * One row per active enemy.
   *
   * Contract: In seat order.
   * When to use: The Fit lines and the attention flag.
   * Expected outcome: A list, empty when no enemy is active.
   * Exceptions: None.
   */
  readonly rows: readonly PostureFitRow[];
}
