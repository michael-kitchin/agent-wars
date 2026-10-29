/**
 * Resets in-memory match state after the database file has been replaced.
 *
 * Purpose: A load must not keep the previous match's commanders, deferred consult, march memory, melee pause, attack mix, or tactical session.
 * When to use: Immediately after `replaceGameDatabaseWithStagedFile` succeeds, before the next microtask.
 * Expected outcome: Those stores match the database that is now open. A persisted tactical battle is active again when the loaded match has one.
 * Exceptions: None. Each callee logs its own failure.
 *
 * These caches are left alone on purpose:
 * - Human march preview caches. A session is reused only when the seat, selection, position, and environment signatures match.
 * - The planning-phase pathfinding session. Its key includes the turn, the phase, the perspective, fog, the unit ids and positions, and the hex ids.
 * - The one-step destination cache. It is a WeakMap keyed by snapshot object identity.
 * - Terrain, weather, region, map, hex-code, and ordered-hex caches. Loading the stored map replaces them.
 * - OpenRouter model capabilities and credit limits. They belong to the app session, not the match.
 * - Match generation and model-call epochs. Stopping model work for the load advances them before the swap. A commander-pool write already queued is dropped once `resetCommanderPool` bumps the pool generation.
 */

import { clearAttackMixOnNewGame } from '../attackMixReset';
import { getSeatRoster } from '../gameDb';
import { clearMeleeInterceptPendingSnapshot } from '../gameActions/meleeInterceptPendingState';
import { clearDeferredPlaybackConsultPending } from '../ipc/deferredResolutionPlaybackConsult';
import { logDebug } from '../logger';
import { resetCommanderPool } from '../openRouter/commanderPool';
import { clearStrategicPreviousHexMemory } from '../strategicUnitPreviousHex';
import { releaseTacticalBattleMemory } from '../tacticalBattle/tacticalBattleMemoryRelease';
import { restorePersistedTacticalBattleSession } from '../tacticalBattle/tacticalBattleSession';

/**
 * Rebuilds in-memory match state from the database that is open now.
 *
 * Purpose: The file swap does not clear process memory by itself.
 * When to use: Once, synchronously, after a successful replace.
 * Expected outcome: Commander memory, deferred work, and the tactical session match the open database.
 * Exceptions: None.
 */
export function resetMatchMemoryAfterDatabaseReplace(): void {
  logDebug('matchMemoryReset resetMatchMemoryAfterDatabaseReplace');
  resetCommanderPool(getSeatRoster());
  clearDeferredPlaybackConsultPending();
  clearStrategicPreviousHexMemory();
  clearMeleeInterceptPendingSnapshot();
  clearAttackMixOnNewGame();
  releaseTacticalBattleMemory();
  restorePersistedTacticalBattleSession();
}
