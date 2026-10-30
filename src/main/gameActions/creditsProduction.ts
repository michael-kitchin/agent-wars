/**
 * How many credits items one production step can buy.
 *
 * Purpose: A credits row spends production points and does not spawn a unit.
 * When to use: Immediately after the fortification branch of the production loop.
 * Expected outcome: The count that fits in the remaining points and the remaining queue count.
 * Exceptions: None. A cost that is not a positive integer buys nothing.
 */

import { logDebug } from '../logger';

/**
 * Returns how many credits items to build from the points on hand.
 *
 * Purpose: The spend loop should not divide by a missing or zero cost.
 * When to use: Once per credits row at the head of a queue.
 * Expected outcome: 0 when `cost` is not a positive integer. Otherwise the lesser of the remaining count and the count the points can afford.
 * Exceptions: None.
 */
export function creditsSpendStep(args: {
  readonly remainingCount: number;
  readonly points: number;
  readonly cost: number;
}): number {
  logDebug('gameActions creditsSpendStep', {
    remainingCount: args.remainingCount,
    points: args.points,
    cost: args.cost,
  });
  if (!Number.isInteger(args.cost) || args.cost <= 0) return 0;
  return Math.max(0, Math.min(args.remainingCount, Math.floor(args.points / args.cost)));
}
