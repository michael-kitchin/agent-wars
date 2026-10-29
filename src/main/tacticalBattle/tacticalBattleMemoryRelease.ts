/**
 * Clears the in-memory tactical battle without writing the database.
 *
 * Purpose: Loading a save must drop the previous battle's memory. Ending the session is the wrong call: it restores transport rows and deletes the tactical rows the loaded battle needs.
 * When to use: From `resetMatchMemoryAfterDatabaseReplace`, before the loaded battle is restored.
 * Expected outcome: No tactical snapshot, stash, march memo, or renderer override cache remains in memory. The database is unchanged.
 * Exceptions: None.
 */

import { clearTacticalRendererOverrideCache } from '../gameDb/tacticalRendererOverrideCache';
import { logDebug } from '../logger';
import { clearTacticalCallbackSubscriptionStash } from '../openRouter/tacticalCallbackSubscriptionLifecycle';
import { setActiveTacticalBattleSnapshotRef } from './activeTacticalBattleRef';
import { clearTacticalMovementPlanningCache } from './tacticalMovementPlanningCache';

/**
 * Drops every in-memory tactical battle cache.
 *
 * Purpose: The database still holds the loaded battle. Memory has to match it after restore, not before.
 * When to use: After the match file has been replaced and before `restorePersistedTacticalBattleSession`.
 * Expected outcome: The active snapshot is null and the three caches are empty.
 * Exceptions: None.
 */
export function releaseTacticalBattleMemory(): void {
  logDebug('tacticalBattleMemoryRelease releaseTacticalBattleMemory');
  setActiveTacticalBattleSnapshotRef(null);
  clearTacticalCallbackSubscriptionStash();
  clearTacticalMovementPlanningCache();
  clearTacticalRendererOverrideCache();
}
