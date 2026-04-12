/**
 * Holds the in-memory tactical battle snapshot for the main process without importing `gameDb`.
 *
 * Purpose: Lets `gameDb.getGameState` attach `tacticalBattleSession` to strategic snapshots while avoiding a
 * `gameDb` ↔ `tacticalBattleSession` import cycle (`tacticalBattleSession` already depends on `gameDb` readers).
 * When to use: Only `tacticalBattleSession` and restore helpers should mutate this ref; `gameDb` reads it.
 * Expected outcome: `getActiveTacticalBattleSnapshotRef` returns null when no battle is active.
 * Exceptions: None.
 */

import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { tacticalLogMutate, tacticalLogQuery } from './tacticalLogging';

/**
 * Stores the currently active tactical battle snapshot for process-local coordination.
 *
 * Purpose: Provides one authoritative in-memory session reference shared by tactical session code and `gameDb` snapshot merges.
 * When to use: Read via `getActiveTacticalBattleSnapshotRef`; mutate only via `setActiveTacticalBattleSnapshotRef`.
 * Expected outcome: Null when no tactical battle is active; otherwise points at the latest committed tactical snapshot.
 * Exceptions: None.
 */
let activeTacticalBattle: TacticalBattleSnapshot | null = null;

/**
 * Returns the active tactical snapshot held for the current main-process session, if any.
 *
 * Purpose: Read-only access for `getGameState` merge logic and diagnostics.
 * When to use: From `gameDb` when building `GameStateSnapshot` payloads for the renderer.
 * Expected outcome: Same reference the tactical session last committed until the next mutating call.
 * Exceptions: None.
 */
export function getActiveTacticalBattleSnapshotRef(): TacticalBattleSnapshot | null {
  tacticalLogQuery('getActiveTacticalBattleSnapshotRef', { hasBattle: !!activeTacticalBattle });
  return activeTacticalBattle;
}

/**
 * Replaces the active tactical snapshot reference (or clears it).
 *
 * Purpose: Single mutation entry for tactical session lifecycle so persistence can mirror memory reliably.
 * When to use: From `tacticalBattleSession` start/apply/advance/end and from DB restore after app launch.
 * Expected outcome: Subsequent reads return `next` (or null after clear).
 * Exceptions: None.
 */
export function setActiveTacticalBattleSnapshotRef(next: TacticalBattleSnapshot | null): void {
  tacticalLogMutate('setActiveTacticalBattleSnapshotRef', {
    hadBattle: !!activeTacticalBattle,
    hasBattle: !!next,
    battleId: next?.battleId ?? null,
  });
  activeTacticalBattle = next;
}
