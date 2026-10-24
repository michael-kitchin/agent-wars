/**
 * Chooses where a loaded Neutral ship sails.
 *
 * Purpose: Empty landing hexes are preferred. Within a pass, a farther hex is skipped once it cannot beat the best route already found.
 * When to use: `prepareNeutralTransportsForTurn` for a ship that is not already on a landing hex.
 * Expected outcome: One candidate, or null when none has a route.
 * Exceptions: None. A null grid distance or a null sailing time skips that candidate.
 */

/**
 * One hex where Neutral cargo may land.
 *
 * Contract: `occupiedBySeat` is true when any unit owned by a seat stands on the hex.
 * When to use: The candidate list passed to `chooseNeutralLandingTarget`.
 * Expected outcome: The hex is a landing hex under the debark rule.
 * Exceptions: None.
 */
export interface LandingCandidate {
  /**
   * The landing hex.
   *
   * Contract: An H3 index the caller already accepted as a landing hex.
   * When to use: Comparing distance and routes.
   * Expected outcome: A strategic hex id.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Whether a seat's unit stands on the hex.
   *
   * Contract: Neutral units do not count. A seat's unit does.
   * When to use: The empty pass runs before the occupied pass.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly occupiedBySeat: boolean;
}

/**
 * The chosen landing hex.
 *
 * Contract: The hex is one of the candidates. `occupiedBySeat` matches that candidate.
 * When to use: The ship's march order.
 * Expected outcome: A candidate that has a route.
 * Exceptions: None.
 */
export interface NeutralLandingChoice {
  /**
   * The hex the ship will sail toward.
   *
   * Contract: One of the candidates passed in.
   * When to use: The march destination.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Whether a seat's unit stands on the chosen hex.
   *
   * Contract: True only when the choice came from the occupied pass.
   * When to use: Deciding whether the route may pass enemies.
   * Expected outcome: The candidate's flag.
   * Exceptions: None.
   */
  readonly occupiedBySeat: boolean;
}

/**
 * Picks the landing hex for one loaded Neutral ship.
 *
 * Purpose: Empty hexes win when any of them has a route. Otherwise an occupied landing hex may.
 * When to use: Once per loaded ship that is not already on a landing hex.
 * Expected outcome: The best candidate, or null when no candidate has a route.
 * Exceptions: None.
 */
export function chooseNeutralLandingTarget(args: {
  readonly shipH3: string;
  readonly candidates: readonly LandingCandidate[];
  readonly gridDistance: (from: string, to: string) => number | null;
  readonly navalMovesPerTurn: number;
  readonly sailingTurns: (to: string) => number | null;
}): NeutralLandingChoice | null {
  const empty = args.candidates.filter((candidate) => !candidate.occupiedBySeat);
  return choosePass(args, empty) ?? choosePass(args, args.candidates.filter((candidate) => candidate.occupiedBySeat));
}

/**
 * The best candidate in one pass.
 *
 * Purpose: Grid distance orders the search, and the optimistic turn count stops it once a route is good enough.
 * When to use: The empty pass, then the occupied pass when the empty pass found nothing.
 * Expected outcome: The candidate with the fewest sailing turns, or null. Ties keep the earlier candidate.
 * Exceptions: None.
 */
function choosePass(
  args: {
    readonly shipH3: string;
    readonly gridDistance: (from: string, to: string) => number | null;
    readonly navalMovesPerTurn: number;
    readonly sailingTurns: (to: string) => number | null;
  },
  candidates: readonly LandingCandidate[]
): NeutralLandingChoice | null {
  const ordered = [...candidates].sort((left, right) => {
    const leftDistance = args.gridDistance(args.shipH3, left.h3Index);
    const rightDistance = args.gridDistance(args.shipH3, right.h3Index);
    return (leftDistance ?? Number.POSITIVE_INFINITY) - (rightDistance ?? Number.POSITIVE_INFINITY);
  });
  let best: { readonly candidate: LandingCandidate; readonly turns: number } | null = null;
  const moves = Math.max(1, args.navalMovesPerTurn);
  for (const candidate of ordered) {
    const distance = args.gridDistance(args.shipH3, candidate.h3Index);
    if (distance === null) continue;
    if (best && Math.ceil(distance / moves) > best.turns) break;
    const turns = args.sailingTurns(candidate.h3Index);
    if (turns === null) continue;
    if (!best || turns < best.turns) best = { candidate, turns };
  }
  return best ? { h3Index: best.candidate.h3Index, occupiedBySeat: best.candidate.occupiedBySeat } : null;
}
