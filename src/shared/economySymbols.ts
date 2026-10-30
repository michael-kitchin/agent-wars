/**
 * Marks for production capacity and treasury credits.
 *
 * Purpose: Map labels, the top bar, the build popup, and the hire panel share one pair of symbols.
 * When to use: Any player-facing amount of production points or credits.
 * Expected outcome: Production amounts start with ⚒ in text style. Credit amounts start with ¤.
 * Exceptions: None. This module does not log and does not import the renderer.
 */

/**
 * Text-style hammer and pick for production capacity.
 *
 * Purpose: Every player-facing production amount uses one mark, including dark text on a light hire button.
 * When to use: Through `formatProductionCapacityAmount` and `formatCompactRaiseCost`. Do not paste the glyph at a call site.
 * Expected outcome: U+2692 followed by U+FE0E, so the glyph takes the surrounding text color.
 * Exceptions: None.
 */
export const PRODUCTION_CAPACITY_SYMBOL = '\u2692\uFE0E';

/**
 * Generic currency sign for treasury credits.
 *
 * Purpose: Balances, upkeep, hire fees, and the mercenary token share one mark. Real-money readouts do not use it.
 * When to use: Amounts go through `formatCreditsAmount` and `formatCompactHireCost`. The mercenary token uses this constant directly. Do not paste the glyph at a call site.
 * Expected outcome: U+00A4.
 * Exceptions: None.
 */
export const CREDITS_SYMBOL = '\u00A4';

/**
 * Prefixes an already formatted production amount.
 *
 * Purpose: Callers keep their own thousands separators.
 * When to use: After `toLocaleString` or `String` has produced the digits.
 * Expected outcome: The production symbol followed by `formattedNumber`, including when that number is `0`.
 * Exceptions: None.
 */
export function formatProductionCapacityAmount(formattedNumber: string): string {
  return `${PRODUCTION_CAPACITY_SYMBOL}${formattedNumber}`;
}

/**
 * Prefixes an already formatted credit amount.
 *
 * Purpose: Callers keep their own thousands separators.
 * When to use: After the digits of a balance, an upkeep, or a fee are known.
 * Expected outcome: The credits symbol followed by `formattedNumber`.
 * Exceptions: None.
 */
export function formatCreditsAmount(formattedNumber: string): string {
  return `${CREDITS_SYMBOL}${formattedNumber}`;
}

/**
 * Compact credit price for one hired unit.
 *
 * Purpose: The raise menu, the rehire row, and a pending order share one spelling.
 * When to use: With the one-time fee and the later per-turn upkeep. The fee may equal the upkeep or exceed it.
 * Expected outcome: `¤3/turn` when the fee is not above the upkeep. `¤3 + ¤3/turn` when the fee is 6 and the upkeep is 3. The one-time number is `fee - upkeep`, not the full fee. No space before `/turn`, no parentheses, and no thousands separators.
 * Exceptions: None. A negative extra is omitted rather than shown.
 */
export function formatCompactHireCost(fee: number, upkeep: number): string {
  const perTurn = `${CREDITS_SYMBOL}${upkeep}/turn`;
  const extra = fee - upkeep;
  if (extra > 0) return `${CREDITS_SYMBOL}${extra} + ${perTurn}`;
  return perTurn;
}

/**
 * Compact production-and-credit price for one raised unit.
 *
 * Purpose: A raise spends production points as well as credits.
 * When to use: With the unit's production cost, its one-time fee, and its later upkeep.
 * Expected outcome: The production symbol, the unit cost, ` + `, then `formatCompactHireCost`. For 20, 3, and 3 that is `⚒20 + ¤3/turn`.
 * Exceptions: None.
 */
export function formatCompactRaiseCost(unitCost: number, fee: number, upkeep: number): string {
  return `${PRODUCTION_CAPACITY_SYMBOL}${unitCost} + ${formatCompactHireCost(fee, upkeep)}`;
}
