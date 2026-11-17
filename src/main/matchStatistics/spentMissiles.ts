/**
 * The missiles launched since the last strategic statistics were recorded.
 *
 * Purpose: A launch deletes its missile (`spendMissile`), and a spent missile is not a loss. A missile destroyed in melee is a loss. Both vanish from `units`, so the launch is noted here to tell them apart.
 * When to use: `spendMissile` notes each launch. `recordTurnStatistics` takes the set for each strategic step, and a turn's second step (after a battle, or at the match end) gets the same set as its first.
 * Expected outcome: The ids noted since the previous turn's first take. The set is kept in memory only. A load or a new match does not clear it, which is harmless: the first turn after a load has no baseline and no loss count. With the recorder off, noted ids pile up until the next take, one id per launch.
 * Exceptions: None.
 */

import { logTrace } from '../logger';

/**
 * The missile ids noted since the last turn's first take, and the set handed to that turn.
 *
 * Purpose: `pending` collects launches. `forTurn` is the set the current turn's statistics use, so a turn that records twice counts the same launches both times.
 * When to use: Only through `noteSpentMissile` and `takeSpentMissileIds`.
 * Expected outcome: `pending` holds launches not yet handed to a turn. `forTurn` holds the launches handed to `forTurnNumber`.
 * Exceptions: None.
 */
let pending = new Set<string>();
let forTurn = new Set<string>();
let forTurnNumber: number | null = null;

/**
 * Notes that a missile was launched and deleted.
 *
 * Purpose: The next turn's units-lost count leaves this missile out.
 * When to use: From `spendMissile`, once per launched missile.
 * Expected outcome: The id is in the set that the next turn takes.
 * Exceptions: None.
 */
export function noteSpentMissile(unitId: string): void {
  logTrace('spentMissiles noteSpentMissile', { unitId });
  pending.add(unitId);
}

/**
 * Returns the missiles launched while the turn before this one resolved.
 *
 * Purpose: Each strategic step compares against the turn before, so every step of one turn leaves out the same launches.
 * When to use: Once per strategic step, from `recordTurnStatistics`, before `unitsLostBySeat`.
 * Expected outcome: For a turn's first step, the ids noted since the previous turn's first step. For a later step of the same turn, the same ids again.
 * Exceptions: None.
 */
export function takeSpentMissileIds(turnNumber: number): ReadonlySet<string> {
  logTrace('spentMissiles takeSpentMissileIds', { turnNumber, count: pending.size });
  if (forTurnNumber !== turnNumber) {
    forTurn = pending;
    pending = new Set<string>();
    forTurnNumber = turnNumber;
  }
  return forTurn;
}
