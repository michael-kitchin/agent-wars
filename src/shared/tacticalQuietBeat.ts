/**
 * The rule for a quiet beat in a battle between two AI seats.
 *
 * Purpose: A beat with no attack shot, no anti-air fire, no melee, and no sub-unit closing on the enemy counts toward ending the battle.
 * When to use: `applyAiOnlyTacticalBeat`, and the battle header's quiet count.
 * Expected outcome: Pure answers from the values passed in. This module does not import the main-process logger.
 * Exceptions: None.
 */

import { computeGridDistancePure } from './h3GridRangePure';
import type { CombatDiceRoll } from './ipc/combatDiceTypes';
import type { TacticalBeatActivity, TacticalSubUnitSnapshot } from './tacticalBattleTypes';

/**
 * Quiet beats in a row that end a battle between two AI seats.
 *
 * Purpose: Two commanders holding fire should not run a battle to the beat limit.
 * When to use: The end-reason check of an AI-only beat, and the text that names the count.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const QUIET_BEATS_TO_END = 3;

/**
 * Counts the attack shots one side rolled.
 *
 * Purpose: Only a side's own attacks count. Return fire, anti-air fire, and infrastructure counter-fire answer an attack.
 * When to use: Once per side, over the air strike and ranged dice of one beat.
 * Expected outcome: The number of rolls of kind `ranged` or `airStrike` whose `player` is `player`.
 * Exceptions: None.
 */
export function countAttackShots(rolls: readonly CombatDiceRoll[], player: string): number {
  return rolls.filter((roll) => roll.player === player && (roll.kind === 'ranged' || roll.kind === 'airStrike')).length;
}

/**
 * Where one sub-unit stands.
 *
 * Contract: The id, the owner, and the cell of a battle sub-unit.
 * When to use: Comparing the positions before and after a beat.
 * Expected outcome: A snapshot sub-unit satisfies this shape.
 * Exceptions: None.
 */
export type TacticalSubUnitPosition = Pick<TacticalSubUnitSnapshot, 'id' | 'player' | 'h3Index'>;

/**
 * Grid steps from one cell to the nearest of several enemy cells.
 *
 * Purpose: Both sides of the closer-or-not comparison measure the same way.
 * When to use: `anySubUnitMovedCloser`, once with the positions before the beat and once with those after it.
 * Expected outcome: The smallest measurable distance, or null when no enemy cell gives one.
 * Exceptions: None.
 */
function nearestDistance(from: string, enemies: readonly TacticalSubUnitPosition[]): number | null {
  let best: number | null = null;
  for (const enemy of enemies) {
    const distance = computeGridDistancePure(from, enemy.h3Index);
    if (distance !== null && (best === null || distance < best)) best = distance;
  }
  return best;
}

/**
 * Whether any sub-unit moved closer to the enemy during a beat.
 *
 * Purpose: The test is per sub-unit, so a withdrawing side does not keep the battle going, and a holding screen does not
 *   hide an advance behind it.
 * When to use: With the positions the beat started from and the positions after melee.
 * Expected outcome: True when a sub-unit of either party changed cell and its distance to the nearest sub-unit of the
 *   other party after the beat is smaller than that distance before it. A sub-unit that stood still, that is new, or
 *   whose distance cannot be measured both before and after does not count.
 * Exceptions: None.
 */
export function anySubUnitMovedCloser(args: {
  /**
   * Positions at the start of the beat.
   *
   * Contract: Every sub-unit standing before any order of the beat resolved.
   * When to use: Measuring where each sub-unit and its enemies were.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly before: readonly TacticalSubUnitPosition[];
  /**
   * Positions at the end of the beat.
   *
   * Contract: Every sub-unit still standing after melee.
   * When to use: Measuring where each sub-unit and its enemies ended up.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly after: readonly TacticalSubUnitPosition[];
  /**
   * The lead side of the battle.
   *
   * Contract: One of the two owner ids that are enemies of each other.
   * When to use: Choosing each sub-unit's enemies.
   * Expected outcome: An owner id.
   * Exceptions: None.
   */
  readonly leadPartyId: string;
  /**
   * The other side of the battle.
   *
   * Contract: The second owner id.
   * When to use: Choosing each sub-unit's enemies.
   * Expected outcome: An owner id.
   * Exceptions: None.
   */
  readonly opposingPartyId: string;
}): boolean {
  const { before, after, leadPartyId, opposingPartyId } = args;
  const beforeById = new Map(before.map((unit) => [unit.id, unit] as const));
  return after.some((unit) => {
    if (unit.player !== leadPartyId && unit.player !== opposingPartyId) return false;
    const start = beforeById.get(unit.id);
    if (start === undefined || start.h3Index === unit.h3Index) return false;
    const enemy = unit.player === leadPartyId ? opposingPartyId : leadPartyId;
    const distanceBefore = nearestDistance(start.h3Index, before.filter((other) => other.player === enemy));
    const distanceAfter = nearestDistance(unit.h3Index, after.filter((other) => other.player === enemy));
    return distanceBefore !== null && distanceAfter !== null && distanceAfter < distanceBefore;
  });
}

/**
 * Whether a beat was quiet.
 *
 * Purpose: One place states what stops a quiet streak.
 * When to use: After a beat has resolved, before the streak is updated.
 * Expected outcome: True only with no attack shot by either side, no anti-air fire, no melee, and no sub-unit moving closer.
 * Exceptions: None.
 */
export function isQuietBeat(args: {
  /**
   * What the beat's dice show.
   *
   * Contract: The record stored for that beat.
   * When to use: Reading the shot counts and the melee flag.
   * Expected outcome: Read only.
   * Exceptions: None.
   */
  readonly activity: TacticalBeatActivity;
  /**
   * Whether any sub-unit moved closer during the beat.
   *
   * Contract: The answer of `anySubUnitMovedCloser` for the same beat.
   * When to use: Keeping an advance from counting as quiet.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly movedCloser: boolean;
  /**
   * Whether any anti-air die was rolled in the beat.
   *
   * Contract: True when the beat's dice hold a roll of kind `antiAir`. An air drop into defended airspace draws one with no
   *   attack shot to count.
   * When to use: Keeping an air drop that was fired on from counting as quiet.
   * Expected outcome: True or false.
   * Exceptions: None.
   */
  readonly antiAirFired: boolean;
}): boolean {
  const { activity, movedCloser, antiAirFired } = args;
  return activity.leadShots === 0 && activity.opposingShots === 0 && !antiAirFired && !activity.meleeFought && !movedCloser;
}
