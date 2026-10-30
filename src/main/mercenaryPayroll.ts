/**
 * Decides which mercenaries a seat can pay.
 *
 * Purpose: Desertion is a pure function of upkeep, credits, and a seed, so tests can pin the order.
 * When to use: Once per active seat at the end of the turn, after the rows are loaded.
 * Expected outcome: The units that leave, including a deserting ship's cargo, and the credits left.
 * Exceptions: None.
 */

import { createSeededRng } from './seededRng';
import { logTrace } from './logger';

/**
 * One mercenary payroll can group.
 *
 * Purpose: Transport decides whether the unit walks, sails, or rides a ship that is not a mercenary.
 * When to use: One row per mercenary of the seat. Cargo that is not a mercenary appears only in `cargoIds`.
 * Expected outcome: Upkeep is the unit's own. `cargoIds` lists everyone aboard this ship.
 * Exceptions: None.
 */
export interface PayrollMercenary {
  /**
   * Unit id.
   *
   * Contract: Unique in the list.
   * When to use: Desertion and grouping cargo with its ship.
   * Expected outcome: The mercenary's id.
   * Exceptions: None.
   */
  readonly id: string;
  /**
   * Credits this unit costs this turn.
   *
   * Contract: A non-positive value is not drawn, because drawing it would not reduce what is still owed.
   * When to use: The group total.
   * Expected outcome: The unit's upkeep.
   * Exceptions: None.
   */
  readonly upkeep: number;
  /**
   * Ship this mercenary is aboard.
   *
   * Contract: Null when the unit is not embarked. Set for a ship that is not a mercenary as well as one that is.
   * When to use: A rider aboard a ship that is not in this list never deserts.
   * Expected outcome: The naval unit id, or null.
   * Exceptions: None.
   */
  readonly carriedByShipId: string | null;
  /**
   * Units aboard this mercenary, whether or not they are mercenaries.
   *
   * Contract: Empty for a unit that carries nothing. A deserting ship takes every id here.
   * When to use: The ship's group, and the deserter list.
   * Expected outcome: The assignment-table cargo of this unit.
   * Exceptions: None.
   */
  readonly cargoIds: readonly string[];
}

/**
 * Who deserts and what the treasury holds afterwards.
 *
 * Purpose: The end-of-turn step converts these ids and stores the balance.
 * When to use: The result of one seat's payroll.
 * Expected outcome: Deserters include cargo. Credits are never negative.
 * Exceptions: None.
 */
export interface PayrollResult {
  /**
   * Units that leave for lack of pay.
   *
   * Contract: Mercenaries that were not kept, plus every cargo id of a deserting ship.
   * When to use: Neutral conversion.
   * Expected outcome: Empty when the treasury covers every mercenary.
   * Exceptions: None.
   */
  readonly deserterIds: readonly string[];
  /**
   * Credits left after paying the units that stayed, with unpaid riders forgiven.
   *
   * Contract: Never negative.
   * When to use: The treasury write.
   * Expected outcome: Credits minus paid upkeep, and not below 0 when riders cost more than what remains.
   * Exceptions: None.
   */
  readonly creditsAfter: number;
}

/**
 * One group the draw may drop.
 *
 * Purpose: A walker is one unit. A loaded ship is the ship plus the mercenaries aboard it.
 * When to use: Only inside `settleMercenaryPayroll`.
 * Expected outcome: A positive upkeep and the ids that desert together.
 * Exceptions: None.
 */
interface PayableGroup {
  /**
   * Credits the group costs if it is kept.
   *
   * Contract: A positive integer. Cargo that is not a mercenary adds nothing.
   * When to use: The draw and the keep pass.
   * Expected outcome: The walker, or the ship plus mercenary cargo.
   * Exceptions: None.
   */
  readonly upkeep: number;
  /**
   * Units that leave together when the group is not kept.
   *
   * Contract: A walker is one id. A ship is the ship id and then every cargo id.
   * When to use: The deserter list.
   * Expected outcome: The ids Neutral conversion receives.
   * Exceptions: None.
   */
  readonly deserterIds: readonly string[];
}

/**
 * Copies a list and shuffles it with a seeded Fisher-Yates.
 *
 * Purpose: Desertion and hire order share one shuffle.
 * When to use: After sorting a pool by id, or after listing hire orders.
 * Expected outcome: A new array. The same seed and the same items produce the same order.
 * Exceptions: None.
 */
