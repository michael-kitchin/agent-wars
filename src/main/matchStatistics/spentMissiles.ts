/**
 * The missiles launched since the last strategic statistics were recorded.
 *
 * Purpose: A launch deletes its missile (`spendMissile`), and a spent missile is not a loss. A missile destroyed in melee is a loss. Both vanish from `units`, so the launch is noted here to tell them apart.
 * When to use: `spendMissile` notes each launch. `recordTurnStatistics` takes the set once per strategic step.
 * Expected outcome: The ids noted since the last take. The set is kept in memory only, so a load starts empty, which is harmless because the first turn after a load has no loss count.
 * Exceptions: None.
 */

import { logTrace } from '../logger';

/**
 * The missile ids noted since the last take.
 *
 * Purpose: One set shared by the launch resolution and the statistics recorder.
 * When to use: Only through `noteSpentMissile` and `takeSpentMissileIds`.
 * Expected outcome: Ids of missiles launched since the last take.
 * Exceptions: None.
 */
let spentMissileIds = new Set<string>();

/**
 * Notes that a missile was launched and deleted.
 *
 * Purpose: The next units-lost count leaves this missile out.
 * When to use: From `spendMissile`, once per launched missile.
 * Expected outcome: The id is in the set until the next take.
 * Exceptions: None.
 */
export function noteSpentMissile(unitId: string): void {
  logTrace('spentMissiles noteSpentMissile', { unitId });
  spentMissileIds.add(unitId);
}

/**
 * Returns the missiles launched since the last take and starts a new set.
 *
 * Purpose: Each strategic step compares against the launches of the turn that just resolved.
 * When to use: Once per strategic step, from `recordTurnStatistics`, before `unitsLostBySeat`.
 * Expected outcome: The noted ids. The store is empty afterwards.
 * Exceptions: None.
 */
export function takeSpentMissileIds(): ReadonlySet<string> {
  logTrace('spentMissiles takeSpentMissileIds', { count: spentMissileIds.size });
  const taken = spentMissileIds;
  spentMissileIds = new Set<string>();
  return taken;
}
