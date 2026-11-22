/**
 * The missiles launched since the last strategic statistics were recorded, and which seat launched each.
 *
 * Purpose: A launch deletes its missile (`spendMissile`), and a spent missile is not a loss. A missile destroyed in melee is a loss. Both vanish from `units`, so the launch is noted here to tell them apart. The launching seat is kept too, so a turn's report can say which seats launched a missile.
 * When to use: `spendMissile` notes each launch. `recordTurnStatistics` takes the ids and the launching seats for each strategic step and passes the seats to the posture reports, and a turn's second step (after a battle, or at the match end) gets the same launches as its first. `refreshedTurnStatistics` reads neither, so a refresh never takes launches meant for the next turn.
 * Expected outcome: The launches noted since the previous turn's first take. They are kept in memory only. A load or a new match does not clear them, which is harmless: the first turn after a load has no baseline and no loss count. With the recorder off, noted launches pile up until the next take, one entry per launch.
 * Exceptions: None.
 */

import { logTrace } from '../logger';

/**
 * The launches noted since the last turn's first take, and the launches handed to that turn, each mapping a missile id to its owner seat id.
 *
 * Purpose: `pending` collects launches. `forTurn` is the set the current turn's statistics use, so a turn that records twice counts the same launches both times.
 * When to use: Only through `noteSpentMissile`, `takeSpentMissileIds`, and `spentMissileSeatIds`.
 * Expected outcome: `pending` holds launches not yet handed to a turn. `forTurn` holds the launches handed to `forTurnNumber`. An owner is null when the missile's row could not be read.
 * Exceptions: None.
 */
let pending = new Map<string, string | null>();
let forTurn = new Map<string, string | null>();
let forTurnNumber: number | null = null;

/**
 * Notes that a missile was launched and deleted.
 *
 * Purpose: The next turn's units-lost count leaves this missile out, and the launching seat counts as having launched.
 * When to use: From `spendMissile`, once per launched missile, before its unit row is deleted.
 * Expected outcome: The id and its owner are in the launches that the next turn takes.
 * Exceptions: None.
 */
export function noteSpentMissile(unitId: string, ownerSeatId: string | null): void {
  logTrace('spentMissiles noteSpentMissile', { unitId, ownerSeatId });
  pending.set(unitId, ownerSeatId);
}

/**
 * Hands the pending launches to a turn the first time that turn asks, and returns the launches that turn uses.
 *
 * Purpose: One swap point, so every reader of one turn sees the same launches whichever reads first.
 * When to use: Only from the two readers below.
 * Expected outcome: For a turn's first request, the launches noted since the previous turn's first request. For a later request of the same turn, the same launches again.
 * Exceptions: None.
 */
function spentForTurn(turnNumber: number): ReadonlyMap<string, string | null> {
  if (forTurnNumber !== turnNumber) {
    forTurn = pending;
    pending = new Map<string, string | null>();
    forTurnNumber = turnNumber;
  }
  return forTurn;
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
  const spent = spentForTurn(turnNumber);
  logTrace('spentMissiles takeSpentMissileIds', { turnNumber, count: spent.size });
  return new Set(spent.keys());
}

/**
 * Returns the seats that launched a missile while the turn before this one resolved.
 *
 * Purpose: A seat on the strangle posture is acting when one of its missiles was launched.
 * When to use: Once per strategic step, from `recordTurnStatistics`, before or after `takeSpentMissileIds` for the same turn. Never from a refresh of an already recorded turn, because the first request of a turn takes the pending launches.
 * Expected outcome: The non-null owners of the same launches `takeSpentMissileIds` returns for that turn.
 * Exceptions: None.
 */
export function spentMissileSeatIds(turnNumber: number): ReadonlySet<string> {
  const spent = spentForTurn(turnNumber);
  const seatIds = new Set<string>();
  for (const owner of spent.values()) {
    if (owner !== null) seatIds.add(owner);
  }
  logTrace('spentMissiles spentMissileSeatIds', { turnNumber, count: seatIds.size });
  return seatIds;
}