export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  logTrace('mercenaryPayroll shuffleWithSeed', { count: items.length, seed });
  const copy = [...items];
  const rng = createSeededRng(seed);
  for (let i = copy.length - 1; i >= 1; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = swap;
  }
  return copy;
}

/**
 * Pays as many mercenary groups as the treasury can cover.
 *
 * Purpose: Walkers are drawn before loaded ships. A cheap group drawn early is kept when the reverse pass can still afford it.
 * When to use: Once per seat that has mercenaries. Riders aboard a ship that is not a mercenary are paid last and never desert.
 * Expected outcome: No deserters when total upkeep fits. Otherwise the deserter ids and a non-negative balance.
 * Exceptions: None.
 */
export function settleMercenaryPayroll(args: {
  readonly mercenaries: readonly PayrollMercenary[];
  readonly credits: number;
  readonly seed: number;
}): PayrollResult {
  logTrace('mercenaryPayroll settleMercenaryPayroll', {
    count: args.mercenaries.length,
    credits: args.credits,
    seed: args.seed,
  });
  const total = args.mercenaries.reduce((sum, unit) => sum + unit.upkeep, 0);
  if (total <= args.credits) return { deserterIds: [], creditsAfter: args.credits - total };

  const mercenaryIds = new Set(args.mercenaries.map((unit) => unit.id));
  const upkeepById = new Map(args.mercenaries.map((unit) => [unit.id, unit.upkeep]));
  const walkers: PayableGroup[] = [];
  const ships: PayableGroup[] = [];
  let riderUpkeep = 0;
  for (const unit of args.mercenaries) {
    if (unit.carriedByShipId && !mercenaryIds.has(unit.carriedByShipId)) {
      riderUpkeep += unit.upkeep;
      continue;
    }
    if (unit.carriedByShipId) continue;
    if (unit.cargoIds.length === 0) {
      if (isPayable(unit.upkeep)) walkers.push({ upkeep: unit.upkeep, deserterIds: [unit.id] });
      continue;
    }
    const cargoUpkeep = unit.cargoIds.reduce((sum, id) => sum + (upkeepById.get(id) ?? 0), 0);
    const groupUpkeep = unit.upkeep + cargoUpkeep;
    if (isPayable(groupUpkeep)) ships.push({ upkeep: groupUpkeep, deserterIds: [unit.id, ...unit.cargoIds] });
  }
  const poolA = shuffleWithSeed(walkers.sort(byFirstId), args.seed);
  const poolB = shuffleWithSeed(ships.sort(byFirstId), (args.seed + 1) >>> 0);
  let remaining = [...poolA, ...poolB].reduce((sum, group) => sum + group.upkeep, 0);
  const drawn: PayableGroup[] = [];
  for (const group of [...poolA, ...poolB]) {
    if (remaining <= args.credits) break;
    drawn.push(group);
    remaining -= group.upkeep;
  }
  const deserterIds: string[] = [];
  for (const group of [...drawn].reverse()) {
    if (group.upkeep <= args.credits - remaining) {
      remaining += group.upkeep;
      continue;
    }
    deserterIds.push(...group.deserterIds);
  }
  return {
    deserterIds,
    creditsAfter: Math.max(0, args.credits - remaining - riderUpkeep),
  };
}

/**
 * Whether a group can be drawn.
 *
 * Purpose: A zero upkeep would never shrink the amount still owed, and the walk would not finish.
 * When to use: Before a walker or a ship enters a pool.
 * Expected outcome: True for a positive integer.
 * Exceptions: None.
 */
function isPayable(upkeep: number): boolean {
  return Number.isInteger(upkeep) && upkeep > 0;
}

/**
 * Orders groups by the first deserter id so the shuffle starts from a stable list.
 *
 * Purpose: The seed, not the input order, decides who is drawn.
 * When to use: `Array.prototype.sort` on a pool.
 * Expected outcome: A negative number when `left` sorts first.
 * Exceptions: None.
 */
function byFirstId(left: PayableGroup, right: PayableGroup): number {
  return (left.deserterIds[0] ?? '').localeCompare(right.deserterIds[0] ?? '');
}
