import { logTrace } from '../logger';

/**
 * Generated urban cells held toward a home-region control win.
 *
 * Purpose: The winner and the prompt share one count of baseline urban cells.
 * When to use: The return value of `computeHomeControlProgress`.
 * Expected outcome: Counts are non-negative. `neededUrbanCells` is 0 when the every-hex rule applies.
 * Exceptions: None.
 */
export type HomeControlProgress = {
  /**
   * Generated urban cells in enemy-home hexes this side controls.
   *
   * Contract: A hex counts only when its control entry equals the controller.
   * When to use: The progress lines and the share comparison.
   * Expected outcome: An integer from 0 through `totalUrbanCells`.
   * Exceptions: None.
   */
  readonly heldUrbanCells: number;
  /**
   * Generated urban cells in the whole enemy home.
   *
   * Contract: The sum of the baseline callback over every home hex.
   * When to use: The share denominator.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly totalUrbanCells: number;
  /**
   * Cells needed for a share win.
   *
   * Contract: 0 when the every-hex rule applies.
   * When to use: The prompt's "you need" count.
   * Expected outcome: `Math.ceil(share * total - 1e-9)` when a share is set and the total is positive.
   * Exceptions: None.
   */
  readonly neededUrbanCells: number;
  /**
   * Whether this side has met the control rule.
   *
   * Contract: Every home hex when the share is null or the home has no urban cells. Otherwise the held count meets the needed count.
   * When to use: Choosing the control winner.
   * Expected outcome: True only when that rule is met.
   * Exceptions: None.
   */
  readonly controlWinMet: boolean;
};

/**
 * Counts baseline urban cells and decides whether one side meets the control rule.
 *
 * Purpose: The winner and the prompt must not use different thresholds.
 * When to use: Once per side at end of turn, and when building the regional prompt.
 * Expected outcome: A progress object. This function changes nothing.
 * Exceptions: None. The baseline callback's exceptions propagate.
 */
export function computeHomeControlProgress(args: {
  readonly homeHexes: readonly string[];
  readonly controller: 'human' | 'opponent';
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): HomeControlProgress {
  if (args.homeHexes.length === 0) {
    const empty = { heldUrbanCells: 0, totalUrbanCells: 0, neededUrbanCells: 0, controlWinMet: false };
    logTrace('computeHomeControlProgress', empty);
    return empty;
  }
  let heldUrbanCells = 0;
  let totalUrbanCells = 0;
  let everyHexHeld = true;
  for (const hex of args.homeHexes) {
    const urbanCells = args.baselineUrbanCellsForHex(hex);
    totalUrbanCells += urbanCells;
    const held = args.controlByHex.get(hex) === args.controller;
    if (held) heldUrbanCells += urbanCells;
    else everyHexHeld = false;
  }
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
