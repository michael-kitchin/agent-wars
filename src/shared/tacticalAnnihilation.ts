/**
 * Pure helpers for tactical battle end conditions (milestone 2.1 annihilation slice).
 */

import type { TacticalBattlePlayerId } from './tacticalBattleTypes';

/**
 * Describes how a tactical roster ended when at least one side has zero sub-units.
 *
 * Contract: `null` means both sides still have at least one sub-unit; otherwise exactly one of the three outcomes applies.
 * When to use: After roster changes to drive annihilation UI (`getTacticalAnnihilationOutcome`) alongside `shouldEndTacticalBattleForAnnihilation`.
 * Expected outcome: `human_win` when only the opponent is wiped; `human_loss` when only the human is wiped; `mutual` when both counts are zero.
 * Exceptions: None.
 */
export type TacticalAnnihilationOutcomeKind = 'human_win' | 'human_loss' | 'mutual';

/**
 * Returns the annihilation outcome for the current roster, or null while both sides retain sub-units.
 *
 * Contract: Counts `player` on `subUnits` only; treats `human` and `opponent` as the two sides.
 * When to use: Renderer annihilation dialog and any logic that needs win/loss/draw-style messaging after combat.
 * Expected outcome: `null` iff both human and opponent counts are positive; otherwise the appropriate terminal outcome.
 * Exceptions: None.
 */
export function getTacticalAnnihilationOutcome(
  subUnits: readonly { player: TacticalBattlePlayerId }[]
): TacticalAnnihilationOutcomeKind | null {
  let human = 0;
  let opponent = 0;
  for (const u of subUnits) {
    if (u.player === 'human') human += 1;
    else opponent += 1;
  }
  if (human > 0 && opponent > 0) return null;
  if (human > 0 && opponent === 0) return 'human_win';
  if (human === 0 && opponent > 0) return 'human_loss';
  return 'mutual';
}

/**
 * Returns true when at least one tactical side has zero sub-units so the battle cannot continue.
 *
 * Contract: Equivalent to `getTacticalAnnihilationOutcome(subUnits) !== null`.
 * When to use: Renderer and future combat-resolution paths after any change to the tactical sub-unit roster.
 * Expected outcome: True when either side count is zero (including both zero); false only when both sides have at least one unit.
 * Exceptions: None.
 */
export function shouldEndTacticalBattleForAnnihilation(
  subUnits: readonly { player: TacticalBattlePlayerId }[]
): boolean {
  return getTacticalAnnihilationOutcome(subUnits) !== null;
}
