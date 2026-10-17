/**
 * Counts for the battle header's force bar: each side's sub-units in a battle and the player's share of them.
 */
import type { TacticalSubUnitSnapshot } from './tacticalBattleTypes';

/**
 * Each side's sub-units in a battle, and the player's share of all of them.
 *
 * Purpose: The force bar shows both counts and draws the player's share as the teal part of the bar.
 * When to use: Returned by `countBattleForces`.
 * Expected outcome: Whole counts, and a share from 0 to 1.
 * Exceptions: None.
 */
export type BattleForceCounts = {
  readonly human: number;
  readonly opponent: number;
  readonly humanShare: number;
};

/**
 * Counts each side's sub-units in a battle and works out the player's share.
 *
 * Purpose: The player sees at a glance how the two sides compare in the fight.
 * When to use: With the battle snapshot's `subUnits`. A battle has no fog of war, so the snapshot lists every enemy
 *   sub-unit.
 * Expected outcome: Every sub-unit is counted for its side, including one carried by a ship. `humanShare` is the
 *   player's count over both counts, or 0.5 when neither side has any.
 * Exceptions: None.
 */
export function countBattleForces(subUnits: readonly Pick<TacticalSubUnitSnapshot, 'player'>[]): BattleForceCounts {
  const human = subUnits.filter((sub) => sub.player === 'human').length;
  const opponent = subUnits.length - human;
  const total = human + opponent;
  return { human, opponent, humanShare: total > 0 ? human / total : 0.5 };
}
