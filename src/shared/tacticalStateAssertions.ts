/**
 * Non-throwing tactical/strategic mode boundary checks shared by main and renderer processes.
 */

import type { TacticalBattleSnapshot } from './tacticalBattleTypes';

/**
 * Describes whether a tactical boundary predicate passed and, if not, a machine-oriented reason code.
 *
 * Contract: `ok: true` means the guarded action may proceed; `ok: false` carries a stable `code` for branching/logging.
 * When to use: Early returns in tactical UI flows and main-process tactical session entry guards.
 * Expected outcome: Callers preserve existing user-facing strings while centralizing eligibility checks.
 * Exceptions: None.
 */
export type TacticalBoundaryOutcome = { ok: true } | { ok: false; code: string };

/**
 * Returns whether a new tactical session may start when no battle is already active in the main process.
 *
 * Contract: Pure; does not log; mirrors the duplicate-start guard in `startTacticalBattleForEnclosingStrategicHex`.
 * When to use: Before allocating a tactical battle id when `activeTacticalBattle` may already be populated.
 * Expected outcome: `ok: false` with `code: 'concurrent_session'` when `alreadyActive` is true.
 * Exceptions: None.
 */
export function tacticalBoundaryConcurrentSessionAllowed(alreadyActive: boolean): TacticalBoundaryOutcome {
  if (alreadyActive) return { ok: false, code: 'concurrent_session' };
  return { ok: true };
}

/**
 * Returns whether tactical exit actions may run given client-side tactical planning flags.
 *
 * Contract: Pure; encodes the renderer guard `snapshot && planning` used by exit/ready-equivalent flows.
 * When to use: `performTacticalBattleExit` and similar UI handlers before issuing IPC teardown.
 * Expected outcome: `ok: false` with `code: 'not_planning_exit'` when snapshot or planning flag is wrong.
 * Exceptions: None.
 */
export function tacticalBoundaryPlanningExitAllowed(
  tacticalSnapshot: TacticalBattleSnapshot | null,
  tacticalPhasePlanning: boolean
): TacticalBoundaryOutcome {
  if (!tacticalSnapshot || !tacticalPhasePlanning) return { ok: false, code: 'not_planning_exit' };
  return { ok: true };
}

/**
 * Returns whether tactical advance-turn actions may start from the renderer planning beat.
 *
 * Contract: Pure; matches the early guard on `performTacticalAdvanceTurn`.
 * When to use: Before flipping `tacticalPhasePlanning` to resolution mode in the renderer.
 * Expected outcome: `ok: false` with `code: 'not_planning_advance'` when snapshot missing or not planning.
 * Exceptions: None.
 */
export function tacticalBoundaryPlanningAdvanceAllowed(
  tacticalSnapshot: TacticalBattleSnapshot | null,
  tacticalPhasePlanning: boolean
): TacticalBoundaryOutcome {
  if (!tacticalSnapshot || !tacticalPhasePlanning) return { ok: false, code: 'not_planning_advance' };
  return { ok: true };
}
