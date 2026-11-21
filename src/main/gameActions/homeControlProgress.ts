/**
 * Counts a home's original urban cells two ways: those one side holds, and those its owner has lost.
 *
 * Purpose: The knockout rule, the `outBy` credit, and the strategic briefing read the same counts, so they cannot disagree.
 * When to use: End-of-turn outcome and the knockout status builder.
 * Expected outcome: Pure calculators over the hexes, control map, and baseline callback the caller passes.
 * Exceptions: None. The baseline callback's exceptions propagate.
 */

import { logTrace } from '../logger';

/**
 * Totals from one pass over a home's hexes.
 *
 * Purpose: Both counts walk the home once with a different test for which controllers match.
 * When to use: The return value of `countHomeHexes`.
 * Expected outcome: Matched counts never exceed totals.
 * Exceptions: None.
 */
type HomeHexCounts = {
  /**
   * Original urban cells in home hexes whose controller matched.
   *
   * Contract: A non-negative integer no larger than `totalUrbanCells`.
   * When to use: The held or lost cell count.
   * Expected outcome: Sum of the baseline callback over matched hexes.
   * Exceptions: None.
   */
  readonly matchedUrbanCells: number;
  /**
   * Original urban cells in every home hex.
   *
   * Contract: The sum of the baseline callback over every home hex.
   * When to use: The share denominator.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalUrbanCells: number;
  /**
   * Home hexes whose controller matched.
   *
   * Contract: A non-negative integer no larger than `totalHexes`.
   * When to use: The every-hex rule.
   * Expected outcome: Count of matched hexes.
   * Exceptions: None.
   */
  readonly matchedHexes: number;
  /**
   * Home hexes.
   *
   * Contract: The length of the home hex list.
   * When to use: The every-hex rule.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalHexes: number;
};

/**
 * Walks a home's hexes once and totals the urban cells of those whose controller matches.
 *
 * Purpose: One loop serves the held count and the lost count, so the two cannot drift.
 * When to use: `computeHomeControlProgress` and `computeHomeLossProgress`.
 * Expected outcome: Totals as described on `HomeHexCounts`. Nothing is changed.
 * Exceptions: None. The baseline callback's exceptions propagate.
 */
function countHomeHexes(args: {
  readonly homeHexes: readonly string[];
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly controllerMatches: (controller: string | null | undefined) => boolean;
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
}): HomeHexCounts {
  let matchedUrbanCells = 0;
  let totalUrbanCells = 0;
  let matchedHexes = 0;
  for (const hex of args.homeHexes) {
    const urbanCells = args.baselineUrbanCellsForHex(hex);
    totalUrbanCells += urbanCells;
    if (args.controllerMatches(args.controlByHex.get(hex))) {
      matchedUrbanCells += urbanCells;
      matchedHexes += 1;
    }
  }
  return { matchedUrbanCells, totalUrbanCells, matchedHexes, totalHexes: args.homeHexes.length };
}

/**
 * Original urban cells of one home that a single named side holds.
 *
 * Purpose: Answers "how much of this home does this one side hold", for the briefing's count of cells the viewer holds.
 * When to use: The return value of `computeHomeControlProgress`.
 * Expected outcome: Counts are non-negative. `neededUrbanCells` is 0 when the every-hex rule applies.
 * Exceptions: None.
 */
export type HomeControlProgress = {
  /**
   * Original urban cells in home hexes the named controller holds.
   *
   * Contract: A hex counts only when its control entry equals the controller.
   * When to use: The briefing's "yours" count and the share comparison.
   * Expected outcome: An integer from 0 through `totalUrbanCells`.
   * Exceptions: None.
   */
  readonly heldUrbanCells: number;
  /**
   * Original urban cells in the whole home.
   *
   * Contract: The sum of the baseline callback over every home hex.
   * When to use: The share denominator.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalUrbanCells: number;
  /**
   * Cells the named controller would need to hold to meet the share.
   *
   * Contract: 0 when the every-hex rule applies.
   * When to use: Comparing a single holder's cells against the share.
   * Expected outcome: `Math.ceil(share * total - 1e-9)` when a share is set and the total is positive.
   * Exceptions: None.
   */
  readonly neededUrbanCells: number;
  /**
   * Whether the named controller alone meets the share.
   *
   * Contract: Every home hex when the share is null or the home has no urban cells. Otherwise the held count meets the needed count.
   * When to use: Tests and callers that ask whether one side alone holds enough of a home.
   * Expected outcome: True only when that rule is met.
   * Exceptions: None.
   */
  readonly controlWinMet: boolean;
};

/**
 * Counts the original urban cells of a home that one named side holds.
 *
 * Purpose: The briefing reports how much of an enemy home the viewer holds, using the same baseline and share as the knockout rule.
 * When to use: When building the strategic briefing's knockout status.
 * Expected outcome: A progress object. This function changes nothing.
 * Exceptions: None. The baseline callback's exceptions propagate.
 */
export function computeHomeControlProgress(args: {
  readonly homeHexes: readonly string[];
  readonly controller: string;
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): HomeControlProgress {
  if (args.homeHexes.length === 0) {
    const empty = { heldUrbanCells: 0, totalUrbanCells: 0, neededUrbanCells: 0, controlWinMet: false };
    logTrace('computeHomeControlProgress', empty);
    return empty;
  }
  const counts = countHomeHexes({
    homeHexes: args.homeHexes,
    controlByHex: args.controlByHex,
    controllerMatches: (controller) => controller === args.controller,
    baselineUrbanCellsForHex: args.baselineUrbanCellsForHex,
  });
  const heldUrbanCells = counts.matchedUrbanCells;
  const totalUrbanCells = counts.totalUrbanCells;
  const everyHexHeld = counts.matchedHexes === counts.totalHexes;
  const everyHexRule = args.minUrbanShare === null || totalUrbanCells === 0;
  const neededUrbanCells = everyHexRule ? 0 : Math.ceil(args.minUrbanShare * totalUrbanCells - 1e-9);
  const progress = {
    heldUrbanCells,
    totalUrbanCells,
    neededUrbanCells,
    controlWinMet: everyHexRule ? everyHexHeld : heldUrbanCells >= neededUrbanCells,
  };
  logTrace('computeHomeControlProgress', progress);
  return progress;
}

/**
 * Original urban cells and hexes of a home that other seats or Neutral hold.
 *
 * Purpose: The knockout rule and the briefing read one answer to "how much of this home is lost".
 * When to use: The return value of `computeHomeLossProgress`.
 * Expected outcome: Counts are non-negative. `neededUrbanCells` is 0 under the every-hex rule.
 * Exceptions: None.
 */
export type HomeLossProgress = {
  /**
   * Original urban cells in home hexes held by another seat or by Neutral.
   *
   * Contract: A hex with no controller counts as neither held nor lost.
   * When to use: The share comparison and the briefing.
   * Expected outcome: An integer from 0 through `totalUrbanCells`.
   * Exceptions: None.
   */
  readonly lostUrbanCells: number;
  /**
   * Original urban cells in all home hexes.
   *
   * Contract: The sum of the baseline callback over every home hex.
   * When to use: The share denominator.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalUrbanCells: number;
  /**
   * Lost cells at which the owner is out.
   *
   * Contract: 0 under the every-hex rule. Otherwise `Math.ceil(share * total - 1e-9)`.
   * When to use: The briefing's "knocked out if they reach" count.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly neededUrbanCells: number;
  /**
   * Home hexes held by another seat or by Neutral.
   *
   * Contract: A hex with no controller is not counted.
   * When to use: The every-hex rule and its briefing line.
   * Expected outcome: An integer from 0 through `totalHexes`.
   * Exceptions: None.
   */
  readonly lostHexes: number;
  /**
   * Home hexes.
   *
   * Contract: The length of the home hex list.
   * When to use: The every-hex rule and its briefing line.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalHexes: number;
  /**
   * Whether the every-hex fallback decides this home.
   *
   * Contract: True when the share is null or the home has no original urban cells.
   * When to use: Choosing between the share wording and the every-hex wording.
   * Expected outcome: True only in those two cases, and for an empty home.
   * Exceptions: None.
   */
  readonly everyHexRule: boolean;
  /**
   * Whether the owner has lost its home under the rule in force.
   *
   * Contract: Under the every-hex rule, every home hex is lost and there is at least one. Otherwise `lostUrbanCells` meets `neededUrbanCells`.
   * When to use: The `home_control` knockout.
   * Expected outcome: True only when that rule is met.
   * Exceptions: None.
   */
  readonly homeLost: boolean;
};

/**
 * Counts how much of a side's home other seats and Neutral hold, and whether the home is lost.
 *
 * Purpose: A side is knocked out when the original urban cells it has lost reach the share, whoever took them.
 * When to use: Once per side at end of turn, and when building the strategic briefing's knockout status.
 * Expected outcome: A progress object. A hex held by a controller other than the owner, including Neutral, is lost. A hex with no controller is neither held nor lost. This function changes nothing.
 * Exceptions: None. The baseline callback's exceptions propagate.
 */
export function computeHomeLossProgress(args: {
  readonly homeHexes: readonly string[];
  readonly ownerSeatId: string;
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): HomeLossProgress {
  logTrace('computeHomeLossProgress', { ownerSeatId: args.ownerSeatId, hexCount: args.homeHexes.length });
  if (args.homeHexes.length === 0) {
    return {
      lostUrbanCells: 0,
      totalUrbanCells: 0,
      neededUrbanCells: 0,
      lostHexes: 0,
      totalHexes: 0,
      everyHexRule: true,
      homeLost: false,
    };
  }
  const counts = countHomeHexes({
    homeHexes: args.homeHexes,
    controlByHex: args.controlByHex,
    controllerMatches: (controller) => typeof controller === 'string' && controller !== '' && controller !== args.ownerSeatId,
    baselineUrbanCellsForHex: args.baselineUrbanCellsForHex,
  });
  const everyHexRule = args.minUrbanShare === null || counts.totalUrbanCells === 0;
  const neededUrbanCells = everyHexRule ? 0 : Math.ceil(args.minUrbanShare * counts.totalUrbanCells - 1e-9);
  return {
    lostUrbanCells: counts.matchedUrbanCells,
    totalUrbanCells: counts.totalUrbanCells,
    neededUrbanCells,
    lostHexes: counts.matchedHexes,
    totalHexes: counts.totalHexes,
    everyHexRule,
    homeLost: everyHexRule
      ? counts.totalHexes > 0 && counts.matchedHexes === counts.totalHexes
      : counts.matchedUrbanCells >= neededUrbanCells,
  };
}
