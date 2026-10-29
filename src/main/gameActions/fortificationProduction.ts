/**
 * Chooses which intact city cells a production pulse fortifies.
 *
 * Purpose: Production runs after combat. Drawing from the combat generator would change later turns' dice,
 * so cell selection uses its own seeded generator.
 * When to use: The production spend loop, after it has decided how many cells one hex can afford.
 * Expected outcome: The same seed, turn, and hex always choose the same cells.
 * Exceptions: None. A missing cell list fortifies nothing.
 */

import { createSeededRng } from '../seededRng';
import { getGameSeed, listFortifiableCellsForHex, setTacticalCellFortified } from '../gameDb';
import { logDebug, logTrace } from '../logger';

/**
 * Hashes the match seed, turn, and hex into a 32-bit placement seed.
 *
 * Purpose: Two hexes on the same turn must not share a shuffle.
 * When to use: Before `pickCellsToFortify`.
 * Expected outcome: The unsigned FNV-1a hash of `${gameSeed}|${turnNumber}|${h3Index}`.
 * Exceptions: None.
 */
export function fortificationPlacementSeed(gameSeed: number, turnNumber: number, h3Index: string): number {
  const text = `${gameSeed}|${turnNumber}|${h3Index}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const seed = hash >>> 0;
  logTrace('fortificationPlacementSeed', { gameSeed, turnNumber, h3Index, seed });
  return seed;
}

/**
 * Picks distinct fortifiable cells with a partial Fisher-Yates shuffle.
 *
 * Purpose: The same inputs always fortify the same cells, without drawing combat dice.
 * When to use: After `fortificationPlacementSeed`. The cell list is sorted by H3 index.
 * Expected outcome: `min(count, length)` cells. The same seed returns the same cells.
 * Exceptions: None. A non-positive count returns an empty list.
 */
export function pickCellsToFortify(args: {
  readonly fortifiableCells: readonly string[];
  readonly count: number;
  readonly seed: number;
}): string[] {
  const cells = [...args.fortifiableCells];
  const steps = Math.min(Math.max(0, Math.trunc(args.count)), cells.length);
  const next = createSeededRng(args.seed);
  for (let index = 0; index < steps; index += 1) {
    const swapIndex = index + Math.floor(next() * (cells.length - index));
    const current = cells[index]!;
    cells[index] = cells[swapIndex]!;
    cells[swapIndex] = current;
  }
  const picked = cells.slice(0, steps);
  logTrace('pickCellsToFortify', { count: args.count, seed: args.seed, picked: picked.length });
  return picked;
}

/**
 * Decides how many fortifications one queue row builds this pulse.
 *
 * Purpose: A fortification pauses like a unit cap when no intact city cell remains, and otherwise spends points.
 * When to use: The production loop, before any unit cap lookup.
 * Expected outcome: `paused` when no cell remains. Otherwise `built` is the minimum of the row, the affordable count, and the cells left. A cost that is not a positive integer builds nothing and does not pause.
 * Exceptions: None.
 */
export function fortificationSpendStep(args: {
  readonly remainingCount: number;
  readonly points: number;
  readonly fortifiableLeft: number;
  readonly cost: number;
}): { readonly paused: boolean; readonly built: number } {
  if (args.fortifiableLeft <= 0) {
    logTrace('fortificationSpendStep', { paused: true, built: 0 });
    return { paused: true, built: 0 };
  }
  if (!Number.isInteger(args.cost) || args.cost <= 0) {
    logTrace('fortificationSpendStep', { paused: false, built: 0, cost: args.cost });
    return { paused: false, built: 0 };
  }
  const affordable = Math.floor(args.points / args.cost);
  const built = Math.max(0, Math.min(args.remainingCount, affordable, args.fortifiableLeft));
  logTrace('fortificationSpendStep', { paused: false, built, affordable });
  return { paused: false, built };
}

/**
 * Fortifies up to `count` intact city cells on one hex.
 *
 * Purpose: Applies the production decision with the match's own placement seed.
 * When to use: After the spend loop has counted how many cells this hex paid for.
 * Expected outcome: The number of cells newly fortified, which is at most `count` and at most the cells that were left.
 * Exceptions: A missing tactical row throws from `setTacticalCellFortified`.
 */
export function fortifyCellsForHex(args: {
  readonly h3Index: string;
  readonly count: number;
  readonly turnNumber: number;
}): number {
  logDebug('fortifyCellsForHex', args);
  const cells = listFortifiableCellsForHex(args.h3Index);
  const seed = fortificationPlacementSeed(getGameSeed(), args.turnNumber, args.h3Index);
  const picked = pickCellsToFortify({ fortifiableCells: cells, count: args.count, seed });
  for (const cell of picked) setTacticalCellFortified(cell, true);
  return picked.length;
}
