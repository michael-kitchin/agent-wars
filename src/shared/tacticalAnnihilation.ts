/**
 * Pure helpers for tactical battle end conditions (milestone 2.1 annihilation slice).
 */

import type { TacticalBattlePlayerId } from './tacticalBattleTypes';

/**
 * Returns true when at least one tactical side has zero sub-units so the battle cannot continue.
 *
 * Contract: Counts `player` on `subUnits` only; treats `human` and `opponent` as the two sides.
 * When to use: Renderer and future combat-resolution paths after any change to the tactical sub-unit roster.
 * Expected outcome: True when either side count is zero (including both zero); false only when both sides have at least one unit.
 * Exceptions: None.
 */
export function shouldEndTacticalBattleForAnnihilation(
  subUnits: readonly { player: TacticalBattlePlayerId }[]
): boolean {
  let human = 0;
  let opponent = 0;
  for (const u of subUnits) {
    if (u.player === 'human') human += 1;
    else opponent += 1;
  }
  return human === 0 || opponent === 0;
}
