/**
 * Explored-hex fortification facts the AI may be told.
 *
 * Purpose: Briefings, estimates, and order checks share one rule for what an explored snapshot reveals.
 * When to use: Before showing a fortified count or accepting a ranged order at an empty hex.
 * Expected outcome: An absent explored list counts as explored. A hidden hex does not.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from './ipc/gameStateTypes';

/**
 * Whether the snapshot treats a hex as explored.
 *
 * Purpose: Fog hides fortification counts the same way it hides other infrastructure.
 * When to use: Every AI read of a fortified count.
 * Expected outcome: True when `exploredHexes` is absent or includes the hex.
 * Exceptions: None.
 */
export function isHexExploredInSnapshot(state: GameStateSnapshot, h3Index: string): boolean {
  const explored = state.exploredHexes;
  return explored == null || explored.includes(h3Index);
}

/**
 * Whether an explored hex is fortified by someone other than `player`.
 *
 * Purpose: A ranged order may name that hex even when it holds no units.
 * When to use: With a separate check that the hex has no enemy unit. This function does not look at units.
 * Expected outcome: True only for an explored hex whose controller is someone else and whose fortified count is above 0.
 * Exceptions: None.
 */
export function isExploredEnemyFortifiedHex(state: GameStateSnapshot, h3Index: string, player: string): boolean {
  if (!isHexExploredInSnapshot(state, h3Index)) return false;
  const controller = state.strategicControl?.find((row) => row.h3Index === h3Index)?.controllerPlayerId ?? null;
  if (controller == null || controller === player) return false;
  const fortified = state.strategicInfrastructure?.find((row) => row.h3Index === h3Index)?.fortifiedCount ?? 0;
  return fortified > 0;
}
